package finance

import (
	"errors"
	"fmt"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/id"
	"github.com/masterkeysrd/saturn/internal/platform/patch"
)

type RecurringTransactionID string

const recurringTransactionPrefix = "rec_"

func NewRecurringTransactionID() (RecurringTransactionID, error) {
	raw, err := id.Generate(recurringTransactionPrefix)
	if err != nil {
		return "", err
	}
	return RecurringTransactionID(raw), nil
}

func ParseRecurringTransactionID(s string) (RecurringTransactionID, error) {
	if err := id.Validate(s, recurringTransactionPrefix); err != nil {
		return "", fmt.Errorf("invalid recurring transaction ID: %w", err)
	}
	return RecurringTransactionID(s), nil
}

func (rid RecurringTransactionID) Validate() error {
	return id.Validate(string(rid), recurringTransactionPrefix)
}

type RecurringTransactionStatus string

const (
	RecurringTransactionActive RecurringTransactionStatus = "active"
	RecurringTransactionPaused RecurringTransactionStatus = "paused"
	RecurringTransactionEnded  RecurringTransactionStatus = "ended"
)

type RecurringTransaction struct {
	ID              RecurringTransactionID
	SpaceID         SpaceID
	BudgetID        *BudgetID // Nullable, required for EXPENSE type
	Name            string
	Amount          int64
	Currency        Currency
	Interval        RecurrenceInterval
	NextDueDate     time.Time
	IsVariable      bool
	Status          RecurringTransactionStatus
	GracePeriodDays int32
	Type            TransactionType // EXPENSE or INCOME
	AccountID       *AccountID      // Nullable target/settlement account
	Version         int64
	CreateTime      time.Time
	UpdateTime      time.Time
}

// RecurringTransactionPatchSchema defines patchable fields for a RecurringTransaction entity.
var RecurringTransactionPatchSchema = patch.NewSchema[RecurringTransaction]().
	Register("name", patch.Field(func(re *RecurringTransaction) *string { return &re.Name })).
	Register("amount", patch.Field(func(re *RecurringTransaction) *int64 { return &re.Amount })).
	Register("currency", patch.Field(func(re *RecurringTransaction) *Currency { return &re.Currency })).
	Register("interval", patch.Field(func(re *RecurringTransaction) *RecurrenceInterval { return &re.Interval })).
	Register("next_due_date", patch.Field(func(re *RecurringTransaction) *time.Time { return &re.NextDueDate })).
	Register("is_variable", patch.Field(func(re *RecurringTransaction) *bool { return &re.IsVariable })).
	Register("status", patch.Field(func(re *RecurringTransaction) *RecurringTransactionStatus { return &re.Status })).
	Register("grace_period_days", patch.Field(func(re *RecurringTransaction) *int32 { return &re.GracePeriodDays })).
	Register("budget_id", patch.Field(func(re *RecurringTransaction) **BudgetID { return &re.BudgetID })).
	Register("type", patch.Field(func(re *RecurringTransaction) *TransactionType { return &re.Type })).
	Register("account_id", patch.Field(func(re *RecurringTransaction) **AccountID { return &re.AccountID }))

// ApplyPatch selectively mutates patchable fields on the existing recurring transaction.
func (re *RecurringTransaction) ApplyPatch(update *RecurringTransaction, mask []string) error {
	if err := RecurringTransactionPatchSchema.Apply(re, update, mask); err != nil {
		return fmt.Errorf("apply patch: %w", err)
	}
	re.UpdateTime = time.Now().UTC()
	return nil
}

// Init prepares a new recurring transaction entity for creation by generating an ID (if missing), setting active status, and populating creation timestamps.
func (re *RecurringTransaction) Init() error {
	if string(re.ID) == "" {
		reID, err := NewRecurringTransactionID()
		if err != nil {
			return fmt.Errorf("generate recurring transaction ID: %w", err)
		}
		re.ID = reID
	}
	if re.Status == "" {
		re.Status = RecurringTransactionActive
	}
	if re.Type == "" {
		re.Type = TransactionTypeExpense
	}
	now := time.Now().UTC()
	re.CreateTime = now
	re.UpdateTime = now
	return nil
}

