package finance

import (
	"context"
	"errors"
	"fmt"
	"log/slog"

	"github.com/masterkeysrd/saturn/internal/foundation/access"
)

type InsightsService struct {
	InsightsStore InsightsStore
}

func NewInsightsService(insightsStore InsightsStore) *InsightsService {
	return &InsightsService{
		InsightsStore: insightsStore,
	}
}

func (s *InsightsService) GetInsights(ctx context.Context, actor access.Principal, input GetInsightsInput) (*Insights, error) {
	slog.DebugContext(ctx, "GetInsights called", slog.Any("input", input), slog.Any("actor", actor))
	if !actor.IsSpaceMember() {
		return nil, errors.New("access denied: principal is not a space member")
	}

	spending, err := s.InsightsStore.GetSpendingTrends(ctx, SpendingTrendPointCriteria{
		SpaceID:   actor.SpaceID(),
		StartDate: input.StartDate,
		EndState:  input.EndState,
	})
	if err != nil {
		return nil, fmt.Errorf("cannot get spending trends: %w", err)
	}

	var spendingInsights SpendingInsights
	spendingInsights.Aggregate(spending)

	return &Insights{
		Spending: &spendingInsights,
	}, nil
}
