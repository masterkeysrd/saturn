package finance

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/masterkeysrd/saturn/internal/foundation/fieldmask"
	"github.com/masterkeysrd/saturn/internal/pkg/id"
	"github.com/masterkeysrd/saturn/internal/pkg/money"
	"github.com/masterkeysrd/saturn/internal/pkg/ptr"
)

// Expense represents a financial expense that generates a transaction.
//
// It extends Operation with budget tracking and unique identification.
type Expense struct {
	Operation

	ID       TransactionID
	BudgetID BudgetID
}

// Initialize initializes the Expense with a new ID and sanitizes input fields.
//
// This must be called before Validate to ensure the expense is ready for persistence.
func (e *Expense) Initialize() error {
	id, err := id.New[TransactionID]()
	if err != nil {
		return fmt.Errorf("cannot generate expense ID: %w", err)
	}

	e.ID = id
	e.sanitize()
	return nil
}

// ValidateForCreate validates an expense before creation
func (e *Expense) ValidateForCreate() error {
	if e == nil {
		return errors.New("expense is nil")
	}

	if e.ID == "" {
		return errors.New("id is required")
	}

	if err := id.Validate(e.BudgetID); err != nil {
		return fmt.Errorf("invalid budget id: %w", err)
	}

	return e.validate()
}

// ValidateForUpdate validates an expense before update with field mask
func (e *Expense) ValidateForUpdate(mask *fieldmask.FieldMask) error {
	if e == nil {
		return errors.New("expense is nil")
	}

	if err := ExpenseUpdateSchema.Validate(mask); err != nil {
		return err
	}

	// If mask is empty, validate all fields
	if mask == nil || mask.IsEmpty() {
		return e.validate()
	}

	if mask.Contains("name") && e.Name == "" {
		return errors.New("name is required")
	}

	if mask.Contains("amount") && e.Amount <= 0 {
		return errors.New("amount must be a positive number")
	}

	if mask.Contains("date") && e.Date.IsZero() {
		return errors.New("date is required")
	}

	if mask.Contains("exchange_rate") && e.ExchangeRate != nil && *e.ExchangeRate <= 0 {
		return errors.New("exchange must be a positive number if provided")
	}

	return nil
}

// sanitize cleans up input fields without generating a new ID.
// This should be called for both CREATE and UPDATE operations.
func (e *Expense) sanitize() {
	e.Name = strings.TrimSpace(e.Name)
	e.Description = strings.TrimSpace(e.Description)
}

// validate checks that the Expense has valid BudgetID and Operation fields.
func (e *Expense) validate() error {
	if e == nil {
		return errors.New("expense is nil")
	}

	if e.Name == "" {
		return errors.New("name is required")
	}

	if e.Amount <= 0 {
		return errors.New("amount must be a positive number")
	}

	if e.Date.IsZero() {
		return errors.New("date is required")
	}

	if e.ExchangeRate != nil && *e.ExchangeRate <= 0 {
		return errors.New("exchange must be a positive number if provided")
	}

	return e.Validate()
}

// Transaction converts the Expense into a Transaction using the provided
// currency.
//
// The currency is used to calculate the base amount via exchange rate.
// This method assumes the Expense has already been validated.
func (e *Expense) Transaction(period *BudgetPeriod, exchangeRate float64) (*Transaction, error) {
	if e == nil {
		return nil, errors.New("expense is nil")
	}

	now := time.Now().UTC()
	amount := money.NewMoney(period.Amount.Currency, e.Amount)

	// Build transaction from expense fields
	return &Transaction{
		ID:             e.ID,
		Type:           TransactionTypeExpense,
		BudgetID:       ptr.Of(e.BudgetID),
		BudgetPeriodID: ptr.Of(period.ID),
		Name:           e.Name,
		Description:    e.Description,
		Amount:         amount,
		BaseAmount:     amount.Exchange(DefaultBaseCurrency, exchangeRate),
		ExchangeRate:   exchangeRate,
		Date:           e.Date,
		CreatedAt:      now,
		UpdatedAt:      now,
	}, nil
}

func (e *Expense) UpdateTransaction(trx *Transaction, mask *fieldmask.FieldMask) error {
	if trx == nil {
		return fmt.Errorf("transaction cannot be nil")
	}

	amount := trx.Amount
	exchangeRate := trx.ExchangeRate

	if mask.Contains("amount") {
		amount.Cents = e.Amount
	}

	if mask.Contains("exchange_rate") && e.ExchangeRate != nil {
		exchangeRate = *e.ExchangeRate
	}

	trx.Amount = amount
	trx.BaseAmount = amount.Exchange(DefaultBaseCurrency, exchangeRate)
	trx.ExchangeRate = exchangeRate

	if mask.Contains("name") {
		trx.Name = e.Name
	}

	if mask.Contains("description") {
		trx.Description = e.Description
	}

	if mask.Contains("date") {
		trx.Date = e.Date
	}

	trx.UpdatedAt = time.Now().UTC()
	return nil
}

// Operation contains common fields for financial operations.
// It enforces business rules on names, amounts, and dates.
type Operation struct {
	Name         string
	Description  string
	Amount       money.Cents
	ExchangeRate *float64
	Date         time.Time
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

	if op.Amount <= 0 {
		return errors.New("amount must be positive")
	}

	if op.ExchangeRate != nil && *op.ExchangeRate <= 0 {
		return errors.New("exchange rate must be a positive number when provided")
	}

	if op.Date.IsZero() {
		return errors.New("date must be a valid non-zero time")
	}

	return nil
}

// Transaction represents a persisted financial transaction.
// It includes the base currency conversion and exchange rate for reporting.
type Transaction struct {
	ID             TransactionID
	Type           TransactionType
	BudgetID       *BudgetID
	BudgetPeriodID *BudgetPeriodID
	Name           string
	Description    string
	Amount         money.Money
	BaseAmount     money.Money
	ExchangeRate   float64
	Date           time.Time
	CreatedAt      time.Time
	UpdatedAt      time.Time
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

// TODO: Change for a config base currency
const DefaultBaseCurrency CurrencyCode = "USD"

type Currency struct {
	Code      CurrencyCode
	Name      string
	Rate      float64
	CreatedAt time.Time
	UpdatedAt time.Time
}

func (c *Currency) Initialize() error {
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
