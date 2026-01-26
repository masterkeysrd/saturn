package finance

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/masterkeysrd/saturn/internal/foundation/appearance"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/foundation/decimal"
	"github.com/masterkeysrd/saturn/internal/foundation/id"
	"github.com/masterkeysrd/saturn/internal/foundation/paging"
	"github.com/masterkeysrd/saturn/internal/foundation/space"
	"github.com/masterkeysrd/saturn/internal/pkg/money"
)

type TransactionStore interface {
	Get(context.Context, TransactionKey) (*Transaction, error)
	List(context.Context, space.ID) ([]*Transaction, error)
	Store(context.Context, *Transaction) error
	Delete(context.Context, TransactionKey) error
	ExistsBy(context.Context, TransactionCriteria) (bool, error)
}

type TransactionCriteria interface {
	isTransactionCriteria()
}

type TransactionSearcher interface {
	Search(context.Context, *TransactionSearchCriteria) (*TransactionPage, error)
}

// TransactionPage represet a page of Transaction Items.
type TransactionPage = paging.Page[*TransactionItem]

// Transaction represents a persisted financial transaction.
// It includes the base currency conversion and exchange rate for reporting.
type Transaction struct {
	TransactionKey
	Type           TransactionType
	BudgetID       *BudgetID
	BudgetPeriodID *BudgetPeriodID
	Title          string
	Description    string
	Amount         money.Money
	BaseAmount     money.Money
	ExchangeRate   decimal.Decimal
	Date           time.Time
	EffectiveDate  time.Time
	CreateTime     time.Time
	CreateBy       auth.UserID
	UpdateTime     time.Time
	UpdateBy       auth.UserID
}

// Validate ensures the Transaction is ready for persistence.
func (t *Transaction) Validate() error {
	if t == nil {
		return errors.New("transaction is nil")
	}

	if t.ID == "" {
		return errors.New("id field is required")
	}

	if err := t.Type.Validate(); err != nil {
		return fmt.Errorf("cannot validate transaction type: %w", err)
	}

	if t.BaseAmount.Cents <= 0 {
		return errors.New("base amount field must be a positive number")
	}

	if err := t.BaseAmount.Validate(); err != nil {
		return fmt.Errorf("invalid amount: %w", err)
	}

	if t.ExchangeRate.Cmp(decimal.Zero) <= 0 {
		return errors.New("exchange rate must be a positive number")
	}

	if t.Type == TransactionTypeExpense {
		return t.validateExpense()
	}

	return nil
}

func (t *Transaction) validateExpense() error {
	if t.Type != TransactionTypeExpense {
		return fmt.Errorf("transaction of type %s is not an expense", t.Type)
	}

	if t.BudgetID == nil {
		return errors.New("budget id is require for expenses")
	}

	if err := id.Validate(*t.BudgetID); err != nil {
		return fmt.Errorf("budget id is invalid: %w", err)
	}

	if t.BudgetPeriodID == nil {
		return errors.New("budget period id is require for expenses")
	}

	if err := id.Validate(*t.BudgetPeriodID); err != nil {
		return fmt.Errorf("budget period id is invalid: %w", err)
	}

	return nil
}

type TransactionKey struct {
	ID      TransactionID
	SpaceID space.ID
}

// TransactionID uniquely identifies a transaction.
type TransactionID string

func (tid TransactionID) String() string {
	return string(tid)
}

// TransactionType represents the kind of transaction (e.g., expense, income).
type TransactionType string

const (
	// TransactionTypeExpense represents an expense transaction.
	TransactionTypeExpense TransactionType = "expense"
)

var transactionTypes = map[TransactionType]struct{}{
	TransactionTypeExpense: {},
}

// Validate checks that the TransactionType is recognized.
func (tt TransactionType) Validate() error {
	if _, ok := transactionTypes[tt]; !ok {
		return fmt.Errorf("transaction type %s is invalid", tt)
	}

	return nil
}

func (tt TransactionType) String() string {
	return string(tt)
}

type SearchTransactionsInput struct {
	Term          string
	PagingRequest paging.Request
}

func (tsi *SearchTransactionsInput) toCriteria() TransactionSearchCriteria {
	if tsi == nil {
		return TransactionSearchCriteria{}
	}

	return TransactionSearchCriteria{
		Term:          tsi.Term,
		PagingRequest: tsi.PagingRequest,
	}
}

type TransactionSearchCriteria struct {
	SpaceID       space.ID
	Term          string
	Date          time.Time
	PagingRequest paging.Request
}

func (tsi *TransactionSearchCriteria) sanitize() {
	if tsi == nil {
		return
	}

	tsi.Term = strings.TrimSpace(tsi.Term)
}

func (tsi *TransactionSearchCriteria) Validate() error {
	if tsi == nil {
		return errors.New("transaction search criteria is nil")
	}

	if len(tsi.Term) > 1 && len(tsi.Term) < 3 {
		return errors.New("term to search cannot be less than 3 characters")
	}

	if len(tsi.Term) > 20 {
		return errors.New("term to search cannot exceeds 20 characters")
	}

	return nil
}

type TransactionItem struct {
	ID           TransactionID
	Type         TransactionType
	Title        string
	Description  string
	Amount       money.Money
	BaseAmount   money.Money
	ExchangeRate float64
	Date         time.Time
	CreatedAt    time.Time
	UpdatedAt    time.Time

	Budget *TransactionBudgetItem
}

type TransactionBudgetItem struct {
	ID   BudgetID
	Name string

	appearance.Appearance
}
