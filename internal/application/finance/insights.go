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

func (c *Coordinator) GetInsights(ctx context.Context, req *GetInsightsRequest) (*finance.SpentInsights, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}

	return c.financeService.GetSpentInsights(ctx, &finance.GetSpentInsightsRequest{
		SpaceID:     rCtx.SpaceID,
		Granularity: req.Granularity,
		StartDate:   req.StartDate,
		EndDate:     req.EndDate,
	})
}
