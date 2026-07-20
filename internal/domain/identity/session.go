package identity

import (
	"fmt"
	"time"

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
