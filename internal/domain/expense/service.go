package expense

import (
	"context"
	"fmt"

	"github.com/masterkeysrd/saturn/internal/foundations/uuid"
)

type Service struct {
	repository Repository
}

func NewService(repository Repository) *Service {
	return &Service{repository: repository}
}

func (s *Service) Create(ctx context.Context, expense *Expense) error {
	id, err := uuid.New()
	if err != nil {
		return fmt.Errorf("could not generate ID: %w", err)
	}

	expense.ID = ID(id)
	if err := expense.Validate(); err != nil {
		return fmt.Errorf("invalid expense: %w", err)
	}

	if err := s.repository.Create(ctx, expense); err != nil {
		return fmt.Errorf("could not create expense: %w", err)
	}

	return nil
}
