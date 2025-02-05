package lists

import (
	"context"

	"github.com/masterkeysrd/saturn/internal/foundations/errors"
)

// Service is a service for managing lists.
type Service struct {
	repo Repository
}

// NewService creates a new list service.
func NewService(repo Repository) *Service {
	return &Service{repo: repo}
}

// Get gets a list by name.
func (s *Service) Get(ctx context.Context, name string) (*List, error) {
	if name == "" {
		return nil, errors.New("name is required")
	}

	list, err := s.repo.Get(ctx, name)
	if errors.Is(err, errors.NotExist) {
		return &List{Name: name, Items: make([]*Item, 0)}, nil
	}

	return list, err
}

// Save creates or updates a list.
func (s *Service) Save(ctx context.Context, list *List) error {
	if err := list.Validate(); err != nil {
		return err
	}

	return s.repo.Save(ctx, list)
}
