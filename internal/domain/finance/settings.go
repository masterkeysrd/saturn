package finance

import (
	"fmt"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/id"
)

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

// FinanceSettings stores workspace-scoped configurations.
type FinanceSettings struct {
	SpaceID      SpaceID
	BaseCurrency Currency
	CreateTime   time.Time
	UpdateTime   time.Time
}

// Validate checks the settings validity.
func (fs *FinanceSettings) Validate() error {
	if err := fs.BaseCurrency.Validate(); err != nil {
		return fmt.Errorf("validate base currency: %w", err)
	}
	if err := fs.SpaceID.Validate(); err != nil {
		return fmt.Errorf("validate space ID: %w", err)
	}
	return nil
}
