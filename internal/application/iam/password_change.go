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

	accessToken, _, err := c.tokenService.IssueAccessToken(token.IssueInput{
		Subject:     string(user.ID),
		AccessLevel: string(user.AccessLevel),
		AuthVersion: user.AuthVersion,
	}, now)
	if err != nil {
		return nil, errors.E(op, fmt.Errorf("issue access token: %w", err))
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

	if _, err := c.identityService.CreateSession(ctx, &identity.CreateSessionRequest{
		UserID:            user.ID,
		RefreshTokenHash:  refreshTokenHash,
		UserAgent:         req.UserAgent,
		IPAddress:         req.IPAddress,
		ExpiresAt:         now.Add(24 * time.Hour),
		AbsoluteExpiresAt: now.Add(7 * 24 * time.Hour),
	}); err != nil {
		return nil, errors.E(op, fmt.Errorf("create session: %w", err))
	}

	return &ChangePasswordResponse{
		AccessToken:           accessToken,
		AccessTokenExpiresAt:  now.Add(15 * time.Minute).Unix(),
		RefreshToken:          refreshToken,
		RefreshTokenExpiresAt: now.Add(24 * time.Hour).Unix(),
	}, nil
}
