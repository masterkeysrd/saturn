package budget

import (
	"context"
	"sync"
)

type Repository interface {
	Store(context.Context, *Budget) error
	List(context.Context) ([]*Budget, error)
}

type InMemRepository struct {
	mu      sync.Mutex
	budgets []*Budget
}

func NewInMemRepository() *InMemRepository {
	return &InMemRepository{}
}

func (r *InMemRepository) Store(_ context.Context, budget *Budget) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.budgets = append(r.budgets, budget)
	return nil
}

func (r *InMemRepository) List(_ context.Context) ([]*Budget, error) {
	return r.budgets, nil
}
