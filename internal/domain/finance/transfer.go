package finance

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/id"
)

// TransferID is a custom string type representing a transfer's unique identifier (KSUID).
type TransferID string

// NewTransferID creates a new TransferID using the default ID generator.
func NewTransferID() (TransferID, error) {
	raw, err := id.Generate(transferPrefix)
	if err != nil {
		return "", err
	}
	return TransferID(raw), nil
}

// ParseTransferID parses a string into a TransferID and validates it.
func ParseTransferID(s string) (TransferID, error) {
	if err := id.Validate(s, transferPrefix); err != nil {
		return "", fmt.Errorf("invalid transfer ID: %w", err)
	}
	return TransferID(s), nil
}

// MustTransferID panics if the string is not a valid TransferID.
func MustTransferID(s string) TransferID {
	tID, err := ParseTransferID(s)
	if err != nil {
		panic(err)
	}
	return tID
}

// String returns the string representation.
func (tid TransferID) String() string {
	return string(tid)
}

// Validate checks if the TransferID is valid.
func (tid TransferID) Validate() error {
	return id.Validate(string(tid), transferPrefix)
}

const transferPrefix = "trsf_"

// Transfer represents an account-to-account funds movement.
type Transfer struct {
	ID                   TransferID
	SpaceID              SpaceID
	SourceAccountID      AccountID
	DestinationAccountID AccountID
	SourceAmount         int64
	DestinationAmount    int64
	TransferDate         time.Time
	Notes                string
	CreateTime           time.Time
	UpdateTime           time.Time
}

// Validate checks basic properties of a transfer.
func (t *Transfer) Validate() error {
	if err := t.ID.Validate(); err != nil {
		return fmt.Errorf("validate transfer ID: %w", err)
	}
	if err := t.SpaceID.Validate(); err != nil {
		return fmt.Errorf("validate space ID: %w", err)
	}
	if err := t.SourceAccountID.Validate(); err != nil {
		return fmt.Errorf("validate source account ID: %w", err)
	}
	if err := t.DestinationAccountID.Validate(); err != nil {
		return fmt.Errorf("validate destination account ID: %w", err)
	}
	if t.SourceAccountID == t.DestinationAccountID {
		return errors.New("source and destination accounts must be different")
	}
	if t.SourceAmount <= 0 {
		return errors.New("source amount must be greater than zero")
	}
	if t.DestinationAmount <= 0 {
		return errors.New("destination amount must be greater than zero")
	}
	if t.TransferDate.IsZero() {
		return errors.New("transfer date is required")
	}
	t.Notes = strings.TrimSpace(t.Notes)
	return nil
}
