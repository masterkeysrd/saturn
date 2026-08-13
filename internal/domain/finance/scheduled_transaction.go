package finance

import (
	"errors"
	"fmt"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/id"
)

var ErrScheduledTransactionNotFound = errors.New("scheduled transaction not found")

type ScheduledTransactionID string

const scheduledTransactionPrefix = "sch_"

func NewScheduledTransactionID() (ScheduledTransactionID, error) {
	raw, err := id.Generate(scheduledTransactionPrefix)
	if err != nil {
		return "", err
	}
	return ScheduledTransactionID(raw), nil
}

func ParseScheduledTransactionID(s string) (ScheduledTransactionID, error) {
	if err := id.Validate(s, scheduledTransactionPrefix); err != nil {
		return "", fmt.Errorf("invalid scheduled transaction ID: %w", err)
	}
	return ScheduledTransactionID(s), nil
}

func (spid ScheduledTransactionID) Validate() error {
	return id.Validate(string(spid), scheduledTransactionPrefix)
}

type ScheduledTransactionStatus string

const (
	ScheduledTransactionPending    ScheduledTransactionStatus = "pending"
	ScheduledTransactionProcessing ScheduledTransactionStatus = "processing"
	ScheduledTransactionSkipped    ScheduledTransactionStatus = "skipped"
	ScheduledTransactionPaid       ScheduledTransactionStatus = "paid"
)

// ScheduledTransactionMetadata contains strongly typed domain context metadata associated with a scheduled transaction.
type ScheduledTransactionMetadata struct {
	Name        string `json:"name,omitempty"`
	DueDate     string `json:"due_date,omitempty"`
	Description string `json:"description,omitempty"`
	VendorName  string `json:"vendor_name,omitempty"`
	InvoiceID   string `json:"invoice_id,omitempty"`
	Notes       string `json:"notes,omitempty"`
}

type ScheduledTransaction struct {
	ID         ScheduledTransactionID
	SpaceID    SpaceID
	BudgetID   *BudgetID // Nullable, required for EXPENSE type
	SourceType string    // "recurrent_transaction", "loan", "tax"
	SourceID   string
	Amount     int64
	Currency   Currency
	DueDate    time.Time
	Status     ScheduledTransactionStatus
	Metadata   ScheduledTransactionMetadata
	Type       TransactionType // EXPENSE or INCOME
	AccountID  *AccountID      // Nullable target/settlement account
	CreateTime time.Time
	UpdateTime time.Time
}

func (sp *ScheduledTransaction) Validate() error {
	if err := sp.ID.Validate(); err != nil {
		return fmt.Errorf("validate scheduled transaction ID: %w", err)
	}
	if err := sp.SpaceID.Validate(); err != nil {
		return fmt.Errorf("validate space ID: %w", err)
	}
	if sp.Type == TransactionTypeExpense {
		if sp.BudgetID == nil {
			return errors.New("scheduled expense transaction requires a budget ID")
		}
		if err := sp.BudgetID.Validate(); err != nil {
			return fmt.Errorf("validate budget ID: %w", err)
		}
	} else if sp.Type != TransactionTypeIncome {
		return fmt.Errorf("invalid scheduled transaction type: %s", sp.Type)
	}
	if sp.SourceType == "" {
		return errors.New("source type is required")
	}
	if sp.SourceID == "" {
		return errors.New("source ID is required")
	}
	if sp.Amount <= 0 {
		return errors.New("scheduled transaction amount must be greater than zero")
	}
	if err := sp.Currency.Validate(); err != nil {
		return fmt.Errorf("validate currency: %w", err)
	}
	if sp.DueDate.IsZero() {
		return errors.New("due date cannot be zero")
	}
	if sp.AccountID != nil {
		if err := sp.AccountID.Validate(); err != nil {
			return fmt.Errorf("validate account ID: %w", err)
		}
	}
	return nil
}

// Init sets default fields, ID, and timestamps for a ScheduledTransaction.
func (sp *ScheduledTransaction) Init() error {
	if string(sp.ID) == "" {
		spID, err := NewScheduledTransactionID()
		if err != nil {
			return fmt.Errorf("generate scheduled transaction ID: %w", err)
		}
		sp.ID = spID
	}
	if sp.Status == "" {
		sp.Status = ScheduledTransactionPending
	}
	if sp.Type == "" {
		sp.Type = TransactionTypeExpense
	}
	now := time.Now().UTC()
	sp.CreateTime = now
	sp.UpdateTime = now
	return nil
}

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

