package finance

import (
	"errors"
	"fmt"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/id"
)

type RecurringExpenseID string

const recurringExpensePrefix = "rec_"

func NewRecurringExpenseID() (RecurringExpenseID, error) {
	raw, err := id.Generate(recurringExpensePrefix)
	if err != nil {
		return "", err
	}
	return RecurringExpenseID(raw), nil
}

func ParseRecurringExpenseID(s string) (RecurringExpenseID, error) {
	if err := id.Validate(s, recurringExpensePrefix); err != nil {
		return "", fmt.Errorf("invalid recurring expense ID: %w", err)
	}
	return RecurringExpenseID(s), nil
}

func (rid RecurringExpenseID) Validate() error {
	return id.Validate(string(rid), recurringExpensePrefix)
}

type RecurringExpenseStatus string

const (
	RecurringExpenseActive RecurringExpenseStatus = "active"
	RecurringExpensePaused RecurringExpenseStatus = "paused"
	RecurringExpenseEnded  RecurringExpenseStatus = "ended"
)

type RecurringExpense struct {
	ID              RecurringExpenseID
	SpaceID         SpaceID
	BudgetID        BudgetID
	Name            string
	Amount          int64
	Currency        Currency
	Interval        string // "weekly", "monthly", "yearly"
	NextDueDate     time.Time
	IsVariable      bool
	Status          RecurringExpenseStatus
	GracePeriodDays int32
	CreateTime      time.Time
	UpdateTime      time.Time
}

func (re *RecurringExpense) Validate() error {
	if err := re.ID.Validate(); err != nil {
		return fmt.Errorf("validate recurring expense ID: %w", err)
	}
	if err := re.SpaceID.Validate(); err != nil {
		return fmt.Errorf("validate space ID: %w", err)
	}
	if err := re.BudgetID.Validate(); err != nil {
		return fmt.Errorf("validate budget ID: %w", err)
	}
	if re.Name == "" {
		return errors.New("recurring expense name cannot be empty")
	}
	if re.Amount <= 0 {
		return errors.New("recurring expense amount must be greater than zero")
	}
	if err := re.Currency.Validate(); err != nil {
		return fmt.Errorf("validate currency: %w", err)
	}
	if re.Interval != "weekly" && re.Interval != "monthly" && re.Interval != "yearly" {
		return fmt.Errorf("invalid interval: %q", re.Interval)
	}
	if re.NextDueDate.IsZero() {
		return errors.New("next due date cannot be zero")
	}
	return nil
}

const DefaultRecurringExpenseSortField = "create_time"

// RecurringExpenseSortFields registry maps sortable recurring expense field names to cursor strings.
var RecurringExpenseSortFields = map[string]func(*RecurringExpense) string{
	"name":          func(re *RecurringExpense) string { return re.Name },
	"amount":        func(re *RecurringExpense) string { return fmt.Sprintf("%018d", re.Amount) },
	"next_due_date": func(re *RecurringExpense) string { return re.NextDueDate.Format(time.RFC3339) },
	"status":        func(re *RecurringExpense) string { return string(re.Status) },
	"create_time":   func(re *RecurringExpense) string { return re.CreateTime.Format(time.RFC3339) },
}

func IsRecurringExpenseSortField(field string) bool {
	_, ok := RecurringExpenseSortFields[field]
	return ok
}

func (re *RecurringExpense) GetSortValue(field string) string {
	if fn, ok := RecurringExpenseSortFields[field]; ok {
		return fn(re)
	}
	return re.GetSortValue(DefaultRecurringExpenseSortField)
}
