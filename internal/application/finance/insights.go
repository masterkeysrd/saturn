package financeapp

import (
	"context"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
)

type GetInsightsRequest struct {
	Granularity string
	StartDate   time.Time
	EndDate     time.Time
}

func (c *coordinator) GetInsights(ctx context.Context, req *GetInsightsRequest) (*finance.Insights, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}

	appReq := &finance.GetSpentInsightsRequest{
		Granularity: req.Granularity,
		StartDate:   toLocation(req.StartDate, rCtx.Location()),
		EndDate:     toLocation(req.EndDate, rCtx.Location()),
	}

	spent, err := c.financeService.GetSpentInsights(ctx, rCtx, appReq)
	if err != nil {
		return nil, err
	}

	income, err := c.financeService.GetIncomeInsights(ctx, rCtx, appReq)
	if err != nil {
		return nil, err
	}

	return &finance.Insights{
		Spent:  spent,
		Income: income,
	}, nil
}
