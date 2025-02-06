package income

import (
	"context"
	"fmt"

	"github.com/masterkeysrd/saturn/internal/domain/category"
	"github.com/masterkeysrd/saturn/internal/foundations/errors"
	"github.com/masterkeysrd/saturn/internal/foundations/log"
	"github.com/masterkeysrd/saturn/internal/foundations/uuid"
)

type Service struct {
	repository      Repository
	categoryService CategoryService
}

type ServiceParams struct {
	Repository      Repository
	CategoryService CategoryService
}

type CategoryService interface {
	Get(context.Context, category.CategoryType, category.ID) (*category.Category, error)
}

func NewService(params ServiceParams) *Service {
	return &Service{
		repository:      params.Repository,
		categoryService: params.CategoryService,
	}
}

func (s *Service) Get(ctx context.Context, id ID) (*Income, error) {
	const op = errors.Op("income/service.Get")

	if err := uuid.Validate(id); err != nil {
		return nil, errors.New(op, errors.Invalid, fmt.Errorf("could not validate id: %w", err))
	}

	income, err := s.repository.Get(ctx, id)
	if err != nil {
		return nil, errors.New(op, err)
	}

	return income, nil
}

func (s *Service) List(ctx context.Context) ([]*Income, error) {
	const op = errors.Op("income/service.List")

	incomes, err := s.repository.List(ctx)
	if err != nil {
		return nil, errors.New(op, errors.Internal, err)
	}

	return incomes, nil
}

func (s *Service) Create(ctx context.Context, income *Income) error {
	const op = errors.Op("income/service.Create")

	id, err := uuid.New()
	if err != nil {
		return errors.New(op, errors.Internal, err)
	}

	income.ID = ID(id)
	if err := income.Validate(); err != nil {
		return errors.New(op, errors.Invalid, fmt.Errorf("could not validate income: %w", err))
	}

	category, err := s.categoryService.Get(ctx, category.IncomeCategoryType, income.CategoryID)
	if err != nil {
		return errors.New(op, errors.Internal, err)
	}

	income.Category = &Category{
		Name: category.Name,
	}

	if err := s.repository.Create(ctx, income); err != nil {
		return errors.New(op, errors.Internal, err)
	}

	return nil
}

func (s *Service) Update(ctx context.Context, update *Income) error {
	log.InfoCtx(ctx, "Update", log.Any("update", update))
	const op = errors.Op("income/service.Update")

	income, err := s.repository.Get(ctx, update.ID)
	if err != nil {
		return errors.New(op, err)
	}

	category, err := s.categoryService.Get(ctx, category.IncomeCategoryType, update.CategoryID)
	if err != nil {
		return errors.New(op, errors.Internal, err)
	}

	update.Category = &Category{
		Name: category.Name,
	}

	income.Update(update)
	if err := income.Validate(); err != nil {
		return errors.New(op, errors.Invalid, fmt.Errorf("could not validate income: %w", err))
	}

	if err := s.repository.Update(ctx, income); err != nil {
		return errors.New(op, errors.Internal, err)
	}

	return nil
}

func (s *Service) Delete(ctx context.Context, id ID) error {
	const op = errors.Op("income/service.Delete")

	if err := uuid.Validate(id); err != nil {
		return errors.New(op, errors.Invalid, fmt.Errorf("could not validate id: %w", err))
	}

	if _, err := s.Get(ctx, id); err != nil {
		return errors.New(op, fmt.Errorf("could not get income: %w", err))
	}

	if err := s.repository.Delete(ctx, id); err != nil {
		return errors.New(op, errors.Internal, err)
	}

	return nil
}
