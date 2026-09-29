package identity

import (
	"fmt"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/id"
)

const (
	resetTokenPrefix = "rst_"

	// DefaultResetTokenTTL defines the default lifespan of a password reset token (15 minutes).
	DefaultResetTokenTTL = 15 * time.Minute

	// MaxResetTokenTTL defines the maximum allowed lifespan for a password reset token (60 minutes).
	MaxResetTokenTTL = 60 * time.Minute
)

// ResetTokenID represents a unique identifier for a password reset token record.
type ResetTokenID string

// NewResetTokenID generates a new unique ResetTokenID.
func NewResetTokenID() (ResetTokenID, error) {
	raw, err := id.Generate(resetTokenPrefix)
	if err != nil {
		return "", err
	}
	return ResetTokenID(raw), nil
}

// ParseResetTokenID parses and validates a string as a ResetTokenID.
func ParseResetTokenID(s string) (ResetTokenID, error) {
	if err := id.Validate(s, resetTokenPrefix); err != nil {
		return "", fmt.Errorf("invalid reset token ID: %w", err)
	}
	return ResetTokenID(s), nil
}

// PasswordResetToken represents a single-use password reset token record.
type PasswordResetToken struct {
	ID         ResetTokenID
	UserID     UserID
	TokenHash  []byte
	ExpiresAt  time.Time
	UsedAt     *time.Time
	CreatedBy  UserID
	CreateTime time.Time
}

// IsUsed returns true if the reset token has already been consumed.
func (t *PasswordResetToken) IsUsed() bool {
	return t.UsedAt != nil
}

// IsExpired returns true if the token is past its expiration time.
func (t *PasswordResetToken) IsExpired(now time.Time) bool {
	return !now.Before(t.ExpiresAt)
}

// IsValid returns true if the reset token is unconsumed and not expired.
func (t *PasswordResetToken) IsValid(now time.Time) bool {
	return !t.IsUsed() && !t.IsExpired(now)
}

// CreatePasswordResetTokenRequest contains parameters for issuing a new reset token.
type CreatePasswordResetTokenRequest struct {
	AdminID      UserID
	TargetUserID UserID
	TokenHash    []byte
	TTL          time.Duration
}

// ValidatePasswordResetTokenRequest contains parameters for verifying a reset token.
type ValidatePasswordResetTokenRequest struct {
	TokenHash []byte
	Now       time.Time
}

// CompletePasswordResetRequest contains parameters for consuming a reset token and setting a new password.
type CompletePasswordResetRequest struct {
	TokenHash      []byte
	HashedPassword string
	Now            time.Time
}
