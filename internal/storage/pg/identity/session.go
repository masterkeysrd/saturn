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
	params := GetSessionByIDParams{
		Id: sessionID.String(),
	}

	query, args, err := s.db.BindNamed(GetSessionByIDQuery, params)
	if err != nil {
		return nil, fmt.Errorf("failed to bind named query: %w", err)
	}

	query = s.db.Rebind(query)

	var entity SessionEntity
	if err := s.db.GetContext(ctx, &entity, query, args...); err != nil {
		return nil, fmt.Errorf("failed to get session: %w", err)
	}

	return entity.ToModel(), nil
}

func (s *SessionStore) Store(ctx context.Context, session *identity.Session) error {
	entity := SessionEntityFromModel(session)
	if _, err := s.db.NamedExecContext(ctx, UpsertSessionQuery, entity); err != nil {
		return fmt.Errorf("failed to upsert session: %w", err)
	}
	return nil
}

func (s *SessionStore) Delete(ctx context.Context, sessionID identity.SessionID) error {
	params := DeleteSessionByIDParams{
		Id: sessionID.String(),
	}

	if _, err := s.db.NamedExecContext(ctx, DeleteSessionByIDQuery, params); err != nil {
		return fmt.Errorf("failed to delete session: %w", err)
	}
	return nil
}

func (s *SessionStore) DeleteBy(ctx context.Context, criteria identity.DeleteSessionCriteria) error {
	var query string
	var params any
	switch c := criteria.(type) {
	case identity.ByUserID:
		query = DeleteSessionsByUserIDQuery
		params = DeleteSessionsByUserIDParams{
			UserId: string(c),
		}
	default:
		return fmt.Errorf("unsupported criteria type: %T", criteria)
	}

	if _, err := s.db.NamedExecContext(ctx, query, params); err != nil {
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
