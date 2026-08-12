package finance

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/id"
	"github.com/masterkeysrd/saturn/internal/platform/patch"
)

type RecurrenceInterval string

const (
	IntervalWeekly  RecurrenceInterval = "weekly"
	IntervalMonthly RecurrenceInterval = "monthly"
	IntervalYearly  RecurrenceInterval = "yearly"
	IntervalOneTime RecurrenceInterval = "one_time"
)

type BudgetStatus string

const (
	BudgetStatusActive BudgetStatus = "active"
	BudgetStatusPaused BudgetStatus = "paused"
	BudgetStatusClosed BudgetStatus = "closed"
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
	ID               BudgetID
	SpaceID          SpaceID
	Name             string
	LimitAmount      int64
	Currency         Currency
	Interval         RecurrenceInterval
	Status           BudgetStatus
	Icon             string
	Color            string
	DefaultAccountID *AccountID // Nullable default account for spending
	Version          int64
	CreateTime       time.Time
	UpdateTime       time.Time
}

// IsActive returns true if the budget status is active.
func (b *Budget) IsActive() bool {
	return b.Status == BudgetStatusActive
}

// DefaultBudgetSortField represents the fallback sorting column name for budgets.
const DefaultBudgetSortField = "name"

// BudgetSortFields registry maps sortable budget field names to their cursor string extraction logic.
var BudgetSortFields = map[string]func(*Budget) string{
	"name":         func(b *Budget) string { return b.Name },
	"limit_amount": func(b *Budget) string { return fmt.Sprintf("%018d", b.LimitAmount) },
}

// IsBudgetSortField validates if a sort column name is allowed.
func IsBudgetSortField(field string) bool {
	_, ok := BudgetSortFields[field]
	return ok
}

// GetSortValue extracts and formats the string representation of a field for cursor-based lexical sorting.
func (b *Budget) GetSortValue(field string) string {
	if fn, ok := BudgetSortFields[field]; ok {
		return fn(b)
	}
	return b.GetSortValue(DefaultBudgetSortField)
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
	case IntervalWeekly, IntervalMonthly, IntervalYearly, IntervalOneTime:
		// Valid
	default:
		return fmt.Errorf("invalid interval %q: must be weekly, monthly, yearly, or one_time", b.Interval)
	}
	switch b.Status {
	case BudgetStatusActive, BudgetStatusPaused, BudgetStatusClosed:
		// Valid
	case "":
		b.Status = BudgetStatusActive
	default:
		return fmt.Errorf("invalid status %q: must be active, paused, or closed", b.Status)
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
	if b.DefaultAccountID != nil {
		if err := b.DefaultAccountID.Validate(); err != nil {
			return fmt.Errorf("validate default account ID: %w", err)
		}
	}
	return nil
}

// CalculateBounds computes the start and end time boundaries around a given date in UTC.
func (b *Budget) CalculateBounds(t time.Time) (time.Time, time.Time) {
	t = t.UTC()
	switch b.Interval {
	case IntervalOneTime:
		start := time.Date(1970, 1, 1, 0, 0, 0, 0, time.UTC)
		end := time.Date(9999, 12, 31, 23, 59, 59, 0, time.UTC)
		return start, end

	case IntervalWeekly:
		// Go back to Monday
		offset := int(t.Weekday()) - int(time.Monday)
		if offset < 0 {
			offset += 7
		}
		start := time.Date(t.Year(), t.Month(), t.Day()-offset, 0, 0, 0, 0, time.UTC)
		end := start.AddDate(0, 0, 7).Add(-time.Second)
		return start, end

	case IntervalYearly:
		start := time.Date(t.Year(), 1, 1, 0, 0, 0, 0, time.UTC)
		end := start.AddDate(1, 0, 0).Add(-time.Second)
		return start, end

	case IntervalMonthly:
		fallthrough
	default:
		start := time.Date(t.Year(), t.Month(), 1, 0, 0, 0, 0, time.UTC)
		end := start.AddDate(0, 1, 0).Add(-time.Second)
		return start, end
	}
}

// BudgetPatchSchema defines all patchable fields for a Budget entity.
var BudgetPatchSchema = patch.NewSchema[Budget]().
	Register("name", patch.Field(func(b *Budget) *string { return &b.Name })).
	Register("limit_amount", patch.Field(func(b *Budget) *int64 { return &b.LimitAmount })).
	Register("currency", patch.Field(func(b *Budget) *Currency { return &b.Currency })).
	Register("interval", patch.Field(func(b *Budget) *RecurrenceInterval { return &b.Interval })).
	Register("status", patch.Field(func(b *Budget) *BudgetStatus { return &b.Status })).
	Register("icon", patch.Field(func(b *Budget) *string { return &b.Icon })).
	Register("color", patch.Field(func(b *Budget) *string { return &b.Color })).
	Register("default_account_id", patch.Field(func(b *Budget) **AccountID { return &b.DefaultAccountID }))

// ApplyPatch applies partial updates from an incoming budget based on the field mask.
func (b *Budget) ApplyPatch(incoming *Budget, mask []string) error {
	if err := BudgetPatchSchema.Apply(b, incoming, mask); err != nil {
		return err
	}
	b.UpdateTime = time.Now().UTC()
	return b.Validate()
}
