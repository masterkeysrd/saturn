package identity

import (
	"fmt"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/id"
)

const (
	sessionPrefix = "ses_"
	familyPrefix  = "tfm_"
)

// SessionID is a string type representing a session's unique identifier.
type SessionID string

// NewSessionID creates a new SessionID using the default ID generator.
func NewSessionID() (SessionID, error) {
	raw, err := id.Generate(sessionPrefix)
	if err != nil {
		return "", err
	}
	return SessionID(raw), nil
}

// ParseSessionID parses a string into a SessionID and validates it.
func ParseSessionID(s string) (SessionID, error) {
	if err := id.Validate(s, sessionPrefix); err != nil {
		return "", fmt.Errorf("invalid session ID: %w", err)
	}
	return SessionID(s), nil
}

// TokenFamilyID is a string type representing a token family's unique identifier.
type TokenFamilyID string

// NewTokenFamilyID creates a new TokenFamilyID using the default ID generator.
func NewTokenFamilyID() (TokenFamilyID, error) {
	raw, err := id.Generate(familyPrefix)
	if err != nil {
		return "", err
	}
	return TokenFamilyID(raw), nil
}

// ParseTokenFamilyID parses a string into a TokenFamilyID and validates it.
func ParseTokenFamilyID(s string) (TokenFamilyID, error) {
	if err := id.Validate(s, familyPrefix); err != nil {
		return "", fmt.Errorf("invalid token family ID: %w", err)
	}
	return TokenFamilyID(s), nil
}

// Session represents an authenticated session for a user.
type Session struct {
	ID                SessionID
	UserID            UserID
	RefreshTokenHash  []byte
	TokenFamilyID     TokenFamilyID
	ParentSessionID   *SessionID
	ExpiresAt         time.Time
	AbsoluteExpiresAt time.Time
	RevokedAt         *time.Time
	ReplacedAt        *time.Time
	CreateTime        time.Time
	LastUsedAt        *time.Time
	UserAgent         string
	IPAddress         string
}

// CreateSessionRequest encapsulates the fields required to create a new user session.
type CreateSessionRequest struct {
	UserID            UserID
	RefreshTokenHash  []byte
	UserAgent         string
	IPAddress         string
	ExpiresAt         time.Time
	AbsoluteExpiresAt time.Time
}

// RotateSessionRequest encapsulates the fields required to rotate an existing session.
type RotateSessionRequest struct {
	RefreshTokenHash []byte
	SuccessorHash    []byte
	UserAgent        string
	IPAddress        string
	ExpiresAt        time.Time
}

// IsRevoked checks whether the session has been revoked.
func (s *Session) IsRevoked() bool {
	return s.RevokedAt != nil
}

// IsReplaced checks whether the session has already been replaced by a successor.
func (s *Session) IsReplaced() bool {
	return s.ReplacedAt != nil
}

// IsExpired checks whether the session has exceeded its sliding expiration.
func (s *Session) IsExpired(now time.Time) bool {
	if s.ExpiresAt.IsZero() {
		return false
	}
	return now.After(s.ExpiresAt)
}

// IsActive returns true if the session is not revoked, not replaced, and not expired.
func (s *Session) IsActive(now time.Time) bool {
	return !s.IsRevoked() && !s.IsReplaced() && !s.IsExpired(now)
}

// Revoke marks the session as revoked at the specified timestamp.
func (s *Session) Revoke(now time.Time) {
	s.RevokedAt = &now
}

// RotateInput encapsulates the parameters required to rotate an existing session into a successor.
type RotateInput struct {
	SuccessorID   SessionID
	SuccessorHash []byte
	UserAgent     string
	IPAddress     string
	ExpiresAt     time.Time
	Now           time.Time
}

// Rotate marks the current session as replaced and constructs the successor Session.
// It returns a domain error if the session is already replaced (reuse attack), revoked, or expired.
func (s *Session) Rotate(in RotateInput) (*Session, error) {
	if s.IsReplaced() {
		return nil, errors.E(errors.Conflict, SessionReused, "session reused")
	}
	if s.IsRevoked() {
		return nil, errors.E(errors.Unauthenticated, SessionRevoked, "session revoked")
	}
	if s.IsExpired(in.Now) {
		return nil, errors.E(errors.Unauthenticated, SessionExpired, "session expired")
	}

	s.ReplacedAt = &in.Now
	s.LastUsedAt = &in.Now

	parentID := s.ID
	successor := &Session{
		ID:                in.SuccessorID,
		UserID:            s.UserID,
		RefreshTokenHash:  in.SuccessorHash,
		TokenFamilyID:     s.TokenFamilyID,
		ParentSessionID:   &parentID,
		ExpiresAt:         in.ExpiresAt,
		AbsoluteExpiresAt: s.AbsoluteExpiresAt,
		CreateTime:        in.Now,
		LastUsedAt:        &in.Now,
		UserAgent:         in.UserAgent,
		IPAddress:         in.IPAddress,
	}

	return successor, nil
}
