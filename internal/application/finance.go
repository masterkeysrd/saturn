package application

import (
	"context"
	"errors"
	"log"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/foundation/access"
)

type FinanceService interface {
	CreateBudget(context.Context, access.Principal, *finance.Budget) error
	ListBudgets(context.Context, access.Principal) ([]*finance.Budget, error)
}

type FinanceApp struct {
	financeService FinanceService
}

func NewFinanceApp(financeService FinanceService) *FinanceApp {
	return &FinanceApp{
		financeService: financeService,
	}
}

func (app *FinanceApp) CreateBudget(ctx context.Context, budget *finance.Budget) error {
	principal, ok := access.GetPrincipal(ctx)
	if !ok {
		return errors.New("missing principal in context")
	}

	return app.financeService.CreateBudget(ctx, principal, budget)
}

func (app *FinanceApp) ListBudgets(ctx context.Context) ([]*finance.Budget, error) {
	log.Println("FinanceApp: ListBudgets called")
	principal, ok := access.GetPrincipal(ctx)
	if !ok {
		return nil, errors.New("missing principal in context")
	}

	return app.financeService.ListBudgets(ctx, principal)
}
