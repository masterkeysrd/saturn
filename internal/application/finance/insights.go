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

func (c *Coordinator) GetInsights(ctx context.Context, req *GetInsightsRequest) (*finance.Insights, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}

	appReq := &finance.GetSpentInsightsRequest{
		SpaceID:     rCtx.SpaceID,
		Granularity: req.Granularity,
		StartDate:   req.StartDate,
		EndDate:     req.EndDate,
	}

	spent, err := c.financeService.GetSpentInsights(ctx, appReq)
	if err != nil {
		return nil, err
	}

	income, err := c.financeService.GetIncomeInsights(ctx, appReq)
	if err != nil {
		return nil, err
	}

	return &finance.Insights{
		Spent:  spent,
		Income: income,
	}, nil
}
