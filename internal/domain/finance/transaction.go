package finance

import (
	"errors"
	"fmt"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/id"
)

type TransactionType string

const (
	TransactionTypeExpense           TransactionType = "EXPENSE"
	TransactionTypeIncome            TransactionType = "INCOME"
	TransactionTypeTransferOut       TransactionType = "TRANSFER_OUT"
	TransactionTypeTransferIn        TransactionType = "TRANSFER_IN"
	TransactionTypeBalanceAdjustment TransactionType = "BALANCE_ADJUSTMENT"

	SourceTypeBorrowing            = "borrowing"
	SourceTypeBorrowingRepayment   = "borrowing_repayment"
	SourceTypeBorrowingAdditional  = "borrowing_additional"
	SourceTypeRecurrentTransaction = "recurrent_transaction"
)

type ScheduledPaymentID = ScheduledTransactionID
type RecurringExpenseID = RecurringTransactionID

// TransactionID is a custom string type representing a transaction's unique identifier (KSUID).
type TransactionID string

// NewTransactionID creates a new TransactionID using the default ID generator.
func NewTransactionID() (TransactionID, error) {
	raw, err := id.Generate(transactionPrefix)
	if err != nil {
		return "", err
	}
	return TransactionID(raw), nil
}

// ParseTransactionID parses a string into a TransactionID and validates it.
func ParseTransactionID(s string) (TransactionID, error) {
	if err := id.Validate(s, transactionPrefix); err != nil {
		return "", fmt.Errorf("invalid transaction ID: %w", err)
	}
	return TransactionID(s), nil
}

// MustTransactionID panics if the string is not a valid TransactionID.
func MustTransactionID(s string) TransactionID {
	tID, err := ParseTransactionID(s)
	if err != nil {
		panic(err)
	}
	return tID
}

// String returns the string representation.
func (tid TransactionID) String() string {
	return string(tid)
}

// Validate checks if the TransactionID is valid.
func (tid TransactionID) Validate() error {
	return id.Validate(string(tid), transactionPrefix)
}

const transactionPrefix = "txn_"

// TransactionMetadata contains strongly typed domain context metadata associated with a transaction.
type TransactionMetadata struct {
	ScheduledPaymentID   *ScheduledPaymentID `json:"scheduled_payment_id,omitempty"`
	RecurringExpenseID   *RecurringExpenseID `json:"recurring_expense_id,omitempty"`
	BorrowingID          *BorrowingID        `json:"borrowing_id,omitempty"`
	BorrowingRole        string              `json:"borrowing_role,omitempty"` // "INITIAL_FUNDING", "REPAYMENT", "ADDITIONAL_LOAN"
	BorrowingAmount      int64               `json:"borrowing_amount,omitempty"`
	AccountImpactAmount  int64               `json:"account_impact_amount,omitempty"`
	TransferID           *TransferID         `json:"transfer_id,omitempty"`
	CounterpartAccountID *AccountID          `json:"counterpart_account_id,omitempty"`
	Notes                string              `json:"notes,omitempty"`
}

// Transaction represents a financial record in the space ledger.
type Transaction struct {
	ID              TransactionID
	SpaceID         SpaceID
	Type            TransactionType
	BudgetID        *BudgetID  // Nullable
	PeriodID        *PeriodID  // Nullable
	AccountID       *AccountID // Nullable
	Amount          int64      // Unsigned in local currency cents
	Currency        Currency
	AmountInBase    int64 // Unsigned in workspace base currency cents
	Description     string
	TransactionDate time.Time
	EffectiveDate   time.Time
	Metadata        TransactionMetadata
	CreateTime      time.Time
	UpdateTime      time.Time
}

// Init populates default timestamps and generates an ID if unpopulated.
func (t *Transaction) Init() error {
	if string(t.ID) == "" {
		tID, err := NewTransactionID()
		if err != nil {
			return fmt.Errorf("generate transaction ID: %w", err)
		}
		t.ID = tID
	}
	now := time.Now().UTC()
	if t.TransactionDate.IsZero() {
		t.TransactionDate = now
	}
	if t.EffectiveDate.IsZero() {
		t.EffectiveDate = t.TransactionDate
	}
	if t.CreateTime.IsZero() {
		t.CreateTime = now
	}
	t.UpdateTime = now
	return nil
}

