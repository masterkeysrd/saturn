package finance

import (
	"fmt"
	"strings"
)

// Currency represents a 3-letter ISO currency code.
type Currency string

var supportedCurrencies = map[Currency]bool{
	"USD": true,
	"EUR": true,
	"GBP": true,
	"CAD": true,
	"JPY": true,
	"DOP": true,
}

// ParseCurrency parses, trims, and validates a string into a Currency type.
func ParseCurrency(s string) (Currency, error) {
	c := Currency(strings.ToUpper(strings.TrimSpace(s)))
	if err := c.Validate(); err != nil {
		return "", err
	}
	return c, nil
}

// Validate checks if the currency code is one of the supported codes.
func (c Currency) Validate() error {
	if !supportedCurrencies[c] {
		return fmt.Errorf("currency '%s' is not supported", c)
	}
	return nil
}

// String returns the string value of the Currency.
func (c Currency) String() string {
	return string(c)
}
