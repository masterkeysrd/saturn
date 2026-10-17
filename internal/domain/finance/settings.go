package finance

import (
	"context"
	"fmt"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/id"
	"github.com/masterkeysrd/saturn/internal/platform/patch"
	"github.com/masterkeysrd/saturn/internal/platform/settings"
)

// SettingsClient defines the settings operations required by the finance domain.
//
// @Mock
type SettingsClient interface {
	Get(ctx context.Context, scopeID string) (*settings.Entry[Settings], error)
	Save(ctx context.Context, entry *settings.Entry[Settings]) error
}

// SpaceID is a custom string type representing a space's identifier.
type SpaceID string

// ParseSpaceID parses a string into a SpaceID and validates it.
func ParseSpaceID(s string) (SpaceID, error) {
	if err := id.Validate(s, spacePrefix); err != nil {
		return "", fmt.Errorf("invalid space ID: %w", err)
	}
	return SpaceID(s), nil
}

// String returns the string representation.
func (sid SpaceID) String() string {
	return string(sid)
}

// Validate checks if the SpaceID is valid.
func (sid SpaceID) Validate() error {
	return id.Validate(string(sid), spacePrefix)
}

const spacePrefix = "spc_"

// Settings stores workspace-scoped configurations.
type Settings struct {
	BaseCurrency         Currency `json:"base_currency"`
	FiscalYearStartMonth int      `json:"fiscal_year_start_month,omitempty"`
}

// SettingsKey is the typed descriptor for workspace finance settings.
var SettingsKey = settings.NewKey[Settings](settings.ScopeSpace, "finance")

// FiscalYearStart returns the normalized fiscal year start month (1-12, default 1).
func (s *Settings) FiscalYearStart() int {
	if s == nil || s.FiscalYearStartMonth < 1 || s.FiscalYearStartMonth > 12 {
		return 1
	}
	return s.FiscalYearStartMonth
}

// Validate checks the settings validity.
func (s *Settings) Validate() error {
	if s == nil {
		return errors.E(errors.Invalid, "settings payload is required")
	}
	if err := s.BaseCurrency.Validate(); err != nil {
		return fmt.Errorf("validate base currency: %w", err)
	}
	if s.FiscalYearStartMonth != 0 && (s.FiscalYearStartMonth < 1 || s.FiscalYearStartMonth > 12) {
		return errors.E(errors.Invalid, "fiscal year start month must be between 1 and 12")
	}
	return nil
}

// SettingsPatchSchema defines all patchable fields for a Settings entity.
var SettingsPatchSchema = patch.NewSchema[Settings]().
	Field("fiscal_year_start_month", func(s *Settings) *int { return &s.FiscalYearStartMonth })

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

// NewDefaultCashAccount instantiates the standard default Cash account for a workspace.
func (s *Settings) NewDefaultCashAccount() (*Account, error) {
	if err := s.Validate(); err != nil {
		return nil, fmt.Errorf("validate finance settings: %w", err)
	}

	accID, err := NewAccountID()
	if err != nil {
		return nil, fmt.Errorf("generate cash account ID: %w", err)
	}

	acc := &Account{
		ID:             accID,
		Name:           "Cash",
		Type:           AccountTypeCash,
		Currency:       s.BaseCurrency,
		IsActive:       true,
		InitialBalance: 0,
		CurrentBalance: 0,
		CreateTime:     time.Now().UTC(),
		UpdateTime:     time.Now().UTC(),
	}
	if err := acc.Validate(); err != nil {
		return nil, fmt.Errorf("validate default cash account: %w", err)
	}
	return acc, nil
}
