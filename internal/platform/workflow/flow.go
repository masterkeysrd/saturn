package workflow

import (
	"strings"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/id"
)

// FlowPrefix is the ID prefix for workflow definitions.
const FlowPrefix = "flw_"

// FlowIDGenerator generates and validates Flow IDs.
var FlowIDGenerator = id.NewPrefixGenerator(FlowPrefix)

// GenerateFlowID generates a new Flow ID with the flw_ prefix.
func GenerateFlowID() (string, error) {
	return FlowIDGenerator.Generate()
}

// ValidateFlowID checks that idStr is a valid Flow ID.
func ValidateFlowID(idStr string) error {
	return FlowIDGenerator.Validate(idStr)
}

// ModelConfig configures an LLM agent or inline provider/model for AI steps.
type ModelConfig struct {
	AgentID     *string  `json:"agent_id,omitempty"`
	ProviderID  *string  `json:"provider_id,omitempty"`
	ModelName   *string  `json:"model_name,omitempty"`
	Temperature *float64 `json:"temperature,omitempty"`
}

// Validate checks that inline ModelConfig entries specifying a provider also specify model_name.
func (m *ModelConfig) Validate() error {
	if m == nil {
		return nil
	}
	hasAgent := m.AgentID != nil && strings.TrimSpace(*m.AgentID) != ""
	hasProvider := m.ProviderID != nil && strings.TrimSpace(*m.ProviderID) != ""
	hasModel := m.ModelName != nil && strings.TrimSpace(*m.ModelName) != ""
	if !hasAgent && hasProvider && !hasModel {
		return errors.E(errors.Invalid, "model_name is required when provider_id is specified without agent_id")
	}
	return nil
}

// FlowConfig stores extensible execution settings on a Flow.
type FlowConfig struct {
	DefaultModel   *ModelConfig `json:"default_model,omitempty"`
	TimeoutSeconds *int32       `json:"timeout_seconds,omitempty"`
	MaxRetries     *int32       `json:"max_retries,omitempty"`
}

// FlowStats summarizes 7-day execution metrics for a flow.
type FlowStats struct {
	TotalRuns7d     int32      `json:"total_runs_7d"`
	CompletedRuns7d int32      `json:"completed_runs_7d"`
	FailedRuns7d    int32      `json:"failed_runs_7d"`
	FilteredRuns7d  int32      `json:"filtered_runs_7d"`
	LastRunAt       *time.Time `json:"last_run_at,omitempty"`
	LastRunStatus   *string    `json:"last_run_status,omitempty"`
	DailyCounts7d   []int32    `json:"daily_counts_7d,omitempty"`
}

// Flow represents a domain-agnostic workflow automation definition.
type Flow struct {
	ID          string         `db:"id" json:"id"`
	SpaceID     string         `db:"space_id" json:"space_id"`
	SystemKey   *string        `db:"system_key" json:"system_key,omitempty"`
	IsSystem    bool           `db:"is_system" json:"is_system"`
	IsEnabled   bool           `db:"is_enabled" json:"is_enabled"`
	Name        string         `db:"name" json:"name"`
	Description string         `db:"description" json:"description"`
	Config      FlowConfig     `json:"config"`
	InputSchema map[string]any `json:"input_schema,omitempty"`
	Steps       []StepNode     `json:"steps"`
	Triggers    []Trigger      `json:"triggers,omitempty"`
	Version     int64          `db:"version" json:"version"`
	Stats       *FlowStats     `json:"stats,omitempty"`
	CreateTime  time.Time      `db:"create_time" json:"create_time"`
	UpdateTime  time.Time      `db:"update_time" json:"update_time"`
}

// EnsureDeletable verifies the flow is not a built-in system flow.
func (f *Flow) EnsureDeletable() error {
	if f == nil {
		return ErrFlowNotFound
	}
	if f.IsSystem {
		return ErrCannotDeleteSystemFlow
	}
	return nil
}

// ValidateBasic checks structural invariants on a Flow definition.
func (f *Flow) ValidateBasic() error {
	if f == nil {
		return errors.E(errors.Invalid, "flow is required")
	}
	if strings.TrimSpace(f.Name) == "" {
		return errors.E(errors.Invalid, "flow name is required")
	}
	if len(f.Steps) == 0 {
		return errors.E(errors.Invalid, "flow must contain at least one step")
	}
	if f.Config.TimeoutSeconds != nil && *f.Config.TimeoutSeconds < 0 {
		return errors.E(errors.Invalid, "timeout_seconds cannot be negative")
	}
	if f.Config.MaxRetries != nil && *f.Config.MaxRetries < 0 {
		return errors.E(errors.Invalid, "max_retries cannot be negative")
	}
	if err := f.Config.DefaultModel.Validate(); err != nil {
		return err
	}
	for i := range f.Triggers {
		if err := f.Triggers[i].Validate(); err != nil {
			return err
		}
	}
	return nil
}

// ListFlowsFilter filters flows retrieved from the store.
type ListFlowsFilter struct {
	SpaceID   string
	IsSystem  *bool
	IsEnabled *bool
}
