package storage

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/jmoiron/sqlx"

	"github.com/masterkeysrd/saturn/internal/domain/identity"
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
	IPAddress         string     `db:"ip_address"`
}

// SessionStore implements identity.SessionStoreProvider using sqlx.
type SessionStore struct {
	db *sqlx.DB
}

// NewSessionStore creates a new SessionStore.
func NewSessionStore(db *sqlx.DB) *SessionStore {
	return &SessionStore{db: db}
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
		IPAddress:         s.IPAddress,
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
		IPAddress:         s.IPAddress,
	}
}

// Create inserts a new session record.
func (s *SessionStore) Create(ctx context.Context, session *identity.Session) error {
	db := toDBSession(session)
	query := `INSERT INTO identity.sessions
		(id, user_id, refresh_token_hash, token_family_id, parent_session_id,
		 expires_at, absolute_expires_at, revoked_at, replaced_at,
		 create_time, last_used_at, user_agent, ip_address)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`
	_, err := s.db.ExecContext(ctx, query,
		db.ID, db.UserID, db.RefreshTokenHash, db.TokenFamilyID,
		db.ParentSessionID, db.ExpiresAt, db.AbsoluteExpiresAt,
		db.RevokedAt, db.ReplacedAt, db.CreateTime, db.LastUsedAt,
		db.UserAgent, db.IPAddress,
	)
	return err
}

