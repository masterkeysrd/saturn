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

// Rotate atomically rotates a refresh token: marks the old session as replaced,
// inserts the successor session, and revokes the entire token family if reuse was detected.
func (s *SessionStore) Rotate(ctx context.Context, refreshTokenHash []byte, now time.Time, successor *identity.Session) (*identity.Session, error) {
	const op errors.Op = "domain/identity/storage.RotateSession"

	execute := func(txCtx context.Context) error {
		// 1. Lock and fetch current session
		q, args, err := pgDialect.From(goqu.T("sessions").Schema("identity")).
			Where(goqu.C("refresh_token_hash").Eq(refreshTokenHash)).
			ForUpdate(goqu.Wait).
			Prepared(true).
			ToSQL()
		if err != nil {
			return errors.E(op, err)
		}

		var old sessionDB
		if err := s.db.Get(txCtx, &old, q, args...); err != nil {
			if errors.Is(err, errors.NotExist) {
				return errors.E(op, errors.NotExist, identity.SessionNotFound, "session not found")
			}
			return errors.E(op, err)
		}

		// 2. Check if already replaced, revoked, or expired
		if old.ReplacedAt != nil || old.RevokedAt != nil || (!old.ExpiresAt.IsZero() && now.After(old.ExpiresAt)) {
			if old.ReplacedAt != nil {
				revokeQ, revokeArgs, err := pgDialect.Update(goqu.T("sessions").Schema("identity")).
					Set(goqu.Record{"revoked_at": now}).
					Where(
						goqu.C("token_family_id").Eq(old.TokenFamilyID),
						goqu.Or(goqu.C("revoked_at").IsNull(), goqu.C("replaced_at").IsNotNull()),
					).
					Prepared(true).
					ToSQL()
				if err == nil {
					_, _ = s.db.Exec(txCtx, revokeQ, revokeArgs...)
				}
				return errors.E(op, errors.Conflict, identity.SessionReused, "session reused")
			}
			if old.RevokedAt != nil {
				return errors.E(op, errors.Unauthenticated, identity.SessionRevoked, "session revoked")
			}
			return errors.E(op, errors.Unauthenticated, identity.SessionExpired, "session expired")
		}

		// 3. Mark old session as replaced
		replaceQ, replaceArgs, err := pgDialect.Update(goqu.T("sessions").Schema("identity")).
			Set(goqu.Record{
				"replaced_at":  now,
				"last_used_at": now,
			}).
			Where(goqu.C("id").Eq(old.ID)).
			Prepared(true).
			ToSQL()
		if err != nil {
			return errors.E(op, err)
		}

		if err := s.db.ExecOne(txCtx, replaceQ, replaceArgs...); err != nil {
			return errors.E(op, err)
		}

		// 4. Populate successor from old session
		successor.UserID = identity.UserID(old.UserID)
		successor.TokenFamilyID = identity.TokenFamilyID(old.TokenFamilyID)
		parentID := identity.SessionID(old.ID)
		successor.ParentSessionID = &parentID
		successor.AbsoluteExpiresAt = old.AbsoluteExpiresAt

		// 5. Insert successor session
		dbSuccessor := toDBSession(successor)
		insertQ, insertArgs, err := pgDialect.Insert(goqu.T("sessions").Schema("identity")).
			Rows(goqu.Record{
				"id":                  dbSuccessor.ID,
				"user_id":             dbSuccessor.UserID,
				"refresh_token_hash":  dbSuccessor.RefreshTokenHash,
				"token_family_id":     dbSuccessor.TokenFamilyID,
				"parent_session_id":   dbSuccessor.ParentSessionID,
				"expires_at":          dbSuccessor.ExpiresAt,
				"absolute_expires_at": dbSuccessor.AbsoluteExpiresAt,
				"revoked_at":          dbSuccessor.RevokedAt,
				"replaced_at":         dbSuccessor.ReplacedAt,
				"create_time":         dbSuccessor.CreateTime,
				"last_used_at":        dbSuccessor.LastUsedAt,
				"user_agent":          dbSuccessor.UserAgent,
				"ip_address":          dbSuccessor.IPAddress,
			}).
			Prepared(true).
			ToSQL()
		if err != nil {
			return errors.E(op, err)
		}

		if _, err := s.db.Exec(txCtx, insertQ, insertArgs...); err != nil {
			return errors.E(op, err)
		}

		return nil
	}

	if txr, ok := s.db.(db.Transactor); ok {
		if err := txr.WithTx(ctx, execute); err != nil {
			return nil, err
		}
	} else {
		if err := execute(ctx); err != nil {
			return nil, err
		}
	}

	return successor, nil
}

// RevokeByID marks a session as revoked for the specific user.
func (s *SessionStore) RevokeByID(ctx context.Context, sessionID identity.SessionID, userID identity.UserID, now time.Time) error {
	const op errors.Op = "domain/identity/storage.RevokeSessionByID"

	q, args, err := pgDialect.Update(goqu.T("sessions").Schema("identity")).
		Set(goqu.Record{"revoked_at": now}).
		Where(
			goqu.C("id").Eq(string(sessionID)),
			goqu.C("user_id").Eq(string(userID)),
			goqu.Or(goqu.C("revoked_at").IsNull(), goqu.C("replaced_at").IsNotNull()),
		).
		Prepared(true).
		ToSQL()
	if err != nil {
		return errors.E(op, err)
	}

	if err := s.db.ExecOne(ctx, q, args...); err != nil {
		if errors.Is(err, errors.NotExist) {
			return errors.E(op, errors.NotExist, identity.SessionNotFound, "session not found")
		}
		return errors.E(op, err)
	}
	return nil
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

// RevokeByHash invalidates all sessions in the family matching the given refresh token hash.
func (s *SessionStore) RevokeByHash(ctx context.Context, refreshTokenHash []byte, now time.Time) error {
	const op errors.Op = "domain/identity/storage.RevokeByHash"

	subQ := pgDialect.From(goqu.T("sessions").Schema("identity")).
		Select("token_family_id").
		Where(goqu.C("refresh_token_hash").Eq(refreshTokenHash))

	q, args, err := pgDialect.Update(goqu.T("sessions").Schema("identity")).
		Set(goqu.Record{"revoked_at": now}).
		Where(
			goqu.C("token_family_id").In(subQ),
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

// GetActiveSessions returns all currently active sessions for the given user.
func (s *SessionStore) GetActiveSessions(ctx context.Context, userID identity.UserID) ([]*identity.Session, error) {
	const op errors.Op = "domain/identity/storage.GetActiveSessions"

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
