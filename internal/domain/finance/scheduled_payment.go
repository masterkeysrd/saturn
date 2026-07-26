package finance

import (
	"errors"
	"fmt"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/id"
)

type ScheduledPaymentID string

const scheduledPaymentPrefix = "sch_"

func NewScheduledPaymentID() (ScheduledPaymentID, error) {
	raw, err := id.Generate(scheduledPaymentPrefix)
	if err != nil {
		return "", err
	}
	return ScheduledPaymentID(raw), nil
}

func ParseScheduledPaymentID(s string) (ScheduledPaymentID, error) {
	if err := id.Validate(s, scheduledPaymentPrefix); err != nil {
		return "", fmt.Errorf("invalid scheduled payment ID: %w", err)
	}
	return ScheduledPaymentID(s), nil
}

func (spid ScheduledPaymentID) Validate() error {
	return id.Validate(string(spid), scheduledPaymentPrefix)
}

type ScheduledPaymentStatus string

const (
	ScheduledPaymentPending    ScheduledPaymentStatus = "pending"
	ScheduledPaymentProcessing ScheduledPaymentStatus = "processing"
	ScheduledPaymentSkipped    ScheduledPaymentStatus = "skipped"
)

type ScheduledPayment struct {
	ID         ScheduledPaymentID
	SpaceID    SpaceID
	BudgetID   BudgetID
	SourceType string // "recurrent_expense", "loan", "tax"
	SourceID   string
	Amount     int64
	Currency   Currency
	DueDate    time.Time
	Status     ScheduledPaymentStatus
	Metadata   []byte // Optional JSONB metadata
	CreateTime time.Time
	UpdateTime time.Time
}

func (sp *ScheduledPayment) Validate() error {
	if err := sp.ID.Validate(); err != nil {
		return fmt.Errorf("validate scheduled payment ID: %w", err)
	}
	if err := sp.SpaceID.Validate(); err != nil {
		return fmt.Errorf("validate space ID: %w", err)
	}
	if err := sp.BudgetID.Validate(); err != nil {
		return fmt.Errorf("validate budget ID: %w", err)
	}
	if sp.SourceType == "" {
		return errors.New("source type is required")
	}
	if sp.SourceID == "" {
		return errors.New("source ID is required")
	}
	if sp.Amount <= 0 {
		return errors.New("scheduled payment amount must be greater than zero")
	}
	if err := sp.Currency.Validate(); err != nil {
		return fmt.Errorf("validate currency: %w", err)
	}
	if sp.DueDate.IsZero() {
		return errors.New("due date cannot be zero")
	}
	return nil
}

const DefaultScheduledPaymentSortField = "due_date"

// ScheduledPaymentSortFields registry maps sortable scheduled payment field names to cursor strings.
var ScheduledPaymentSortFields = map[string]func(*ScheduledPayment) string{
	"due_date":    func(sp *ScheduledPayment) string { return sp.DueDate.Format(time.RFC3339) },
	"amount":      func(sp *ScheduledPayment) string { return fmt.Sprintf("%018d", sp.Amount) },
	"status":      func(sp *ScheduledPayment) string { return string(sp.Status) },
	"create_time": func(sp *ScheduledPayment) string { return sp.CreateTime.Format(time.RFC3339) },
}

func IsScheduledPaymentSortField(field string) bool {
	_, ok := ScheduledPaymentSortFields[field]
	return ok
}

func (sp *ScheduledPayment) GetSortValue(field string) string {
	if fn, ok := ScheduledPaymentSortFields[field]; ok {
		return fn(sp)
	}
	return sp.GetSortValue(DefaultScheduledPaymentSortField)
}
