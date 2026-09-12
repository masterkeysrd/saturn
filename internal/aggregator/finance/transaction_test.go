package financeaggregator

import (
	"context"
	"errors"
	"testing"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
)

func TestGetTransaction(t *testing.T) {
	ctx := context.Background()
	spaceID := finance.SpaceID("spc_1")
	accountID := finance.AccountID("acc_1")
	budgetID := finance.BudgetID("bgt_1")

	txn := &finance.Transaction{
		ID:        "txn_1",
		SpaceID:   spaceID,
		AccountID: &accountID,
		BudgetID:  &budgetID,
		Amount:    2500,
	}

	t.Run("Basic View", func(t *testing.T) {
		mockFS := &FinanceServiceMock{
			GetTransactionFunc: func(ctx context.Context, sid finance.SpaceID, id finance.TransactionID) (*finance.Transaction, error) {
				return txn, nil
			},
		}

		svc := NewService(mockFS)
		res, err := svc.GetTransaction(ctx, spaceID, ViewBasic, "txn_1")
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
		acc := &finance.Account{ID: accountID, SpaceID: spaceID, Name: "Checking", Currency: "USD"}
		bgt := &finance.Budget{ID: budgetID, SpaceID: spaceID, Name: "Groceries"}

		mockFS := &FinanceServiceMock{
			GetTransactionFunc: func(ctx context.Context, sid finance.SpaceID, id finance.TransactionID) (*finance.Transaction, error) {
				return txn, nil
			},
			GetAccountsFunc: func(ctx context.Context, sid finance.SpaceID, ids []finance.AccountID) ([]*finance.Account, error) {
				return []*finance.Account{acc}, nil
			},
			GetFinanceSettingsFunc: func(ctx context.Context, sid finance.SpaceID) (*finance.FinanceSettings, error) {
				return &finance.FinanceSettings{SpaceID: spaceID, BaseCurrency: "USD"}, nil
			},
			GetLatestRatesFunc: func(ctx context.Context, sid finance.SpaceID, from []finance.Currency, to finance.Currency) ([]*finance.ExchangeRate, error) {
				return nil, nil
			},
			GetBudgetsFunc: func(ctx context.Context, sid finance.SpaceID, ids []finance.BudgetID) ([]*finance.Budget, error) {
				return []*finance.Budget{bgt}, nil
			},
		}

		svc := NewService(mockFS)
		res, err := svc.GetTransaction(ctx, spaceID, ViewFull, "txn_1")
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
			GetTransactionFunc: func(ctx context.Context, sid finance.SpaceID, id finance.TransactionID) (*finance.Transaction, error) {
				return nil, errors.New("not found")
			},
		}

		svc := NewService(mockFS)
		_, err := svc.GetTransaction(ctx, spaceID, ViewBasic, "txn_1")
		if err == nil {
			t.Fatal("expected error, got nil")
		}
	})
}

func TestListTransactions(t *testing.T) {
	ctx := context.Background()
	spaceID := finance.SpaceID("spc_1")

	t.Run("Empty transaction list", func(t *testing.T) {
		mockFS := &FinanceServiceMock{
			ListTransactionsFunc: func(ctx context.Context, sid finance.SpaceID, filter *finance.TransactionFilter) (*paging.Page[*finance.Transaction], error) {
				return &paging.Page[*finance.Transaction]{
					Items:         []*finance.Transaction{},
					NextPageToken: "",
				}, nil
			},
		}

		svc := NewService(mockFS)
		page, err := svc.ListTransactions(ctx, spaceID, ViewFull, finance.TransactionFilter{})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(page.Items) != 0 {
			t.Errorf("expected 0 items, got %d", len(page.Items))
		}
	})

	t.Run("Error from domain", func(t *testing.T) {
		mockFS := &FinanceServiceMock{
			ListTransactionsFunc: func(ctx context.Context, sid finance.SpaceID, filter *finance.TransactionFilter) (*paging.Page[*finance.Transaction], error) {
				return nil, errors.New("db error")
			},
		}

		svc := NewService(mockFS)
		_, err := svc.ListTransactions(ctx, spaceID, ViewBasic, finance.TransactionFilter{})
		if err == nil {
			t.Fatal("expected error, got nil")
		}
	})
}
