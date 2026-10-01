package finance

import (
	"context"
	"fmt"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/id"
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
	BaseCurrency Currency `json:"base_currency"`
}

// SettingsKey is the typed descriptor for workspace finance settings.
var SettingsKey = settings.NewKey[Settings](settings.ScopeSpace, "finance")

// Validate checks the settings validity.
func (s *Settings) Validate() error {
	if err := s.BaseCurrency.Validate(); err != nil {
		return fmt.Errorf("validate base currency: %w", err)
	}
	return nil
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
