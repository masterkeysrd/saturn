package money

import (
	"errors"
	"fmt"
)

type Money struct {
	Currency CurrencyCode `json:"currency"`
	Cents    Cents        `json:"cents"`
}

func NewMoney(code CurrencyCode, cents Cents) Money {
	return Money{code, cents}
}

func (m Money) IsZero() bool {
	return m == Money{}
}

func (m Money) Int64() int64 {
	return m.Cents.Int64()
}

// Exchange returns a new Money in the target currency using the given rate.
func (m Money) Exchange(target CurrencyCode, rate float64) Money {
	return Money{
		Cents:    m.Cents.Divide(rate),
		Currency: target,
	}
}

// Validate checks that Money is well-formed
func (m Money) Validate() error {
	if m.Currency == "" {
		return errors.New("currency cannot be empty")
	}
	if err := m.Currency.Validate(); err != nil {
		return fmt.Errorf("currency is invalid: %w", err)
	}
	return nil
}

// Cents represents a monetary value in minor units (e.g., cents).
type Cents int64

func (c Cents) Int() int {
	return int(c)
}

func (c Cents) Int64() int64 {
	return int64(c)
}

// Divide divides Cents by a rate, returns the floored result.
func (c Cents) Divide(rate float64) Cents {
	if rate <= 0 {
		return 0 // or panic, or error, based on your needs
	}
	return Cents(float64(c) / rate)
}
