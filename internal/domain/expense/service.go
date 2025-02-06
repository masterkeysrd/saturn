package expense

import (
	"context"
	"fmt"

	"github.com/masterkeysrd/saturn/internal/domain/budget"
	"github.com/masterkeysrd/saturn/internal/domain/category"
	"github.com/masterkeysrd/saturn/internal/foundations/errors"
	"github.com/masterkeysrd/saturn/internal/foundations/uuid"
)

type ServiceParams struct {
	Repository      Repository
	BudgetService   BudgetService
	CategoryService CategoryService
}

type Service struct {
	repository      Repository
	categoryService CategoryService
	budgetService   BudgetService
}

func NewService(params ServiceParams) *Service {
	return &Service{
		repository:      params.Repository,
		budgetService:   params.BudgetService,
		categoryService: params.CategoryService,
	}
}

func (s *Service) Get(ctx context.Context, id ID) (*Expense, error) {
	const op = errors.Op("expense/service.Get")

	if err := uuid.Validate(id); err != nil {
		return nil, errors.New(op, errors.Invalid, fmt.Errorf("could not validate id: %w", err))
	}

	expense, err := s.repository.Get(ctx, id)
	if err != nil {
		return nil, errors.New(op, err)
	}

	return expense, nil
}

func (s *Service) List(ctx context.Context) ([]*Expense, error) {
	const op = errors.Op("expense/service.List")

	expenses, err := s.repository.List(ctx)
	if err != nil {
		return nil, errors.New(op, errors.Internal, err)
	}

	return expenses, nil
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

	budget, err := s.budgetService.Get(ctx, expense.BudgetID)
	if err != nil {
		return errors.New(op, errors.Internal, err)
	}

	expense.Budget = &Budget{
		Description: budget.Description,
	}

	catetory, err := s.categoryService.Get(ctx, category.ExpenseCategoryType, expense.CategoryID)
	if err != nil {
		return errors.New(op, errors.Internal, err)
	}

	expense.Category = &Category{
		Name: catetory.Name,
	}

	if err := s.repository.Create(ctx, expense); err != nil {
		return errors.New(op, errors.Internal, err)
	}

	return nil
}

func (s *Service) Update(ctx context.Context, expense *Expense) error {
	const op = errors.Op("expense/service.Update")

	if err := expense.Validate(); err != nil {
		return errors.New(op, errors.Invalid, fmt.Errorf("could not validate expense: %w", err))
	}

	budget, err := s.budgetService.Get(ctx, expense.BudgetID)
	if err != nil {
		return errors.New(op, errors.Internal, err)
	}

	expense.Budget = &Budget{
		Description: budget.Description,
	}

	catetory, err := s.categoryService.Get(ctx, category.ExpenseCategoryType, expense.CategoryID)
	if err != nil {
		return errors.New(op, errors.Internal, err)
	}

	expense.Category = &Category{
		Name: catetory.Name,
	}

	if err := s.repository.Update(ctx, expense); err != nil {
		return errors.New(op, errors.Internal, err)
	}

	return nil
}

func (s *Service) Delete(ctx context.Context, id ID) error {
	const op = errors.Op("expense/service.Delete")

	if err := uuid.Validate(id); err != nil {
		return errors.New(op, errors.Invalid, fmt.Errorf("could not validate id: %w", err))
	}

	if err := s.repository.Delete(ctx, id); err != nil {
		return errors.New(op, errors.Internal, err)
	}

	return nil
}

type BudgetService interface {
	Get(ctx context.Context, id budget.ID) (*budget.Budget, error)
}

type CategoryService interface {
	Get(ctx context.Context, ctype category.CategoryType, id category.ID) (*category.Category, error)
}
