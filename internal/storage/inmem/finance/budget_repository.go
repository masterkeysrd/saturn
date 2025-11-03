package financeinmem

import (
	"context"
	"sync"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
)

type BudgetRepository struct {
	mu      sync.Mutex
	budgets []*finance.Budget
}

func NewInMemRepository() *BudgetRepository {
	return &BudgetRepository{}
}

func (r *BudgetRepository) Store(_ context.Context, budget *finance.Budget) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.budgets = append(r.budgets, budget)
	return nil
}

func (r *BudgetRepository) List(_ context.Context) ([]*finance.Budget, error) {
	return r.budgets, nil
}
