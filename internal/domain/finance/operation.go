package finance

import (
	"errors"
	"time"

	"github.com/masterkeysrd/saturn/internal/foundation/decimal"
	"github.com/masterkeysrd/saturn/internal/pkg/money"
)

// Operation contains common fields for financial operations.
// It enforces business rules on names, amounts, and dates.
type Operation struct {
	Name         string
	Description  string
	Amount       money.Cents
	ExchangeRate *decimal.Decimal
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

	if op.ExchangeRate.Cmp(decimal.Zero) <= 0 {
		return errors.New("exchange rate must be a positive number when provided")
	}

	if op.Date.IsZero() {
		return errors.New("date must be a valid non-zero time")
	}

	return nil
}
