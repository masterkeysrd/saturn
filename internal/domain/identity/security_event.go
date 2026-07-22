package identity

import (
	"context"
	"time"
)

// SecurityEventType represents the classification of a security event.
type SecurityEventType string

const (
	SecurityEventLoginSuccess    SecurityEventType = "login_success"
	SecurityEventLoginFailed     SecurityEventType = "login_failed"
	SecurityEventAccountLocked   SecurityEventType = "account_locked"
	SecurityEventAccountUnlocked SecurityEventType = "account_unlocked"
)

// SecurityEvent represents a recorded authentication or authorization event.
type SecurityEvent struct {
	ID        string            `json:"id"`
	UserID    *UserID           `json:"user_id,omitempty"`
	Email     string            `json:"email"`
	EventType SecurityEventType `json:"event_type"`
	IPAddress string            `json:"ip_address"`
	UserAgent string            `json:"user_agent"`
	CreatedAt time.Time         `json:"created_at"`
}

// SecurityEventFilter configures queries for listing security events.
type SecurityEventFilter struct {
	UserID        *UserID
	Email         string
	EventType     string
	Limit         int
	NextPageToken string
}

// SecurityEventStore defines the persistence interface for security audit events.
type SecurityEventStore interface {
	Create(ctx context.Context, event *SecurityEvent) error
	List(ctx context.Context, filter SecurityEventFilter) ([]*SecurityEvent, string, error)
}
