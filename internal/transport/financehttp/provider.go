package financehttp

import (
	"fmt"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/pkg/deps"
)

func RegisterProviders(inj deps.Injector) error {
	if err := inj.Provide(func(app *finance.Service) FinanceService {
		return app
	}); err != nil {
		return fmt.Errorf("cannot inject finance.Application dep")
	}

	if err := inj.Provide(NewBudgetController); err != nil {
		return fmt.Errorf("cannot provide budget controller: %w", err)
	}

	if err := inj.Provide(NewCurrencyController); err != nil {
		return fmt.Errorf("cannot provide currency controller: %w", err)
	}

	if err := inj.Provide(NewRouter); err != nil {
		return fmt.Errorf("cannot provide finance router: %w", err)
	}

	return nil
}