// Rotate atomically rotates a refresh token: marks the old session as replaced,
// inserts the successor session, and revokes the entire token family if reuse was detected.
func (s *SessionStore) Rotate(ctx context.Context, refreshTokenHash []byte, now time.Time, successor *identity.Session) (*identity.Session, error) {
	// Pre-fetch the old session before beginning the transaction
	var old sessionDB
	query := `SELECT * FROM identity.sessions WHERE refresh_token_hash = $1 FOR UPDATE`
	if err := s.db.GetContext(ctx, &old, query, refreshTokenHash); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, identity.ErrSessionNotFound
		}
		return nil, fmt.Errorf("query session: %w", err)
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	// Check if already replaced, revoked, or expired
	if old.ReplacedAt != nil || old.RevokedAt != nil || (!old.ExpiresAt.IsZero() && now.After(old.ExpiresAt)) {
		// If already replaced, revoke the family
		if old.ReplacedAt != nil {
			revokeQuery := `UPDATE identity.sessions SET revoked_at = $1 WHERE token_family_id = $2 AND (revoked_at IS NULL OR replaced_at IS NOT NULL)`
			if _, err := tx.ExecContext(ctx, revokeQuery, &now, old.TokenFamilyID); err != nil {
				if rbErr := tx.Rollback(); rbErr != nil {
					return nil, fmt.Errorf("rollback: %w", rbErr)
				}
				return nil, fmt.Errorf("revoke family on reuse: %w", err)
			}
		}
		if err := tx.Rollback(); err != nil {
			return nil, fmt.Errorf("rollback: %w", err)
		}
		return nil, identity.ErrSessionReused
	}

	// Mark old session as replaced
	replaceQuery := `UPDATE identity.sessions SET replaced_at = $1, last_used_at = $2 WHERE id = $3`
	if _, err := tx.ExecContext(ctx, replaceQuery, &now, &now, old.ID); err != nil {
		if rbErr := tx.Rollback(); rbErr != nil {
			return nil, fmt.Errorf("rollback: %w", rbErr)
		}
		return nil, fmt.Errorf("mark replaced: %w", err)
	}

	// Assign values from old session
	successor.TokenFamilyID = identity.TokenFamilyID(old.TokenFamilyID)
	parentID := identity.SessionID(old.ID)
	successor.ParentSessionID = &parentID
	successor.AbsoluteExpiresAt = old.AbsoluteExpiresAt

	// Insert successor
	dbSuccessor := toDBSession(successor)
	insertQuery := `INSERT INTO identity.sessions
		(id, user_id, refresh_token_hash, token_family_id, parent_session_id,
		 expires_at, absolute_expires_at, revoked_at, replaced_at,
		 create_time, last_used_at, user_agent, ip_address)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`
	if _, err := tx.ExecContext(ctx, insertQuery,
		dbSuccessor.ID, dbSuccessor.UserID, dbSuccessor.RefreshTokenHash,
		dbSuccessor.TokenFamilyID, dbSuccessor.ParentSessionID,
		dbSuccessor.ExpiresAt, dbSuccessor.AbsoluteExpiresAt,
		dbSuccessor.RevokedAt, dbSuccessor.ReplacedAt,
		dbSuccessor.CreateTime, dbSuccessor.LastUsedAt,
		dbSuccessor.UserAgent, dbSuccessor.IPAddress,
	); err != nil {
		if rbErr := tx.Rollback(); rbErr != nil {
			return nil, fmt.Errorf("rollback: %w", rbErr)
		}
		return nil, fmt.Errorf("insert successor: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}

	return toDomainSession(dbSuccessor), nil
}

// RevokeByID marks a session as revoked for the specific user.
func (s *SessionStore) RevokeByID(ctx context.Context, sessionID identity.SessionID, userID identity.UserID, now time.Time) error {
	query := `UPDATE identity.sessions SET revoked_at = $1 
		WHERE id = $2 AND user_id = $3 AND (revoked_at IS NULL OR replaced_at IS NOT NULL)`
	res, err := s.db.ExecContext(ctx, query, &now, string(sessionID), string(userID))
	if err != nil {
		return err
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return identity.ErrSessionNotFound
	}
	return nil
}

// RevokeFamily marks all active sessions in a family as revoked.
func (s *SessionStore) RevokeFamily(ctx context.Context, familyID identity.TokenFamilyID, now time.Time) error {
	query := `UPDATE identity.sessions SET revoked_at = $1 WHERE token_family_id = $2 AND (revoked_at IS NULL OR replaced_at IS NOT NULL)`
	_, err := s.db.ExecContext(ctx, query, &now, string(familyID))
	if errors.Is(err, sql.ErrNoRows) {
		return nil // No sessions to revoke
	}
	return err
}

// RevokeAllForUser marks all non-revoked sessions for a user as revoked.
func (s *SessionStore) RevokeAllForUser(ctx context.Context, userID identity.UserID, now time.Time) error {
	query := `UPDATE identity.sessions SET revoked_at = $1 WHERE user_id = $2 AND (revoked_at IS NULL OR replaced_at IS NOT NULL)`
	_, err := s.db.ExecContext(ctx, query, &now, string(userID))
	if errors.Is(err, sql.ErrNoRows) {
		return nil // No sessions to revoke
	}
	return err
}

// RevokeByHash invalidates all sessions in the family matching the given refresh token hash.
func (s *SessionStore) RevokeByHash(ctx context.Context, refreshTokenHash []byte, now time.Time) error {
	query := `UPDATE identity.sessions SET revoked_at = $1 
		WHERE token_family_id = (SELECT token_family_id FROM identity.sessions WHERE refresh_token_hash = $2) 
		  AND (revoked_at IS NULL OR replaced_at IS NOT NULL)`
	_, err := s.db.ExecContext(ctx, query, &now, refreshTokenHash)
	return err
}

// GetActiveSessions returns all currently active sessions for the given user.
func (s *SessionStore) GetActiveSessions(ctx context.Context, userID identity.UserID) ([]*identity.Session, error) {
	var dbSessions []sessionDB
	query := `SELECT * FROM identity.sessions 
		WHERE user_id = $1 
		  AND revoked_at IS NULL 
		  AND replaced_at IS NULL 
		  AND expires_at > NOW()
		ORDER BY last_used_at DESC`
	if err := s.db.SelectContext(ctx, &dbSessions, query, string(userID)); err != nil {
		return nil, fmt.Errorf("select active sessions: %w", err)
	}

	sessions := make([]*identity.Session, len(dbSessions))
	for i, dbSess := range dbSessions {
		sessions[i] = toDomainSession(&dbSess)
	}
	return sessions, nil
}
