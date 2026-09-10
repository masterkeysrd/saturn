package identity

import (
	"context"
	"time"
)

// SessionStoreProvider provides access to session persistence operations.
type SessionStoreProvider interface {
	Create(ctx context.Context, session *Session) error
	GetByID(ctx context.Context, id SessionID) (*Session, error)
	GetByRefreshTokenHash(ctx context.Context, hash []byte) (*Session, error)
	Update(ctx context.Context, session *Session) error
	ListActiveSessions(ctx context.Context, userID UserID) ([]*Session, error)
	RevokeFamily(ctx context.Context, familyID TokenFamilyID, now time.Time) error
	RevokeAllForUser(ctx context.Context, userID UserID, now time.Time) error
}
