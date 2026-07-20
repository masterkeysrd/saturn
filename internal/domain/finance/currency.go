package finance

import (
	"errors"
	"strings"
)

// Currency represents a 3-letter ISO currency code.
type Currency string

// ParseCurrency parses, trims, and validates a string into a Currency type.
func ParseCurrency(s string) (Currency, error) {
	c := Currency(strings.ToUpper(strings.TrimSpace(s)))
	if err := c.Validate(); err != nil {
		return "", err
	}
	return c, nil
}

// Validate checks if the currency code conforms to the 3-letter ISO standard.
func (c Currency) Validate() error {
	if len(c) != 3 {
		return errors.New("currency must be a 3-letter ISO code")
	}
	return nil
}

// String returns the string value of the Currency.
func (c Currency) String() string {
	return string(c)
}
