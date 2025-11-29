package finance

import (
	"context"
	"fmt"
	"time"

	"github.com/masterkeysrd/saturn/internal/pkg/deps"
)

type SearchServiceParams struct {
	deps.In

	BudgetSearcher BudgetSearcher
}

type SearchService struct {
	budgetsSearcher BudgetSearcher
}

func NewSearchService(params SearchServiceParams) *SearchService {
	return &SearchService{
		budgetsSearcher: params.BudgetSearcher,
	}
}

func (s *SearchService) SearchBudgets(ctx context.Context, in *BudgetSearchInput) (BudgetPage, error) {
	criteria := in.toCriteria()
	criteria.sanitize()
	if err := criteria.Validate(); err != nil {
		return BudgetPage{}, fmt.Errorf("invalid budget search criteria: %w", err)
	}

	criteria.Date = time.Now()
	page, err := s.budgetsSearcher.Search(ctx, &criteria)
	if err != nil {
		return BudgetPage{}, fmt.Errorf("cannot search budgets: %w", err)
	}

	return page, nil
}
