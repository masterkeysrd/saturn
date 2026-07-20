package iam

import (
	"context"
	"fmt"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/platform/hash"
	"github.com/masterkeysrd/saturn/internal/platform/token"
)

// LoginRequest represents the application input for the user authentication use case.
type LoginRequest struct {
	Identifier string
	Password   string
	UserAgent  string
	IPAddress  string
}

// LoginResponse represents the application output after successful user authentication.
type LoginResponse struct {
	User                  *identity.User
	AccessToken           string
	AccessTokenExpiresAt  int64
	RefreshToken          string
	RefreshTokenExpiresAt int64
}

// Login authenticates credentials, issues access/refresh tokens, and persists the session.
func (c *Coordinator) Login(ctx context.Context, req *LoginRequest) (*LoginResponse, error) {
	user, err := c.identityService.Authenticate(ctx, req.Identifier, req.Password)
	if err != nil {
		return nil, err
	}

	authVersion, err := c.identityService.GetAuthVersion(ctx, user.ID)
	if err != nil {
		return nil, fmt.Errorf("get auth version: %w", err)
	}

	now := time.Now()
	accessToken, _, err := c.tokenService.IssueAccessToken(token.IssueInput{
		Subject:     string(user.ID),
		AccessLevel: string(user.AccessLevel),
		AuthVersion: authVersion,
	}, now)
	if err != nil {
		return nil, fmt.Errorf("issue access token: %w", err)
	}

	// Session refresh token absolute expiry is 7 days, sliding window is 24 hours
	refreshToken, _, err := c.tokenService.IssueRefreshToken(token.IssueInput{
		Subject:     string(user.ID),
		AccessLevel: string(user.AccessLevel),
		AuthVersion: authVersion,
	}, now, now.Add(7*24*time.Hour))
	if err != nil {
		return nil, fmt.Errorf("issue refresh token: %w", err)
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
		return nil, fmt.Errorf("create session: %w", err)
	}

	return &LoginResponse{
		User:                  user,
		AccessToken:           accessToken,
		AccessTokenExpiresAt:  now.Add(15 * time.Minute).Unix(),
		RefreshToken:          refreshToken,
		RefreshTokenExpiresAt: now.Add(24 * time.Hour).Unix(),
	}, nil
}
