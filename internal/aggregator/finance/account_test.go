package financeaggregator

import (
	"context"
	"errors"
	"testing"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
	"github.com/masterkeysrd/saturn/internal/platform/sorting"
)

func TestListAccounts(t *testing.T) {
	ctx := context.Background()
	spaceID := finance.SpaceID("spc_1")
	instID := finance.InstitutionID("inst_1")

	acc1 := &finance.Account{
		ID:             "acc_1",
		SpaceID:        spaceID,
		Name:           "Checking",
		Currency:       "USD",
		CurrentBalance: 10000,
		InstitutionID:  &instID,
	}
	acc2 := &finance.Account{
		ID:             "acc_2",
		SpaceID:        spaceID,
		Name:           "EUR Savings",
		Currency:       "EUR",
		CurrentBalance: 5000,
	}

	t.Run("Basic View", func(t *testing.T) {
		mockFS := &FinanceServiceMock{
			ListAccountsFunc: func(ctx context.Context, sid finance.SpaceID, filter *finance.ListAccountsFilter) (*paging.Page[*finance.Account], error) {
				return &paging.Page[*finance.Account]{
					Items:         []*finance.Account{acc1, acc2},
					NextPageToken: "next_token",
				}, nil
			},
		}

		svc := NewService(mockFS)
		page, err := svc.ListAccounts(ctx, spaceID, ViewBasic, ListAccountsFilter{
			ListAccountsFilter: finance.ListAccountsFilter{
				PageSize: 10,
				Sort:     sorting.New("id", true),
			},
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(page.Items) != 2 {
			t.Fatalf("expected 2 items, got %d", len(page.Items))
		}
		if page.Items[0].BalanceInBase != 0 || page.Items[0].ExchangeRateToBase != 0.0 {
			t.Errorf("expected 0 for basic view balance in base, got %d", page.Items[0].BalanceInBase)
		}
		if page.NextPageToken != "next_token" {
			t.Errorf("expected next_token, got %s", page.NextPageToken)
		}
	})

	t.Run("Full View with currency conversion and institution", func(t *testing.T) {
		mockFS := &FinanceServiceMock{
			ListAccountsFunc: func(ctx context.Context, sid finance.SpaceID, filter *finance.ListAccountsFilter) (*paging.Page[*finance.Account], error) {
				return &paging.Page[*finance.Account]{
					Items: []*finance.Account{acc1, acc2},
				}, nil
			},
			GetFinanceSettingsFunc: func(ctx context.Context, sid finance.SpaceID) (*finance.FinanceSettings, error) {
				return &finance.FinanceSettings{
					SpaceID:      spaceID,
					BaseCurrency: "USD",
				}, nil
			},
			GetLatestRatesFunc: func(ctx context.Context, sid finance.SpaceID, from []finance.Currency, to finance.Currency) ([]*finance.ExchangeRate, error) {
				return []*finance.ExchangeRate{
					{FromCurrency: "EUR", ToCurrency: "USD", Rate: 1.1},
				}, nil
			},
			GetInstitutionsByIDsFunc: func(ctx context.Context, sid finance.SpaceID, ids []finance.InstitutionID) ([]*finance.Institution, error) {
				return []*finance.Institution{
					{ID: instID, Name: "Bank of Test"},
				}, nil
			},
		}

		svc := NewService(mockFS)
		page, err := svc.ListAccounts(ctx, spaceID, ViewFull, ListAccountsFilter{
			ListAccountsFilter: finance.ListAccountsFilter{PageSize: 10},
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(page.Items) != 2 {
			t.Fatalf("expected 2 items, got %d", len(page.Items))
		}
		// acc1 is USD -> base currency, rate 1.0, balance 10000
		if page.Items[0].BalanceInBase != 10000 || page.Items[0].ExchangeRateToBase != 1.0 {
			t.Errorf("expected USD balance 10000 at rate 1.0, got %d at %f", page.Items[0].BalanceInBase, page.Items[0].ExchangeRateToBase)
		}
		if page.Items[0].Institution == nil || page.Items[0].Institution.Name != "Bank of Test" {
			t.Errorf("expected institution Bank of Test, got %v", page.Items[0].Institution)
		}
		// acc2 is EUR -> USD at rate 1.1 -> 5000 * 1.1 = 5500
		if page.Items[1].BalanceInBase != 5500 || page.Items[1].ExchangeRateToBase != 1.1 {
			t.Errorf("expected EUR balance 5500 at rate 1.1, got %d at %f", page.Items[1].BalanceInBase, page.Items[1].ExchangeRateToBase)
		}
	})

	t.Run("Error from domain ListAccounts", func(t *testing.T) {
		mockFS := &FinanceServiceMock{
			ListAccountsFunc: func(ctx context.Context, sid finance.SpaceID, filter *finance.ListAccountsFilter) (*paging.Page[*finance.Account], error) {
				return nil, errors.New("db error")
			},
		}

		svc := NewService(mockFS)
		_, err := svc.ListAccounts(ctx, spaceID, ViewBasic, ListAccountsFilter{
			ListAccountsFilter: finance.ListAccountsFilter{PageSize: 10},
		})
		if err == nil {
			t.Fatal("expected error, got nil")
		}
	})

	t.Run("Error from GetFinanceSettings in Full View", func(t *testing.T) {
		mockFS := &FinanceServiceMock{
			ListAccountsFunc: func(ctx context.Context, sid finance.SpaceID, filter *finance.ListAccountsFilter) (*paging.Page[*finance.Account], error) {
				return &paging.Page[*finance.Account]{Items: []*finance.Account{acc1}}, nil
			},
			GetFinanceSettingsFunc: func(ctx context.Context, sid finance.SpaceID) (*finance.FinanceSettings, error) {
				return nil, errors.New("settings error")
			},
		}

		svc := NewService(mockFS)
		_, err := svc.ListAccounts(ctx, spaceID, ViewFull, ListAccountsFilter{
			ListAccountsFilter: finance.ListAccountsFilter{PageSize: 10},
		})
		if err == nil {
			t.Fatal("expected error, got nil")
		}
	})
}

func TestGetAccount(t *testing.T) {
	ctx := context.Background()
	spaceID := finance.SpaceID("spc_1")
	acc := &finance.Account{
		ID:             "acc_1",
		SpaceID:        spaceID,
		Name:           "Checking",
		Currency:       "USD",
		CurrentBalance: 1000,
	}

	t.Run("Success", func(t *testing.T) {
		mockFS := &FinanceServiceMock{
			GetAccountFunc: func(ctx context.Context, sid finance.SpaceID, id finance.AccountID) (*finance.Account, error) {
				return acc, nil
			},
		}

		svc := NewService(mockFS)
		result, err := svc.GetAccount(ctx, spaceID, "acc_1", ViewBasic)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result.ID != "acc_1" {
			t.Errorf("expected acc_1, got %s", result.ID)
		}
	})

	t.Run("Error", func(t *testing.T) {
		mockFS := &FinanceServiceMock{
			GetAccountFunc: func(ctx context.Context, sid finance.SpaceID, id finance.AccountID) (*finance.Account, error) {
				return nil, errors.New("not found")
			},
		}

		svc := NewService(mockFS)
		_, err := svc.GetAccount(ctx, spaceID, "acc_1", ViewBasic)
		if err == nil {
			t.Fatal("expected error, got nil")
		}
	})
}

func TestGetAccounts(t *testing.T) {
	ctx := context.Background()
	spaceID := finance.SpaceID("spc_1")
	otherSpaceID := finance.SpaceID("spc_2")

	acc1 := &finance.Account{ID: "acc_1", SpaceID: spaceID, Currency: "USD", CurrentBalance: 100}
	acc2 := &finance.Account{ID: "acc_2", SpaceID: otherSpaceID, Currency: "USD", CurrentBalance: 200}

	t.Run("Empty IDs returns nil", func(t *testing.T) {
		svc := NewService(&FinanceServiceMock{})
		res, err := svc.GetAccounts(ctx, spaceID, nil, ViewBasic)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if res != nil {
			t.Errorf("expected nil, got %v", res)
		}
	})

	t.Run("Filters accounts by spaceID", func(t *testing.T) {
		mockFS := &FinanceServiceMock{
			GetAccountsFunc: func(ctx context.Context, sid finance.SpaceID, ids []finance.AccountID) ([]*finance.Account, error) {
				return []*finance.Account{acc1, acc2}, nil
			},
		}

		svc := NewService(mockFS)
		res, err := svc.GetAccounts(ctx, spaceID, []finance.AccountID{"acc_1", "acc_2"}, ViewBasic)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(res) != 1 || res[0].ID != "acc_1" {
			t.Errorf("expected only acc_1, got %v", res)
		}
	})

	t.Run("Domain error returns error", func(t *testing.T) {
		mockFS := &FinanceServiceMock{
			GetAccountsFunc: func(ctx context.Context, sid finance.SpaceID, ids []finance.AccountID) ([]*finance.Account, error) {
				return nil, errors.New("query failed")
			},
		}

		svc := NewService(mockFS)
		_, err := svc.GetAccounts(ctx, spaceID, []finance.AccountID{"acc_1"}, ViewBasic)
		if err == nil {
			t.Fatal("expected error, got nil")
		}
	})
}
