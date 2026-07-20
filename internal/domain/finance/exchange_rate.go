package finance

import (
	"errors"
	"fmt"
	"time"
)

// ExchangeRate represents a daily rate record.
type ExchangeRate struct {
	SpaceID      SpaceID
	FromCurrency Currency
	ToCurrency   Currency
	Rate         float64
	RateDate     time.Time
	CreateTime   time.Time
}

// Validate checks exchange rate constraints.
func (r *ExchangeRate) Validate() error {
	if err := r.SpaceID.Validate(); err != nil {
		return fmt.Errorf("validate space ID: %w", err)
	}
	if err := r.FromCurrency.Validate(); err != nil {
		return fmt.Errorf("validate from currency: %w", err)
	}
	if err := r.ToCurrency.Validate(); err != nil {
		return fmt.Errorf("validate to currency: %w", err)
	}
	if r.Rate <= 0 {
		return errors.New("exchange rate must be greater than zero")
	}
	if r.RateDate.IsZero() {
		return errors.New("rate date is required")
	}
	return nil
}
