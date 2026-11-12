package mail

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json/v2"
	"io"
	"strings"
	"time"

	domainmail "github.com/masterkeysrd/saturn/internal/domain/mail"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

const maxUploadSize = 25 * 1024 * 1024

// AttachmentTokenClaims encapsulates the signed payload for ephemeral attachment streaming.
type AttachmentTokenClaims struct {
	SpaceID      string `json:"space_id"`
	MessageID    string `json:"message_id"`
	AttachmentID string `json:"attachment_id"`
	Disposition  string `json:"disposition"` // "inline" or "attachment"
	ExpiresAt    int64  `json:"exp"`
}

// MintAttachmentToken generates a tamper-proof HMAC-SHA256 signed attachment token.
func MintAttachmentToken(claims AttachmentTokenClaims, secret []byte) (string, error) {
	if len(secret) == 0 {
		return "", errors.E(errors.Internal, "hmac secret cannot be empty")
	}

	payloadBytes, err := json.Marshal(claims)
	if err != nil {
		return "", errors.E(errors.Internal, "marshal token claims: %w", err)
	}

	mac := hmac.New(sha256.New, secret)
	mac.Write(payloadBytes)
	sig := mac.Sum(nil)

	encodedPayload := base64.RawURLEncoding.EncodeToString(payloadBytes)
	encodedSig := base64.RawURLEncoding.EncodeToString(sig)

	return encodedPayload + "." + encodedSig, nil
}

// VerifyAttachmentToken parses and validates a signed attachment token.
func VerifyAttachmentToken(tokenStr string, secret []byte) (*AttachmentTokenClaims, error) {
	const op errors.Op = "application/mail.VerifyAttachmentToken"

	if len(secret) == 0 {
		return nil, errors.E(op, errors.Internal, "hmac secret cannot be empty")
	}

	parts := strings.Split(tokenStr, ".")
	if len(parts) != 2 {
		return nil, errors.E(op, errors.Unauthenticated, "invalid token format")
	}

	payloadBytes, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return nil, errors.E(op, errors.Unauthenticated, "invalid payload encoding")
	}

	providedSig, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, errors.E(op, errors.Unauthenticated, "invalid signature encoding")
	}

	mac := hmac.New(sha256.New, secret)
	mac.Write(payloadBytes)
	expectedSig := mac.Sum(nil)

	if !hmac.Equal(providedSig, expectedSig) {
		return nil, errors.E(op, errors.Permission, "invalid token signature")
	}

	var claims AttachmentTokenClaims
	if err := json.Unmarshal(payloadBytes, &claims); err != nil {
		return nil, errors.E(op, errors.Unauthenticated, "invalid token payload")
	}

	if claims.ExpiresAt < time.Now().Unix() {
		return nil, errors.E(op, errors.Unauthenticated, "attachment token expired")
	}

	return &claims, nil
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
	if draft.ConnectedAccountID != "" && draft.ProviderDraftID != nil && *draft.ProviderDraftID != "" && c.tokenManager != nil {
		acc, err := c.accountStore.GetAccount(ctx, spaceID, draft.ConnectedAccountID)
		if err == nil && acc != nil {
			if prov, ok := c.externalProviders[acc.Provider]; ok {
				token, err := c.tokenManager.TokenSource(ctx, spaceID, draft.ConnectedAccountID)
				if err == nil && token != "" {
					meta, _ = prov.UploadDraftAttachment(ctx, token, *draft.ProviderDraftID, req.Filename, req.ContentType, bytes.NewReader(blob))
				}
			}
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
