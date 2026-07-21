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
