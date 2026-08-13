package finance

import (
	"errors"
	"fmt"
	"strings"
	"time"
)

// ExchangeRate represents a daily rate record.
type ExchangeRate struct {
	ID           string
	SpaceID      SpaceID
	FromCurrency Currency
	ToCurrency   Currency
	Rate         float64
	RateDate     time.Time
	CreateTime   time.Time
}

// ComputeID generates the deterministic identifier for an exchange rate (e.g. "rate_USD_EUR_20260727").
func (r *ExchangeRate) ComputeID() string {
	return fmt.Sprintf("rate_%s_%s_%s", r.FromCurrency, r.ToCurrency, r.RateDate.Format("20060102"))
}

// ParseExchangeRateID extracts fromCurrency, toCurrency, and rateDate from an exchange rate ID.
func ParseExchangeRateID(id string) (Currency, Currency, time.Time, error) {
	clean := strings.TrimPrefix(id, "rate_")
	parts := strings.Split(clean, "_")
	if len(parts) != 3 {
		return "", "", time.Time{}, errors.New("invalid exchange rate ID format")
	}
	from, err := ParseCurrency(parts[0])
	if err != nil {
		return "", "", time.Time{}, fmt.Errorf("invalid from currency in ID: %w", err)
	}
	to, err := ParseCurrency(parts[1])
	if err != nil {
		return "", "", time.Time{}, fmt.Errorf("invalid to currency in ID: %w", err)
	}
	t, err := time.Parse("20060102", parts[2])
	if err != nil {
		return "", "", time.Time{}, fmt.Errorf("invalid rate date in ID: %w", err)
	}
	return from, to, t, nil
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

// DefaultExchangeRateSortField represents the fallback sorting column name for exchange rates.
const DefaultExchangeRateSortField = "rate_date"

// ExchangeRateSortFields registry maps sortable exchange rate field names to cursor strings.
var ExchangeRateSortFields = map[string]func(*ExchangeRate) string{
	"rate_date":     func(r *ExchangeRate) string { return r.RateDate.Format("2006-01-02") },
	"from_currency": func(r *ExchangeRate) string { return string(r.FromCurrency) },
	"to_currency":   func(r *ExchangeRate) string { return string(r.ToCurrency) },
	"rate":          func(r *ExchangeRate) string { return fmt.Sprintf("%f", r.Rate) },
	"create_time":   func(r *ExchangeRate) string { return r.CreateTime.Format(time.RFC3339) },
}

// IsExchangeRateSortField validates if a sort column name is allowed.
func IsExchangeRateSortField(field string) bool {
	_, ok := ExchangeRateSortFields[field]
	return ok
}

// GetSortValue extracts the sort value string for pagination cursor generation.
func (r *ExchangeRate) GetSortValue(field string) string {
	if fn, ok := ExchangeRateSortFields[field]; ok {
		return fn(r)
	}
	return r.GetSortValue(DefaultExchangeRateSortField)
}

// ConvertAmount converts a monetary amount in cents using an exchange rate multiplier.
func ConvertAmount(amount int64, rate float64) int64 {
	if rate == 1.0 || amount == 0 {
		return amount
	}
	return int64(float64(amount) * rate)
}
