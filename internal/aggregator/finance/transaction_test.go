package financeaggregator

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
)

func TestGetTransaction(t *testing.T) {
	ctx := context.Background()
	spaceID := finance.SpaceID("spc_1")
	rCtx := finance.NewContext(spaceID, "usr_1", time.UTC, "USD")
	accountID := finance.AccountID("acc_1")
	budgetID := finance.BudgetID("bgt_1")

	txn := &finance.Transaction{
		ID:        "txn_1",
		AccountID: &accountID,
		BudgetID:  &budgetID,
		Amount:    2500,
	}

	t.Run("Basic View", func(t *testing.T) {
		mockFS := &FinanceServiceMock{
			GetTransactionFunc: func(ctx context.Context, rCtx finance.Context, id finance.TransactionID) (*finance.Transaction, error) {
				return txn, nil
			},
		}

		svc := NewService(mockFS)
		res, err := svc.GetTransaction(ctx, rCtx, ViewBasic, "txn_1")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if res.ID != "txn_1" {
			t.Errorf("expected txn_1, got %s", res.ID)
		}
		if res.Account != nil || res.Budget != nil {
			t.Errorf("expected nil account and budget in basic view")
		}
	})

	t.Run("Full View hydrates account and budget", func(t *testing.T) {
		acc := &finance.Account{ID: accountID, Name: "Checking", Currency: "USD"}
		bgt := &finance.Budget{ID: budgetID, Name: "Groceries"}

		mockFS := &FinanceServiceMock{
			GetTransactionFunc: func(ctx context.Context, rCtx finance.Context, id finance.TransactionID) (*finance.Transaction, error) {
				return txn, nil
			},
			GetAccountsFunc: func(ctx context.Context, rCtx finance.Context, ids []finance.AccountID) ([]*finance.Account, error) {
				return []*finance.Account{acc}, nil
			},
			GetLatestRatesFunc: func(ctx context.Context, rCtx finance.Context, from []finance.Currency, to finance.Currency) ([]*finance.ExchangeRate, error) {
				return nil, nil
			},
			GetBudgetsFunc: func(ctx context.Context, rCtx finance.Context, ids []finance.BudgetID) ([]*finance.Budget, error) {
				return []*finance.Budget{bgt}, nil
			},
		}

		svc := NewService(mockFS)
		res, err := svc.GetTransaction(ctx, rCtx, ViewFull, "txn_1")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if res.Account == nil || res.Account.ID != accountID {
			t.Errorf("expected hydrated account, got %v", res.Account)
		}
		if res.Budget == nil || res.Budget.ID != budgetID {
			t.Errorf("expected hydrated budget, got %v", res.Budget)
		}
	})

	t.Run("Error fetching transaction", func(t *testing.T) {
		mockFS := &FinanceServiceMock{
			GetTransactionFunc: func(ctx context.Context, rCtx finance.Context, id finance.TransactionID) (*finance.Transaction, error) {
				return nil, errors.New("not found")
			},
		}

		svc := NewService(mockFS)
		_, err := svc.GetTransaction(ctx, rCtx, ViewBasic, "txn_1")
		if err == nil {
			t.Fatal("expected error, got nil")
		}
	})
}

func TestListTransactions(t *testing.T) {
	ctx := context.Background()
	spaceID := finance.SpaceID("spc_1")
	rCtx := finance.NewContext(spaceID, "usr_1", time.UTC, "USD")

	t.Run("Empty transaction list", func(t *testing.T) {
		mockFS := &FinanceServiceMock{
			ListTransactionsFunc: func(ctx context.Context, rCtx finance.Context, filter *finance.TransactionFilter) (*paging.Page[*finance.Transaction], error) {
				return &paging.Page[*finance.Transaction]{
					Items:         []*finance.Transaction{},
					NextPageToken: "",
				}, nil
			},
		}

		svc := NewService(mockFS)
		page, err := svc.ListTransactions(ctx, rCtx, ViewFull, finance.TransactionFilter{})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(page.Items) != 0 {
			t.Errorf("expected 0 items, got %d", len(page.Items))
		}
	})

	t.Run("Error from domain", func(t *testing.T) {
		mockFS := &FinanceServiceMock{
			ListTransactionsFunc: func(ctx context.Context, rCtx finance.Context, filter *finance.TransactionFilter) (*paging.Page[*finance.Transaction], error) {
				return nil, errors.New("db error")
			},
		}

		svc := NewService(mockFS)
		_, err := svc.ListTransactions(ctx, rCtx, ViewBasic, finance.TransactionFilter{})
		if err == nil {
			t.Fatal("expected error, got nil")
		}
	})
}
