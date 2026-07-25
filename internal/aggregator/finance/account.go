package financeaggregator

import (
	"context"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/platform/collections"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
)

// AggregatedAccount wraps the core account with hydrated metrics.
type AggregatedAccount struct {
	*finance.Account
	BalanceInBase      int64
	ExchangeRateToBase float64
}

// ListAccountsFilter contains filtering parameters for listing accounts.
type ListAccountsFilter struct {
	finance.ListAccountsFilter
}

// ListAccounts retrieves workspace accounts hydrated with base currency balances.
func (s *Service) ListAccounts(ctx context.Context, spaceID finance.SpaceID, view ViewType, filter ListAccountsFilter) (*paging.Page[*AggregatedAccount], error) {
	// 1. Fetch raw accounts from the domain service
	page, err := s.financeService.ListAccounts(ctx, spaceID, &filter.ListAccountsFilter)
	if err != nil {
		return nil, err
	}

	// 2. Hydrate accounts using centralized helper
	aggregated, err := s.hydrateAccounts(ctx, spaceID, page.Items, view)
	if err != nil {
		return nil, err
	}

	aggPage := paging.NewPage(aggregated, int(filter.PageSize), func(a *AggregatedAccount) paging.Cursor {
		return paging.Cursor{
			SortValue: a.GetSortValue(filter.Sort.Field),
			ID:        string(a.ID),
		}
	})
	aggPage.NextPageToken = page.NextPageToken

	return aggPage, nil
}

// GetAccount retrieves a single account, optionally hydrating conversion metrics.
func (s *Service) GetAccount(ctx context.Context, spaceID finance.SpaceID, id finance.AccountID, view ViewType) (*AggregatedAccount, error) {
	acc, err := s.financeService.GetAccount(ctx, id)
	if err != nil {
		return nil, err
	}

	if acc.SpaceID != spaceID {
		return nil, finance.ErrAccountNotFound
	}

	aggregated, err := s.hydrateAccounts(ctx, spaceID, []*finance.Account{acc}, view)
	if err != nil {
		return nil, err
	}

	return aggregated[0], nil
}

// GetAccounts retrieves multiple accounts in batch, optionally hydrating conversion metrics.
func (s *Service) GetAccounts(ctx context.Context, spaceID finance.SpaceID, ids []finance.AccountID, view ViewType) ([]*AggregatedAccount, error) {
	if len(ids) == 0 {
		return nil, nil
	}

	accounts, err := s.financeService.GetAccounts(ctx, ids)
	if err != nil {
		return nil, err
	}

	// Safety check: ensure all fetched accounts belong to the target space
	var spaceAccounts []*finance.Account
	for _, acc := range accounts {
		if acc.SpaceID == spaceID {
			spaceAccounts = append(spaceAccounts, acc)
		}
	}

	return s.hydrateAccounts(ctx, spaceID, spaceAccounts, view)
}

// hydrateAccounts is a centralized helper to convert balances and query exchange rates in a single batch.
func (s *Service) hydrateAccounts(ctx context.Context, spaceID finance.SpaceID, accounts []*finance.Account, view ViewType) ([]*AggregatedAccount, error) {
	if len(accounts) == 0 {
		return nil, nil
	}

	if view == ViewBasic {
		aggregated := make([]*AggregatedAccount, len(accounts))
		for i, acc := range accounts {
			aggregated[i] = &AggregatedAccount{
				Account:            acc,
				BalanceInBase:      0,
				ExchangeRateToBase: 0.0,
			}
		}
		return aggregated, nil
	}

	// Fetch settings to get base currency
	settings, err := s.financeService.GetFinanceSettings(ctx, spaceID)
	if err != nil {
		return nil, err
	}

	// Extract unique currencies from the batch
	currencySet := collections.NewSet[finance.Currency]()
	for _, acc := range accounts {
		currencySet.Add(acc.Currency)
	}
	fromCurrencies := currencySet.ToSlice()

	// Fetch latest rates in a single batch query
	rates, err := s.financeService.GetLatestRates(ctx, spaceID, fromCurrencies, settings.BaseCurrency)
	ratesMap := make(map[string]float64)
	if err == nil {
		for _, rate := range rates {
			key := string(rate.FromCurrency) + "->" + string(rate.ToCurrency)
			ratesMap[key] = rate.Rate
		}
	}

	// Construct aggregated representations
	aggregated := make([]*AggregatedAccount, len(accounts))
	for i, acc := range accounts {
		balanceInBase := acc.CurrentBalance
		rateToBase := 1.0
		if settings.BaseCurrency != acc.Currency {
			key := string(acc.Currency) + "->" + string(settings.BaseCurrency)
			if rate, ok := ratesMap[key]; ok {
				balanceInBase = int64(float64(acc.CurrentBalance) * rate)
				rateToBase = rate
			} else {
				balanceInBase = 0
				rateToBase = 0.0
			}
		}

		aggregated[i] = &AggregatedAccount{
			Account:            acc,
			BalanceInBase:      balanceInBase,
			ExchangeRateToBase: rateToBase,
		}
	}

	return aggregated, nil
}
