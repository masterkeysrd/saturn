package workflow

import (
	"strings"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/id"
)

// TriggerPrefix is the ID prefix for workflow trigger bindings.
const TriggerPrefix = "trg_"

// TriggerIDGenerator generates and validates Trigger IDs.
var TriggerIDGenerator = id.NewPrefixGenerator(TriggerPrefix)

// GenerateTriggerID generates a new Trigger ID with the trg_ prefix.
func GenerateTriggerID() (string, error) {
	return TriggerIDGenerator.Generate()
}

// ValidateTriggerID checks that idStr is a valid Trigger ID.
func ValidateTriggerID(idStr string) error {
	return TriggerIDGenerator.Validate(idStr)
}

// TriggerType defines supported trigger binding kinds.
type TriggerType string

const (
	TriggerEvent    TriggerType = "event"
	TriggerWebhook  TriggerType = "webhook"
	TriggerSchedule TriggerType = "schedule"
	TriggerManual   TriggerType = "manual"
)

// IsValid reports whether t is a supported trigger kind.
func (t TriggerType) IsValid() bool {
	switch t {
	case TriggerEvent, TriggerWebhook, TriggerSchedule, TriggerManual:
		return true
	default:
		return false
	}
}

// TriggerConfig holds polymorphic configuration and CEL rules for a Trigger.
type TriggerConfig struct {
	Topic        *string        `json:"topic,omitempty"`
	Cron         *string        `json:"cron,omitempty"`
	ScheduleID   *string        `json:"schedule_id,omitempty"`
	Filter       *string        `json:"filter,omitempty"`
	InputMapping map[string]any `json:"input_mapping,omitempty"`
}

// Trigger binds an event, webhook, schedule, or manual invocation entry point to a Flow.
type Trigger struct {
	ID         string        `db:"id" json:"id"`
	FlowID     string        `db:"flow_id" json:"flow_id"`
	SpaceID    string        `db:"space_id" json:"space_id"`
	Name       string        `db:"name" json:"name"`
	Type       TriggerType   `db:"type" json:"type"`
	Config     TriggerConfig `json:"config"`
	IsEnabled  bool          `db:"is_enabled" json:"is_enabled"`
	CreateTime time.Time     `db:"create_time" json:"create_time"`
	UpdateTime time.Time     `db:"update_time" json:"update_time"`
}

// Validate checks business invariants for a Trigger binding.
func (t *Trigger) Validate() error {
	if t == nil {
		return errors.E(errors.Invalid, "trigger is required")
	}
	if strings.TrimSpace(t.Name) == "" {
		return errors.E(errors.Invalid, "trigger name is required")
	}
	if !t.Type.IsValid() {
		return errors.E(errors.Invalid, "unsupported trigger type: %q", t.Type)
	}
	switch t.Type {
	case TriggerEvent:
		if t.Config.Topic == nil || strings.TrimSpace(*t.Config.Topic) == "" {
			return errors.E(errors.Invalid, "event trigger requires config.topic")
		}
	case TriggerSchedule:
		if t.Config.Cron == nil || strings.TrimSpace(*t.Config.Cron) == "" {
			return errors.E(errors.Invalid, "schedule trigger requires config.cron")
		}
	}
	return nil
}

// HasFilter reports whether the trigger configures a non-empty CEL filter expression.
func (t *Trigger) HasFilter() bool {
	return t != nil && t.Config.Filter != nil && strings.TrimSpace(*t.Config.Filter) != ""
}

// HasInputMapping reports whether the trigger configures a CEL input_mapping object.
func (t *Trigger) HasInputMapping() bool {
	return t != nil && len(t.Config.InputMapping) > 0
}
