package storage

import (
	"context"
	"time"

	"github.com/doug-martin/goqu/v9"
	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/platform/db"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

// sessionDB is the internal DB record type for identity.sessions.
type sessionDB struct {
	ID                string     `db:"id"`
	UserID            string     `db:"user_id"`
	RefreshTokenHash  []byte     `db:"refresh_token_hash"`
	TokenFamilyID     string     `db:"token_family_id"`
	ParentSessionID   *string    `db:"parent_session_id"`
	ExpiresAt         time.Time  `db:"expires_at"`
	AbsoluteExpiresAt time.Time  `db:"absolute_expires_at"`
	RevokedAt         *time.Time `db:"revoked_at"`
	ReplacedAt        *time.Time `db:"replaced_at"`
	CreateTime        time.Time  `db:"create_time"`
	LastUsedAt        *time.Time `db:"last_used_at"`
	UserAgent         string     `db:"user_agent"`
	IPAddress         *string    `db:"ip_address"`
}

// SessionStore implements identity.SessionStoreProvider using db.DB.
type SessionStore struct {
	db db.DB
}

// NewSessionStore creates a new SessionStore.
func NewSessionStore(database db.DB) *SessionStore {
	return &SessionStore{db: database}
}

func toDomainSession(s *sessionDB) *identity.Session {
	var parentID *identity.SessionID
	if s.ParentSessionID != nil {
		pid := identity.SessionID(*s.ParentSessionID)
		parentID = &pid
	}
	return &identity.Session{
		ID:                identity.SessionID(s.ID),
		UserID:            identity.UserID(s.UserID),
		RefreshTokenHash:  s.RefreshTokenHash,
		TokenFamilyID:     identity.TokenFamilyID(s.TokenFamilyID),
		ParentSessionID:   parentID,
		ExpiresAt:         s.ExpiresAt,
		AbsoluteExpiresAt: s.AbsoluteExpiresAt,
		RevokedAt:         s.RevokedAt,
		ReplacedAt:        s.ReplacedAt,
		CreateTime:        s.CreateTime,
		LastUsedAt:        s.LastUsedAt,
		UserAgent:         s.UserAgent,
		IPAddress:         ptrToString(s.IPAddress),
	}
}

func toDBSession(s *identity.Session) *sessionDB {
	var parentID *string
	if s.ParentSessionID != nil {
		pid := string(*s.ParentSessionID)
		parentID = &pid
	}
	return &sessionDB{
		ID:                string(s.ID),
		UserID:            string(s.UserID),
		RefreshTokenHash:  s.RefreshTokenHash,
		TokenFamilyID:     string(s.TokenFamilyID),
		ParentSessionID:   parentID,
		ExpiresAt:         s.ExpiresAt,
		AbsoluteExpiresAt: s.AbsoluteExpiresAt,
		RevokedAt:         s.RevokedAt,
		ReplacedAt:        s.ReplacedAt,
		CreateTime:        s.CreateTime,
		LastUsedAt:        s.LastUsedAt,
		UserAgent:         s.UserAgent,
		IPAddress:         strToPtr(s.IPAddress),
	}
}

// Create inserts a new session record.
func (s *SessionStore) Create(ctx context.Context, session *identity.Session) error {
	const op errors.Op = "domain/identity/storage.CreateSession"

	dbRecord := toDBSession(session)
	q, args, err := pgDialect.Insert(goqu.T("sessions").Schema("identity")).
		Rows(goqu.Record{
			"id":                  dbRecord.ID,
			"user_id":             dbRecord.UserID,
			"refresh_token_hash":  dbRecord.RefreshTokenHash,
			"token_family_id":     dbRecord.TokenFamilyID,
			"parent_session_id":   dbRecord.ParentSessionID,
			"expires_at":          dbRecord.ExpiresAt,
			"absolute_expires_at": dbRecord.AbsoluteExpiresAt,
			"revoked_at":          dbRecord.RevokedAt,
			"replaced_at":         dbRecord.ReplacedAt,
			"create_time":         dbRecord.CreateTime,
			"last_used_at":        dbRecord.LastUsedAt,
			"user_agent":          dbRecord.UserAgent,
			"ip_address":          dbRecord.IPAddress,
		}).
		Prepared(true).
		ToSQL()
	if err != nil {
		return errors.E(op, err)
	}

	if _, err := s.db.Exec(ctx, q, args...); err != nil {
		return errors.E(op, err)
	}
	return nil
}

// GetByID retrieves a session by its unique ID.
func (s *SessionStore) GetByID(ctx context.Context, id identity.SessionID) (*identity.Session, error) {
	const op errors.Op = "domain/identity/storage.GetSessionByID"

	q, args, err := pgDialect.From(goqu.T("sessions").Schema("identity")).
		Where(goqu.C("id").Eq(string(id))).
		Prepared(true).
		ToSQL()
	if err != nil {
		return nil, errors.E(op, err)
	}

	var dbRecord sessionDB
	if err := s.db.Get(ctx, &dbRecord, q, args...); err != nil {
		return nil, errors.E(op, err)
	}
	return toDomainSession(&dbRecord), nil
}

// GetByRefreshTokenHash retrieves a session by its hashed refresh token.
func (s *SessionStore) GetByRefreshTokenHash(ctx context.Context, hash []byte) (*identity.Session, error) {
	const op errors.Op = "domain/identity/storage.GetSessionByRefreshTokenHash"

	q, args, err := pgDialect.From(goqu.T("sessions").Schema("identity")).
		Where(goqu.C("refresh_token_hash").Eq(hash)).
		Prepared(true).
		ToSQL()
	if err != nil {
		return nil, errors.E(op, err)
	}

	var dbRecord sessionDB
	if err := s.db.Get(ctx, &dbRecord, q, args...); err != nil {
		return nil, errors.E(op, err)
	}
	return toDomainSession(&dbRecord), nil
}

// Update persists changes to mutable session fields (revoked_at, replaced_at, last_used_at, expires_at).
func (s *SessionStore) Update(ctx context.Context, session *identity.Session) error {
	const op errors.Op = "domain/identity/storage.UpdateSession"

	dbRecord := toDBSession(session)
	q, args, err := pgDialect.Update(goqu.T("sessions").Schema("identity")).
		Set(goqu.Record{
			"revoked_at":   dbRecord.RevokedAt,
			"replaced_at":  dbRecord.ReplacedAt,
			"last_used_at": dbRecord.LastUsedAt,
			"expires_at":   dbRecord.ExpiresAt,
		}).
		Where(goqu.C("id").Eq(dbRecord.ID)).
		Prepared(true).
		ToSQL()
	if err != nil {
		return errors.E(op, err)
	}

	if err := s.db.ExecOne(ctx, q, args...); err != nil {
		return errors.E(op, err)
	}
	return nil
}

// ListActiveSessions returns all currently active sessions for the given user.
func (s *SessionStore) ListActiveSessions(ctx context.Context, userID identity.UserID) ([]*identity.Session, error) {
	const op errors.Op = "domain/identity/storage.ListActiveSessions"

	q, args, err := pgDialect.From(goqu.T("sessions").Schema("identity")).
		Where(
			goqu.C("user_id").Eq(string(userID)),
			goqu.C("revoked_at").IsNull(),
			goqu.C("replaced_at").IsNull(),
			goqu.C("expires_at").Gt(goqu.L("NOW()")),
		).
		Order(goqu.C("last_used_at").Desc()).
		Prepared(true).
		ToSQL()
	if err != nil {
		return nil, errors.E(op, err)
	}

	var dbSessions []sessionDB
	if err := s.db.Select(ctx, &dbSessions, q, args...); err != nil {
		return nil, errors.E(op, err)
	}

	sessions := make([]*identity.Session, len(dbSessions))
	for i := range dbSessions {
		sessions[i] = toDomainSession(&dbSessions[i])
	}
	return sessions, nil
}

// RevokeFamily marks all active sessions in a family as revoked.
func (s *SessionStore) RevokeFamily(ctx context.Context, familyID identity.TokenFamilyID, now time.Time) error {
	const op errors.Op = "domain/identity/storage.RevokeFamily"

	q, args, err := pgDialect.Update(goqu.T("sessions").Schema("identity")).
		Set(goqu.Record{"revoked_at": now}).
		Where(
			goqu.C("token_family_id").Eq(string(familyID)),
			goqu.Or(goqu.C("revoked_at").IsNull(), goqu.C("replaced_at").IsNotNull()),
		).
		Prepared(true).
		ToSQL()
	if err != nil {
		return errors.E(op, err)
	}

	if _, err := s.db.Exec(ctx, q, args...); err != nil {
		return errors.E(op, err)
	}
	return nil
}

// RevokeAllForUser marks all non-revoked sessions for a user as revoked.
func (s *SessionStore) RevokeAllForUser(ctx context.Context, userID identity.UserID, now time.Time) error {
	const op errors.Op = "domain/identity/storage.RevokeAllForUser"

	q, args, err := pgDialect.Update(goqu.T("sessions").Schema("identity")).
		Set(goqu.Record{"revoked_at": now}).
		Where(
			goqu.C("user_id").Eq(string(userID)),
			goqu.Or(goqu.C("revoked_at").IsNull(), goqu.C("replaced_at").IsNotNull()),
		).
		Prepared(true).
		ToSQL()
	if err != nil {
		return errors.E(op, err)
	}

	if _, err := s.db.Exec(ctx, q, args...); err != nil {
		return errors.E(op, err)
	}
	return nil
}
