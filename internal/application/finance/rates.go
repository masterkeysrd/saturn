package financeapp

import (
	"context"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
)

type CreateExchangeRateRequest struct {
	FromCurrency finance.Currency
	ToCurrency   finance.Currency
	Rate         float64
	RateDate     time.Time
}

type ListExchangeRatesRequest struct {
	PageSize  int32
	PageToken string
}

type DeleteExchangeRateRequest struct {
	FromCurrency finance.Currency
	ToCurrency   finance.Currency
	RateDate     time.Time
}

func (c *Coordinator) CreateExchangeRate(ctx context.Context, req *CreateExchangeRateRequest) (*finance.ExchangeRate, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}

	rate := &finance.ExchangeRate{
		SpaceID:      rCtx.SpaceID,
		FromCurrency: req.FromCurrency,
		ToCurrency:   req.ToCurrency,
		Rate:         req.Rate,
		RateDate:     req.RateDate,
	}

	return c.financeService.CreateExchangeRate(ctx, rate)
}

func (c *Coordinator) ListExchangeRates(ctx context.Context, req *ListExchangeRatesRequest) ([]*finance.ExchangeRate, string, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, "", err
	}

	filter := &finance.ListExchangeRatesFilter{
		PageSize:      req.PageSize,
		NextPageToken: req.PageToken,
	}

	return c.financeService.ListExchangeRates(ctx, rCtx.SpaceID, filter)
}

func (c *Coordinator) DeleteExchangeRate(ctx context.Context, req *DeleteExchangeRateRequest) error {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return err
	}

	return c.financeService.DeleteExchangeRate(ctx, rCtx.SpaceID, req.FromCurrency, req.ToCurrency, req.RateDate)
}
