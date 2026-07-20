package finance

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/id"
)

type RecurrenceInterval string

const (
	IntervalWeekly  RecurrenceInterval = "weekly"
	IntervalMonthly RecurrenceInterval = "monthly"
	IntervalYearly  RecurrenceInterval = "yearly"
)

type LimitPropagation string

const (
	PropagationNextPeriodsOnly LimitPropagation = "next_periods_only"
	PropagationCurrentPeriod   LimitPropagation = "current_period"
)

// BudgetID is a custom string type representing a budget's unique identifier (KSUID).
type BudgetID string

// NewBudgetID creates a new BudgetID using the default ID generator.
func NewBudgetID() (BudgetID, error) {
	raw, err := id.Generate(budgetPrefix)
	if err != nil {
		return "", err
	}
	return BudgetID(raw), nil
}

// ParseBudgetID parses a string into a BudgetID and validates it.
func ParseBudgetID(s string) (BudgetID, error) {
	if err := id.Validate(s, budgetPrefix); err != nil {
		return "", fmt.Errorf("invalid budget ID: %w", err)
	}
	return BudgetID(s), nil
}

// MustBudgetID panics if the string is not a valid BudgetID.
func MustBudgetID(s string) BudgetID {
	bID, err := ParseBudgetID(s)
	if err != nil {
		panic(err)
	}
	return bID
}

// String returns the string representation.
func (bid BudgetID) String() string {
	return string(bid)
}

// Validate checks if the BudgetID is valid.
func (bid BudgetID) Validate() error {
	return id.Validate(string(bid), budgetPrefix)
}

const budgetPrefix = "bgt_"

// Budget represents a budget template definition.
type Budget struct {
	ID          BudgetID
	SpaceID     SpaceID
	Name        string
	LimitAmount int64
	Currency    Currency
	Interval    RecurrenceInterval
	IsActive    bool
	Icon        string
	Color       string
	CreateTime  time.Time
	UpdateTime  time.Time
}

// Validate checks the budget's business rules.
func (b *Budget) Validate() error {
	b.Name = strings.TrimSpace(b.Name)
	if b.Name == "" {
		return errors.New("budget name is required")
	}
	if len(b.Name) > 255 {
		return errors.New("budget name must not exceed 255 characters")
	}
	if b.LimitAmount <= 0 {
		return errors.New("budget limit must be greater than zero")
	}
	if err := b.Currency.Validate(); err != nil {
		return fmt.Errorf("validate currency: %w", err)
	}
	switch b.Interval {
	case IntervalWeekly, IntervalMonthly, IntervalYearly:
		// Valid
	default:
		return fmt.Errorf("invalid interval %q: must be weekly, monthly, or yearly", b.Interval)
	}
	b.Icon = strings.TrimSpace(b.Icon)
	if b.Icon == "" {
		b.Icon = "piggy-bank"
	}
	b.Color = strings.TrimSpace(b.Color)
	if b.Color == "" {
		b.Color = "indigo"
	}
	if err := b.ID.Validate(); err != nil {
		return fmt.Errorf("validate budget ID: %w", err)
	}
	if err := b.SpaceID.Validate(); err != nil {
		return fmt.Errorf("validate space ID: %w", err)
	}
	return nil
}

// CalculateBounds computes the start and end time boundaries around a given date in UTC.
func (b *Budget) CalculateBounds(t time.Time) (time.Time, time.Time) {
	t = t.UTC()
	switch b.Interval {
	case IntervalWeekly:
		// Go back to Monday
		offset := int(t.Weekday()) - int(time.Monday)
		if offset < 0 {
			offset += 7
		}
		start := time.Date(t.Year(), t.Month(), t.Day()-offset, 0, 0, 0, 0, time.UTC)
		end := start.AddDate(0, 0, 7).Add(-time.Nanosecond)
		return start, end

	case IntervalYearly:
		start := time.Date(t.Year(), 1, 1, 0, 0, 0, 0, time.UTC)
		end := start.AddDate(1, 0, 0).Add(-time.Nanosecond)
		return start, end

	case IntervalMonthly:
		fallthrough
	default:
		start := time.Date(t.Year(), t.Month(), 1, 0, 0, 0, 0, time.UTC)
		end := start.AddDate(0, 1, 0).Add(-time.Nanosecond)
		return start, end
	}
}
