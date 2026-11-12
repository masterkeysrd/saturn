package mail

import (
	"strings"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/id"
	"github.com/masterkeysrd/saturn/internal/platform/patch"
)

// DraftPrefix is the unique prefix for draft IDs.
const DraftPrefix = "mdf_"

// DraftIDGenerator generates and validates Draft IDs.
var DraftIDGenerator = id.NewPrefixGenerator(DraftPrefix)

// GenerateDraftID generates a new Draft ID with the mdf_ prefix.
func GenerateDraftID() (string, error) {
	return DraftIDGenerator.Generate()
}

// ValidateDraftID checks that idStr is a valid Draft ID.
func ValidateDraftID(idStr string) error {
	return DraftIDGenerator.Validate(idStr)
}

// DraftMode defines whether a draft is a new email, reply, or forward.
type DraftMode string

const (
	DraftModeNew      DraftMode = "new"
	DraftModeReply    DraftMode = "reply"
	DraftModeReplyAll DraftMode = "reply_all"
	DraftModeForward  DraftMode = "forward"
)

// IsValid checks if the draft mode is recognized.
func (m DraftMode) IsValid() bool {
	switch m {
	case DraftModeNew, DraftModeReply, DraftModeReplyAll, DraftModeForward:
		return true
	default:
		return false
	}
}

// Draft models an editable email composition.
type Draft struct {
	ID                 string           `json:"id"`
	SpaceID            string           `json:"space_id"`
	ConnectedAccountID string           `json:"connected_account_id"`
	ProviderDraftID    *string          `json:"provider_draft_id,omitempty"`
	ProviderMessageID  *string          `json:"provider_message_id,omitempty"`
	ThreadID           *string          `json:"thread_id,omitempty"`
	ReplyToMessageID   *string          `json:"reply_to_message_id,omitempty"`
	Mode               DraftMode        `json:"mode"`
	From               string           `json:"from"`
	To                 []Participant    `json:"to"`
	Cc                 []Participant    `json:"cc"`
	Bcc                []Participant    `json:"bcc"`
	Subject            string           `json:"subject"`
	BodyHTML           string           `json:"body_html"`
	BodyText           string           `json:"body_text"`
	Attachments        []AttachmentMeta `json:"attachments"`
	Version            int64            `json:"version"`
	CreateTime         time.Time        `json:"create_time"`
	UpdateTime         time.Time        `json:"update_time"`
}

// Validate checks business invariants for Draft.
func (d *Draft) Validate() error {
	if d == nil {
		return errors.E(errors.Invalid, "draft is required")
	}

	if err := ValidateDraftID(d.ID); err != nil {
		return errors.E(errors.Invalid, ErrInvalidDraft, "invalid draft id: %w", err)
	}

	if strings.TrimSpace(d.SpaceID) == "" {
		return errors.E(errors.Invalid, ErrInvalidDraft, "space_id is required")
	}

	if strings.TrimSpace(d.ConnectedAccountID) == "" {
		return errors.E(errors.Invalid, ErrInvalidDraft, "connected_account_id is required")
	}

	if d.Mode == "" {
		d.Mode = DraftModeNew
	}
	if !d.Mode.IsValid() {
		return errors.E(errors.Invalid, ErrInvalidDraft, "invalid mode: %s", d.Mode)
	}

	if d.To == nil {
		d.To = []Participant{}
	}
	if d.Cc == nil {
		d.Cc = []Participant{}
	}
	if d.Bcc == nil {
		d.Bcc = []Participant{}
	}
	if d.Attachments == nil {
		d.Attachments = []AttachmentMeta{}
	}

	for i := range d.Attachments {
		if err := d.Attachments[i].Validate(); err != nil {
			return errors.E(errors.Invalid, ErrInvalidDraft, "attachment %d invalid: %w", i, err)
		}
	}

	return nil
}

// DraftPatchSchema defines the field mask schema for partial draft updates.
var DraftPatchSchema = patch.NewSchema[Draft]().
	Field("to", func(d *Draft) *[]Participant { return &d.To }).
	Field("cc", func(d *Draft) *[]Participant { return &d.Cc }).
	Field("bcc", func(d *Draft) *[]Participant { return &d.Bcc }).
	Field("subject", func(d *Draft) *string { return &d.Subject }).
	Field("body_html", func(d *Draft) *string { return &d.BodyHTML }).
	Field("body_text", func(d *Draft) *string { return &d.BodyText }).
	Field("attachments", func(d *Draft) *[]AttachmentMeta { return &d.Attachments }).
	Field("thread_id", func(d *Draft) **string { return &d.ThreadID }).
	Field("reply_to_message_id", func(d *Draft) **string { return &d.ReplyToMessageID }).
	Field("mode", func(d *Draft) *DraftMode { return &d.Mode })

// ApplyPatch applies field-masked updates to the Draft.
func (d *Draft) ApplyPatch(incoming *Draft, mask []string) error {
	if incoming == nil {
		return errors.E(errors.Invalid, "incoming draft is required")
	}

	if err := DraftPatchSchema.Apply(d, incoming, mask); err != nil {
		return errors.E(errors.Invalid, err)
	}

	d.UpdateTime = time.Now().UTC()
	return d.Validate()
}
