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

// ActiveSession represents a user's active session metadata.
type ActiveSession struct {
	SessionID  string    `json:"session_id"`
	UserAgent  string    `json:"user_agent"`
	IPAddress  string    `json:"ip_address"`
	CreateTime time.Time `json:"create_time"`
	LastUsedAt time.Time `json:"last_used_at"`
	IsCurrent  bool      `json:"is_current"`
}

// ListActiveSessionsRequest is the input for listing active sessions.
type ListActiveSessionsRequest struct {
	UserID           string
	CurrentSessionID string
}

// ListActiveSessionsResponse is the output containing the list of active sessions.
type ListActiveSessionsResponse struct {
	Sessions []*ActiveSession
}

// RevokeSessionRequest is the input for revoking a specific session.
type RevokeSessionRequest struct {
	SessionID string
	UserID    string
}

// RevokeSessionResponse is the output after revoking a session.
type RevokeSessionResponse struct{}

// RevokeAllSessionsRequest is the input for revoking all sessions.
type RevokeAllSessionsRequest struct {
	UserID string
}

// RevokeAllSessionsResponse is the output after revoking all sessions.
type RevokeAllSessionsResponse struct{}

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

// LogoutRequest represents the application input for logging out a session.
type LogoutRequest struct {
	RefreshToken string
}

// LogoutResponse represents the application output after logging out.
type LogoutResponse struct{}

// ListActiveSessions returns all currently active sessions for the user.
func (c *coordinator) ListActiveSessions(ctx context.Context, req *ListActiveSessionsRequest) (*ListActiveSessionsResponse, error) {
	domainSessions, err := c.identityService.ListActiveSessions(ctx, identity.UserID(req.UserID))
	if err != nil {
		return nil, err
	}

	sessions := make([]*ActiveSession, len(domainSessions))
	for i, s := range domainSessions {
		lastUsed := s.CreateTime
		if s.LastUsedAt != nil {
			lastUsed = *s.LastUsedAt
		}
		isCurrent := req.CurrentSessionID != "" && string(s.ID) == req.CurrentSessionID
		sessions[i] = &ActiveSession{
			SessionID:  string(s.ID),
			UserAgent:  s.UserAgent,
			IPAddress:  s.IPAddress,
			CreateTime: s.CreateTime,
			LastUsedAt: lastUsed,
			IsCurrent:  isCurrent,
		}
	}

	return &ListActiveSessionsResponse{Sessions: sessions}, nil
}

// RevokeSession invalidates a specific session for the authenticated user.
func (c *coordinator) RevokeSession(ctx context.Context, req *RevokeSessionRequest) (*RevokeSessionResponse, error) {
	err := c.identityService.RevokeSessionByID(
		ctx,
		identity.SessionID(req.SessionID),
		identity.UserID(req.UserID),
	)
	if err != nil {
		return nil, err
	}

	return &RevokeSessionResponse{}, nil
}

// RevokeAllSessions invalidates all sessions for the user and increments auth version.
func (c *coordinator) RevokeAllSessions(ctx context.Context, req *RevokeAllSessionsRequest) (*RevokeAllSessionsResponse, error) {
	_, err := c.identityService.RevokeAllSessions(ctx, identity.UserID(req.UserID))
	if err != nil {
		return nil, err
	}

	return &RevokeAllSessionsResponse{}, nil
}

// RefreshSession validates the refresh token, checks database auth version, and rotates the session.
func (c *coordinator) RefreshSession(ctx context.Context, req *RefreshSessionRequest) (*RefreshSessionResponse, error) {
	const op errors.Op = "application/iam.RefreshSession"
	now := time.Now()

	claims, err := c.tokenService.ValidateRefreshToken(req.RefreshToken, now)
	if err != nil {
		return nil, errors.E(op, errors.Unauthenticated, identity.SessionExpired, "session expired")
	}

	authVersion, err := c.identityService.GetAuthVersion(ctx, identity.UserID(claims.Subject))
	if err != nil {
		return nil, errors.E(op, fmt.Errorf("get auth version: %w", err))
	}
	if claims.AuthVersion != authVersion {
		return nil, errors.E(op, errors.Unauthenticated, identity.SessionRevoked, "session revoked")
	}

	successorRefreshToken, _, err := c.tokenService.IssueRefreshToken(token.IssueInput{
		Subject:     claims.Subject,
		AccessLevel: claims.AccessLevel,
		AuthVersion: authVersion,
	}, now, claims.ExpiresAt.Time)
	if err != nil {
		return nil, errors.E(op, fmt.Errorf("issue refresh token: %w", err))
	}

	rawTokenHash := hash.SHA256String(req.RefreshToken)
	successorTokenHash := hash.SHA256String(successorRefreshToken)

	rotatedSession, err := c.identityService.RotateSession(ctx, &identity.RotateSessionRequest{
		RefreshTokenHash: rawTokenHash,
		SuccessorHash:    successorTokenHash,
		UserAgent:        req.UserAgent,
		IPAddress:        req.IPAddress,
		ExpiresAt:        now.Add(24 * time.Hour),
	})
	if err != nil {
		return nil, errors.E(op, err)
	}

	accessToken, _, err := c.tokenService.IssueAccessToken(token.IssueInput{
		Subject:     claims.Subject,
		AccessLevel: claims.AccessLevel,
		AuthVersion: authVersion,
		SessionID:   string(rotatedSession.ID),
	}, now)
	if err != nil {
		return nil, errors.E(op, fmt.Errorf("issue access token: %w", err))
	}

	return &RefreshSessionResponse{
		AccessToken:           accessToken,
		AccessTokenExpiresAt:  now.Add(15 * time.Minute).Unix(),
		RefreshToken:          successorRefreshToken,
		RefreshTokenExpiresAt: now.Add(24 * time.Hour).Unix(),
	}, nil
}

// Logout validates the refresh token and revokes the associated token family.
func (c *coordinator) Logout(ctx context.Context, req *LogoutRequest) (*LogoutResponse, error) {
	now := time.Now()
	_, err := c.tokenService.ValidateRefreshToken(req.RefreshToken, now)
	if err != nil {
		return nil, err
	}

	rawTokenHash := hash.SHA256String(req.RefreshToken)

	if err := c.identityService.RevokeSessionByHash(ctx, rawTokenHash); err != nil {
		return nil, err
	}

	return &LogoutResponse{}, nil
}
