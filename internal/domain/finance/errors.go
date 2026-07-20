package finance

import "errors"

// Sentinel errors for core finance domain operations.
var (
	ErrSettingsNotFound     = errors.New("finance settings not found")
	ErrBudgetNotFound       = errors.New("budget not found")
	ErrPeriodNotFound       = errors.New("budget period not found")
	ErrExchangeRateNotFound = errors.New("exchange rate not found")
	ErrTransactionNotFound  = errors.New("transaction not found")
)
