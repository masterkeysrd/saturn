package financeapp

import (
	"context"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
)

type CreateExchangeRateRequest struct {
	SpaceID      finance.SpaceID
	UserID       string
	FromCurrency finance.Currency
	ToCurrency   finance.Currency
	Rate         float64
	RateDate     time.Time
}

type ListExchangeRatesRequest struct {
	SpaceID   finance.SpaceID
	UserID    string
	PageSize  int32
	PageToken string
}

type DeleteExchangeRateRequest struct {
	SpaceID      finance.SpaceID
	UserID       string
	FromCurrency finance.Currency
	ToCurrency   finance.Currency
	RateDate     time.Time
}

func (c *Coordinator) CreateExchangeRate(ctx context.Context, req *CreateExchangeRateRequest) (*finance.ExchangeRate, error) {
	spaceID, err := c.authorize(ctx, req.SpaceID, req.UserID)
	if err != nil {
		return nil, err
	}

	rate := &finance.ExchangeRate{
		SpaceID:      spaceID,
		FromCurrency: req.FromCurrency,
		ToCurrency:   req.ToCurrency,
		Rate:         req.Rate,
		RateDate:     req.RateDate,
	}

	return c.financeService.CreateExchangeRate(ctx, rate)
}

func (c *Coordinator) ListExchangeRates(ctx context.Context, req *ListExchangeRatesRequest) ([]*finance.ExchangeRate, string, error) {
	spaceID, err := c.authorize(ctx, req.SpaceID, req.UserID)
	if err != nil {
		return nil, "", err
	}

	filter := &finance.ListExchangeRatesFilter{
		PageSize:      req.PageSize,
		NextPageToken: req.PageToken,
	}

	return c.financeService.ListExchangeRates(ctx, spaceID, filter)
}

func (c *Coordinator) DeleteExchangeRate(ctx context.Context, req *DeleteExchangeRateRequest) error {
	spaceID, err := c.authorize(ctx, req.SpaceID, req.UserID)
	if err != nil {
		return err
	}

	return c.financeService.DeleteExchangeRate(ctx, spaceID, req.FromCurrency, req.ToCurrency, req.RateDate)
}
