package pgrepositories

import (
	"github.com/masterkeysrd/saturn/internal/domain/finance/budget"
	"github.com/masterkeysrd/saturn/internal/pkg/deps"
)

func Provide(inj deps.Injector) error {
	if err := inj.Provide(NewBudget, deps.As(new(budget.Repository))); err != nil {
		return err
	}

	return nil
}
