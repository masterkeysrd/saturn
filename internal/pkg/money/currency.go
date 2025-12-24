package money

import (
	"errors"
	"regexp"
)

var iso4217Regex = regexp.MustCompile(`^[A-Z]{3}$`)

type Currency struct {
	Code   CurrencyCode
	Name   string
	Symbol string
}

type CurrencyCode string

func (c CurrencyCode) Validate() error {
	if c == "" {
		return errors.New("currency code is empty")
	}

	if !iso4217Regex.MatchString(string(c)) {
		return errors.New("currency code must be 3 uppercase letters (ISO-4217)")
	}

	if _, exists := currencyMap[c]; !exists {
		return errors.New("currency code is not supported")
	}

	return nil
}

func (c CurrencyCode) String() string {
	return string(c)
}

var (
	currencyMap = map[CurrencyCode]Currency{
		"CAD": {Code: "CAD", Name: "Canadian Dollar", Symbol: "C$"},
		"COP": {Code: "COP", Name: "Colombian Peso", Symbol: "COL$"},
		"DOP": {Code: "DOP", Name: "Dominican Peso", Symbol: "RD$"},
		"EUR": {Code: "EUR", Name: "Euro", Symbol: "€"},
		"JPY": {Code: "JPY", Name: "Japanese Yen", Symbol: "¥"},
		"MXN": {Code: "MXN", Name: "Mexican Peso", Symbol: "MX$"},
		"USD": {Code: "USD", Name: "United States Dollar", Symbol: "$"},
	}

	currencyList = buildCurrencyList()
)

func ListCurrencies() []Currency {
	currencies := make([]Currency, len(currencyList))
	copy(currencies, currencyList)
	return currencies
}

func buildCurrencyList() []Currency {
	list := make([]Currency, 0, len(currencyMap))
	for _, currency := range currencyMap {
		list = append(list, currency)
	}
	return list
}
