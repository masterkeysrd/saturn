package identitypg

import (
	"context"
	"fmt"
	"time"

	"github.com/jmoiron/sqlx"
	"github.com/masterkeysrd/saturn/internal/domain/identity"
)

var _ identity.SessionStore = (*SessionStore)(nil)

// SessionStore implements identity.SessionStore using PostgreSQL as the backend.
type SessionStore struct {
	db      *sqlx.DB
	queries *SessionQueries
}

// NewSessionStore creates a new instance of SessionStore.
func NewSessionStore(db *sqlx.DB) (*SessionStore, error) {
	queries, err := NewSessionQueries(db)
	if err != nil {
		return nil, err
	}
	return &SessionStore{
		db:      db,
		queries: queries,
	}, nil
}

func (s *SessionStore) Get(ctx context.Context, sessionID identity.SessionID) (*identity.Session, error) {
	var entity SessionEntity
	row := s.queries.GetByID(ctx, sessionID)
	if err := row.StructScan(&entity); err != nil {
		return nil, fmt.Errorf("failed to scan session fields: %w", err)
	}

	return entity.ToModel(), nil
}

func (s *SessionStore) Store(ctx context.Context, session *identity.Session) error {
	entity := SessionEntityFromModel(session)
	if err := s.queries.Upsert(ctx, entity); err != nil {
		return fmt.Errorf("failed to upsert session: %w", err)
	}
	return nil
}

func (s *SessionStore) Delete(ctx context.Context, sessionID identity.SessionID) error {
	if err := s.queries.DeleteByID(ctx, sessionID); err != nil {
		return fmt.Errorf("failed to delete session: %w", err)
	}
	return nil
}

func (s *SessionStore) DeleteBy(ctx context.Context, criteria identity.DeleteSessionCriteria) error {
	query, args, err := s.queries.DeleteByCriteria(criteria)
	if err != nil {
		return fmt.Errorf("failed to build delete query: %w", err)
	}

	_, err = s.db.NamedExecContext(ctx, query, args)
	if err != nil {
		return fmt.Errorf("failed to execute delete query: %w", err)
	}

	return nil
}

var (
	getSessionByIDQuery = `
SELECT
	id,
	user_id,
	token_hash,
	user_agent,
	client_ip,
	expires_at,
	created_at,
	updated_at
FROM
	identity.sessions
WHERE
	id = :id
`

	upsertSessionQuery = `
INSERT INTO identity.sessions (
	id,
	user_id,
	token_hash,
	user_agent,
	client_ip,
	expires_at,
	created_at,
	updated_at
) VALUES (
	:id,
	:user_id,
	:token_hash,
	:user_agent,
	:client_ip,
	:expires_at,
	:created_at,
	:updated_at
)
ON CONFLICT (id) DO UPDATE SET
	user_id = EXCLUDED.user_id,
	token_hash = EXCLUDED.token_hash,
	user_agent = EXCLUDED.user_agent,
	client_ip = EXCLUDED.client_ip,
	expires_at = EXCLUDED.expires_at,
	updated_at = EXCLUDED.updated_at
`

	deleteSessionByIDQuery = `
DELETE FROM
	identity.sessions
WHERE
	id = :id
`

	deleteByQuery = `
DELETE FROM
	identity.sessions
WHERE
	%s
`
)

type SessionQueries struct {
	getByIDSmt     *sqlx.NamedStmt
	upsertStmt     *sqlx.NamedStmt
	deleteByIDStmt *sqlx.NamedStmt
}

func NewSessionQueries(db *sqlx.DB) (*SessionQueries, error) {
	getByIDSmt, err := db.PrepareNamed(getSessionByIDQuery)
	if err != nil {
		return nil, err
	}

	upsertStmt, err := db.PrepareNamed(upsertSessionQuery)
	if err != nil {
		return nil, err
	}

	deleteByIDStmt, err := db.PrepareNamed(deleteSessionByIDQuery)
	if err != nil {
		return nil, err
	}

	return &SessionQueries{
		getByIDSmt:     getByIDSmt,
		upsertStmt:     upsertStmt,
		deleteByIDStmt: deleteByIDStmt,
	}, nil
}

func (q *SessionQueries) GetByID(ctx context.Context, sessionID identity.SessionID) *sqlx.Row {
	params := struct {
		ID identity.SessionID `db:"id"`
	}{
		ID: sessionID,
	}
	return q.getByIDSmt.QueryRowxContext(ctx, params)
}

func (q *SessionQueries) Upsert(ctx context.Context, entity *SessionEntity) error {
	_, err := q.upsertStmt.ExecContext(ctx, entity)
	return err
}

func (q *SessionQueries) DeleteByID(ctx context.Context, sessionID identity.SessionID) error {
	params := struct {
		ID identity.SessionID `db:"id"`
	}{
		ID: sessionID,
	}
	_, err := q.deleteByIDStmt.ExecContext(ctx, params)
	return err
}

func (q *SessionQueries) DeleteByCriteria(criteria identity.DeleteSessionCriteria) (string, any, error) {
	var condition string
	var args any

	switch c := criteria.(type) {
	case identity.ByUserID:
		condition = "user_id = :user_id"
		args = struct {
			UserID string `db:"user_id"`
		}{
			UserID: string(c),
		}
	default:
		return "", nil, fmt.Errorf("unsupported delete session criteria type")
	}

	query := fmt.Sprintf(deleteByQuery, condition)
	return query, args, nil
}

type SessionEntity struct {
	ID        identity.SessionID `db:"id"`
	UserID    identity.UserID    `db:"user_id"`
	TokenHash string             `db:"token_hash"`
	UserAgent string             `db:"user_agent"`
	ClientIP  string             `db:"client_ip"`
	ExpiresAt time.Time          `db:"expires_at"`
	CreatedAt time.Time          `db:"created_at"`
	UpdatedAt time.Time          `db:"updated_at"`
}

func SessionEntityFromModel(session *identity.Session) *SessionEntity {
	return &SessionEntity{
		ID:        session.ID,
		UserID:    session.UserID,
		TokenHash: session.TokenHash,
		UserAgent: session.UserAgent,
		ClientIP:  session.ClientIP,
		ExpiresAt: session.ExpiresAt,
		CreatedAt: session.CreatedAt,
		UpdatedAt: session.UpdatedAt,
	}
}

func (e *SessionEntity) ToModel() *identity.Session {
	return &identity.Session{
		ID:        e.ID,
		UserID:    e.UserID,
		TokenHash: e.TokenHash,
		UserAgent: e.UserAgent,
		ClientIP:  e.ClientIP,
		ExpiresAt: e.ExpiresAt,
		CreatedAt: e.CreatedAt,
		UpdatedAt: e.UpdatedAt,
	}
}
