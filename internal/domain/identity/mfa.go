package identity

import (
	"fmt"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/id"
)

const (
	mfaFactorPrefix = "mfa_"
)

// MFAFactorID is a string type representing an MFA factor's unique identifier.
type MFAFactorID string

// NewMFAFactorID creates a new MFAFactorID using the default ID generator.
func NewMFAFactorID() (MFAFactorID, error) {
	raw, err := id.Generate(mfaFactorPrefix)
	if err != nil {
		return "", err
	}
	return MFAFactorID(raw), nil
}

// ParseMFAFactorID parses a string into an MFAFactorID and validates it.
func ParseMFAFactorID(s string) (MFAFactorID, error) {
	if err := id.Validate(s, mfaFactorPrefix); err != nil {
		return "", fmt.Errorf("invalid mfa factor ID: %w", err)
	}
	return MFAFactorID(s), nil
}

// MFAFactorType represents the type of multi-factor credential.
type MFAFactorType string

const (
	MFAFactorTypeTOTP       MFAFactorType = "totp"
	MFAFactorTypeWebAuthn   MFAFactorType = "webauthn"
	MFAFactorTypeMobilePush MFAFactorType = "mobile_push"
	MFAFactorTypeEmailOTP   MFAFactorType = "email_otp"
)

// MFAConfig defines the interface for factor-specific configuration payloads.
type MFAConfig interface {
	FactorType() MFAFactorType
}

// TOTPConfig represents configuration specific to a TOTP factor.
type TOTPConfig struct {
	EncryptedSecret string
}

// FactorType returns MFAFactorTypeTOTP.
func (TOTPConfig) FactorType() MFAFactorType {
	return MFAFactorTypeTOTP
}

// MFAFactor represents an enrolled multi-factor authentication credential domain entity.
type MFAFactor struct {
	ID         MFAFactorID
	UserID     UserID
	Type       MFAFactorType
	Name       string
	Config     MFAConfig
	IsPrimary  bool
	CreatedAt  time.Time
	LastUsedAt *time.Time
	RevokedAt  *time.Time
}

// TOTPConfig returns the typed TOTPConfig if this factor is of type MFAFactorTypeTOTP, or nil otherwise.
func (f *MFAFactor) TOTPConfig() *TOTPConfig {
	if f == nil || f.Config == nil {
		return nil
	}
	if cfg, ok := f.Config.(*TOTPConfig); ok {
		return cfg
	}
	if cfg, ok := f.Config.(TOTPConfig); ok {
		return &cfg
	}
	return nil
}

// IsActive returns true if the factor is not revoked.
func (f *MFAFactor) IsActive() bool {
	return f.RevokedAt == nil
}

// IsRevoked returns true if the factor is revoked.
func (f *MFAFactor) IsRevoked() bool {
	return f.RevokedAt != nil
}

// Revoke marks the factor as revoked at the given timestamp.
func (f *MFAFactor) Revoke(now time.Time) {
	f.RevokedAt = &now
}

// MarkUsed marks the factor as utilized at the given timestamp.
func (f *MFAFactor) MarkUsed(now time.Time) {
	f.LastUsedAt = &now
}

// MFARecovery holds the single-use backup recovery codes for a user.
type MFARecovery struct {
	UserID      UserID
	BackupCodes []string
	UpdatedAt   time.Time
}

// SetupTOTPRequest contains arguments to initiate TOTP factor enrollment.
type SetupTOTPRequest struct {
	UserID UserID
	Name   string
}

// SetupTOTPResult contains the staging details for confirming a TOTP factor.
type SetupTOTPResult struct {
	FactorID    MFAFactorID
	Secret      string
	AccountName string
}

// ConfirmTOTPRequest contains arguments to verify and activate a TOTP factor.
type ConfirmTOTPRequest struct {
	UserID   UserID
	FactorID MFAFactorID
	Code     string
}

// DeleteMFAFactorRequest contains arguments to revoke an MFA factor.
type DeleteMFAFactorRequest struct {
	UserID   UserID
	FactorID MFAFactorID
}

// SetPrimaryMFAFactorRequest contains arguments to designate an MFA factor as primary.
type SetPrimaryMFAFactorRequest struct {
	UserID   UserID
	FactorID MFAFactorID
}

// RegenerateBackupCodesRequest contains arguments to regenerate recovery codes.
type RegenerateBackupCodesRequest struct {
	UserID           UserID
	VerificationCode string
}

// VerifyMFAAssertionRequest contains arguments to verify an MFA challenge assertion.
type VerifyMFAAssertionRequest struct {
	UserID     UserID
	FactorID   string
	TOTPCode   string
	BackupCode string
}

// MFAFactorsSummary summarizes a user's enrolled MFA factors and recovery state.
type MFAFactorsSummary struct {
	Factors              []*MFAFactor
	HasBackupCodes       bool
	RemainingBackupCodes int
}
