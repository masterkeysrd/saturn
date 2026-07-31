package financeaggregator

import (
	"context"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/platform/collections"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
)

// AggregatedTransaction wraps the core transaction with hydrated details.
type AggregatedTransaction struct {
	*finance.Transaction
	Account *AggregatedAccount
	Budget  *AggregatedBudget
}

// GetTransaction retrieves a single transaction by ID for a space, optionally hydrating associated accounts and budgets.
func (s *Service) GetTransaction(ctx context.Context, spaceID finance.SpaceID, view ViewType, id finance.TransactionID) (*AggregatedTransaction, error) {
	txn, err := s.financeService.GetTransaction(ctx, spaceID, id)
	if err != nil {
		return nil, err
	}

	page, err := s.hydrateTransactions(ctx, spaceID, view, []*finance.Transaction{txn}, "")
	if err != nil || len(page.Items) == 0 {
		return &AggregatedTransaction{Transaction: txn}, nil
	}
	return page.Items[0], nil
}

// ListTransactions retrieves space transactions, optionally hydrating associated accounts and budgets.
func (s *Service) ListTransactions(ctx context.Context, spaceID finance.SpaceID, view ViewType, filter finance.TransactionFilter) (*paging.Page[*AggregatedTransaction], error) {
	page, err := s.financeService.ListTransactions(ctx, spaceID, &filter)
	if err != nil {
		return nil, err
	}
	return s.hydrateTransactions(ctx, spaceID, view, page.Items, page.NextPageToken)
}

func (s *Service) hydrateTransactions(ctx context.Context, spaceID finance.SpaceID, view ViewType, txns []*finance.Transaction, nextToken string) (*paging.Page[*AggregatedTransaction], error) {
	if len(txns) == 0 {
		return &paging.Page[*AggregatedTransaction]{
			Items:         []*AggregatedTransaction{},
			NextPageToken: nextToken,
		}, nil
	}

	var aggregated []*AggregatedTransaction

	if view == ViewBasic {
		for _, t := range txns {
			aggregated = append(aggregated, &AggregatedTransaction{
				Transaction: t,
			})
		}
		return &paging.Page[*AggregatedTransaction]{
			Items:         aggregated,
			NextPageToken: nextToken,
		}, nil
	}

	// For ViewFull, we hydrate Account and Budget
	// 1. Fetch only the distinct accounts referenced in the loaded transactions in a single batch query
	accountIDsSet := collections.NewSet[finance.AccountID]()
	for _, t := range txns {
		if t.AccountID != nil {
			accountIDsSet.Add(*t.AccountID)
		}
	}
	accountIDs := accountIDsSet.ToSlice()
	accountsMap := make(map[finance.AccountID]*AggregatedAccount)
	if len(accountIDs) > 0 {
		accountsList, err := s.GetAccounts(ctx, spaceID, accountIDs, ViewFull)
		if err == nil {
			for _, acc := range accountsList {
				accountsMap[acc.ID] = acc
			}
		}
	}

	// 2. Fetch only the distinct budgets referenced in the loaded transactions in a single batch query
	budgetIDsSet := collections.NewSet[finance.BudgetID]()
	for _, t := range txns {
		if t.BudgetID != nil {
			budgetIDsSet.Add(*t.BudgetID)
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

	// 3. Construct aggregated transactions
	for _, t := range txns {
		var account *AggregatedAccount
		if t.AccountID != nil {
			account = accountsMap[*t.AccountID]
		}
		var budget *AggregatedBudget
		if t.BudgetID != nil {
			budget = budgetsMap[*t.BudgetID]
		}

		aggregated = append(aggregated, &AggregatedTransaction{
			Transaction: t,
			Account:     account,
			Budget:      budget,
		})
	}

	return &paging.Page[*AggregatedTransaction]{
		Items:         aggregated,
		NextPageToken: nextToken,
	}, nil
}
