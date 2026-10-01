package financeapp

import (
	"context"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/platform/sorting"
)

type CreateExchangeRateRequest struct {
	FromCurrency finance.Currency
	ToCurrency   finance.Currency
	Rate         float64
	RateDate     time.Time
}

type GetExchangeRateRequest struct {
	ID string
}

type UpdateExchangeRateRequest struct {
	ID   string
	Rate float64
}

type ListExchangeRatesRequest struct {
	PageSize     int32
	PageToken    string
	FromCurrency *finance.Currency
	ToCurrency   *finance.Currency
	StartDate    *time.Time
	EndDate      *time.Time
	OrderBy      string
}

type DeleteExchangeRateRequest struct {
	ID string
}

func (c *coordinator) CreateExchangeRate(ctx context.Context, req *CreateExchangeRateRequest) (*finance.ExchangeRate, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}

	rate := &finance.ExchangeRate{
		FromCurrency: req.FromCurrency,
		ToCurrency:   req.ToCurrency,
		Rate:         req.Rate,
		RateDate:     rCtx.Date(req.RateDate),
	}

	return c.financeService.CreateExchangeRate(ctx, rCtx, rate)
}

func (c *coordinator) GetExchangeRate(ctx context.Context, req *GetExchangeRateRequest) (*finance.ExchangeRate, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}

	return c.financeService.GetExchangeRateByID(ctx, rCtx, req.ID)
}

func (c *coordinator) UpdateExchangeRate(ctx context.Context, req *UpdateExchangeRateRequest) (*finance.ExchangeRate, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}

	rate := &finance.ExchangeRate{
		Rate: req.Rate,
	}

	return c.financeService.UpdateExchangeRate(ctx, rCtx, req.ID, rate)
}

func (c *coordinator) ListExchangeRates(ctx context.Context, req *ListExchangeRatesRequest) ([]*finance.ExchangeRate, string, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, "", err
	}

	filter := &finance.ListExchangeRatesFilter{
		PageSize:      req.PageSize,
		NextPageToken: req.PageToken,
		FromCurrency:  req.FromCurrency,
		ToCurrency:    req.ToCurrency,
		StartDate:     req.StartDate,
		EndDate:       req.EndDate,
		Sort:          sorting.Parse(req.OrderBy),
	}

	return c.financeService.ListExchangeRates(ctx, rCtx, filter)
}

func (c *coordinator) DeleteExchangeRate(ctx context.Context, req *DeleteExchangeRateRequest) error {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return err
	}

	return c.financeService.DeleteExchangeRateByID(ctx, rCtx, req.ID)
}
