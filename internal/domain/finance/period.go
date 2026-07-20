package finance

import (
	"errors"
	"fmt"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/id"
)

// PeriodID is a custom string type representing a budget period's unique identifier (KSUID).
type PeriodID string

// NewPeriodID creates a new PeriodID using the default ID generator.
func NewPeriodID() (PeriodID, error) {
	raw, err := id.Generate(periodPrefix)
	if err != nil {
		return "", err
	}
	return PeriodID(raw), nil
}

// ParsePeriodID parses a string into a PeriodID and validates it.
func ParsePeriodID(s string) (PeriodID, error) {
	if err := id.Validate(s, periodPrefix); err != nil {
		return "", fmt.Errorf("invalid period ID: %w", err)
	}
	return PeriodID(s), nil
}

// MustPeriodID panics if the string is not a valid PeriodID.
func MustPeriodID(s string) PeriodID {
	pID, err := ParsePeriodID(s)
	if err != nil {
		panic(err)
	}
	return pID
}

// String returns the string representation.
func (pid PeriodID) String() string {
	return string(pid)
}

// Validate checks if the PeriodID is valid.
func (pid PeriodID) Validate() error {
	return id.Validate(string(pid), periodPrefix)
}

const periodPrefix = "bgp_"

// BudgetPeriod represents a concrete execution instance of a Budget.
type BudgetPeriod struct {
	ID                 PeriodID
	BudgetID           BudgetID
	SpaceID            SpaceID
	StartDate          time.Time
	EndDate            time.Time
	LimitAmount        int64
	Currency           Currency
	BaseCurrency       Currency
	ExchangeRateToBase float64
	CreateTime         time.Time
	UpdateTime         time.Time
	SpentAmount        int64
	SpentInBase        int64
}

// Validate checks the period constraints.
func (p *BudgetPeriod) Validate() error {
	if err := p.ID.Validate(); err != nil {
		return fmt.Errorf("validate period ID: %w", err)
	}
	if err := p.BudgetID.Validate(); err != nil {
		return fmt.Errorf("validate budget ID: %w", err)
	}
	if err := p.SpaceID.Validate(); err != nil {
		return fmt.Errorf("validate space ID: %w", err)
	}
	if p.StartDate.After(p.EndDate) {
		return errors.New("start date cannot be after end date")
	}
	if p.LimitAmount <= 0 {
		return errors.New("limit must be greater than zero")
	}
	if err := p.Currency.Validate(); err != nil {
		return fmt.Errorf("validate currency: %w", err)
	}
	if err := p.BaseCurrency.Validate(); err != nil {
		return fmt.Errorf("validate base currency: %w", err)
	}
	if p.ExchangeRateToBase <= 0 {
		return errors.New("exchange rate must be greater than zero")
	}
	return nil
}
