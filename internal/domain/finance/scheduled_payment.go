package finance

import (
	"errors"
	"fmt"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/id"
)

var ErrScheduledPaymentNotFound = errors.New("scheduled payment not found")

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
	ScheduledPaymentPaid       ScheduledPaymentStatus = "paid"
)

// ScheduledPaymentMetadata contains strongly typed domain context metadata associated with a scheduled payment.
type ScheduledPaymentMetadata struct {
	Name        string `json:"name,omitempty"`
	DueDate     string `json:"due_date,omitempty"`
	Description string `json:"description,omitempty"`
	VendorName  string `json:"vendor_name,omitempty"`
	InvoiceID   string `json:"invoice_id,omitempty"`
	Notes       string `json:"notes,omitempty"`
}

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
	Metadata   ScheduledPaymentMetadata
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

// Init sets default fields, ID, and timestamps for a ScheduledPayment.
func (sp *ScheduledPayment) Init() error {
	if string(sp.ID) == "" {
		id, err := NewScheduledPaymentID()
		if err != nil {
			return fmt.Errorf("generate scheduled payment ID: %w", err)
		}
		sp.ID = id
	}
	now := time.Now().UTC()
	if sp.DueDate.IsZero() {
		sp.DueDate = now
	}
	if sp.Status == "" {
		sp.Status = ScheduledPaymentPending
	}
	if sp.CreateTime.IsZero() {
		sp.CreateTime = now
	}
	sp.UpdateTime = now
	return nil
}

// MarkPaid transitions status to paid and updates timestamp.
func (sp *ScheduledPayment) MarkPaid() error {
	if sp.Status == ScheduledPaymentPaid {
		return errors.New("scheduled payment is already paid")
	}
	sp.Status = ScheduledPaymentPaid
	sp.UpdateTime = time.Now().UTC()
	return nil
}

// MarkSkipped transitions status to skipped and updates timestamp.
func (sp *ScheduledPayment) MarkSkipped() error {
	if sp.Status == ScheduledPaymentPaid {
		return errors.New("cannot skip a paid scheduled payment")
	}
	sp.Status = ScheduledPaymentSkipped
	sp.UpdateTime = time.Now().UTC()
	return nil
}

// ConfirmOpts contains parameters for creating an expense transaction upon confirming a scheduled payment.
type ConfirmOpts struct {
	BudgetID            *BudgetID
	PeriodID            *PeriodID
	AccountID           *AccountID
	Amount              int64
	Currency            Currency
	AmountInBase        int64
	AccountImpactAmount int64
	Description         string
	TransactionDate     time.Time
	EffectiveDate       time.Time
}

// NewConfirmationTransaction constructs an expense transaction for a confirmed scheduled payment.
func (sp *ScheduledPayment) NewConfirmationTransaction(opts ConfirmOpts) (*Transaction, error) {
	date := opts.TransactionDate
	if date.IsZero() {
		date = time.Now().UTC()
	}

	effDate := opts.EffectiveDate
	if effDate.IsZero() {
		effDate = date
	}

	budgetID := &sp.BudgetID
	if opts.BudgetID != nil {
		budgetID = opts.BudgetID
	}

	amount := sp.Amount
	if opts.Amount > 0 {
		amount = opts.Amount
	}

	curr := sp.Currency
	if opts.Currency != "" {
		curr = opts.Currency
	}

	desc := opts.Description
	if desc == "" {
		if sp.Metadata.Description != "" {
			desc = sp.Metadata.Description
		} else {
			desc = fmt.Sprintf("Scheduled Payment: %s", sp.SourceType)
		}
	}

	spID := sp.ID
	meta := TransactionMetadata{
		ScheduledPaymentID:  &spID,
		AccountImpactAmount: opts.AccountImpactAmount,
	}

	if sp.SourceType == SourceTypeRecurrentExpense && sp.SourceID != "" {
		meta.RecurringExpenseID = new(RecurringExpenseID(sp.SourceID))
	}

	t := &Transaction{
		SpaceID:         sp.SpaceID,
		Type:            TransactionTypeExpense,
		BudgetID:        budgetID,
		PeriodID:        opts.PeriodID,
		AccountID:       opts.AccountID,
		Amount:          amount,
		Currency:        curr,
		AmountInBase:    opts.AmountInBase,
		Description:     desc,
		TransactionDate: opts.TransactionDate,
		EffectiveDate:   opts.EffectiveDate,
		Metadata:        meta,
	}

	if err := t.Init(); err != nil {
		return nil, fmt.Errorf("init confirmation transaction: %w", err)
	}

	if opts.PeriodID != nil {
		if err := t.Validate(); err != nil {
			return nil, fmt.Errorf("validate confirmation transaction: %w", err)
		}
	}
	return t, nil
}

// ResolveDescription determines the final description for a payment confirmation using fallback hierarchy.
func (sp *ScheduledPayment) ResolveDescription(reqDesc, sourceFallback string) string {
	if reqDesc != "" {
		return reqDesc
	}
	if sp.Metadata.Description != "" {
		return sp.Metadata.Description
	}
	if sourceFallback != "" {
		return sourceFallback
	}
	return "Scheduled Payment"
}

// NewScheduledEvent constructs an EXPENSE_SCHEDULED audit event for the payment.
func (sp *ScheduledPayment) NewScheduledEvent(txnID TransactionID) *TransactionEvent {
	return &TransactionEvent{
		SpaceID:       sp.SpaceID,
		TransactionID: txnID,
		EventType:     "EXPENSE_SCHEDULED",
		CreateTime:    sp.CreateTime,
		Metadata:      map[string]any{"scheduled_payment_id": string(sp.ID)},
	}
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
