package mail

import (
	"bytes"
	"context"
	"io"

	domainmail "github.com/masterkeysrd/saturn/internal/domain/mail"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

const maxUploadSize = 25 * 1024 * 1024

// AttachmentTokenClaims encapsulates the signed payload for ephemeral attachment streaming.
type AttachmentTokenClaims = domainmail.AttachmentTokenClaims

// MintAttachmentToken generates a tamper-proof HMAC-SHA256 signed attachment token.
func MintAttachmentToken(claims AttachmentTokenClaims, secret []byte) (string, error) {
	return domainmail.MintAttachmentToken(claims, secret)
}

// VerifyAttachmentToken parses and validates a signed attachment token.
func VerifyAttachmentToken(tokenStr string, secret []byte) (*AttachmentTokenClaims, error) {
	return domainmail.VerifyAttachmentToken(tokenStr, secret)
}

// UploadDraftAttachment validates attachment size and attaches it to a draft.
func (c *coordinator) UploadDraftAttachment(ctx context.Context, req *UploadDraftAttachmentRequest) (*domainmail.AttachmentMeta, error) {
	const op errors.Op = "application/mail.UploadDraftAttachment"

	if err := c.checkMutationPermission(ctx, op); err != nil {
		return nil, err
	}
	if req == nil || req.DraftID == "" || req.Body == nil {
		return nil, errors.E(op, errors.Invalid, "draft_id and body are required")
	}

	spaceID, err := c.getSpaceID(ctx, op)
	if err != nil {
		return nil, err
	}

	draft, err := c.domainService.GetDraft(ctx, spaceID, req.DraftID)
	if err != nil {
		return nil, errors.E(op, err)
	}

	limitedReader := io.LimitReader(req.Body, maxUploadSize+1)
	blob, err := io.ReadAll(limitedReader)
	if err != nil {
		return nil, errors.E(op, err)
	}
	if len(blob) > maxUploadSize {
		return nil, errors.E(op, errors.Invalid, "attachment exceeds maximum allowed size of 25 MB")
	}

	var meta *domainmail.AttachmentMeta
	if draft.ConnectedAccountID != "" && c.tokenManager != nil {
		acc, err := c.accountStore.GetAccount(ctx, spaceID, draft.ConnectedAccountID)
		if err != nil {
			return nil, errors.E(op, err)
		}
		if acc == nil {
			return nil, errors.E(op, errors.NotExist, "connected account not found")
		}
		prov, ok := c.externalProviders[acc.Provider]
		if !ok {
			return nil, errors.E(op, errors.NotExist, "unsupported mail provider: %s", acc.Provider)
		}
		token, err := c.tokenManager.TokenSource(ctx, spaceID, draft.ConnectedAccountID)
		if err != nil {
			return nil, errors.E(op, err)
		}
		if token == "" {
			return nil, errors.E(op, errors.Unauthenticated, "missing provider access token")
		}

		if draft.ProviderDraftID == nil || *draft.ProviderDraftID == "" {
			provDraft, err := prov.CreateDraft(ctx, token, draft)
			if err != nil {
				return nil, errors.E(op, err)
			}
			if provDraft != nil {
				draft.ProviderDraftID = provDraft.ProviderDraftID
				draft.ProviderMessageID = provDraft.ProviderMessageID
			}
			if draft.ProviderDraftID == nil || *draft.ProviderDraftID == "" {
				return nil, errors.E(op, errors.Internal, "provider draft id missing after creation")
			}
		}

		meta, err = prov.UploadDraftAttachment(ctx, token, *draft.ProviderDraftID, req.Filename, req.ContentType, bytes.NewReader(blob))
		if err != nil {
			return nil, errors.E(op, err)
		}
	}

	if meta == nil {
		attID, err := domainmail.GenerateAttachmentID()
		if err != nil {
			return nil, errors.E(op, err)
		}
		meta = &domainmail.AttachmentMeta{
			ID:          attID,
			Filename:    req.Filename,
			ContentType: req.ContentType,
			Size:        int64(len(blob)),
			IsInline:    false,
		}
	}

	draft.Attachments = append(draft.Attachments, *meta)
	if err := c.domainService.UpdateDraft(ctx, draft); err != nil {
		return nil, errors.E(op, err)
	}

	return meta, nil
}
