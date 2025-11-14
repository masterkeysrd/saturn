package pgrepositories

import (
	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/pkg/deps"
)

func Provide(inj deps.Injector) error {
	if err := inj.Provide(NewBudget, deps.As(new(finance.BudgetStore))); err != nil {
		return err
	}

	if err := inj.Provide(NewBudgetPeriod, deps.As(new(finance.BudgetPeriodStore))); err != nil {
		return err
	}

	if err := inj.Provide(NewCurrency, deps.As(new(finance.CurrencyStore))); err != nil {
		return err
	}

	return nil
}
