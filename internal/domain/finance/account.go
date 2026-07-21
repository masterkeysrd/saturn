package finance

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/id"
)

type AccountType string

const (
	AccountTypeBank           AccountType = "BANK"
	AccountTypeCreditCard     AccountType = "CREDIT_CARD"
	AccountTypeCash           AccountType = "CASH"
	AccountTypeDigitalAccount AccountType = "DIGITAL_ACCOUNT"
)

// AccountID is a custom string type representing an account's unique identifier (KSUID).
type AccountID string

// NewAccountID creates a new AccountID using the default ID generator.
func NewAccountID() (AccountID, error) {
	raw, err := id.Generate(accountPrefix)
	if err != nil {
		return "", err
	}
	return AccountID(raw), nil
}

// ParseAccountID parses a string into an AccountID and validates it.
func ParseAccountID(s string) (AccountID, error) {
	if err := id.Validate(s, accountPrefix); err != nil {
		return "", fmt.Errorf("invalid account ID: %w", err)
	}
	return AccountID(s), nil
}

// MustAccountID panics if the string is not a valid AccountID.
func MustAccountID(s string) AccountID {
	aID, err := ParseAccountID(s)
	if err != nil {
		panic(err)
	}
	return aID
}

// String returns the string representation.
func (aid AccountID) String() string {
	return string(aid)
}

// Validate checks if the AccountID is valid.
func (aid AccountID) Validate() error {
	return id.Validate(string(aid), accountPrefix)
}

const accountPrefix = "acc_"

// Account represents a physical or digital location where funds are held.
type Account struct {
	ID             AccountID
	SpaceID        SpaceID
	Name           string
	Type           AccountType
	Currency       Currency
	InitialBalance int64
	CurrentBalance int64
	CreditLimit    int64
	IsDefault      bool
	IsActive       bool
	Color          string
	Notes          string
	LastFour       string
	CreateTime     time.Time
	UpdateTime     time.Time
}

// Validate checks the account's business rules.
func (a *Account) Validate() error {
	a.Name = strings.TrimSpace(a.Name)
	if a.Name == "" {
		return errors.New("account name is required")
	}
	if len(a.Name) > 255 {
		return errors.New("account name must not exceed 255 characters")
	}
	if a.Type != AccountTypeBank && a.Type != AccountTypeCreditCard && a.Type != AccountTypeCash && a.Type != AccountTypeDigitalAccount {
		return fmt.Errorf("invalid account type: %s", a.Type)
	}
	if err := a.Currency.Validate(); err != nil {
		return fmt.Errorf("validate currency: %w", err)
	}
	if a.Type == AccountTypeCreditCard && a.CreditLimit < 0 {
		return errors.New("credit limit cannot be negative")
	}
	if a.Type != AccountTypeCreditCard {
		a.CreditLimit = 0
	}
	a.LastFour = strings.TrimSpace(a.LastFour)
	if a.LastFour != "" {
		if len(a.LastFour) != 4 {
			return errors.New("last four must be exactly 4 digits")
		}
		for _, r := range a.LastFour {
			if r < '0' || r > '9' {
				return errors.New("last four must contain only digits")
			}
		}
	}
	a.Color = strings.TrimSpace(a.Color)
	if a.Color == "" {
		a.Color = "#6366f1"
	}
	if err := a.ID.Validate(); err != nil {
		return fmt.Errorf("validate account ID: %w", err)
	}
	if err := a.SpaceID.Validate(); err != nil {
		return fmt.Errorf("validate space ID: %w", err)
	}
	return nil
}
