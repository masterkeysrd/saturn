package mail

import (
	"strings"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

// ThreadSummary models an AI-generated summary of a Thread conversation
// scoped to a specific language.
type ThreadSummary struct {
	ThreadID      string    `json:"thread_id"`
	SpaceID       string    `json:"space_id"`
	Language      string    `json:"language"`
	TLDR          string    `json:"tldr"`
	KeyPoints     []string  `json:"key_points"`
	ActionItems   []string  `json:"action_items"`
	LastMessageID string    `json:"last_message_id"`
	LastMessageAt time.Time `json:"last_message_at"`
	MessageCount  int       `json:"message_count"`
	FlowRunID     *string   `json:"flow_run_id,omitempty"`
	CreateTime    time.Time `json:"create_time"`
	UpdateTime    time.Time `json:"update_time"`
}

// Validate checks business invariants for ThreadSummary.
func (s *ThreadSummary) Validate() error {
	if s == nil {
		return errors.E(errors.Invalid, "thread summary is required")
	}

	if err := ValidateThreadID(s.ThreadID); err != nil {
		return errors.E(errors.Invalid, ErrInvalidThread, "invalid thread id: %w", err)
	}

	if strings.TrimSpace(s.SpaceID) == "" {
		return errors.E(errors.Invalid, ErrInvalidThread, "space_id is required")
	}

	if s.LastMessageAt.IsZero() {
		return errors.E(errors.Invalid, ErrInvalidThread, "last_message_at is required")
	}

	if s.MessageCount < 0 {
		s.MessageCount = 0
	}
	if s.KeyPoints == nil {
		s.KeyPoints = []string{}
	}
	if s.ActionItems == nil {
		s.ActionItems = []string{}
	}

	return nil
}

// IsStale reports whether the summary no longer reflects the current state
// of the given thread (newer messages arrived or the message count grew).
func (s *ThreadSummary) IsStale(thread *Thread) bool {
	return s == nil || thread == nil || thread.LastMessageAt.After(s.LastMessageAt) || thread.MessageCount > s.MessageCount
}
