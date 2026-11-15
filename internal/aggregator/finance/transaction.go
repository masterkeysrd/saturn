package financeaggregator

import (
	"context"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/platform/collections"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
	"golang.org/x/sync/errgroup"
)

// AggregatedTransaction wraps the core transaction with hydrated details.
type AggregatedTransaction struct {
	*finance.Transaction
	Account *AggregatedAccount
	Budget  *AggregatedBudget
}

// GetTransaction retrieves a single transaction by ID for a space, optionally hydrating associated accounts and budgets.
func (s *Service) GetTransaction(ctx context.Context, rCtx finance.Context, view ViewType, id finance.TransactionID) (*AggregatedTransaction, error) {
	txn, err := s.financeService.GetTransaction(ctx, rCtx, id)
	if err != nil {
		return nil, err
	}

	page, err := s.hydrateTransactions(ctx, rCtx, view, []*finance.Transaction{txn}, "")
	if err != nil {
		return nil, err
	}
	if len(page.Items) == 0 {
		return &AggregatedTransaction{Transaction: txn}, nil
	}
	return page.Items[0], nil
}

// ListTransactions retrieves space transactions, optionally hydrating associated accounts and budgets.
func (s *Service) ListTransactions(ctx context.Context, rCtx finance.Context, view ViewType, filter finance.TransactionFilter) (*paging.Page[*AggregatedTransaction], error) {
	page, err := s.financeService.ListTransactions(ctx, rCtx, &filter)
	if err != nil {
		return nil, err
	}
	return s.hydrateTransactions(ctx, rCtx, view, page.Items, page.NextPageToken)
}

func (s *Service) hydrateTransactions(ctx context.Context, rCtx finance.Context, view ViewType, txns []*finance.Transaction, nextToken string) (*paging.Page[*AggregatedTransaction], error) {
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

	// For ViewFull, we hydrate Account and Budget in parallel
	accountIDsSet := collections.NewSet[finance.AccountID]()
	budgetIDsSet := collections.NewSet[finance.BudgetID]()
	for _, t := range txns {
		if t.AccountID != nil {
			accountIDsSet.Add(*t.AccountID)
		}
		if t.BudgetID != nil {
			budgetIDsSet.Add(*t.BudgetID)
		}
	}
	accountIDs := accountIDsSet.ToSlice()
	budgetIDs := budgetIDsSet.ToSlice()

	accountsMap := make(map[finance.AccountID]*AggregatedAccount, len(accountIDs))
	budgetsMap := make(map[finance.BudgetID]*AggregatedBudget, len(budgetIDs))

	eg, egCtx := errgroup.WithContext(ctx)
	if len(accountIDs) > 0 {
		eg.Go(func() error {
			accountsList, err := s.GetAccounts(egCtx, rCtx, accountIDs, ViewFull)
			if err != nil {
				return err
			}
			for _, acc := range accountsList {
				accountsMap[acc.ID] = acc
			}
			return nil
		})
	}

	if len(budgetIDs) > 0 {
		eg.Go(func() error {
			budgetsList, err := s.financeService.GetBudgets(egCtx, rCtx, budgetIDs)
			if err != nil {
				return err
			}
			for _, b := range budgetsList {
				budgetsMap[b.ID] = &AggregatedBudget{
					Budget: b,
				}
			}
			return nil
		})
	}

	if err := eg.Wait(); err != nil {
		return nil, err
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
