package financeaggregator

import (
	"context"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
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
	// 1. Fetch accounts
	page, err := s.financeService.ListAccounts(ctx, spaceID, &filter.ListAccountsFilter)
	if err != nil {
		return nil, err
	}
	accounts := page.Items

	if view == ViewBasic {
		aggregated := make([]*AggregatedAccount, 0, len(accounts))
		for _, acc := range accounts {
			aggregated = append(aggregated, &AggregatedAccount{
				Account:            acc,
				BalanceInBase:      0,
				ExchangeRateToBase: 0.0,
			})
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

	// 2. Fetch settings to get base currency
	settings, err := s.financeService.GetFinanceSettings(ctx, spaceID)
	if err != nil {
		return nil, err
	}

	// 3. Extract distinct currencies from retrieved accounts
	var fromCurrencies []finance.Currency
	for _, acc := range accounts {
		fromCurrencies = append(fromCurrencies, acc.Currency)
	}

	// Fetch exchange rates in batch for only these currencies
	rates, err := s.financeService.GetLatestRates(ctx, spaceID, fromCurrencies, settings.BaseCurrency)
	ratesMap := make(map[string]float64)
	if err == nil {
		for _, rate := range rates {
			key := string(rate.FromCurrency) + "->" + string(rate.ToCurrency)
			ratesMap[key] = rate.Rate
		}
	}

	// 4. Hydrate accounts with converted balance
	aggregated := make([]*AggregatedAccount, 0, len(accounts))
	for _, acc := range accounts {
		balanceInBase := acc.CurrentBalance
		rateToBase := 1.0
		if settings.BaseCurrency != acc.Currency {
			key := string(acc.Currency) + "->" + string(settings.BaseCurrency)
			if rate, ok := ratesMap[key]; ok {
				balanceInBase = int64(float64(acc.CurrentBalance) * rate)
				rateToBase = rate
			} else {
				// No rate found, set fallback to 0
				balanceInBase = 0
				rateToBase = 0.0
			}
		}

		aggregated = append(aggregated, &AggregatedAccount{
			Account:            acc,
			BalanceInBase:      balanceInBase,
			ExchangeRateToBase: rateToBase,
		})
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

	if view == ViewBasic {
		return &AggregatedAccount{
			Account:            acc,
			BalanceInBase:      0,
			ExchangeRateToBase: 0.0,
		}, nil
	}

	// Fetch base currency settings
	settings, err := s.financeService.GetFinanceSettings(ctx, spaceID)
	if err != nil {
		return nil, err
	}

	balanceInBase := acc.CurrentBalance
	rateToBase := 1.0

	if settings.BaseCurrency != acc.Currency {
		// Fetch exchange rate in batch for the single currency
		rates, err := s.financeService.GetLatestRates(ctx, spaceID, []finance.Currency{acc.Currency}, settings.BaseCurrency)
		if err == nil && len(rates) > 0 {
			rateToBase = rates[0].Rate
			balanceInBase = int64(float64(acc.CurrentBalance) * rateToBase)
		} else {
			balanceInBase = 0
			rateToBase = 0.0
		}
	}

	return &AggregatedAccount{
		Account:            acc,
		BalanceInBase:      balanceInBase,
		ExchangeRateToBase: rateToBase,
	}, nil
}
