package identity

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/masterkeysrd/saturn/internal/foundation/id"
)

const (
	DefaultSessionTTL  = 24 * time.Hour
	ExtendedSessionTTL = 7 * 24 * time.Hour // 7 days
	SessionTokenLength = 32
)

// SessionStore defines methods to manage sessions.
type SessionStore interface {
	// Get retrieves a session by its unique ID.
	Get(context.Context, SessionID) (*Session, error)

	// Store saves a new session to the store.
	Store(context.Context, *Session) error

	// Delete removes a session from the store by its unique ID.
	Delete(context.Context, SessionID) error

	// DeleteBy removes sessions based on the given criteria.
	DeleteBy(context.Context, DeleteSessionCriteria) error
}

// DeleteSessionCriteria represents criteria to delete sessions.
type DeleteSessionCriteria interface {
	isDeleteSessionCriteria()
}

// TokenHasher defines the interface for token hashing and comparison.
type TokenHasher interface {
	Hash(token string) (string, error)
	Compare(hash, token string) bool
}

// SecretGenerator defines the interface for generating secrets.
type SecretGenerator interface {
	// GenerateSecret creates a random secret of the specified length.
	GenerateSecret(int) (string, error)
}

type SessionID string

func (sid SessionID) String() string {
	return string(sid)
}

type Session struct {
	ID         SessionID
	UserID     UserID
	TokenHash  string // Hash of the current refresh token
	UserAgent  *string
	ClientIP   *string
	ExpireTime time.Time
	CreateTime time.Time
	UpdateTime time.Time
}

// Initialize sets up a new session with a unique ID and timestamps.
func (s *Session) Initialize() error {
	if s == nil {
		return fmt.Errorf("session is nil")
	}

	sid, err := id.New[SessionID]()
	if err != nil {
		return err
	}

	now := time.Now().UTC()
	s.ID = sid
	s.CreateTime = now
	s.UpdateTime = now

	return nil
}

// Sanitize cleans up the session data.
func (s *Session) Sanitize() {
	if s == nil {
		return
	}

	if s.UserAgent != nil {
		*s.UserAgent = strings.TrimSpace(*s.UserAgent)
	}
	if s.ClientIP != nil {
		*s.ClientIP = strings.TrimSpace(*s.ClientIP)
	}
}

// Validate checks if the session data is valid.
func (s *Session) Validate() error {
	if s == nil {
		return fmt.Errorf("session is nil")
	}

	if err := id.Validate(s.ID); err != nil {
		return fmt.Errorf("user ID is required")
	}

	if s.ExpireTime.IsZero() {
		return fmt.Errorf("expires at is required")
	}

	if s.IsExpired() {
		return fmt.Errorf("session is expired")
	}

	if s.TokenHash == "" {
		return fmt.Errorf("token hash is required")
	}

	return nil
}

// IsExpired checks if the session has expired.
func (s *Session) IsExpired() bool {
	if s == nil {
		return true
	}

	return time.Now().UTC().After(s.ExpireTime)
}

// GenerateToken creates a new session token secret, hashes it into the session,
// and return the raw token.
func (s *Session) GenerateToken(hasher TokenHasher, gen SecretGenerator) (string, error) {
	if s == nil {
		return "", fmt.Errorf("session is nil")
	}

	token, err := gen.GenerateSecret(SessionTokenLength)
	if err != nil {
		return "", fmt.Errorf("failed to generate session token: %w", err)
	}

	s.TokenHash, err = hasher.Hash(token)
	if err != nil {
		return "", fmt.Errorf("failed to hash session token: %w", err)
	}

	s.UpdateTime = time.Now().UTC()
	return token, nil
}

// VerifyToken checks if the provided token matches the stored token hash.
func (s *Session) VerifyToken(token string, hasher TokenHasher) bool {
	if s == nil {
		return false
	}

	return hasher.Compare(s.TokenHash, token)
}

type RefreshSessionInput struct {
	SessionID SessionID
	Token     string
}

func (v *RefreshSessionInput) Validate() error {
	if v == nil {
		return fmt.Errorf("input is nil")
	}

	if err := id.Validate(v.SessionID); err != nil {
		return fmt.Errorf("invalid session ID: %w", err)
	}

	if strings.TrimSpace(v.Token) == "" {
		return fmt.Errorf("token cannot be empty")
	}

	return nil
}