// NewConfirmationTransaction constructs an expense or income transaction for a confirmed scheduled transaction.
func (sp *ScheduledTransaction) NewConfirmationTransaction(opts ConfirmOpts) (*Transaction, error) {
	date := opts.TransactionDate
	if date.IsZero() {
		date = time.Now().UTC()
	}

	effDate := opts.EffectiveDate
	if effDate.IsZero() {
		effDate = date
	}

	var budgetID *BudgetID = sp.BudgetID
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
			desc = fmt.Sprintf("Scheduled Transaction: %s", sp.SourceType)
		}
	}

	spID := sp.ID
	meta := TransactionMetadata{
		ScheduledPaymentID:  (*ScheduledPaymentID)(&spID),
		AccountImpactAmount: opts.AccountImpactAmount,
	}

	if sp.SourceType == string(SourceTypeRecurrentTransaction) && sp.SourceID != "" {
		meta.RecurringExpenseID = (*RecurringExpenseID)(&sp.SourceID)
	}

	var accountID *AccountID = sp.AccountID
	if opts.AccountID != nil {
		accountID = opts.AccountID
	}

	t := &Transaction{
		SpaceID:         sp.SpaceID,
		Type:            sp.Type,
		BudgetID:        budgetID,
		PeriodID:        opts.PeriodID,
		AccountID:       accountID,
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

	// Validate transaction only if we have period (expenses)
	if opts.PeriodID != nil {
		if err := t.Validate(); err != nil {
			return nil, fmt.Errorf("validate confirmation transaction: %w", err)
		}
	}
	return t, nil
}

// ResolveDescription determines the final description for a transaction confirmation using fallback hierarchy.
func (sp *ScheduledTransaction) ResolveDescription(reqDesc, sourceFallback string) string {
	if reqDesc != "" {
		return reqDesc
	}
	if sp.Metadata.Description != "" {
		return sp.Metadata.Description
	}
	if sourceFallback != "" {
		return sourceFallback
	}
	return "Scheduled Transaction"
}

// NewScheduledEvent constructs an AUDIT_EVENT for the transaction.
func (sp *ScheduledTransaction) MarkPaid() error {
	if sp.Status == ScheduledTransactionPaid {
		return errors.New("scheduled transaction is already paid")
	}
	sp.Status = ScheduledTransactionPaid
	sp.UpdateTime = time.Now().UTC()
	return nil
}

func (sp *ScheduledTransaction) MarkSkipped() error {
	if sp.Status == ScheduledTransactionPaid {
		return errors.New("cannot skip a paid scheduled transaction")
	}
	sp.Status = ScheduledTransactionSkipped
	sp.UpdateTime = time.Now().UTC()
	return nil
}

func (sp *ScheduledTransaction) NewScheduledEvent(txnID TransactionID) *TransactionEvent {
	eventType := "EXPENSE_SCHEDULED"
	if sp.Type == TransactionTypeIncome {
		eventType = "INCOME_SCHEDULED"
	}
	return &TransactionEvent{
		SpaceID:       sp.SpaceID,
		TransactionID: txnID,
		EventType:     eventType,
		CreateTime:    sp.CreateTime,
		Metadata:      map[string]any{"scheduled_transaction_id": string(sp.ID)},
	}
}

const DefaultScheduledTransactionSortField = "due_date"

// ScheduledTransactionSortFields registry maps sortable scheduled transaction field names to cursor strings.
var ScheduledTransactionSortFields = map[string]func(*ScheduledTransaction) string{
	"due_date":    func(sp *ScheduledTransaction) string { return sp.DueDate.Format(time.RFC3339) },
	"amount":      func(sp *ScheduledTransaction) string { return fmt.Sprintf("%018d", sp.Amount) },
	"status":      func(sp *ScheduledTransaction) string { return string(sp.Status) },
	"create_time": func(sp *ScheduledTransaction) string { return sp.CreateTime.Format(time.RFC3339) },
}

func IsScheduledTransactionSortField(field string) bool {
	_, ok := ScheduledTransactionSortFields[field]
	return ok
}

func (sp *ScheduledTransaction) GetSortValue(field string) string {
	if fn, ok := ScheduledTransactionSortFields[field]; ok {
		return fn(sp)
	}
	return sp.GetSortValue(DefaultScheduledTransactionSortField)
}
