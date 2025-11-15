package finance

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/masterkeysrd/saturn/internal/pkg/id"
	"github.com/masterkeysrd/saturn/internal/pkg/money"
	"github.com/masterkeysrd/saturn/internal/pkg/timeutils"
)

// Expense represents a financial expense that generates a transaction.
//
// It extends Operation with budget tracking and unique identification.
type Expense struct {
	Operation

	ID       TransactionID
	BudgetID BudgetID
}

// Create initializes the Expense with a new ID and sanitizes input fields.
//
// This must be called before Validate to ensure the expense is ready for persistence.
func (e *Expense) Create() error {
	id, err := id.New[TransactionID]()
	if err != nil {
		return fmt.Errorf("cannot generate expense ID: %w", err)
	}

	e.ID = id
	e.Name = strings.TrimSpace(e.Name)
	e.Description = strings.TrimSpace(e.Description)
	return nil
}

// Validate checks that the Expense has valid BudgetID and Operation fields.
func (e *Expense) Validate() error {
	if e == nil {
		return errors.New("expense is nil")
	}

	if err := id.Validate(e.BudgetID); err != nil {
		return fmt.Errorf("invalid budget id: %w", err)
	}

	return e.Operation.Validate()
}

// Transaction converts the Expense into a Transaction using the provided
// currency.
//
// The currency is used to calculate the base amount via exchange rate.
// This method assumes the Expense has already been validated.
func (e *Expense) Transaction(periodCurrency *Currency) (*Transaction, error) {
	if e == nil {
		return nil, errors.New("expense is nil")
	}

	if periodCurrency.Code != e.Amount.Currency {
		return nil, fmt.Errorf("expense currency %s does not match period currency %s", e.Amount.Currency, periodCurrency.Code)
	}

	now := time.Now().UTC()

	// Build transaction from expense fields
	t := &Transaction{
		ID:           e.ID,
		Type:         TransactionTypeExpense,
		BudgetID:     e.BudgetID,
		Name:         e.Name,
		Description:  e.Description,
		Amount:       e.Amount,
		BaseAmount:   e.Amount.Exchange(DefaultBaseCurrency, periodCurrency.Rate),
		ExchangeRate: periodCurrency.Rate,
		Date:         e.Date,
		CreatedAt:    now,
		UpdatedAt:    now,
	}

	return t, nil
}

// Operation contains common fields for financial operations.
// It enforces business rules on names, amounts, and dates.
type Operation struct {
	Name        string
	Description string
	Amount      money.Money
	Date        time.Time
}

// Validate checks that the Operation fields meet business requirements.
func (op Operation) Validate() error {
	if len(op.Name) < 3 {
		return errors.New("name must be at least 3 characters")
	}

	if len(op.Name) > 50 {
		return errors.New("name exceeds 50 characters")
	}

	if len(op.Description) > 250 {
		return errors.New("description exceeds 250 characters")
	}

	if op.Amount.Cents <= 0 {
		return errors.New("amount must be positive")
	}

	if err := op.Amount.Validate(); err != nil {
		return fmt.Errorf("invalid amount: %w", err)
	}

	if op.Date.IsZero() {
		return errors.New("date is required")
	}

	return nil
}