// Validate checks basic properties of a transaction.
func (t *Transaction) Validate() error {
	if t.EffectiveDate.IsZero() {
		t.EffectiveDate = t.TransactionDate
	}
	if err := t.ID.Validate(); err != nil {
		return fmt.Errorf("validate transaction ID: %w", err)
	}
	if err := t.SpaceID.Validate(); err != nil {
		return fmt.Errorf("validate space ID: %w", err)
	}
	if t.Type != TransactionTypeExpense && t.Type != TransactionTypeIncome && t.Type != TransactionTypeTransferOut && t.Type != TransactionTypeTransferIn && t.Type != TransactionTypeBalanceAdjustment {
		return fmt.Errorf("invalid transaction type: %s", t.Type)
	}
	if t.Type != TransactionTypeBalanceAdjustment && t.Amount <= 0 {
		return errors.New("transaction amount must be greater than zero")
	}
	if err := t.Currency.Validate(); err != nil {
		return fmt.Errorf("validate currency: %w", err)
	}
	if t.Type != TransactionTypeBalanceAdjustment && t.AmountInBase <= 0 {
		return errors.New("transaction amount in base currency must be greater than zero")
	}
	if t.AccountID != nil {
		if err := t.AccountID.Validate(); err != nil {
			return fmt.Errorf("validate account ID: %w", err)
		}
	}
	if t.Metadata.TransferID != nil {
		if err := t.Metadata.TransferID.Validate(); err != nil {
			return fmt.Errorf("validate transfer ID: %w", err)
		}
	}
	if t.Type == TransactionTypeExpense {
		isBorrowing := t.Metadata.BorrowingID != nil && *t.Metadata.BorrowingID != ""
		if !isBorrowing {
			if t.BudgetID == nil {
				return errors.New("expense transaction requires a budget ID")
			}
			if err := t.BudgetID.Validate(); err != nil {
				return fmt.Errorf("validate budget ID: %w", err)
			}
			if t.PeriodID == nil {
				return errors.New("expense transaction requires a period ID")
			}
			if err := t.PeriodID.Validate(); err != nil {
				return fmt.Errorf("validate period ID: %w", err)
			}
		}
	}
	return nil
}

// DefaultTransactionSortField represents the fallback sorting column name for transactions.
const DefaultTransactionSortField = "transaction_date"

// TransactionSortFields registry maps sortable transaction field names to their cursor string extraction logic.
var TransactionSortFields = map[string]func(*Transaction) string{
	"transaction_date": func(t *Transaction) string { return t.TransactionDate.Format(time.RFC3339Nano) },
	"effective_date":   func(t *Transaction) string { return t.EffectiveDate.Format(time.RFC3339Nano) },
	"amount":           func(t *Transaction) string { return fmt.Sprintf("%018d", t.Amount) },
	"description":      func(t *Transaction) string { return t.Description },
	"create_time":      func(t *Transaction) string { return t.CreateTime.Format(time.RFC3339Nano) },
}

// IsTransactionSortField validates if a sort column name is allowed.
func IsTransactionSortField(field string) bool {
	_, ok := TransactionSortFields[field]
	return ok
}

// GetSortValue extracts and formats the string representation of a field for cursor-based lexical sorting.
func (t *Transaction) GetSortValue(field string) string {
	if fn, ok := TransactionSortFields[field]; ok {
		return fn(t)
	}
	return t.GetSortValue(DefaultTransactionSortField)
}

// LinkScheduledPayment attaches scheduled payment and recurring expense linkage metadata.
func (t *Transaction) LinkScheduledPayment(paymentID ScheduledPaymentID, reID *RecurringExpenseID) {
	t.Metadata.ScheduledPaymentID = &paymentID
	if reID != nil {
		t.Metadata.RecurringExpenseID = reID
	}
	t.UpdateTime = time.Now().UTC()
}

// LinkBorrowing attaches borrowing linkage metadata.
func (t *Transaction) LinkBorrowing(borrowingID BorrowingID, role string) {
	t.Metadata.BorrowingID = &borrowingID
	t.Metadata.BorrowingRole = role
	t.UpdateTime = time.Now().UTC()
}

// ImpactAmount returns the effective monetary impact amount of the transaction on an account balance.
func (t *Transaction) ImpactAmount() int64 {
	if t.Metadata.AccountImpactAmount > 0 {
		return t.Metadata.AccountImpactAmount
	}
	return t.Amount
}

// Diff compares this transaction with an updated transaction and returns a metadata diff map for audit logging.
func (t *Transaction) Diff(updated *Transaction) map[string]any {
	metadata := map[string]any{}
	if t.Amount != updated.Amount {
		metadata["old_amount"] = t.Amount
		metadata["new_amount"] = updated.Amount
	}
	if t.Description != updated.Description {
		metadata["old_description"] = t.Description
		metadata["new_description"] = updated.Description
	}
	if t.Currency != updated.Currency {
		metadata["old_currency"] = string(t.Currency)
		metadata["new_currency"] = string(updated.Currency)
	}
	if (t.BudgetID == nil && updated.BudgetID != nil) ||
		(t.BudgetID != nil && updated.BudgetID == nil) ||
		(t.BudgetID != nil && updated.BudgetID != nil && *t.BudgetID != *updated.BudgetID) {
		if t.BudgetID != nil {
			metadata["old_budget_id"] = string(*t.BudgetID)
		}
		if updated.BudgetID != nil {
			metadata["new_budget_id"] = string(*updated.BudgetID)
		}
	}
	if (t.AccountID == nil && updated.AccountID != nil) ||
		(t.AccountID != nil && updated.AccountID == nil) ||
		(t.AccountID != nil && updated.AccountID != nil && *t.AccountID != *updated.AccountID) {
		if t.AccountID != nil {
			metadata["old_account_id"] = string(*t.AccountID)
		}
		if updated.AccountID != nil {
			metadata["new_account_id"] = string(*updated.AccountID)
		}
	}
	return metadata
}
