package space

import (
	"context"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/patch"
	"github.com/masterkeysrd/saturn/internal/platform/settings"
)

// SettingsClient defines the settings operations required by the space domain.
//
// @Mock
type SettingsClient interface {
	Get(ctx context.Context, scopeID string) (*settings.Entry[Settings], error)
	GetOrDefault(ctx context.Context, scopeID string, fallback Settings) (*settings.Entry[Settings], error)
	Save(ctx context.Context, entry *settings.Entry[Settings]) error
}

// Settings represents the workspace-level configuration.
type Settings struct {
	Timezone string `json:"timezone"`
}

// SettingsKey is the typed descriptor for workspace settings.
var SettingsKey = settings.NewKey[Settings](settings.ScopeSpace, "settings")

// DefaultSettings returns the default configuration for a workspace.
func DefaultSettings() Settings {
	return Settings{
		Timezone: "UTC",
	}
}

// Validate checks the settings for business rule violations.
func (s *Settings) Validate() error {
	if s == nil {
		return errors.E(errors.Invalid, "settings payload is required")
	}

	if s.Timezone != "" {
		if _, err := time.LoadLocation(s.Timezone); err != nil {
			return errors.E(errors.Invalid, "invalid timezone: "+s.Timezone)
		}
	}

	return nil
}

// SettingsPatchSchema defines all patchable fields for a Settings entity.
var SettingsPatchSchema = patch.NewSchema[Settings]().
	Register("timezone", patch.Field(func(s *Settings) *string { return &s.Timezone }))

// ApplyPatch applies partial updates from an incoming settings based on the field mask.
func (s *Settings) ApplyPatch(incoming *Settings, mask []string) error {
	if incoming == nil {
		return errors.E(errors.Invalid, "settings payload is required")
	}
	if err := SettingsPatchSchema.Apply(s, incoming, mask); err != nil {
		return errors.E(errors.Invalid, err)
	}
	return s.Validate()
}
