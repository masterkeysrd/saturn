package budget

import (
	"context"
	"fmt"
)

var _ Service = (*service)(nil)

type Service interface {
	Create(context.Context, *Budget) error
	List(context.Context) ([]*Budget, error)
}

type service struct {
	repository Repository
}

type ServiceParams struct {
	Repository Repository
}

func NewService(params ServiceParams) *service {
	return &service{
		repository: params.Repository,
	}
}

func (s *service) Create(ctx context.Context, budget *Budget) error {
	if err := budget.Create(); err != nil {
		return fmt.Errorf("cannot initialize budget: %w", err)
	}

	if err := budget.Validate(); err != nil {
		return fmt.Errorf("invalid budget: %w", err)
	}

	if err := s.repository.Store(ctx, budget); err != nil {
		return fmt.Errorf("cannot store budget: %w", err)
	}

	return nil
}

func (s *service) List(ctx context.Context) ([]*Budget, error) {
	budgets, err := s.repository.List(ctx)
	if err != nil {
		return nil, fmt.Errorf("cannot list budgets: %s", err)
	}

	return budgets, nil
}
