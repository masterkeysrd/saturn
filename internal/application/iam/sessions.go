package iam

import (
	"context"
	"fmt"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/identity"
)

// ActiveSession represents a user's active session metadata.
type ActiveSession struct {
	SessionID  string    `json:"session_id"`
	UserAgent  string    `json:"user_agent"`
	IPAddress  string    `json:"ip_address"`
	CreateTime time.Time `json:"create_time"`
	LastUsedAt time.Time `json:"last_used_at"`
}

// ListActiveSessionsRequest is the input for listing active sessions.
type ListActiveSessionsRequest struct {
	UserID string
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

// ListActiveSessions returns all currently active sessions for the user.
func (c *Coordinator) ListActiveSessions(ctx context.Context, req *ListActiveSessionsRequest) (*ListActiveSessionsResponse, error) {
	domainSessions, err := c.identityService.GetActiveSessions(ctx, identity.UserID(req.UserID))
	if err != nil {
		return nil, fmt.Errorf("list active sessions: %w", err)
	}

	sessions := make([]*ActiveSession, len(domainSessions))
	for i, s := range domainSessions {
		lastUsed := s.CreateTime
		if s.LastUsedAt != nil {
			lastUsed = *s.LastUsedAt
		}
		sessions[i] = &ActiveSession{
			SessionID:  string(s.ID),
			UserAgent:  s.UserAgent,
			IPAddress:  s.IPAddress,
			CreateTime: s.CreateTime,
			LastUsedAt: lastUsed,
		}
	}

	return &ListActiveSessionsResponse{Sessions: sessions}, nil
}

// RevokeSession invalidates a specific session for the authenticated user.
func (c *Coordinator) RevokeSession(ctx context.Context, req *RevokeSessionRequest) (*RevokeSessionResponse, error) {
	err := c.identityService.RevokeSessionByID(
		ctx,
		identity.SessionID(req.SessionID),
		identity.UserID(req.UserID),
	)
	if err != nil {
		return nil, fmt.Errorf("revoke session: %w", err)
	}

	return &RevokeSessionResponse{}, nil
}

// RevokeAllSessions invalidates all sessions for the user and increments auth version.
func (c *Coordinator) RevokeAllSessions(ctx context.Context, req *RevokeAllSessionsRequest) (*RevokeAllSessionsResponse, error) {
	_, err := c.identityService.RevokeAllSessions(ctx, identity.UserID(req.UserID))
	if err != nil {
		return nil, fmt.Errorf("revoke all sessions: %w", err)
	}

	return &RevokeAllSessionsResponse{}, nil
}
