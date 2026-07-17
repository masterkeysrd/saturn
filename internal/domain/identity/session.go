package identity

import "time"

// SessionID is a string type representing a session's unique identifier.
type SessionID string

// TokenFamilyID is a string type representing a token family's unique identifier.
type TokenFamilyID string

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
