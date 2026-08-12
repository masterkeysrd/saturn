package financeaggregator

import (
	"context"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
)

// ViewType specifies how much aggregated data is hydrated on list queries.
type ViewType int

const (
	ViewBasic ViewType = iota
	ViewFull
)

// ListBudgetsFilter contains query, filter, sort, and date paging parameters.
type ListBudgetsFilter struct {
	finance.ListBudgetsFilter
	TargetDate time.Time
	View       ViewType
}

// ListBudgets retrieves space budgets, hydrates their period spent and bounds in parallel,
// and applies filtering, dynamic sorting, and cursor-based pagination.
func (s *Service) ListBudgets(
	ctx context.Context,
	spaceID finance.SpaceID,
	filter ListBudgetsFilter,
) (*paging.Page[*AggregatedBudget], error) {
	if len(filter.Statuses) == 0 {
		filter.Statuses = []finance.BudgetStatus{finance.BudgetStatusActive}
	}

	// 1. Fetch raw budget templates from domain service (pre-filtered, sorted, and paginated!)
	page, err := s.financeService.ListBudgets(ctx, spaceID, &filter.ListBudgetsFilter)
	if err != nil {
		return nil, err
	}
	budgets := page.Items
	nextToken := page.NextPageToken

	// 2. Wrap into aggregated structures
	aggregated := make([]*AggregatedBudget, len(budgets))
	for i, b := range budgets {
		aggregated[i] = &AggregatedBudget{Budget: b}
	}

	// 3. Hydrate periods and their spent aggregates in batch (if requested)
	if filter.View == ViewFull {
		targetDate := filter.TargetDate
		if targetDate.IsZero() {
			targetDate = time.Now()
		}

		periods, err := s.financeService.GetOrCreatePeriods(ctx, budgets, targetDate)
		if err == nil && periods != nil {
			periodIDs := make([]finance.PeriodID, 0, len(periods))
			for _, p := range periods {
				periodIDs = append(periodIDs, p.ID)
			}

			stats, aggErr := s.financeService.AggregateSpentBatch(ctx, periodIDs)
			statsMap := make(map[finance.PeriodID]finance.PeriodSpent)
			if aggErr == nil {
				for _, s := range stats {
					statsMap[s.PeriodID] = s
				}
			}

			for _, ab := range aggregated {
				if period, ok := periods[ab.ID]; ok {
					var spentInBase int64
					var spentAmount int64
					if stat, ok := statsMap[period.ID]; ok {
						spentInBase = stat.SpentInBase
						spentAmount = stat.SpentAmount
					}
					ab.Period = &AggregatedBudgetPeriod{
						BudgetPeriod: period,
						SpentAmount:  spentAmount,
						SpentInBase:  spentInBase,
						LimitInBase:  int64(float64(period.LimitAmount) * period.ExchangeRateToBase),
					}
				}
			}
		}
	}

	// 4. Return as a paging page (Note: nextPageToken is already computed by the store!)
	return &paging.Page[*AggregatedBudget]{
		Items:         aggregated,
		NextPageToken: nextToken,
		HasMore:       nextToken != "",
	}, nil
}

// GetBudgetPeriod retrieves or lazily spawns a budget period, hydrating its spent progress.
func (s *Service) GetBudgetPeriod(ctx context.Context, spaceID finance.SpaceID, budgetID finance.BudgetID, date time.Time) (*AggregatedBudgetPeriod, error) {
	budget, err := s.financeService.GetBudget(ctx, spaceID, budgetID)
	if err != nil {
		return nil, err
	}

	periods, err := s.financeService.GetOrCreatePeriods(ctx, []*finance.Budget{budget}, date)
	if err != nil {
		return nil, err
	}

	period, ok := periods[budgetID]
	if !ok {
		return nil, finance.ErrPeriodNotFound
	}

	stats, err := s.financeService.AggregateSpentBatch(ctx, []finance.PeriodID{period.ID})
	var spentInBase, spentAmount int64
	if err == nil && len(stats) > 0 {
		spentInBase = stats[0].SpentInBase
		spentAmount = stats[0].SpentAmount
	}

	return &AggregatedBudgetPeriod{
		BudgetPeriod: period,
		SpentAmount:  spentAmount,
		SpentInBase:  spentInBase,
		LimitInBase:  int64(float64(period.LimitAmount) * period.ExchangeRateToBase),
	}, nil
}
