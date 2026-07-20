package iam

import (
	"context"
	"fmt"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/platform/hash"
	"github.com/masterkeysrd/saturn/internal/platform/token"
)

// RefreshSessionRequest represents the application input for rotating refresh tokens.
type RefreshSessionRequest struct {
	RefreshToken string
	UserAgent    string
	IPAddress    string
}

// RefreshSessionResponse represents the application output after rotating session tokens.
type RefreshSessionResponse struct {
	AccessToken           string
	AccessTokenExpiresAt  int64
	RefreshToken          string
	RefreshTokenExpiresAt int64
}

// RefreshSession validates the refresh token, checks database auth version, and rotates the session.
func (c *Coordinator) RefreshSession(ctx context.Context, req *RefreshSessionRequest) (*RefreshSessionResponse, error) {
	now := time.Now()

	claims, err := c.tokenService.ValidateRefreshToken(req.RefreshToken, now)
	if err != nil {
		return nil, identity.ErrSessionExpired
	}

	authVersion, err := c.identityService.GetAuthVersion(ctx, identity.UserID(claims.Subject))
	if err != nil {
		return nil, fmt.Errorf("get auth version: %w", err)
	}
	if claims.AuthVersion != authVersion {
		return nil, identity.ErrSessionRevoked
	}

	accessToken, _, err := c.tokenService.IssueAccessToken(token.IssueInput{
		Subject:     claims.Subject,
		AccessLevel: claims.AccessLevel,
		AuthVersion: authVersion,
	}, now)
	if err != nil {
		return nil, fmt.Errorf("issue access token: %w", err)
	}

	successorRefreshToken, _, err := c.tokenService.IssueRefreshToken(token.IssueInput{
		Subject:     claims.Subject,
		AccessLevel: claims.AccessLevel,
		AuthVersion: authVersion,
	}, now, claims.ExpiresAt.Time)
	if err != nil {
		return nil, fmt.Errorf("issue refresh token: %w", err)
	}

	rawTokenHash := hash.SHA256String(req.RefreshToken)
	successorTokenHash := hash.SHA256String(successorRefreshToken)

	_, err = c.identityService.RotateSession(ctx, &identity.RotateSessionRequest{
		RefreshTokenHash: rawTokenHash,
		SuccessorHash:    successorTokenHash,
		UserAgent:        req.UserAgent,
		IPAddress:        req.IPAddress,
		ExpiresAt:        now.Add(24 * time.Hour),
	})
	if err != nil {
		return nil, err
	}

	return &RefreshSessionResponse{
		AccessToken:           accessToken,
		AccessTokenExpiresAt:  now.Add(15 * time.Minute).Unix(),
		RefreshToken:          successorRefreshToken,
		RefreshTokenExpiresAt: now.Add(24 * time.Hour).Unix(),
	}, nil
}
