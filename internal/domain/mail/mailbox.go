package mail

import (
	"strings"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/id"
)

// MailboxPrefix is the unique prefix for mailbox IDs.
const MailboxPrefix = "mbx_"

// MailboxIDGenerator generates and validates Mailbox IDs.
var MailboxIDGenerator = id.NewPrefixGenerator(MailboxPrefix)

// GenerateMailboxID generates a new Mailbox ID with the mbx_ prefix.
func GenerateMailboxID() (string, error) {
	return MailboxIDGenerator.Generate()
}

// ValidateMailboxID checks that idStr is a valid Mailbox ID.
func ValidateMailboxID(idStr string) error {
	return MailboxIDGenerator.Validate(idStr)
}

// SystemBucket defines provider-agnostic system mailbox roles.
type SystemBucket string

const (
	SystemBucketInbox   SystemBucket = "inbox"
	SystemBucketStarred SystemBucket = "starred"
	SystemBucketSent    SystemBucket = "sent"
	SystemBucketDrafts  SystemBucket = "drafts"
	SystemBucketArchive SystemBucket = "archive"
	SystemBucketTrash   SystemBucket = "trash"
	SystemBucketSpam    SystemBucket = "spam"
	SystemBucketCustom  SystemBucket = "custom"
)

// IsValid checks if the bucket is recognized.
func (b SystemBucket) IsValid() bool {
	switch b {
	case SystemBucketInbox, SystemBucketStarred, SystemBucketSent, SystemBucketDrafts,
		SystemBucketArchive, SystemBucketTrash, SystemBucketSpam, SystemBucketCustom:
		return true
	default:
		return false
	}
}

// Mailbox models a canonical or provider-synced email folder/label.
type Mailbox struct {
	ID                 string       `json:"id"`
	SpaceID            string       `json:"space_id"`
	ConnectedAccountID string       `json:"connected_account_id"`
	ProviderMailboxID  *string      `json:"provider_mailbox_id,omitempty"`
	Name               string       `json:"name"`
	SystemRole         SystemBucket `json:"system_role"`
	Color              *string      `json:"color,omitempty"`
	UnreadCount        int          `json:"unread_count"`
	TotalCount         int          `json:"total_count"`
	CreateTime         time.Time    `json:"create_time"`
	UpdateTime         time.Time    `json:"update_time"`
}

// Validate checks business invariants for Mailbox.
func (m *Mailbox) Validate() error {
	if m == nil {
		return errors.E(errors.Invalid, "mailbox is required")
	}

	if err := ValidateMailboxID(m.ID); err != nil {
		return errors.E(errors.Invalid, ErrInvalidMailbox, "invalid mailbox id: %w", err)
	}

	if strings.TrimSpace(m.SpaceID) == "" {
		return errors.E(errors.Invalid, ErrInvalidMailbox, "space_id is required")
	}

	if strings.TrimSpace(m.ConnectedAccountID) == "" {
		return errors.E(errors.Invalid, ErrInvalidMailbox, "connected_account_id is required")
	}

	m.Name = strings.TrimSpace(m.Name)
	if m.Name == "" {
		return errors.E(errors.Invalid, ErrInvalidMailbox, "name is required")
	}

	if m.SystemRole == "" {
		m.SystemRole = SystemBucketCustom
	}
	if !m.SystemRole.IsValid() {
		return errors.E(errors.Invalid, ErrInvalidMailbox, "invalid system_role: %s", m.SystemRole)
	}

	if m.UnreadCount < 0 {
		m.UnreadCount = 0
	}
	if m.TotalCount < 0 {
		m.TotalCount = 0
	}

	return nil
}

// SyncState tracks provider synchronization position and rolling window configuration.
type SyncState struct {
	ConnectedAccountID string     `json:"connected_account_id"`
	SpaceID            string     `json:"space_id"`
	SyncCursor         *string    `json:"sync_cursor,omitempty"`
	WindowDays         int        `json:"window_days"`
	OldestSyncedTime   *time.Time `json:"oldest_synced_time,omitempty"`
	ExhaustedBuckets   []string   `json:"exhausted_buckets,omitempty"`
	LastSyncedAt       *time.Time `json:"last_synced_at,omitempty"`
	WatchExpiration    *time.Time `json:"watch_expiration,omitempty"`
}

// Validate checks business invariants for SyncState.
func (s *SyncState) Validate() error {
	if s == nil {
		return errors.E(errors.Invalid, "sync state is required")
	}
	if strings.TrimSpace(s.ConnectedAccountID) == "" {
		return errors.E(errors.Invalid, ErrSyncStateNotFound, "connected_account_id is required")
	}
	if strings.TrimSpace(s.SpaceID) == "" {
		return errors.E(errors.Invalid, ErrSyncStateNotFound, "space_id is required")
	}
	if s.WindowDays <= 0 {
		s.WindowDays = 90
	}
	return nil
}
