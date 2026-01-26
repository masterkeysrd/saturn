package finance

import (
	"context"
	"fmt"
	"time"

	"github.com/masterkeysrd/saturn/internal/foundation/access"
	"github.com/masterkeysrd/saturn/internal/pkg/deps"
)

type SearchServiceParams struct {
	deps.In

	BudgetSearcher      BudgetSearcher
	TransactionSearcher TransactionSearcher
}

type SearchService struct {
	budgetsSearcher      BudgetSearcher
	transactionsSearcher TransactionSearcher
}

func NewSearchService(params SearchServiceParams) *SearchService {
	return &SearchService{
		budgetsSearcher:      params.BudgetSearcher,
		transactionsSearcher: params.TransactionSearcher,
	}
}

func (s *SearchService) SearchBudgets(ctx context.Context, actor access.Principal, in *SearchBudgetsInput) (*BudgetPage, error) {
	if !actor.IsSpaceMember() {
		return nil, fmt.Errorf("unauthorized: principal is not a space member")
	}

	criteria := in.toCriteria()
	criteria.sanitize()
	if err := criteria.Validate(); err != nil {
		return nil, fmt.Errorf("invalid budget search criteria: %w", err)
	}

	criteria.SpaceID = actor.SpaceID()
	criteria.Date = time.Now()
	page, err := s.budgetsSearcher.Search(ctx, &criteria)
	if err != nil {
		return nil, fmt.Errorf("cannot search budgets: %w", err)
	}

	return page, nil
}

func (s *SearchService) SearchTransactions(ctx context.Context, actor access.Principal, in *SearchTransactionsInput) (*TransactionPage, error) {
	if !actor.IsSpaceMember() {
		return nil, fmt.Errorf("unauthorized: principal is not a space member")
	}

	criteria := in.toCriteria()
	criteria.sanitize()
	if err := criteria.Validate(); err != nil {
		return nil, fmt.Errorf("invalid budget search criteria: %w", err)
	}

	criteria.SpaceID = actor.SpaceID()
	criteria.Date = time.Now()
	page, err := s.transactionsSearcher.Search(ctx, &criteria)
	if err != nil {
		return nil, fmt.Errorf("cannot search budgets: %w", err)
	}

	return page, nil
}
