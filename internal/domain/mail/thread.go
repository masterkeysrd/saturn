package mail

import (
	"slices"
	"strings"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/id"
)

// ThreadPrefix is the unique prefix for thread IDs.
const ThreadPrefix = "mth_"

// ThreadIDGenerator generates and validates Thread IDs.
var ThreadIDGenerator = id.NewPrefixGenerator(ThreadPrefix)

// GenerateThreadID generates a new Thread ID with the mth_ prefix.
func GenerateThreadID() (string, error) {
	return ThreadIDGenerator.Generate()
}

// ValidateThreadID checks that idStr is a valid Thread ID.
func ValidateThreadID(idStr string) error {
	return ThreadIDGenerator.Validate(idStr)
}

// Participant represents an email sender, recipient, or participant.
type Participant struct {
	Name  string `json:"name"`
	Email string `json:"email"`
}

// String returns a formatted representation of the participant.
func (p Participant) String() string {
	name := strings.TrimSpace(p.Name)
	email := strings.TrimSpace(p.Email)
	if name == "" {
		return email
	}
	if email == "" {
		return name
	}
	return name + " <" + email + ">"
}

// Thread models an email conversation aggregating one or more messages.
type Thread struct {
	ID                 string        `json:"id"`
	SpaceID            string        `json:"space_id"`
	ConnectedAccountID string        `json:"connected_account_id"`
	ProviderThreadID   *string       `json:"provider_thread_id,omitempty"`
	Subject            string        `json:"subject"`
	Snippet            string        `json:"snippet"`
	Participants       []Participant `json:"participants"`
	MessageCount       int           `json:"message_count"`
	HasAttachments     bool          `json:"has_attachments"`
	IsUnread           bool          `json:"is_unread"`
	IsStarred          bool          `json:"is_starred"`
	InInbox            bool          `json:"in_inbox"`
	InSent             bool          `json:"in_sent"`
	InDrafts           bool          `json:"in_drafts"`
	InTrash            bool          `json:"in_trash"`
	InSpam             bool          `json:"in_spam"`
	MailboxIDs         []string      `json:"mailbox_ids"`
	LastMessageAt      time.Time     `json:"last_message_at"`
	CreateTime         time.Time     `json:"create_time"`
	UpdateTime         time.Time     `json:"update_time"`
}

// Validate checks business invariants for Thread.
func (t *Thread) Validate() error {
	if t == nil {
		return errors.E(errors.Invalid, "thread is required")
	}

	if err := ValidateThreadID(t.ID); err != nil {
		return errors.E(errors.Invalid, ErrInvalidThread, "invalid thread id: %w", err)
	}

	if strings.TrimSpace(t.SpaceID) == "" {
		return errors.E(errors.Invalid, ErrInvalidThread, "space_id is required")
	}

	if strings.TrimSpace(t.ConnectedAccountID) == "" {
		return errors.E(errors.Invalid, ErrInvalidThread, "connected_account_id is required")
	}

	if t.LastMessageAt.IsZero() {
		return errors.E(errors.Invalid, ErrInvalidThread, "last_message_at is required")
	}

	if t.MessageCount < 0 {
		t.MessageCount = 0
	}
	if t.MailboxIDs == nil {
		t.MailboxIDs = []string{}
	}
	if t.Participants == nil {
		t.Participants = []Participant{}
	}

	return nil
}

// AggregateFromMessages recalculates thread summary fields and flags across a collection of messages.
func (t *Thread) AggregateFromMessages(msgs []*Message) {
	if len(msgs) == 0 {
		t.MessageCount = 0
		t.IsUnread = false
		t.IsStarred = false
		t.HasAttachments = false
		return
	}

	// Sort copy of messages chronologically by ReceivedAt (or SentAt)
	sorted := make([]*Message, len(msgs))
	copy(sorted, msgs)
	slices.SortFunc(sorted, func(a, b *Message) int {
		tA := a.EffectiveTime()
		tB := b.EffectiveTime()
		if tA.Before(tB) {
			return -1
		} else if tA.After(tB) {
			return 1
		}
		return strings.Compare(a.ID, b.ID)
	})

	t.MessageCount = len(sorted)
	t.IsUnread = false
	t.IsStarred = false
	t.HasAttachments = false

	var latestTime time.Time
	var latestSnippet string
	var firstSubject string

	// Participant deduplication maintaining first occurrence, updating name if earlier was blank
	participantMap := make(map[string]int) // email -> index in participants
	var participants []Participant

	addParticipant := func(p Participant) {
		email := strings.ToLower(strings.TrimSpace(p.Email))
		if email == "" {
			return
		}
		name := strings.TrimSpace(p.Name)
		if idx, exists := participantMap[email]; exists {
			if participants[idx].Name == "" && name != "" {
				participants[idx].Name = name
			}
			return
		}
		participantMap[email] = len(participants)
		participants = append(participants, Participant{
			Name:  name,
			Email: email,
		})
	}

	for _, m := range sorted {
		if m == nil {
			continue
		}

		if m.IsUnread && !m.IsDraft {
			t.IsUnread = true
		}
		if m.IsStarred {
			t.IsStarred = true
		}
		if len(m.Attachments) > 0 {
			t.HasAttachments = true
		}

		effTime := m.EffectiveTime()
		if latestTime.IsZero() || effTime.After(latestTime) {
			latestTime = effTime
		}

		if strings.TrimSpace(m.Snippet) != "" {
			latestSnippet = m.Snippet
		}

		if firstSubject == "" && strings.TrimSpace(m.Subject) != "" {
			firstSubject = strings.TrimSpace(m.Subject)
		}

		addParticipant(m.From)
		for _, to := range m.To {
			addParticipant(to)
		}
		for _, cc := range m.Cc {
			addParticipant(cc)
		}
	}

	if !latestTime.IsZero() {
		t.LastMessageAt = latestTime
	}
	if latestSnippet != "" {
		t.Snippet = latestSnippet
	}
	if firstSubject != "" {
		t.Subject = firstSubject
	} else if len(sorted) > 0 && t.Subject == "" {
		t.Subject = sorted[len(sorted)-1].Subject
	}
	t.Participants = participants
}
