package budget

import (
	"context"
	"fmt"

	"github.com/masterkeysrd/saturn/internal/foundations/errors"
	"github.com/masterkeysrd/saturn/internal/foundations/uuid"
)

type Service struct {
	repository Repository
}

func NewService(repository Repository) *Service {
	return &Service{repository: repository}
}

func (s *Service) Get(ctx context.Context, id ID) (*Budget, error) {
	const op = errors.Op("budget/service.Get")

	if err := uuid.Validate(id); err != nil {
		return nil, errors.New(op, errors.Invalid, fmt.Errorf("could not validate id: %w", err))
	}

	budget, err := s.repository.Get(ctx, id)
	if err != nil {
		return nil, errors.New(op, err)
	}

	return budget, nil
}

func (s *Service) List(ctx context.Context) ([]*Budget, error) {
	const op = errors.Op("budget/service.List")

	budgets, err := s.repository.List(ctx)
	if err != nil {
		return nil, errors.New(op, errors.Internal, err)
	}

	return budgets, nil
}

func (s *Service) Create(ctx context.Context, budget *Budget) error {
	const op = errors.Op("budget/service.Create")

	id, err := uuid.New()
	if err != nil {
		return errors.New(op, errors.Internal, err)
	}

	budget.ID = ID(id)
	if err := budget.Validate(); err != nil {
		return errors.New(op, errors.Invalid, fmt.Errorf("could not validate budget: %w", err))
	}

	if err := s.repository.Create(ctx, budget); err != nil {
		return errors.New(op, errors.Internal, err)
	}

	return nil
}

func (s *Service) Update(ctx context.Context, update *Budget) error {
	const op = errors.Op("budget/service.Update")

	budget, err := s.repository.Get(ctx, update.ID)
	if err != nil {
		return errors.New(op, err)
	}

	budget.Update(update)
	if err := budget.Validate(); err != nil {
		return errors.New(op, errors.Invalid, fmt.Errorf("could not validate budget: %w", err))
	}

	if err := s.repository.Update(ctx, budget); err != nil {
		return errors.New(op, errors.Internal, err)
	}

	return nil
}

func (s *Service) Delete(ctx context.Context, id ID) error {
	const op = errors.Op("budget/service.Delete")

	if err := uuid.Validate(id); err != nil {
		return errors.New(op, errors.Invalid, fmt.Errorf("could not validate id: %w", err))
	}

	if _, err := s.Get(ctx, id); err != nil {
		return errors.New(op, fmt.Errorf("could not get budget: %w", err))
	}

	if err := s.repository.Delete(ctx, id); err != nil {
		return errors.New(op, errors.Internal, err)
	}

	return nil
}
