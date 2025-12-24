package financepg

import (
	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/pkg/deps"
)

func Provide(inj deps.Injector) error {
	if err := inj.Provide(NewBudgetStore, deps.As(new(finance.BudgetStore))); err != nil {
		return err
	}

	if err := inj.Provide(NewBudgetPeriodStore, deps.As(new(finance.BudgetPeriodStore))); err != nil {
		return err
	}

	if err := inj.Provide(NewCurrencyStore, deps.As(new(finance.CurrencyStore))); err != nil {
		return err
	}

	if err := inj.Provide(NewTransactionsStore, deps.As(new(finance.TransactionStore))); err != nil {
		return err
	}

	if err := inj.Provide(NewInsightsStore, deps.As(new(finance.InsightsStore))); err != nil {
		return err
	}

	if err := inj.Provide(NewBudgetSearcher, deps.As(new(finance.BudgetSearcher))); err != nil {
		return err
	}

	if err := inj.Provide(NewTransactionSearcher, deps.As(new(finance.TransactionSearcher))); err != nil {
		return err
	}

	if err := inj.Provide(NewExchangeRateStore, deps.As(new(finance.ExchangeRateStore))); err != nil {
		return err
	}

	if err := inj.Provide(NewSettingsStore, deps.As(new(finance.SettingsStore))); err != nil {
		return err
	}

	return nil
}
