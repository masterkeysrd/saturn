package ai

import (
	"slices"
	"strings"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/patch"
)

// ThinkingEffort controls reasoning effort on thinking-capable models.
type ThinkingEffort string

const (
	ThinkingEffortLow    ThinkingEffort = "low"
	ThinkingEffortMedium ThinkingEffort = "medium"
	ThinkingEffortHigh   ThinkingEffort = "high"
)

// ThinkingConfig configures extended reasoning behavior.
type ThinkingConfig struct {
	Enabled      bool    `json:"enabled"`
	Effort       *string `json:"effort,omitempty"`
	BudgetTokens *int32  `json:"budget_tokens,omitempty"`
}

// Validate checks ThinkingConfig invariants.
func (t ThinkingConfig) Validate() error {
	if t.Effort != nil && *t.Effort != "" {
		switch ThinkingEffort(*t.Effort) {
		case ThinkingEffortLow, ThinkingEffortMedium, ThinkingEffortHigh:
		default:
			return errors.E(errors.Invalid, "thinking.effort must be one of 'low', 'medium', 'high'")
		}
	}
	if t.BudgetTokens != nil && *t.BudgetTokens < 0 {
		return errors.E(errors.Invalid, "thinking.budget_tokens must be >= 0")
	}
	return nil
}

// GenerationConfig configures LLM sampling and reasoning parameters.
type GenerationConfig struct {
	Temperature *float64       `json:"temperature,omitempty"`
	MaxTokens   *int32         `json:"max_tokens,omitempty"`
	TopP        *float64       `json:"top_p,omitempty"`
	Thinking    ThinkingConfig `json:"thinking,omitzero"`
}

// Validate checks GenerationConfig bounds.
func (g GenerationConfig) Validate() error {
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

// ModelSource indicates how a Model record was registered.
type ModelSource string

const (
	ModelSourceCatalog    ModelSource = "catalog"
	ModelSourceDiscovered ModelSource = "discovered"
	ModelSourceCustom     ModelSource = "custom"
)

// ModelCapabilities describes supported modalities and features of a model.
type ModelCapabilities struct {
	ToolCalling      bool `json:"tool_calling"`
	Vision           bool `json:"vision"`
	Document         bool `json:"document"`
	Audio            bool `json:"audio"`
	Reasoning        bool `json:"reasoning"`
	StructuredOutput bool `json:"structured_output"`
	Streaming        bool `json:"streaming"`
}

// ModelLimits captures token context and output limits for a model.
type ModelLimits struct {
	ContextWindow   int32 `json:"context_window"`
	MaxOutputTokens int32 `json:"max_output_tokens"`
}

// ModelPricing captures per-million-token cost rates in USD.
type ModelPricing struct {
	InputPerMillionUSD       float64 `json:"input_per_million_usd"`
	OutputPerMillionUSD      float64 `json:"output_per_million_usd"`
	CachedInputPerMillionUSD float64 `json:"cached_input_per_million_usd"`
}

// ModelProfile groups capability flags, limits, and pricing metadata.
type ModelProfile struct {
	Capabilities ModelCapabilities `json:"capabilities"`
	Limits       ModelLimits       `json:"limits"`
	Pricing      ModelPricing      `json:"pricing"`
}

// Model represents a workspace-registered AI model (`platform.ai_models`).
type Model struct {
	ID          string
	SpaceID     string
	ProviderID  string
	ModelID     string
	DisplayName string
	Source      ModelSource
	Profile     ModelProfile
	Config      GenerationConfig
	IsEnabled   bool
	CreateTime  time.Time
	UpdateTime  time.Time
}

// ListModelsFilter filters registered workspace models.
type ListModelsFilter struct {
	SpaceID    string
	ProviderID *string
	IsEnabled  *bool
}

// Validate checks Model invariants and normalizes fields.
func (m *Model) Validate() error {
	if m == nil {
		return errors.E(errors.Invalid, "model payload is required")
	}
	m.ProviderID = strings.TrimSpace(m.ProviderID)
	m.ModelID = strings.TrimSpace(m.ModelID)
	m.DisplayName = strings.TrimSpace(m.DisplayName)
	if m.ProviderID == "" {
		return errors.E(errors.Invalid, "provider_id is required")
	}
	if m.ModelID == "" {
		return errors.E(errors.Invalid, "model_id is required")
	}
	if m.DisplayName == "" {
		m.DisplayName = m.ModelID
	}
	if len(m.DisplayName) > 255 {
		return errors.E(errors.Invalid, "display_name must not exceed 255 characters")
	}
	if m.Source == "" {
		m.Source = ModelSourceCustom
	}
	if !slices.Contains([]ModelSource{ModelSourceCatalog, ModelSourceDiscovered, ModelSourceCustom}, m.Source) {
		return errors.E(errors.Invalid, "invalid model source: "+string(m.Source))
	}
	return m.Config.Validate()
}

// ModelPatchSchema defines patchable fields for Model.
var ModelPatchSchema = patch.NewSchema[Model]().
	Field("display_name", func(m *Model) *string { return &m.DisplayName }).
	Field("is_enabled", func(m *Model) *bool { return &m.IsEnabled }).
	Field("profile", func(m *Model) *ModelProfile { return &m.Profile }).
	Field("profile.capabilities", func(m *Model) *ModelCapabilities { return &m.Profile.Capabilities }).
	Field("profile.limits", func(m *Model) *ModelLimits { return &m.Profile.Limits }).
	Field("profile.pricing", func(m *Model) *ModelPricing { return &m.Profile.Pricing }).
	Field("config", func(m *Model) *GenerationConfig { return &m.Config }).
	Field("config.temperature", func(m *Model) **float64 { return &m.Config.Temperature }).
	Field("config.max_tokens", func(m *Model) **int32 { return &m.Config.MaxTokens }).
	Field("config.top_p", func(m *Model) **float64 { return &m.Config.TopP }).
	Field("config.thinking", func(m *Model) *ThinkingConfig { return &m.Config.Thinking }).
	Field("config.thinking.enabled", func(m *Model) *bool { return &m.Config.Thinking.Enabled }).
	Field("config.thinking.effort", func(m *Model) **string { return &m.Config.Thinking.Effort }).
	Field("config.thinking.budget_tokens", func(m *Model) **int32 { return &m.Config.Thinking.BudgetTokens })

// ApplyPatch applies partial updates from incoming according to mask.
func (m *Model) ApplyPatch(incoming *Model, mask []string) error {
	if incoming == nil {
		return errors.E(errors.Invalid, "model payload is required")
	}
	if err := ModelPatchSchema.Apply(m, incoming, mask); err != nil {
		return errors.E(errors.Invalid, err)
	}
	m.UpdateTime = time.Now().UTC()
	return m.Validate()
}
