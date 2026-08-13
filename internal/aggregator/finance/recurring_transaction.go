package financeaggregator

import (
	"context"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/platform/collections"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
)

// ListRecurringTransactions retrieves space templates, optionally hydrating associated budget categories.
func (s *Service) ListRecurringTransactions(ctx context.Context, spaceID finance.SpaceID, view ViewType, filter finance.ListRecurringTransactionsFilter) (*paging.Page[*AggregatedRecurringTransaction], error) {
	if filter.PageSize <= 0 {
		filter.PageSize = 20
	}
	page, err := s.financeService.ListRecurringTransactions(ctx, spaceID, &filter)
	if err != nil {
		return nil, err
	}

	expenses := page.Items

	if len(expenses) == 0 {
		return paging.NewPage([]*AggregatedRecurringTransaction{}, int(filter.PageSize), nil), nil
	}

	var aggregated []*AggregatedRecurringTransaction

	if view == ViewBasic {
		for _, e := range expenses {
			aggregated = append(aggregated, &AggregatedRecurringTransaction{
				RecurringTransaction: e,
			})
		}
		return paging.NewPage(aggregated, int(filter.PageSize), func(e *AggregatedRecurringTransaction) paging.Cursor {
			return paging.Cursor{ID: string(e.ID)}
		}), nil
	}

	// For ViewFull, we hydrate Budget info if present
	budgetIDsSet := collections.NewSet[finance.BudgetID]()
	for _, e := range expenses {
		if e.BudgetID != nil {
			budgetIDsSet.Add(*e.BudgetID)
		}
	}
	budgetIDs := budgetIDsSet.ToSlice()
	budgetsMap := make(map[finance.BudgetID]*AggregatedBudget)
	if len(budgetIDs) > 0 {
		budgetsList, err := s.financeService.GetBudgets(ctx, spaceID, budgetIDs)
		if err == nil {
			for _, b := range budgetsList {
				budgetsMap[b.ID] = &AggregatedBudget{
					Budget: b,
				}
			}
		}
	}

	for _, e := range expenses {
		var budget *AggregatedBudget
		if e.BudgetID != nil {
			budget = budgetsMap[*e.BudgetID]
		}
		aggregated = append(aggregated, &AggregatedRecurringTransaction{
			RecurringTransaction: e,
			Budget:               budget,
		})
	}

	return &paging.Page[*AggregatedRecurringTransaction]{
		Items:         aggregated,
		NextPageToken: page.NextPageToken,
		HasMore:       page.HasMore,
	}, nil
}

// ListScheduledTransactions retrieves space scheduled transaction obligations, optionally hydrating category and parent templates.
func (s *Service) ListScheduledTransactions(ctx context.Context, spaceID finance.SpaceID, view ViewType, filter finance.ListScheduledTransactionsFilter) (*paging.Page[*AggregatedScheduledTransaction], error) {
	if filter.PageSize <= 0 {
		filter.PageSize = 20
	}
	page, err := s.financeService.ListScheduledTransactions(ctx, spaceID, &filter)
	if err != nil {
		return nil, err
	}

	payments := page.Items

	if len(payments) == 0 {
		return paging.NewPage([]*AggregatedScheduledTransaction{}, int(filter.PageSize), nil), nil
	}

	var aggregated []*AggregatedScheduledTransaction

	if view == ViewBasic {
		for _, p := range payments {
			aggregated = append(aggregated, &AggregatedScheduledTransaction{
				ScheduledTransaction: p,
			})
		}
		return paging.NewPage(aggregated, int(filter.PageSize), func(p *AggregatedScheduledTransaction) paging.Cursor {
			return paging.Cursor{ID: string(p.ID)}
		}), nil
	}

	// For ViewFull, we hydrate Budget and RecurringTransaction info
	budgetIDsSet := collections.NewSet[finance.BudgetID]()
	recurringIDsSet := collections.NewSet[finance.RecurringTransactionID]()
	for _, p := range payments {
		if p.BudgetID != nil {
			budgetIDsSet.Add(*p.BudgetID)
		}
		if p.SourceType == string(finance.SourceTypeRecurrentTransaction) {
			recurringIDsSet.Add(finance.RecurringTransactionID(p.SourceID))
		}
	}

	// Hydrate Budgets
	budgetIDs := budgetIDsSet.ToSlice()
	budgetsMap := make(map[finance.BudgetID]*AggregatedBudget)
	if len(budgetIDs) > 0 {
		budgetsList, err := s.financeService.GetBudgets(ctx, spaceID, budgetIDs)
		if err == nil {
			for _, b := range budgetsList {
				budgetsMap[b.ID] = &AggregatedBudget{
					Budget: b,
				}
			}
		}
	}

	// Hydrate RecurringTransactions
	recurringIDs := recurringIDsSet.ToSlice()
	recurringMap := make(map[finance.RecurringTransactionID]*AggregatedRecurringTransaction)
	if len(recurringIDs) > 0 {
		recurringList, err := s.financeService.GetRecurringTransactions(ctx, spaceID, recurringIDs)
		if err == nil {
			for _, re := range recurringList {
				recurringMap[re.ID] = &AggregatedRecurringTransaction{
					RecurringTransaction: re,
				}
			}
		}
	}

	for _, p := range payments {
		var budget *AggregatedBudget
		if p.BudgetID != nil {
			budget = budgetsMap[*p.BudgetID]
		}

		var source *AggregatedRecurringTransaction
		if p.SourceType == string(finance.SourceTypeRecurrentTransaction) {
			source = recurringMap[finance.RecurringTransactionID(p.SourceID)]
		}

		aggregated = append(aggregated, &AggregatedScheduledTransaction{
			ScheduledTransaction: p,
			Budget:               budget,
			RecurringTransaction: source,
		})
	}

	return &paging.Page[*AggregatedScheduledTransaction]{
		Items:         aggregated,
		NextPageToken: page.NextPageToken,
		HasMore:       page.HasMore,
	}, nil
}
