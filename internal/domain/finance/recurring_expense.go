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
	Interval        RecurrenceInterval
	NextDueDate     time.Time
	IsVariable      bool
	Status          RecurringExpenseStatus
	GracePeriodDays int32
	CreateTime      time.Time
	UpdateTime      time.Time
}

// Init prepares a new recurring expense entity for creation by generating an ID (if missing), setting active status, and populating creation timestamps.
func (re *RecurringExpense) Init() error {
	if string(re.ID) == "" {
		reID, err := NewRecurringExpenseID()
		if err != nil {
			return fmt.Errorf("generate recurring expense ID: %w", err)
		}
		re.ID = reID
	}
	if re.Status == "" {
		re.Status = RecurringExpenseActive
	}
	now := time.Now().UTC()
	re.CreateTime = now
	re.UpdateTime = now
	return nil
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
	if err := re.Interval.Validate(); err != nil {
		return err
	}
	if re.Interval == IntervalOneTime {
		return errors.New("recurring expense cannot have a one_time interval")
	}
	if re.NextDueDate.IsZero() {
		return errors.New("next due date cannot be zero")
	}
	return nil
}

// AdvanceNextDueDate moves NextDueDate forward according to the recurrence interval.
func (re *RecurringExpense) AdvanceNextDueDate() error {
	switch re.Interval {
	case IntervalWeekly:
		re.NextDueDate = re.NextDueDate.AddDate(0, 0, 7)
	case IntervalMonthly:
		re.NextDueDate = re.NextDueDate.AddDate(0, 1, 0)
	case IntervalYearly:
		re.NextDueDate = re.NextDueDate.AddDate(1, 0, 0)
	default:
		return fmt.Errorf("unsupported interval for recurring expense %s: %s", re.ID, re.Interval)
	}
	re.UpdateTime = time.Now().UTC()
	return nil
}

// NewScheduledPayment instantiates a pending ScheduledPayment from this template.
func (re *RecurringExpense) NewScheduledPayment(spID ScheduledPaymentID) (*ScheduledPayment, error) {
	var dateTag string
	switch re.Interval {
	case IntervalMonthly:
		dateTag = re.NextDueDate.Format("2006-01")
	case IntervalYearly:
		dateTag = re.NextDueDate.Format("2006")
	default:
		dateTag = re.NextDueDate.Format("2006-01-02")
	}

	descText := fmt.Sprintf("%s (%s)", re.Name, dateTag)
	sp := &ScheduledPayment{
		ID:         spID,
		SpaceID:    re.SpaceID,
		BudgetID:   re.BudgetID,
		SourceType: SourceTypeRecurrentExpense,
		SourceID:   string(re.ID),
		Amount:     re.Amount,
		Currency:   re.Currency,
		DueDate:    re.NextDueDate,
		Status:     ScheduledPaymentPending,
		Metadata: ScheduledPaymentMetadata{
			Name:        re.Name,
			DueDate:     re.NextDueDate.Format("2006-01-02"),
			Description: descText,
		},
		CreateTime: time.Now().UTC(),
		UpdateTime: time.Now().UTC(),
	}

	if err := sp.Validate(); err != nil {
		return nil, fmt.Errorf("validate generated scheduled payment: %w", err)
	}
	return sp, nil
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
