package financehttp

import (
	"context"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
)

type FinanceApplication interface {
	CreateBudget(context.Context, *finance.Budget) error
	ListBudgets(context.Context) ([]*finance.Budget, error)
}
