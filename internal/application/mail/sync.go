package mail

import (
	"context"
	"slices"
	"time"

	domainmail "github.com/masterkeysrd/saturn/internal/domain/mail"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/connector"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

// SyncConnectedAccountMail synchronizes mailboxes, threads, and messages for a connected account.
func (c *coordinator) SyncConnectedAccountMail(ctx context.Context, req *SyncConnectedAccountMailRequest) error {
	const op errors.Op = "application/mail.SyncConnectedAccountMail"

	if req == nil || req.ConnectedAccountID == "" {
		return errors.E(op, errors.Invalid, "connected_account_id is required")
	}

	spaceID := req.SpaceID
	if spaceID == "" {
		if sID, ok := auth.SpaceIDFromContext(ctx); ok {
			spaceID = sID
		}
	}
	if spaceID == "" {
		return errors.E(op, errors.Unauthenticated, "missing active space context")
	}

	// 1. Verify connected account exists and has mail capability enabled
	acc, err := c.accountStore.GetAccount(ctx, spaceID, req.ConnectedAccountID)
	if err != nil {
		return errors.E(op, err)
	}
	if !slices.Contains(acc.EnabledCapabilities, string(connector.CapabilityMail)) {
		return nil // mail sync disabled for this account
	}

	if c.tokenManager == nil {
		return errors.E(op, errors.Internal, "token manager not initialized")
	}

	// 2. Fetch fresh access token
	token, err := c.tokenManager.TokenSource(ctx, spaceID, req.ConnectedAccountID)
	if err != nil {
		return errors.E(op, err)
	}

	prov, ok := c.externalProviders[acc.Provider]
	if !ok {
		return errors.E(op, errors.NotExist, "unsupported mail provider: %s", acc.Provider)
	}

	// 3. Sync mailboxes / labels
	discoveredMailboxes, err := prov.ListMailboxes(ctx, token)
	if err == nil {
		for _, mbx := range discoveredMailboxes {
			mbx.SpaceID = spaceID
			mbx.ConnectedAccountID = req.ConnectedAccountID
			if mbx.ProviderMailboxID != nil && *mbx.ProviderMailboxID != "" {
				existing, err := c.mailboxStore.GetByProviderID(ctx, spaceID, req.ConnectedAccountID, *mbx.ProviderMailboxID)
				if err == nil && existing != nil {
					existing.Name = mbx.Name
					existing.UnreadCount = mbx.UnreadCount
					existing.TotalCount = mbx.TotalCount
					existing.UpdateTime = time.Now().UTC()
					_ = c.mailboxStore.Update(ctx, existing)
					continue
				}
			}
			_ = c.mailboxStore.Upsert(ctx, mbx)
		}
	}

	// 4. Retrieve or initialize sync state
	syncState, err := c.domainService.GetSyncState(ctx, spaceID, req.ConnectedAccountID)
	if err != nil || syncState == nil {
		syncState = &domainmail.SyncState{
			ConnectedAccountID: req.ConnectedAccountID,
			SpaceID:            spaceID,
			WindowDays:         90,
		}
	}

	// 5. Sync threads (bootstrap or incremental delta)
	cursorStr := ""
	if syncState.SyncCursor != nil {
		cursorStr = *syncState.SyncCursor
	}

	syncReq := &domainmail.SyncThreadsRequest{
		SyncCursor:         cursorStr,
		WindowDays:         syncState.WindowDays,
		PrewarmBodiesCount: 25,
	}

	result, err := prov.SyncThreads(ctx, token, syncReq)
	if err != nil {
		return errors.E(op, err)
	}

	// If historyId was expired on provider (404), reset cursor and re-bootstrap rolling window
	if result.ExpiredCursor {
		syncState.SyncCursor = nil
		syncReq.SyncCursor = ""
		result, err = prov.SyncThreads(ctx, token, syncReq)
		if err != nil {
			return errors.E(op, err)
		}
	}

	// 6. Persist synced data with ID reconciliation to prevent foreign key violations
	threadIDMap := make(map[string]string)
	for _, thread := range result.Threads {
		origID := thread.ID
		thread.SpaceID = spaceID
		thread.ConnectedAccountID = req.ConnectedAccountID
		if thread.ProviderThreadID != nil && *thread.ProviderThreadID != "" {
			existing, err := c.threadStore.GetByProviderID(ctx, spaceID, req.ConnectedAccountID, *thread.ProviderThreadID)
			if err == nil && existing != nil {
				thread.ID = existing.ID
			}
		}
		threadIDMap[origID] = thread.ID
		if err := c.threadStore.Upsert(ctx, thread); err != nil {
			return errors.E(op, err)
		}
	}

	messageIDMap := make(map[string]string)
	for _, msg := range result.Messages {
		origMsgID := msg.ID
		msg.SpaceID = spaceID
		msg.ConnectedAccountID = req.ConnectedAccountID
		if actualThreadID, ok := threadIDMap[msg.ThreadID]; ok {
			msg.ThreadID = actualThreadID
		}
		if msg.ProviderMessageID != nil && *msg.ProviderMessageID != "" {
			existing, err := c.messageStore.GetByProviderID(ctx, spaceID, req.ConnectedAccountID, *msg.ProviderMessageID)
			if err == nil && existing != nil {
				msg.ID = existing.ID
			}
		}
		messageIDMap[origMsgID] = msg.ID
		if err := c.messageStore.Upsert(ctx, msg); err != nil {
			return errors.E(op, err)
		}
	}

	for _, body := range result.Bodies {
		body.SpaceID = spaceID
		if actualMsgID, ok := messageIDMap[body.MessageID]; ok {
			body.MessageID = actualMsgID
		}
		if err := c.messageStore.SaveBody(ctx, body); err != nil {
			return errors.E(op, err)
		}
	}

	// 7. Update and save sync state
	now := time.Now().UTC()
	syncState.SyncCursor = &result.NewSyncCursor
	syncState.LastSyncedAt = &now
	if err := c.domainService.SaveSyncState(ctx, syncState); err != nil {
		return errors.E(op, err)
	}

	return nil
}

// PruneWindowAndBodies purges expired message bodies and cached threads older than the rolling window.
func (c *coordinator) PruneWindowAndBodies(ctx context.Context, req *PruneWindowAndBodiesRequest) error {
	const op errors.Op = "application/mail.PruneWindowAndBodies"

	now := req.Now
	if now.IsZero() {
		now = time.Now().UTC()
	}

	// Evict cached bodies past expiration
	_, err := c.domainService.PruneExpiredBodies(ctx, now)
	if err != nil {
		return errors.E(op, err)
	}

	// Prune threads older than 90-day window
	cutoff := now.AddDate(0, 0, -90)
	_, err = c.threadStore.PruneThreadsOlderThanWindow(ctx, cutoff)
	if err != nil {
		return errors.E(op, err)
	}

	return nil
}
