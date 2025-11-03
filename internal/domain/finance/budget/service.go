package budget

import (
	"context"
	"fmt"

	"github.com/masterkeysrd/saturn/internal/pkg/deps"
)

type Service struct {
	repository Repository
}

type ServiceParams struct {
	deps.In

	Repository Repository
}

func NewService(params ServiceParams) *Service {
	return &Service{
		repository: params.Repository,
	}
}

func (s *Service) Create(ctx context.Context, budget *Budget) error {
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

func (s *Service) List(ctx context.Context) ([]*Budget, error) {
	budgets, err := s.repository.List(ctx)
	if err != nil {
		return nil, fmt.Errorf("cannot list budgets: %s", err)
	}

	return budgets, nil
}
