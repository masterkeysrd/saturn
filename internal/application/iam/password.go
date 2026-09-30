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

// ChangePasswordRequest represents the application input for an authenticated password change.
type ChangePasswordRequest struct {
	UserID              string
	CurrentPassword     string
	NewPassword         string
	TOTPCode            string
	RevokeOtherSessions bool
	UserAgent           string
	IPAddress           string
}

// ChangePasswordResponse represents the fresh credentials issued to the caller after password change.
type ChangePasswordResponse struct {
	AccessToken           string
	AccessTokenExpiresAt  int64
	RefreshToken          string
	RefreshTokenExpiresAt int64
}

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

// ChangePassword handles password re-authentication, validation, updating credentials,
// session invalidation, and issuing fresh tokens for the caller.
func (c *coordinator) ChangePassword(ctx context.Context, req *ChangePasswordRequest) (*ChangePasswordResponse, error) {
	const op errors.Op = "application/iam.ChangePassword"

	if req == nil {
		return nil, errors.E(op, errors.Invalid, "request is required")
	}
	if req.UserID == "" {
		return nil, errors.E(op, errors.Invalid, identity.InvalidUserID, "user id is required")
	}
	if req.CurrentPassword == "" {
		return nil, errors.E(op, errors.Invalid, "current password is required")
	}
	if req.NewPassword == "" {
		return nil, errors.E(op, errors.Invalid, "new password is required")
	}
	if req.CurrentPassword == req.NewPassword {
		return nil, errors.E(op, errors.Invalid, identity.PasswordMatchesCurrent, "new password cannot be the same as current password")
	}

	hashedPassword, err := c.passwordHasher.Hash(req.NewPassword)
	if err != nil {
		return nil, errors.E(op, fmt.Errorf("hash password: %w", err))
	}

	now := time.Now().UTC()
	user, err := c.identityService.ChangePassword(ctx, identity.ChangePasswordRequest{
		UserID:              identity.UserID(req.UserID),
		CurrentPassword:     req.CurrentPassword,
		NewPassword:         req.NewPassword,
		HashedNewPassword:   hashedPassword,
		TOTPCode:            req.TOTPCode,
		RevokeOtherSessions: req.RevokeOtherSessions,
		IPAddress:           req.IPAddress,
		UserAgent:           req.UserAgent,
	})
	if err != nil {
		return nil, errors.E(op, err)
	}

	refreshToken, _, err := c.tokenService.IssueRefreshToken(token.IssueInput{
		Subject:     string(user.ID),
		AccessLevel: string(user.AccessLevel),
		AuthVersion: user.AuthVersion,
	}, now, now.Add(7*24*time.Hour))
	if err != nil {
		return nil, errors.E(op, fmt.Errorf("issue refresh token: %w", err))
	}

	refreshTokenHash := hash.SHA256String(refreshToken)

	session, err := c.identityService.CreateSession(ctx, &identity.CreateSessionRequest{
		UserID:            user.ID,
		RefreshTokenHash:  refreshTokenHash,
		UserAgent:         req.UserAgent,
		IPAddress:         req.IPAddress,
		ExpiresAt:         now.Add(24 * time.Hour),
		AbsoluteExpiresAt: now.Add(7 * 24 * time.Hour),
	})
	if err != nil {
		return nil, errors.E(op, fmt.Errorf("create session: %w", err))
	}

	accessToken, _, err := c.tokenService.IssueAccessToken(token.IssueInput{
		Subject:     string(user.ID),
		AccessLevel: string(user.AccessLevel),
		AuthVersion: user.AuthVersion,
		SessionID:   string(session.ID),
	}, now)
	if err != nil {
		return nil, errors.E(op, fmt.Errorf("issue access token: %w", err))
	}

	return &ChangePasswordResponse{
		AccessToken:           accessToken,
		AccessTokenExpiresAt:  now.Add(15 * time.Minute).Unix(),
		RefreshToken:          refreshToken,
		RefreshTokenExpiresAt: now.Add(24 * time.Hour).Unix(),
	}, nil
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
