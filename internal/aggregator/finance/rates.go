package financeaggregator

import (
	"context"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
)

// ListExchangeRatesFilter encapsulates filtering parameters for exchange rates.
type ListExchangeRatesFilter struct {
	finance.ListExchangeRatesFilter
}

// ListExchangeRates retrieves exchange rate records for a space from domain service.
func (s *Service) ListExchangeRates(ctx context.Context, rCtx finance.Context, filter ListExchangeRatesFilter) ([]*finance.ExchangeRate, string, error) {
	return s.financeService.ListExchangeRates(ctx, rCtx, &filter.ListExchangeRatesFilter)
}

// GetExchangeRate retrieves a specific exchange rate record by ID for a space from domain service.
func (s *Service) GetExchangeRate(ctx context.Context, rCtx finance.Context, id string) (*finance.ExchangeRate, error) {
	return s.financeService.GetExchangeRateByID(ctx, rCtx, id)
}
