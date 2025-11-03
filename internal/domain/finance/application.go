package finance

import (
	"context"
	"fmt"

	"github.com/masterkeysrd/saturn/internal/domain/finance/budget"
	"github.com/masterkeysrd/saturn/internal/pkg/deps"
)

type Application struct {
	budget BudgetService
}

type ApplicationParams struct {
	deps.In

	Budget BudgetService
}

func NewApplication(params ApplicationParams) *Application {
	return &Application{
		budget: params.Budget,
	}
}

func (app *Application) CreateBudget(ctx context.Context, b *budget.Budget) error {
	if err := app.budget.Create(ctx, b); err != nil {
		return fmt.Errorf("cannot create budget: %s", err)
	}

	return nil
}

func (app *Application) ListBudgets(ctx context.Context) ([]*budget.Budget, error) {
	budgets, err := app.budget.List(ctx)
	return budgets, err
}

type BudgetService interface {
	Create(context.Context, *budget.Budget) error
	List(context.Context) ([]*budget.Budget, error)
}