// Transaction represents a persisted financial transaction.
// It includes the base currency conversion and exchange rate for reporting.
type Transaction struct {
	ID           TransactionID
	Type         TransactionType
	BudgetID     BudgetID
	Name         string
	Description  string
	Amount       money.Money
	BaseAmount   money.Money
	ExchangeRate float64
	Date         time.Time
	CreatedAt    time.Time
	UpdatedAt    time.Time
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

	if t.ExchangeRate <= 0 {
		return errors.New("exchange rate must be a positive number")
	}

	return nil
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

type Budget struct {
	ID        BudgetID
	Name      string
	Amount    money.Money
	CreatedAt time.Time
	UpdatedAt time.Time
}

func (b *Budget) Create() error {
	id, err := id.New[BudgetID]()
	if err != nil {
		return fmt.Errorf("cannot created a budget identifier: %w", err)
	}

	b.ID = id
	b.CreatedAt = time.Now().UTC()
	b.Name = strings.TrimSpace(b.Name)
	return nil
}

func (b *Budget) Validate() error {
	if b == nil {
		return errors.New("budget is nil")
	}

	if b.ID == "" {
		return errors.New("id field is required")
	}

	if err := id.Validate(b.ID); err != nil {
		return fmt.Errorf("id field is invalid: %w", err)
	}

	if b.Name == "" {
		return errors.New("name field is required")
	}

	if len(b.Name) > 32 {
		return errors.New("name field exceeds 32 characters")
	}

	if b.Amount.Cents <= 0 {
		return errors.New("amount field must be a positive number")
	}

	if err := b.Amount.Validate(); err != nil {
		return fmt.Errorf("invalid amount: %w", err)
	}
	return nil
}

// CreatePeriod creates a new BudgetPeriod for the provided time 't' and exchange context 'c'.
// The base currency is set to DefaultBaseCurrency and the conversion is computed using c.Rate.
func (b *Budget) CreatePeriod(c *Currency, t time.Time) (*BudgetPeriod, error) {
	id, err := id.New[BudgetPeriodID]()
	if err != nil {
		return nil, fmt.Errorf("cannot create period identifier: %w", err)
	}

	start, end := timeutils.MonthStartEnd(t)
	p := BudgetPeriod{
		ID:           id,
		BudgetID:     b.ID,
		StartDate:    start,
		EndDate:      end,
		Amount:       b.Amount,
		BaseAmount:   b.Amount.Exchange(DefaultBaseCurrency, c.Rate),
		ExchangeRate: c.Rate,
		CreatedAt:    time.Now().UTC(),
	}

	return &p, nil
}

type BudgetID string

func (id BudgetID) String() string {
	return string(id)
}

type BudgetPeriod struct {
	ID           BudgetPeriodID
	BudgetID     BudgetID
	StartDate    time.Time
	EndDate      time.Time
	Amount       money.Money
	BaseAmount   money.Money
	ExchangeRate float64
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

// Validate checks whether the BudgetPeriod fields are valid.
// Returns nil if valid, or an error describing the first problem encountered.
func (bp *BudgetPeriod) Validate() error {
	if bp == nil {
		return fmt.Errorf("budget period is nil")
	}
	if bp.ID == "" {
		return fmt.Errorf("budget period ID is empty")
	}
	if bp.BudgetID == "" {
		return fmt.Errorf("budget ID is empty")
	}
	if bp.StartDate.IsZero() {
		return fmt.Errorf("start date is not set")
	}
	if bp.EndDate.IsZero() {
		return fmt.Errorf("end date is not set")
	}
	if bp.EndDate.Before(bp.StartDate) {
		return fmt.Errorf("end date %v is before start date %v", bp.EndDate, bp.StartDate)
	}
	if bp.Amount.Cents < 0 {
		return fmt.Errorf("amount cents cannot be negative")
	}
	if bp.Amount.Currency == "" {
		return fmt.Errorf("amount currency is empty")
	}
	if bp.BaseAmount.Cents < 0 {
		return fmt.Errorf("base amount cents cannot be negative")
	}
	if bp.BaseAmount.Currency == "" {
		return fmt.Errorf("base amount currency is empty")
	}
	if bp.ExchangeRate <= 0 {
		return fmt.Errorf("exchange rate must be positive")
	}
	if bp.CreatedAt.IsZero() {
		return fmt.Errorf("created at is not set")
	}
	// UpdatedAt may be zero for new objects. Add check if you require it.
	return nil
}

type BudgetPeriodID string

func (i BudgetPeriodID) String() string {
	return string(i)
}

// TODO: Change for a config base currency
const DefaultBaseCurrency CurrencyCode = "USD"

type Currency struct {
	Code      CurrencyCode
	Name      string
	Rate      float64
	CreatedAt time.Time
	UpdatedAt time.Time
}

func (c *Currency) Create() error {
	c.CreatedAt = time.Now().UTC()
	return nil
}

func (c *Currency) Validate() error {
	if err := c.Code.Validate(); err != nil {
		return fmt.Errorf("code is invalid: %w", err)
	}

	if c.Name == "" {
		return errors.New("name is require")
	}

	if len(c.Name) > 50 {
		return errors.New("name cannot have more that 50 characters ")
	}

	if c.Rate <= 0 {
		return errors.New("rate must be a positive number")
	}

	return nil
}

type CurrencyCode = money.CurrencyCode