func (re *RecurringTransaction) Validate() error {
	if err := re.ID.Validate(); err != nil {
		return fmt.Errorf("validate recurring transaction ID: %w", err)
	}
	if err := re.SpaceID.Validate(); err != nil {
		return fmt.Errorf("validate space ID: %w", err)
	}
	if re.Type == TransactionTypeExpense {
		if re.BudgetID == nil {
			return errors.New("recurring expense transaction requires a budget ID")
		}
		if err := re.BudgetID.Validate(); err != nil {
			return fmt.Errorf("validate budget ID: %w", err)
		}
	} else if re.Type != TransactionTypeIncome {
		return fmt.Errorf("invalid recurring transaction type: %s", re.Type)
	}
	if re.Name == "" {
		return errors.New("recurring transaction name cannot be empty")
	}
	if re.Amount <= 0 {
		return errors.New("recurring transaction amount must be greater than zero")
	}
	if err := re.Currency.Validate(); err != nil {
		return fmt.Errorf("validate currency: %w", err)
	}
	if err := re.Interval.Validate(); err != nil {
		return err
	}
	if re.Interval == IntervalOneTime {
		return errors.New("recurring transaction cannot have a one_time interval")
	}
	if re.NextDueDate.IsZero() {
		return errors.New("next due date cannot be zero")
	}
	if re.AccountID != nil {
		if err := re.AccountID.Validate(); err != nil {
			return fmt.Errorf("validate account ID: %w", err)
		}
	}
	return nil
}

// AdvanceNextDueDate moves NextDueDate forward according to the recurrence interval.
func (re *RecurringTransaction) AdvanceNextDueDate() error {
	switch re.Interval {
	case IntervalWeekly:
		re.NextDueDate = re.NextDueDate.AddDate(0, 0, 7)
	case IntervalMonthly:
		re.NextDueDate = re.NextDueDate.AddDate(0, 1, 0)
	case IntervalYearly:
		re.NextDueDate = re.NextDueDate.AddDate(1, 0, 0)
	default:
		return fmt.Errorf("unsupported interval for recurring transaction %s: %s", re.ID, re.Interval)
	}
	re.UpdateTime = time.Now().UTC()
	return nil
}

// NewScheduledTransaction instantiates a pending ScheduledTransaction from this template.
func (re *RecurringTransaction) NewScheduledTransaction(spID ScheduledTransactionID) (*ScheduledTransaction, error) {
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

	sp := &ScheduledTransaction{
		ID:         spID,
		SpaceID:    re.SpaceID,
		BudgetID:   re.BudgetID,
		SourceType: string(SourceTypeRecurrentTransaction),
		SourceID:   string(re.ID),
		Amount:     re.Amount,
		Currency:   re.Currency,
		DueDate:    re.NextDueDate,
		Status:     ScheduledTransactionPending,
		Metadata: ScheduledTransactionMetadata{
			Name:        re.Name,
			DueDate:     re.NextDueDate.Format("2006-01-02"),
			Description: descText,
		},
		Type:       re.Type,
		AccountID:  re.AccountID,
		CreateTime: time.Now().UTC(),
		UpdateTime: time.Now().UTC(),
	}

	if err := sp.Validate(); err != nil {
		return nil, fmt.Errorf("validate generated scheduled transaction: %w", err)
	}
	return sp, nil
}

const DefaultRecurringTransactionSortField = "create_time"

// RecurringTransactionSortFields registry maps sortable recurring transaction field names to cursor strings.
var RecurringTransactionSortFields = map[string]func(*RecurringTransaction) string{
	"name":          func(re *RecurringTransaction) string { return re.Name },
	"amount":        func(re *RecurringTransaction) string { return fmt.Sprintf("%018d", re.Amount) },
	"next_due_date": func(re *RecurringTransaction) string { return re.NextDueDate.Format(time.RFC3339) },
	"status":        func(re *RecurringTransaction) string { return string(re.Status) },
	"create_time":   func(re *RecurringTransaction) string { return re.CreateTime.Format(time.RFC3339) },
}

func IsRecurringTransactionSortField(field string) bool {
	_, ok := RecurringTransactionSortFields[field]
	return ok
}

func (re *RecurringTransaction) GetSortValue(field string) string {
	if fn, ok := RecurringTransactionSortFields[field]; ok {
		return fn(re)
	}
	return re.GetSortValue(DefaultRecurringTransactionSortField)
}
