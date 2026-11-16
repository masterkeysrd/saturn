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

// ThinkingConfig configures extended reasoning parameters for workflow AI steps.
type ThinkingConfig struct {
	Enabled      bool    `json:"enabled"`
	Effort       *string `json:"effort,omitempty"`
	BudgetTokens *int32  `json:"budget_tokens,omitempty"`
}

// Validate checks ThinkingConfig bounds.
func (t *ThinkingConfig) Validate() error {
	if t == nil {
		return nil
	}
	if t.Effort != nil && strings.TrimSpace(*t.Effort) != "" {
		switch strings.TrimSpace(*t.Effort) {
		case "low", "medium", "high":
		default:
			return errors.E(errors.Invalid, "thinking.effort must be one of 'low', 'medium', 'high'")
		}
	}
	if t.BudgetTokens != nil && *t.BudgetTokens < 0 {
		return errors.E(errors.Invalid, "thinking.budget_tokens must be >= 0")
	}
	return nil
}

// GenerationConfig configures sampling and thinking parameters for workflow AI steps.
type GenerationConfig struct {
	Temperature *float64        `json:"temperature,omitempty"`
	MaxTokens   *int32          `json:"max_tokens,omitempty"`
	TopP        *float64        `json:"top_p,omitempty"`
	Thinking    *ThinkingConfig `json:"thinking,omitempty"`
}

// Validate checks GenerationConfig bounds.
func (g *GenerationConfig) Validate() error {
	if g == nil {
		return nil
	}
	if g.Temperature != nil && (*g.Temperature < 0 || *g.Temperature > 2) {
		return errors.E(errors.Invalid, "generation.temperature must be between 0 and 2")
	}
	if g.MaxTokens != nil && *g.MaxTokens <= 0 {
		return errors.E(errors.Invalid, "generation.max_tokens must be > 0")
	}
	if g.TopP != nil && (*g.TopP < 0 || *g.TopP > 1) {
		return errors.E(errors.Invalid, "generation.top_p must be between 0 and 1")
	}
	return g.Thinking.Validate()
}

// ModelConfig configures the workspace AI model, semantic role, and generation overrides for AI steps.
type ModelConfig struct {
	ModelID    *string           `json:"model_id,omitempty"`
	Role       *string           `json:"role,omitempty"`
	Generation *GenerationConfig `json:"generation,omitempty"`
}

// Validate checks ModelConfig semantic roles and generation parameter bounds.
func (m *ModelConfig) Validate() error {
	if m == nil {
		return nil
	}
	if m.Role != nil && strings.TrimSpace(*m.Role) != "" {
		switch strings.TrimSpace(*m.Role) {
		case "default", "fast", "reasoning":
		default:
			return errors.E(errors.Invalid, "model role must be one of 'default', 'fast', 'reasoning'")
		}
	}
	return m.Generation.Validate()
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
