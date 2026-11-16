package ai

import (
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/patch"
	"github.com/masterkeysrd/saturn/internal/platform/settings"
)

const DefaultRunRetentionDays int32 = 90

// ModelRole identifies a semantic workspace model slot.
type ModelRole string

const (
	ModelRoleDefault   ModelRole = "default"
	ModelRoleFast      ModelRole = "fast"
	ModelRoleReasoning ModelRole = "reasoning"
)

// IsValid reports whether r is a supported workspace model role.
func (r ModelRole) IsValid() bool {
	switch r {
	case ModelRoleDefault, ModelRoleFast, ModelRoleReasoning:
		return true
	default:
		return false
	}
}

// ModelRoleSettings maps semantic workspace roles to registered Model IDs (`mdl_...`).
type ModelRoleSettings struct {
	DefaultModelID   *string `json:"default_model_id,omitempty"`
	FastModelID      *string `json:"fast_model_id,omitempty"`
	ReasoningModelID *string `json:"reasoning_model_id,omitempty"`
}

// GovernanceConfig controls workspace AI budget caps and run log retention.
type GovernanceConfig struct {
	MonthlyBudgetUSD *float64 `json:"monthly_budget_usd,omitempty"`
	RunRetentionDays int32    `json:"run_retention_days"`
}

// Settings represents workspace-level AI defaults and governance configuration (`platform.ai`).
type Settings struct {
	Models     ModelRoleSettings `json:"models"`
	Governance GovernanceConfig  `json:"governance"`
}

// SettingsKey is the typed settings descriptor for workspace AI configuration.
var SettingsKey = settings.NewKey[Settings](settings.ScopeSpace, "platform.ai")

// DefaultSettings returns default workspace AI settings.
func DefaultSettings() Settings {
	return Settings{
		Governance: GovernanceConfig{
			RunRetentionDays: DefaultRunRetentionDays,
		},
	}
}

// Validate checks workspace AI settings invariants.
func (s *Settings) Validate() error {
	if s == nil {
		return errors.E(errors.Invalid, "AI settings payload is required")
	}
	if s.Governance.MonthlyBudgetUSD != nil && *s.Governance.MonthlyBudgetUSD < 0 {
		return errors.E(errors.Invalid, "governance.monthly_budget_usd must be >= 0")
	}
	if s.Governance.RunRetentionDays < 0 {
		return errors.E(errors.Invalid, "governance.run_retention_days must be >= 0")
	}
	return nil
}

// SettingsPatchSchema defines patchable fields for workspace AI Settings.
var SettingsPatchSchema = patch.NewSchema[Settings]().
	Field("models", func(s *Settings) *ModelRoleSettings { return &s.Models }).
	Field("models.default_model_id", func(s *Settings) **string { return &s.Models.DefaultModelID }).
	Field("models.fast_model_id", func(s *Settings) **string { return &s.Models.FastModelID }).
	Field("models.reasoning_model_id", func(s *Settings) **string { return &s.Models.ReasoningModelID }).
	Field("governance", func(s *Settings) *GovernanceConfig { return &s.Governance }).
	Field("governance.monthly_budget_usd", func(s *Settings) **float64 { return &s.Governance.MonthlyBudgetUSD }).
	Field("governance.run_retention_days", func(s *Settings) *int32 { return &s.Governance.RunRetentionDays })

// ApplyPatch applies partial updates from incoming based on mask and validates invariants.
func (s *Settings) ApplyPatch(incoming *Settings, mask []string) error {
	if incoming == nil {
		return errors.E(errors.Invalid, "AI settings payload is required")
	}
	if err := SettingsPatchSchema.Apply(s, incoming, mask); err != nil {
		return errors.E(errors.Invalid, err)
	}
	return s.Validate()
}
