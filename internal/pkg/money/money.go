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

func (c Cents) Float64() float64 {
	return float64(c)
}

func (c Cents) IsZero() bool {
	return c == 0
}

func (c Cents) IsNegative() bool {
	return c < 0
}

func (c Cents) Add(other Cents) Cents {
	return c + other
}

func (c Cents) Sub(other Cents) Cents {
	return c - other
}

func (c Cents) Mul(factor int64) Cents {
	return Cents(int64(c) * factor)
}

func (c Cents) Div(divisor int64) Cents {
	if divisor == 0 {
		return 0
	}
	return Cents(int64(c) / divisor)
}
