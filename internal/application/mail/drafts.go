package mail

import (
	"context"
	"slices"
	"time"

	domainmail "github.com/masterkeysrd/saturn/internal/domain/mail"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

// CreateDraft creates a new draft locally and on the upstream provider if connected.
func (c *coordinator) CreateDraft(ctx context.Context, req *CreateDraftRequest) (*domainmail.Draft, error) {
	const op errors.Op = "application/mail.CreateDraft"

	if err := c.checkMutationPermission(ctx, op); err != nil {
		return nil, err
	}
	if req == nil || req.Draft == nil {
		return nil, errors.E(op, errors.Invalid, "draft is required")
	}

	spaceID, err := c.getSpaceID(ctx, op)
	if err != nil {
		return nil, err
	}
	req.Draft.SpaceID = spaceID

	// Write-through to upstream provider if account is connected
	if req.Draft.ConnectedAccountID != "" && c.tokenManager != nil {
		acc, err := c.accountStore.GetAccount(ctx, spaceID, req.Draft.ConnectedAccountID)
		if err == nil && acc != nil {
			if prov, ok := c.externalProviders[acc.Provider]; ok {
				token, err := c.tokenManager.TokenSource(ctx, spaceID, req.Draft.ConnectedAccountID)
				if err == nil && token != "" {
					provDraft, err := prov.CreateDraft(ctx, token, req.Draft)
					if err == nil && provDraft != nil {
						req.Draft.ProviderDraftID = provDraft.ProviderDraftID
						req.Draft.ProviderMessageID = provDraft.ProviderMessageID
					}
				}
			}
		}
	}

	if err := c.domainService.CreateDraft(ctx, req.Draft); err != nil {
		return nil, errors.E(op, err)
	}
	return req.Draft, nil
}

// UpdateDraft updates an existing draft locally and syncs changes to the provider.
func (c *coordinator) UpdateDraft(ctx context.Context, req *UpdateDraftRequest) (*domainmail.Draft, error) {
	const op errors.Op = "application/mail.UpdateDraft"

	if err := c.checkMutationPermission(ctx, op); err != nil {
		return nil, err
	}
	if req == nil || req.ID == "" || req.Draft == nil {
		return nil, errors.E(op, errors.Invalid, "draft and id are required")
	}

	spaceID, err := c.getSpaceID(ctx, op)
	if err != nil {
		return nil, err
	}

	var updated *domainmail.Draft
	if len(req.UpdateMask) > 0 {
		var err error
		updated, err = c.domainService.PatchDraft(ctx, spaceID, req.ID, req.Draft, req.UpdateMask)
		if err != nil {
			return nil, errors.E(op, err)
		}
	} else {
		existing, err := c.domainService.GetDraft(ctx, spaceID, req.ID)
		if err != nil {
			return nil, errors.E(op, err)
		}
		existing.To = req.Draft.To
		existing.Cc = req.Draft.Cc
		existing.Bcc = req.Draft.Bcc
		existing.Subject = req.Draft.Subject
		existing.BodyHTML = req.Draft.BodyHTML
		existing.BodyText = req.Draft.BodyText
		existing.Attachments = req.Draft.Attachments

		if err := c.domainService.UpdateDraft(ctx, existing); err != nil {
			return nil, errors.E(op, err)
		}
		updated = existing
	}

	// Write-through to upstream provider
	if updated.ConnectedAccountID != "" && updated.ProviderDraftID != nil && *updated.ProviderDraftID != "" && c.tokenManager != nil {
		acc, err := c.accountStore.GetAccount(ctx, spaceID, updated.ConnectedAccountID)
		if err == nil && acc != nil {
			if prov, ok := c.externalProviders[acc.Provider]; ok {
				token, err := c.tokenManager.TokenSource(ctx, spaceID, updated.ConnectedAccountID)
				if err == nil && token != "" {
					_, _ = prov.UpdateDraft(ctx, token, updated)
				}
			}
		}
	}

	return updated, nil
}

// DeleteDraft deletes a draft locally and removes it from the upstream provider.
func (c *coordinator) DeleteDraft(ctx context.Context, req *DeleteDraftRequest) error {
	const op errors.Op = "application/mail.DeleteDraft"

	if err := c.checkMutationPermission(ctx, op); err != nil {
		return err
	}
	if req == nil || req.ID == "" {
		return errors.E(op, errors.Invalid, "id is required")
	}

	spaceID, err := c.getSpaceID(ctx, op)
	if err != nil {
		return err
	}

	existing, err := c.domainService.GetDraft(ctx, spaceID, req.ID)
	if err != nil {
		if errors.Is(err, errors.NotExist) {
			return c.deleteSyncedDraftMessage(ctx, op, spaceID, req.ID, err)
		}
		return errors.E(op, err)
	}

	// Remove from upstream provider if synced
	if existing.ConnectedAccountID != "" && existing.ProviderDraftID != nil && *existing.ProviderDraftID != "" && c.tokenManager != nil {
		acc, err := c.accountStore.GetAccount(ctx, spaceID, existing.ConnectedAccountID)
		if err == nil && acc != nil {
			if prov, ok := c.externalProviders[acc.Provider]; ok {
				token, err := c.tokenManager.TokenSource(ctx, spaceID, existing.ConnectedAccountID)
				if err == nil && token != "" {
					_ = prov.DeleteDraft(ctx, token, *existing.ProviderDraftID)
				}
			}
		}
	}

	if err := c.domainService.DeleteDraft(ctx, spaceID, req.ID); err != nil {
		return errors.E(op, err)
	}
	return nil
}

func (c *coordinator) deleteSyncedDraftMessage(ctx context.Context, op errors.Op, spaceID, msgID string, origErr error) error {
	msg, err := c.messageStore.GetByID(ctx, spaceID, msgID)
	if err != nil || msg == nil || !msg.IsDraft {
		return errors.E(op, origErr)
	}

	if msg.ConnectedAccountID != "" && msg.ProviderMessageID != nil && *msg.ProviderMessageID != "" && c.tokenManager != nil {
		acc, accErr := c.accountStore.GetAccount(ctx, spaceID, msg.ConnectedAccountID)
		if accErr == nil && acc != nil {
			if prov, ok := c.externalProviders[acc.Provider]; ok {
				token, tokErr := c.tokenManager.TokenSource(ctx, spaceID, msg.ConnectedAccountID)
				if tokErr == nil && token != "" {
					_ = prov.DeleteDraft(ctx, token, *msg.ProviderMessageID)
				}
			}
		}
	}

	if err := c.messageStore.Delete(ctx, spaceID, msg.ID); err != nil {
		return errors.E(op, err)
	}

	if msg.ThreadID != "" {
		remaining, remErr := c.messageStore.ListByThreadID(ctx, spaceID, msg.ThreadID)
		if remErr == nil {
			if len(remaining) == 0 {
				_ = c.threadStore.Delete(ctx, spaceID, msg.ThreadID)
			} else if th, thErr := c.threadStore.GetByID(ctx, spaceID, msg.ThreadID); thErr == nil && th != nil {
				th.InDrafts = slices.ContainsFunc(remaining, func(m *domainmail.Message) bool {
					return m != nil && m.IsDraft
				})
				if !th.InDrafts {
					th.MailboxIDs = slices.DeleteFunc(th.MailboxIDs, func(id string) bool {
						return id == "DRAFT"
					})
				}
				th.AggregateFromMessages(remaining)
				_ = c.threadStore.Update(ctx, th)
			}
		}
	}

	return nil
}

// SendDraft sends an existing draft via the provider, persists the resulting message, and deletes the draft.
func (c *coordinator) SendDraft(ctx context.Context, req *SendDraftRequest) (*domainmail.Message, error) {
	const op errors.Op = "application/mail.SendDraft"

	if err := c.checkMutationPermission(ctx, op); err != nil {
		return nil, err
	}
	if req == nil || req.ID == "" {
		return nil, errors.E(op, errors.Invalid, "id is required")
	}

	spaceID, err := c.getSpaceID(ctx, op)
	if err != nil {
		return nil, err
	}

	draft, err := c.domainService.GetDraft(ctx, spaceID, req.ID)
	if err != nil {
		return nil, errors.E(op, err)
	}

	now := time.Now().UTC()
	var sentMessage *domainmail.Message

	if draft.ConnectedAccountID != "" && draft.ProviderDraftID != nil && *draft.ProviderDraftID != "" && c.tokenManager != nil {
		acc, err := c.accountStore.GetAccount(ctx, spaceID, draft.ConnectedAccountID)
		if err == nil && acc != nil {
			if prov, ok := c.externalProviders[acc.Provider]; ok {
				token, err := c.tokenManager.TokenSource(ctx, spaceID, draft.ConnectedAccountID)
				if err == nil && token != "" {
					sentMessage, err = prov.SendDraft(ctx, token, *draft.ProviderDraftID)
					if err != nil {
						return nil, errors.E(op, err)
					}
				}
			}
		}
	}

	if sentMessage == nil {
		// Fallback for native draft sending
		msgID, err := domainmail.GenerateMessageID()
		if err != nil {
			return nil, errors.E(op, err)
		}

		thID := ""
		if draft.ThreadID != nil {
			thID = *draft.ThreadID
		}
		if thID == "" {
			thID, _ = domainmail.GenerateThreadID()
		}

		sentMessage = &domainmail.Message{
			ID:                 msgID,
			SpaceID:            spaceID,
			ConnectedAccountID: draft.ConnectedAccountID,
			ThreadID:           thID,
			Subject:            draft.Subject,
			Snippet:            draft.BodyText,
			From:               domainmail.Participant{Email: draft.From},
			To:                 draft.To,
			Cc:                 draft.Cc,
			Bcc:                draft.Bcc,
			SentAt:             &now,
			ReceivedAt:         now,
			IsUnread:           false,
			IsStarred:          false,
			IsDraft:            false,
			Attachments:        draft.Attachments,
			CreateTime:         now,
			UpdateTime:         now,
		}
	} else {
		sentMessage.SpaceID = spaceID
		sentMessage.ConnectedAccountID = draft.ConnectedAccountID
		if draft.ThreadID != nil && *draft.ThreadID != "" {
			sentMessage.ThreadID = *draft.ThreadID
		}
	}

	// Persist sent message
	if err := c.domainService.CreateMessage(ctx, sentMessage); err != nil {
		return nil, errors.E(op, err)
	}

	// Cache body if present
	if draft.BodyHTML != "" || draft.BodyText != "" {
		body := &domainmail.MessageBody{
			MessageID:     sentMessage.ID,
			SpaceID:       spaceID,
			SanitizedHTML: draft.BodyHTML,
			PlainText:     draft.BodyText,
			FetchedAt:     now,
			ExpiresAt:     now.Add(30 * 24 * time.Hour),
		}
		_ = c.domainService.SaveMessageBody(ctx, body)
		sentMessage.BodyCached = true
	}

	// Delete draft after sending
	_ = c.domainService.DeleteDraft(ctx, spaceID, req.ID)

	// Recompute parent thread
	if sentMessage.ThreadID != "" {
		_, _ = c.domainService.RecomputeThread(ctx, spaceID, sentMessage.ThreadID)
	}

	return sentMessage, nil
}
