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
	if result.OldestSyncedTime != nil && (syncState.OldestSyncedTime == nil || result.OldestSyncedTime.Before(*syncState.OldestSyncedTime)) {
		syncState.OldestSyncedTime = result.OldestSyncedTime
	}
	if err := c.domainService.SaveSyncState(ctx, syncState); err != nil {
		return errors.E(op, err)
	}

	return nil
}

// SyncOlderThreads fetches and persists an older page of threads from upstream providers into local cache.
func (c *coordinator) SyncOlderThreads(ctx context.Context, req *SyncOlderThreadsRequest) (*SyncOlderThreadsResult, error) {
	const op errors.Op = "application/mail.SyncOlderThreads"

	spaceID, err := c.getSpaceID(ctx, op)
	if err != nil {
		return nil, err
	}

	if req == nil {
		req = &SyncOlderThreadsRequest{}
	}
	pageSize := req.PageSize
	if pageSize <= 0 {
		pageSize = 50
	}

	var providerMailboxID string
	targetAccountID := req.ConnectedAccountID
	if req.MailboxID != "" {
		mbx, mbxErr := c.mailboxStore.GetByID(ctx, spaceID, req.MailboxID)
		if mbxErr != nil {
			return nil, errors.E(op, mbxErr)
		}
		if mbx != nil {
			if mbx.ProviderMailboxID != nil {
				providerMailboxID = *mbx.ProviderMailboxID
			}
			if targetAccountID == "" {
				targetAccountID = mbx.ConnectedAccountID
			}
		}
	}

	var accounts []*connector.ConnectedAccount
	if targetAccountID != "" {
		acc, accErr := c.accountStore.GetAccount(ctx, spaceID, targetAccountID)
		if accErr != nil {
			return nil, errors.E(op, accErr)
		}
		if acc != nil {
			accounts = append(accounts, acc)
		}
	} else {
		accList, listErr := c.accountStore.ListAccounts(ctx, spaceID)
		if listErr != nil {
			return nil, errors.E(op, listErr)
		}
		accounts = accList
	}

	if c.tokenManager == nil {
		return &SyncOlderThreadsResult{}, nil
	}

	var (
		totalSynced int
		anyHasMore  bool
	)

	bucketKey := "all"
	if req.MailboxID != "" {
		bucketKey = "mailbox:" + req.MailboxID
	} else if req.SystemBucket != nil && *req.SystemBucket != "" {
		bucketKey = string(*req.SystemBucket)
	}

	for _, acc := range accounts {
		if acc == nil || !slices.Contains(acc.EnabledCapabilities, string(connector.CapabilityMail)) {
			continue
		}

		syncState, _ := c.domainService.GetSyncState(ctx, spaceID, acc.ID)
		if syncState != nil && slices.Contains(syncState.ExhaustedBuckets, bucketKey) {
			continue
		}

		prov, ok := c.externalProviders[acc.Provider]
		if !ok {
			continue
		}

		token, tokenErr := c.tokenManager.TokenSource(ctx, spaceID, acc.ID)
		if tokenErr != nil {
			continue
		}

		// Determine oldest cached thread timestamp matching this filter for this account
		filter := &domainmail.ListThreadsFilter{
			ConnectedAccountID: &acc.ID,
			SystemBucket:       req.SystemBucket,
		}
		if req.MailboxID != "" {
			mbxID := req.MailboxID
			filter.MailboxID = &mbxID
		}

		var beforeTime *time.Time
		totalCached, countErr := c.threadStore.CountBySpace(ctx, spaceID, filter)
		if countErr == nil && totalCached > 0 {
			oldestFilter := *filter
			oldestFilter.Limit = 1
			oldestFilter.Offset = totalCached - 1
			oldestRows, listErr := c.threadStore.ListBySpace(ctx, spaceID, &oldestFilter)
			if listErr == nil && len(oldestRows) > 0 && !oldestRows[0].LastMessageAt.IsZero() {
				t := oldestRows[0].LastMessageAt
				beforeTime = &t
			}
		}

		if syncState == nil {
			syncState = &domainmail.SyncState{
				ConnectedAccountID: acc.ID,
				SpaceID:            spaceID,
				WindowDays:         90,
			}
		}
		if beforeTime == nil && syncState.OldestSyncedTime != nil {
			t := *syncState.OldestSyncedTime
			beforeTime = &t
		}

		knownIDs, idErr := c.threadStore.ListProviderThreadIDs(ctx, spaceID, acc.ID)
		if idErr != nil {
			return nil, errors.E(op, idErr)
		}
		excludeMap := make(map[string]struct{}, len(knownIDs))
		for _, id := range knownIDs {
			excludeMap[id] = struct{}{}
		}

		var bucket domainmail.SystemBucket
		if req.SystemBucket != nil {
			bucket = *req.SystemBucket
		}

		fetchRes, fetchErr := prov.FetchOlderThreads(ctx, token, &domainmail.FetchOlderThreadsRequest{
			Before:             beforeTime,
			SystemBucket:       bucket,
			ProviderMailboxID:  providerMailboxID,
			Limit:              pageSize,
			ExcludeProviderIDs: excludeMap,
		})
		if fetchErr != nil {
			continue
		}

		threadIDMap := make(map[string]string, len(fetchRes.Threads))
		for _, thread := range fetchRes.Threads {
			origID := thread.ID
			thread.SpaceID = spaceID
			thread.ConnectedAccountID = acc.ID
			isNew := true
			if thread.ProviderThreadID != nil && *thread.ProviderThreadID != "" {
				existing, getErr := c.threadStore.GetByProviderID(ctx, spaceID, acc.ID, *thread.ProviderThreadID)
				if getErr == nil && existing != nil {
					thread.ID = existing.ID
					isNew = false
				}
			}
			threadIDMap[origID] = thread.ID
			if upsertErr := c.threadStore.Upsert(ctx, thread); upsertErr != nil {
				return nil, errors.E(op, upsertErr)
			}
			if isNew {
				totalSynced++
			}
		}

		for _, msg := range fetchRes.Messages {
			msg.SpaceID = spaceID
			msg.ConnectedAccountID = acc.ID
			if actualThreadID, ok := threadIDMap[msg.ThreadID]; ok {
				msg.ThreadID = actualThreadID
			}
			if msg.ProviderMessageID != nil && *msg.ProviderMessageID != "" {
				existing, getErr := c.messageStore.GetByProviderID(ctx, spaceID, acc.ID, *msg.ProviderMessageID)
				if getErr == nil && existing != nil {
					msg.ID = existing.ID
				}
			}
			if upsertErr := c.messageStore.Upsert(ctx, msg); upsertErr != nil {
				return nil, errors.E(op, upsertErr)
			}
		}

		stateDirty := false
		if fetchRes.OldestSyncedTime != nil && (syncState.OldestSyncedTime == nil || fetchRes.OldestSyncedTime.Before(*syncState.OldestSyncedTime)) {
			syncState.OldestSyncedTime = fetchRes.OldestSyncedTime
			stateDirty = true
		}
		if !fetchRes.HasMore && !slices.Contains(syncState.ExhaustedBuckets, bucketKey) {
			syncState.ExhaustedBuckets = append(syncState.ExhaustedBuckets, bucketKey)
			stateDirty = true
		}
		if stateDirty {
			if saveErr := c.domainService.SaveSyncState(ctx, syncState); saveErr != nil {
				return nil, errors.E(op, saveErr)
			}
		}

		if fetchRes.HasMore {
			anyHasMore = true
		}
	}

	return &SyncOlderThreadsResult{
		SyncedCount: totalSynced,
		HasMore:     anyHasMore,
	}, nil
}

// PruneWindowAndBodies purges expired cached message bodies while preserving thread metadata.
func (c *coordinator) PruneWindowAndBodies(ctx context.Context, req *PruneWindowAndBodiesRequest) error {
	const op errors.Op = "application/mail.PruneWindowAndBodies"

	now := req.Now
	if now.IsZero() {
		now = time.Now().UTC()
	}

	// Evict cached bodies past expiration (re-hydrated lazily on open)
	_, err := c.domainService.PruneExpiredBodies(ctx, now)
	if err != nil {
		return errors.E(op, err)
	}

	return nil
}
