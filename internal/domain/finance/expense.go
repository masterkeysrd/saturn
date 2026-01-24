package finance

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/masterkeysrd/saturn/internal/foundation/fieldmask"
	"github.com/masterkeysrd/saturn/internal/foundation/id"
	"github.com/masterkeysrd/saturn/internal/pkg/money"
	"github.com/masterkeysrd/saturn/internal/pkg/ptr"
)

// ExpenseUpdateSchema only includes updatable fields
var ExpenseUpdateSchema = fieldmask.NewSchema("expense").
	Field("name",
		fieldmask.WithDescription("Expense name"),
		fieldmask.WithRequired(),
	).
	Field("description",
		fieldmask.WithDescription("Expense description"),
	).
	Field("date",
		fieldmask.WithDescription("Expense date"),
		fieldmask.WithRequired(),
	).
	Field("amount",
		fieldmask.WithDescription("Expense amount in cents"),
		fieldmask.WithRequired(),
	).
	Field("exchange_rate",
		fieldmask.WithDescription("Custom exchange rate (optional)"),
	).
	Build()

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

	if mask.Contains("exchange_rate") && e.ExchangeRate != nil && !e.ExchangeRate.IsPositive() {
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

	// if e.ExchangeRate != nil && *e.ExchangeRate <= 0 {
	if e.ExchangeRate != nil && !e.ExchangeRate.IsPositive() {
		return errors.New("exchange must be a positive number if provided")
	}

	return e.Validate()
}

// Transaction converts the Expense into a Transaction using the provided
// currency.
//
// The currency is used to calculate the base amount via exchange rate.
// This method assumes the Expense has already been validated.
func (e *Expense) Transaction(period *BudgetPeriod, exchangeRate *ExchangeRate) (*Transaction, error) {
	if e == nil {
		return nil, errors.New("expense is nil")
	}

	now := time.Now().UTC()
	amount := money.NewMoney(period.Amount.Currency, e.Amount)

	baseAmount, err := exchangeRate.ConvertMoney(amount)
	if err != nil {
		return nil, fmt.Errorf("cannot convert amount using exchange rate: %w", err)
	}

	// Build transaction from expense fields
	return &Transaction{
		ID:             e.ID,
		Type:           TransactionTypeExpense,
		BudgetID:       ptr.Of(e.BudgetID),
		BudgetPeriodID: ptr.Of(period.ID),
		Name:           e.Name,
		Description:    e.Description,
		Amount:         amount,
		BaseAmount:     baseAmount,
		ExchangeRate:   exchangeRate.Rate,
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
	exchangeRate := ExchangeRate{
		ExchangeRateKey: ExchangeRateKey{
			SpaceID:      "",
			CurrencyCode: amount.Currency,
		},
		Rate: trx.ExchangeRate,
	}
	// rate := trx.ExchangeRate

	if mask.Contains("amount") {
		amount.Cents = e.Amount
	}

	if mask.Contains("exchange_rate") && e.ExchangeRate != nil {
		exchangeRate.Rate = *e.ExchangeRate
	}

	trx.Amount = amount
	baseAmount, err := exchangeRate.ConvertMoney(amount)
	if err != nil {
		return fmt.Errorf("cannot convert amount using exchange rate: %w", err)
	}
	trx.BaseAmount = baseAmount
	trx.ExchangeRate = exchangeRate.Rate

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

// UpdateExpenseInput contains all data needed to update an expense
type UpdateExpenseInput struct {
	// ID is the transaction identifier
	ID TransactionID

	// Expense contains the fields to update
	Expense *Expense

	// UpdateMask specifies which fields to update.
	// If nil or empty, all fields are updated.
	UpdateMask *fieldmask.FieldMask
}

func (input *UpdateExpenseInput) Validate() error {
	if input.ID == "" {
		return errors.New("id is required")
	}

	if input.Expense == nil {
		return errors.New("expense is required")
	}

	// Validate against schema, don't validate rules just
	// mask fields presence.
	if err := ExpenseUpdateSchema.Validate(input.UpdateMask); err != nil {
		return fmt.Errorf("invalid field mask: %w", err)
	}

	return nil
}
