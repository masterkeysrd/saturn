package identity

import (
	"context"
	"time"
)

// SessionStoreProvider provides access to session persistence operations.
type SessionStoreProvider interface {
	Create(ctx context.Context, session *Session) error
	Rotate(ctx context.Context, refreshTokenHash []byte, now time.Time, successor *Session) (*Session, error)
	RevokeByID(ctx context.Context, sessionID SessionID, userID UserID, now time.Time) error
	RevokeFamily(ctx context.Context, familyID TokenFamilyID, now time.Time) error
	RevokeAllForUser(ctx context.Context, userID UserID, now time.Time) error
	RevokeByHash(ctx context.Context, refreshTokenHash []byte, now time.Time) error
	GetActiveSessions(ctx context.Context, userID UserID) ([]*Session, error)
}
