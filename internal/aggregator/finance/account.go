package financeaggregator

import (
	"context"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/platform/collections"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
	"golang.org/x/sync/errgroup"
)

// AggregatedAccount wraps the core account with hydrated metrics.
type AggregatedAccount struct {
	*finance.Account
	BalanceInBase      int64
	ExchangeRateToBase float64
	Institution        *finance.Institution
}

// ListAccountsFilter contains filtering parameters for listing accounts.
type ListAccountsFilter struct {
	finance.ListAccountsFilter
}

// ListAccounts retrieves workspace accounts hydrated with base currency balances.
func (s *Service) ListAccounts(ctx context.Context, rCtx finance.Context, view ViewType, filter ListAccountsFilter) (*paging.Page[*AggregatedAccount], error) {
	// 1. Fetch raw accounts from the domain service
	page, err := s.financeService.ListAccounts(ctx, rCtx, &filter.ListAccountsFilter)
	if err != nil {
		return nil, err
	}

	// 2. Hydrate accounts using centralized helper
	aggregated, err := s.hydrateAccounts(ctx, rCtx, page.Items, view)
	if err != nil {
		return nil, err
	}

	return &paging.Page[*AggregatedAccount]{
		Items:         aggregated,
		NextPageToken: page.NextPageToken,
		HasMore:       page.HasMore,
	}, nil
}

// GetAccount retrieves a single account, optionally hydrating conversion metrics.
func (s *Service) GetAccount(ctx context.Context, rCtx finance.Context, id finance.AccountID, view ViewType) (*AggregatedAccount, error) {
	acc, err := s.financeService.GetAccount(ctx, rCtx, id)
	if err != nil {
		return nil, err
	}

	aggregated, err := s.hydrateAccounts(ctx, rCtx, []*finance.Account{acc}, view)
	if err != nil {
		return nil, err
	}

	return aggregated[0], nil
}

// GetAccounts retrieves multiple accounts in batch, optionally hydrating conversion metrics.
func (s *Service) GetAccounts(ctx context.Context, rCtx finance.Context, ids []finance.AccountID, view ViewType) ([]*AggregatedAccount, error) {
	if len(ids) == 0 {
		return nil, nil
	}

	accounts, err := s.financeService.GetAccounts(ctx, rCtx, ids)
	if err != nil {
		return nil, err
	}

	return s.hydrateAccounts(ctx, rCtx, accounts, view)
}

// hydrateAccounts is a centralized helper to convert balances and query exchange rates in a single batch.
func (s *Service) hydrateAccounts(ctx context.Context, rCtx finance.Context, accounts []*finance.Account, view ViewType) ([]*AggregatedAccount, error) {
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

	baseCurrency := rCtx.BaseCurrency()
	if baseCurrency == "" {
		return nil, errors.E(errors.Precondition, finance.SettingsNotFound, "workspace base currency is not configured")
	}

	// Extract unique currencies and institution IDs from the batch
	currencySet := collections.NewSet[finance.Currency]()
	instIDSet := collections.NewSet[finance.InstitutionID]()
	for _, acc := range accounts {
		currencySet.Add(acc.Currency)
		if acc.InstitutionID != nil && *acc.InstitutionID != "" {
			instIDSet.Add(*acc.InstitutionID)
		}
	}
	fromCurrencies := currencySet.ToSlice()
	instSlice := instIDSet.ToSlice()

	ratesMap := make(map[string]float64)
	instMap := make(map[finance.InstitutionID]*finance.Institution)

	eg, egCtx := errgroup.WithContext(ctx)
	eg.Go(func() error {
		rates, err := s.financeService.GetLatestRates(egCtx, rCtx, fromCurrencies, baseCurrency)
		if err != nil {
			return err
		}
		for _, rate := range rates {
			key := string(rate.FromCurrency) + "->" + string(rate.ToCurrency)
			ratesMap[key] = rate.Rate
		}
		return nil
	})

	if len(instSlice) > 0 {
		eg.Go(func() error {
			insts, err := s.financeService.GetInstitutionsByIDs(egCtx, rCtx, instSlice)
			if err != nil {
				return err
			}
			for _, inst := range insts {
				instMap[inst.ID] = inst
			}
			return nil
		})
	}

	if err := eg.Wait(); err != nil {
		return nil, err
	}

	// Construct aggregated representations
	aggregated := make([]*AggregatedAccount, len(accounts))
	for i, acc := range accounts {
		balanceInBase := acc.CurrentBalance
		rateToBase := 1.0
		if baseCurrency != acc.Currency {
			key := string(acc.Currency) + "->" + string(baseCurrency)
			if rate, ok := ratesMap[key]; ok {
				balanceInBase = int64(float64(acc.CurrentBalance) * rate)
				rateToBase = rate
			} else {
				balanceInBase = 0
				rateToBase = 0.0
			}
		}

		var inst *finance.Institution
		if acc.InstitutionID != nil {
			inst = instMap[*acc.InstitutionID]
		}

		aggregated[i] = &AggregatedAccount{
			Account:            acc,
			BalanceInBase:      balanceInBase,
			ExchangeRateToBase: rateToBase,
			Institution:        inst,
		}
	}

	return aggregated, nil
}
