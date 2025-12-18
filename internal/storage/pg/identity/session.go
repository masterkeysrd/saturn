package identitypg

import (
	"context"
	"fmt"

	"github.com/jmoiron/sqlx"
	"github.com/masterkeysrd/saturn/internal/domain/identity"
)

var _ identity.SessionStore = (*SessionStore)(nil)

// SessionStore implements identity.SessionStore using PostgreSQL as the backend.
type SessionStore struct {
	db *sqlx.DB
}

// NewSessionStore creates a new instance of SessionStore.
func NewSessionStore(db *sqlx.DB) (*SessionStore, error) {
	return &SessionStore{
		db: db,
	}, nil
}

func (s *SessionStore) Get(ctx context.Context, sessionID identity.SessionID) (*identity.Session, error) {
	entity, err := GetSessionByID(ctx, s.db, &GetSessionByIDParams{
		Id: sessionID.String(),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to get session: %w", err)
	}

	return entity.ToModel(), nil
}

func (s *SessionStore) Store(ctx context.Context, session *identity.Session) error {
	if _, err := UpsertSession(ctx, s.db, SessionEntityFromModel(session)); err != nil {
		return fmt.Errorf("failed to upsert session: %w", err)
	}
	return nil
}

func (s *SessionStore) Delete(ctx context.Context, sessionID identity.SessionID) error {
	if _, err := DeleteSessionByID(ctx, s.db, &DeleteSessionByIDParams{
		Id: sessionID.String(),
	}); err != nil {
		return fmt.Errorf("failed to delete session: %w", err)
	}
	return nil
}

func (s *SessionStore) DeleteBy(ctx context.Context, criteria identity.DeleteSessionCriteria) error {
	var err error
	switch c := criteria.(type) {
	case identity.ByUserID:
		_, err = DeleteSessionsByUserID(ctx, s.db, &DeleteSessionsByUserIDParams{
			UserId: string(c),
		})
	default:
		return fmt.Errorf("unsupported criteria type: %T", criteria)
	}

	if err != nil {
		return fmt.Errorf("failed to delete sessions: %w", err)
	}

	return nil
}

func SessionEntityFromModel(session *identity.Session) *SessionEntity {
	return &SessionEntity{
		Id:         session.ID.String(),
		UserId:     session.UserID.String(),
		TokenHash:  session.TokenHash,
		UserAgent:  session.UserAgent,
		ClientIp:   session.ClientIP,
		ExpireTime: session.ExpireTime,
		CreateTime: session.CreateTime,
		UpdateTime: session.UpdateTime,
	}
}

func (e *SessionEntity) ToModel() *identity.Session {
	return &identity.Session{
		ID:         identity.SessionID(e.Id),
		UserID:     identity.UserID(e.UserId),
		TokenHash:  e.TokenHash,
		UserAgent:  e.UserAgent,
		ClientIP:   e.ClientIp,
		ExpireTime: e.ExpireTime,
		CreateTime: e.CreateTime,
		UpdateTime: e.UpdateTime,
	}
}
