package mail

import (
	"strings"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/id"
)

// MessagePrefix is the unique prefix for message IDs.
const MessagePrefix = "msg_"

// MessageIDGenerator generates and validates Message IDs.
var MessageIDGenerator = id.NewPrefixGenerator(MessagePrefix)

// GenerateMessageID generates a new Message ID with the msg_ prefix.
func GenerateMessageID() (string, error) {
	return MessageIDGenerator.Generate()
}

// ValidateMessageID checks that idStr is a valid Message ID.
func ValidateMessageID(idStr string) error {
	return MessageIDGenerator.Validate(idStr)
}

// AttachmentMetaPrefix is the unique prefix for attachment IDs.
const AttachmentMetaPrefix = "mat_"

// AttachmentMetaIDGenerator generates and validates AttachmentMeta IDs.
var AttachmentMetaIDGenerator = id.NewPrefixGenerator(AttachmentMetaPrefix)

// GenerateAttachmentID generates a new AttachmentMeta ID with the mat_ prefix.
func GenerateAttachmentID() (string, error) {
	return AttachmentMetaIDGenerator.Generate()
}

// ValidateAttachmentID checks that idStr is a valid AttachmentMeta ID.
func ValidateAttachmentID(idStr string) error {
	return AttachmentMetaIDGenerator.Validate(idStr)
}

// AttachmentMeta models metadata for an attachment without storing raw blob data.
type AttachmentMeta struct {
	ID          string `json:"id"`
	Filename    string `json:"filename"`
	ContentType string `json:"content_type"`
	Size        int64  `json:"size"`
	ContentID   string `json:"content_id,omitempty"`
	IsInline    bool   `json:"is_inline"`
}

// Validate checks business invariants for AttachmentMeta.
func (a *AttachmentMeta) Validate() error {
	if a == nil {
		return errors.E(errors.Invalid, "attachment metadata is required")
	}
	if a.ID == "" {
		newID, err := GenerateAttachmentID()
		if err != nil {
			return errors.E(errors.Internal, "generate attachment id: %w", err)
		}
		a.ID = newID
	} else if err := ValidateAttachmentID(a.ID); err != nil {
		return errors.E(errors.Invalid, "invalid attachment id: %w", err)
	}

	if a.Size < 0 {
		return errors.E(errors.Invalid, "attachment size cannot be negative")
	}
	return nil
}

// Message models an individual RFC 5322 email message.
type Message struct {
	ID                 string           `json:"id"`
	SpaceID            string           `json:"space_id"`
	ConnectedAccountID string           `json:"connected_account_id"`
	ThreadID           string           `json:"thread_id"`
	ProviderMessageID  *string          `json:"provider_message_id,omitempty"`
	RFCMessageID       *string          `json:"rfc_message_id,omitempty"`
	InReplyTo          *string          `json:"in_reply_to,omitempty"`
	References         *string          `json:"references,omitempty"`
	Subject            string           `json:"subject"`
	Snippet            string           `json:"snippet"`
	From               Participant      `json:"from"`
	To                 []Participant    `json:"to"`
	Cc                 []Participant    `json:"cc"`
	Bcc                []Participant    `json:"bcc"`
	ReplyTo            []Participant    `json:"reply_to"`
	SentAt             *time.Time       `json:"sent_at,omitempty"`
	ReceivedAt         time.Time        `json:"received_at"`
	IsUnread           bool             `json:"is_unread"`
	IsStarred          bool             `json:"is_starred"`
	IsDraft            bool             `json:"is_draft"`
	Attachments        []AttachmentMeta `json:"attachments"`
	HasRemoteImages    bool             `json:"has_remote_images"`
	BodyCached         bool             `json:"body_cached"`
	CreateTime         time.Time        `json:"create_time"`
	UpdateTime         time.Time        `json:"update_time"`
}

// EffectiveTime returns ReceivedAt if non-zero, or SentAt, or CreateTime.
func (m *Message) EffectiveTime() time.Time {
	if m == nil {
		return time.Time{}
	}
	if !m.ReceivedAt.IsZero() {
		return m.ReceivedAt
	}
	if m.SentAt != nil && !m.SentAt.IsZero() {
		return *m.SentAt
	}
	return m.CreateTime
}

// Validate checks business invariants for Message.
func (m *Message) Validate() error {
	if m == nil {
		return errors.E(errors.Invalid, "message is required")
	}

	if err := ValidateMessageID(m.ID); err != nil {
		return errors.E(errors.Invalid, ErrInvalidMessage, "invalid message id: %w", err)
	}

	if strings.TrimSpace(m.SpaceID) == "" {
		return errors.E(errors.Invalid, ErrInvalidMessage, "space_id is required")
	}

	if strings.TrimSpace(m.ConnectedAccountID) == "" {
		return errors.E(errors.Invalid, ErrInvalidMessage, "connected_account_id is required")
	}

	if strings.TrimSpace(m.ThreadID) == "" {
		return errors.E(errors.Invalid, ErrInvalidMessage, "thread_id is required")
	}

	if m.ReceivedAt.IsZero() {
		if m.SentAt != nil && !m.SentAt.IsZero() {
			m.ReceivedAt = *m.SentAt
		} else {
			return errors.E(errors.Invalid, ErrInvalidMessage, "received_at is required")
		}
	}

	if m.To == nil {
		m.To = []Participant{}
	}
	if m.Cc == nil {
		m.Cc = []Participant{}
	}
	if m.Bcc == nil {
		m.Bcc = []Participant{}
	}
	if m.ReplyTo == nil {
		m.ReplyTo = []Participant{}
	}
	if m.Attachments == nil {
		m.Attachments = []AttachmentMeta{}
	}

	for i := range m.Attachments {
		if err := m.Attachments[i].Validate(); err != nil {
			return errors.E(errors.Invalid, ErrInvalidMessage, "attachment %d invalid: %w", i, err)
		}
	}

	return nil
}

// MessageBody models the lazy-fetched and sanitized email body cached with a TTL.
type MessageBody struct {
	MessageID       string    `json:"message_id"`
	SpaceID         string    `json:"space_id"`
	SanitizedHTML   string    `json:"sanitized_html"`
	PlainText       string    `json:"plain_text"`
	HasRemoteImages bool      `json:"has_remote_images"`
	FetchedAt       time.Time `json:"fetched_at"`
	ExpiresAt       time.Time `json:"expires_at"`
}

// Validate checks business invariants for MessageBody.
func (b *MessageBody) Validate() error {
	if b == nil {
		return errors.E(errors.Invalid, "message body is required")
	}

	if err := ValidateMessageID(b.MessageID); err != nil {
		return errors.E(errors.Invalid, ErrInvalidMessage, "invalid message_id: %w", err)
	}

	if strings.TrimSpace(b.SpaceID) == "" {
		return errors.E(errors.Invalid, ErrInvalidMessage, "space_id is required")
	}

	if b.ExpiresAt.IsZero() {
		return errors.E(errors.Invalid, ErrInvalidMessage, "expires_at is required")
	}

	return nil
}
