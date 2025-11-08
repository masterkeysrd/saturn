package money

import (
	"errors"
	"regexp"
)

type Money struct {
	Currency Currency `json:"currency"`
	Cents    Cents    `json:"cents"`
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
	// Basic ISO-4217 currency code validation
	reg := regexp.MustCompile(`^[A-Z]{3}$`)
	if !reg.MatchString(string(m.Currency)) {
		return errors.New("currency code must be 3 uppercase letters (ISO-4217)")
	}
	return nil
}

type Currency string

func (c Currency) String() string {
	return string(c)
}

type Cents int64

func (c Cents) Int() int {
	return int(c)
}

func (c Cents) Int64() int64 {
	return int64(c)
}
