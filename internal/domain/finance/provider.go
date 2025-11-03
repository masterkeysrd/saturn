package finance

import (
	"fmt"

	"github.com/masterkeysrd/saturn/internal/domain/finance/budget"
	"github.com/masterkeysrd/saturn/internal/pkg/deps"
)

func RegisterProviders(inj deps.Injector) error {
	if err := inj.Provide(budget.NewService, deps.As(new(BudgetService))); err != nil {
		return fmt.Errorf("cannot register budget service provider: %w", err)
	}

	if err := inj.Provide(NewApplication); err != nil {
		return fmt.Errorf("cannot register finance application provider: %w", err)
	}

	return nil
}
