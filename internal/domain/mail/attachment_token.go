package mail

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json/v2"
	"strings"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

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
	const op errors.Op = "domain/mail.VerifyAttachmentToken"

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
