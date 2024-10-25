package expense

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

func (s *Service) Create(ctx context.Context, expense *Expense) error {
	const op = errors.Op("expense/service.Create")

	id, err := uuid.New()
	if err != nil {
		return errors.New(op, errors.Internal, err)
	}

	expense.ID = ID(id)
	if err := expense.Validate(); err != nil {
		return errors.New(op, errors.Invalid, fmt.Errorf("could not validate expense: %w", err))
	}

	if err := s.repository.Create(ctx, expense); err != nil {
		return errors.New(op, errors.Internal, err)
	}

	return nil
}
