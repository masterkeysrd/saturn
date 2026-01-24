package money

import (
	"errors"
	"regexp"
)

var iso4217Regex = regexp.MustCompile(`^[A-Z]{3}$`)

type CurrencyCode string

func (c CurrencyCode) Validate() error {
	if c == "" {
		return errors.New("currency code is empty")
	}

	if !iso4217Regex.MatchString(string(c)) {
		return errors.New("currency code must be 3 uppercase letters (ISO-4217)")
	}

	return nil
}

func (c CurrencyCode) String() string {
	return string(c)
}
