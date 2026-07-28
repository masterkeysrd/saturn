package financeaggregator

import (
	"context"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/platform/collections"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
)

// ListRecurringExpenses retrieves space templates, optionally hydrating associated budget categories.
func (s *Service) ListRecurringExpenses(ctx context.Context, spaceID finance.SpaceID, view ViewType, filter finance.ListRecurringExpensesFilter) (*paging.Page[*AggregatedRecurringExpense], error) {
	if filter.PageSize <= 0 {
		filter.PageSize = 20
	}
	page, err := s.financeService.ListRecurringExpenses(ctx, spaceID, &filter)
	if err != nil {
		return nil, err
	}

	expenses := page.Items

	if len(expenses) == 0 {
		return paging.NewPage([]*AggregatedRecurringExpense{}, int(filter.PageSize), nil), nil
	}

	var aggregated []*AggregatedRecurringExpense

	if view == ViewBasic {
		for _, e := range expenses {
			aggregated = append(aggregated, &AggregatedRecurringExpense{
				RecurringExpense: e,
			})
		}
		return paging.NewPage(aggregated, int(filter.PageSize), func(e *AggregatedRecurringExpense) paging.Cursor {
			return paging.Cursor{ID: string(e.ID)}
		}), nil
	}

	// For ViewFull, we hydrate Budget info
	budgetIDsSet := collections.NewSet[finance.BudgetID]()
	for _, e := range expenses {
		budgetIDsSet.Add(e.BudgetID)
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
		aggregated = append(aggregated, &AggregatedRecurringExpense{
			RecurringExpense: e,
			Budget:           budgetsMap[e.BudgetID],
		})
	}

	return &paging.Page[*AggregatedRecurringExpense]{
		Items:         aggregated,
		NextPageToken: page.NextPageToken,
		HasMore:       page.HasMore,
	}, nil
}

// ListScheduledPayments retrieves space scheduled payment obligations, optionally hydrating category and parent templates.
func (s *Service) ListScheduledPayments(ctx context.Context, spaceID finance.SpaceID, view ViewType, filter finance.ListScheduledPaymentsFilter) (*paging.Page[*AggregatedScheduledPayment], error) {
	if filter.PageSize <= 0 {
		filter.PageSize = 20
	}
	page, err := s.financeService.ListScheduledPayments(ctx, spaceID, &filter)
	if err != nil {
		return nil, err
	}

	payments := page.Items

	if len(payments) == 0 {
		return paging.NewPage([]*AggregatedScheduledPayment{}, int(filter.PageSize), nil), nil
	}

	var aggregated []*AggregatedScheduledPayment

	if view == ViewBasic {
		for _, p := range payments {
			aggregated = append(aggregated, &AggregatedScheduledPayment{
				ScheduledPayment: p,
			})
		}
		return paging.NewPage(aggregated, int(filter.PageSize), func(p *AggregatedScheduledPayment) paging.Cursor {
			return paging.Cursor{ID: string(p.ID)}
		}), nil
	}

	// For ViewFull, we hydrate Budget and RecurringExpense info
	budgetIDsSet := collections.NewSet[finance.BudgetID]()
	recurringIDsSet := collections.NewSet[finance.RecurringExpenseID]()
	for _, p := range payments {
		budgetIDsSet.Add(p.BudgetID)
		if p.SourceType == "recurrent_expense" {
			recurringIDsSet.Add(finance.RecurringExpenseID(p.SourceID))
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

	// Hydrate RecurringExpenses
	recurringIDs := recurringIDsSet.ToSlice()
	recurringMap := make(map[finance.RecurringExpenseID]*AggregatedRecurringExpense)
	if len(recurringIDs) > 0 {
		recurringList, err := s.financeService.GetRecurringExpenses(ctx, spaceID, recurringIDs)
		if err == nil {
			for _, re := range recurringList {
				recurringMap[re.ID] = &AggregatedRecurringExpense{
					RecurringExpense: re,
				}
			}
		}
	}

	for _, p := range payments {
		budget := budgetsMap[p.BudgetID]

		var source *AggregatedRecurringExpense
		if p.SourceType == "recurrent_expense" {
			source = recurringMap[finance.RecurringExpenseID(p.SourceID)]
		}

		aggregated = append(aggregated, &AggregatedScheduledPayment{
			ScheduledPayment: p,
			Budget:           budget,
			RecurringExpense: source,
		})
	}

	return &paging.Page[*AggregatedScheduledPayment]{
		Items:         aggregated,
		NextPageToken: page.NextPageToken,
		HasMore:       page.HasMore,
	}, nil
}
