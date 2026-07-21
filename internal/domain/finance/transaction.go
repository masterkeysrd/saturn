package finance

import (
	"errors"
	"fmt"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/id"
)

type TransactionType string

const (
	TransactionTypeExpense TransactionType = "EXPENSE"
	TransactionTypeIncome  TransactionType = "INCOME"
)

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

// Transaction represents a financial record in the space ledger.
type Transaction struct {
	ID              TransactionID
	SpaceID         SpaceID
	Type            TransactionType
	BudgetID        *BudgetID // Nullable
	PeriodID        *PeriodID // Nullable
	Amount          int64     // Unsigned in local currency cents
	Currency        Currency
	AmountInBase    int64 // Unsigned in workspace base currency cents
	Description     string
	TransactionDate time.Time
	EffectiveDate   time.Time
	CreateTime      time.Time
	UpdateTime      time.Time
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
	if t.Type != TransactionTypeExpense && t.Type != TransactionTypeIncome {
		return fmt.Errorf("invalid transaction type: %s", t.Type)
	}
	if t.Amount <= 0 {
		return errors.New("transaction amount must be greater than zero")
	}
	if err := t.Currency.Validate(); err != nil {
		return fmt.Errorf("validate currency: %w", err)
	}
	if t.AmountInBase <= 0 {
		return errors.New("transaction amount in base currency must be greater than zero")
	}
	if t.Type == TransactionTypeExpense {
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
	return nil
}
