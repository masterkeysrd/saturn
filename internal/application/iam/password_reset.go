package iam

import (
	"context"
	"fmt"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/hash"
	"github.com/masterkeysrd/saturn/internal/platform/token"
)

// ResetPasswordRequest represents the admin request to initiate a password reset.
type ResetPasswordRequest struct {
	AdminUserID  string
	TargetUserID string
	TTLMinutes   int32
}

// ResetPasswordResponse represents the admin response containing the generated reset link and token.
type ResetPasswordResponse struct {
	ResetURL  string
	Token     string
	ExpiresAt time.Time
}

// ValidateResetTokenRequest represents the request to validate a reset token.
type ValidateResetTokenRequest struct {
	Token string
}

// ValidateResetTokenResponse represents the response containing user information for a valid token.
type ValidateResetTokenResponse struct {
	Username string
}

// CompleteResetPasswordRequest represents the request to consume a reset token and set a new password.
type CompleteResetPasswordRequest struct {
	Token       string
	NewPassword string
}

// ResetPassword generates a single-use password reset link for the target user.
func (c *coordinator) ResetPassword(ctx context.Context, req *ResetPasswordRequest) (*ResetPasswordResponse, error) {
	const op errors.Op = "application/iam.ResetPassword"

	adminID := identity.UserID(req.AdminUserID)
	targetID := identity.UserID(req.TargetUserID)

	rawToken, err := token.GenerateRandomHex(32)
	if err != nil {
		return nil, errors.E(op, fmt.Errorf("generate reset token: %w", err))
	}
	tokenHash := hash.SHA256String(rawToken)

	ttl := time.Duration(req.TTLMinutes) * time.Minute
	record, err := c.identityService.CreatePasswordResetToken(ctx, identity.CreatePasswordResetTokenRequest{
		AdminID:      adminID,
		TargetUserID: targetID,
		TokenHash:    tokenHash,
		TTL:          ttl,
	})
	if err != nil {
		return nil, errors.E(op, err)
	}

	resetURL := fmt.Sprintf("/reset-password?token=%s", rawToken)

	return &ResetPasswordResponse{
		ResetURL:  resetURL,
		Token:     rawToken,
		ExpiresAt: record.ExpiresAt,
	}, nil
}

// ValidateResetToken verifies that the provided token is valid, unconsumed, and not expired.
func (c *coordinator) ValidateResetToken(ctx context.Context, req *ValidateResetTokenRequest) (*ValidateResetTokenResponse, error) {
	const op errors.Op = "application/iam.ValidateResetToken"

	if req.Token == "" {
		return nil, errors.E(op, errors.Invalid, identity.ResetTokenNotFound, "reset token is required")
	}

	now := time.Now().UTC()
	tokenHash := hash.SHA256String(req.Token)
	user, _, err := c.identityService.ValidatePasswordResetToken(ctx, identity.ValidatePasswordResetTokenRequest{
		TokenHash: tokenHash,
		Now:       now,
	})
	if err != nil {
		return nil, errors.E(op, err)
	}

	return &ValidateResetTokenResponse{
		Username: user.Username,
	}, nil
}

// CompleteResetPassword hashes the new password, consumes the reset token, and globally invalidates sessions.
func (c *coordinator) CompleteResetPassword(ctx context.Context, req *CompleteResetPasswordRequest) error {
	const op errors.Op = "application/iam.CompleteResetPassword"

	if req.Token == "" {
		return errors.E(op, errors.Invalid, identity.ResetTokenNotFound, "reset token is required")
	}
	if req.NewPassword == "" {
		return errors.E(op, errors.Invalid, "new password is required")
	}

	hashedPassword, err := c.passwordHasher.Hash(req.NewPassword)
	if err != nil {
		return errors.E(op, fmt.Errorf("hash password: %w", err))
	}

	now := time.Now().UTC()
	tokenHash := hash.SHA256String(req.Token)
	_, err = c.identityService.CompletePasswordReset(ctx, identity.CompletePasswordResetRequest{
		TokenHash:      tokenHash,
		HashedPassword: hashedPassword,
		Now:            now,
	})
	if err != nil {
		return errors.E(op, err)
	}

	return nil
}
