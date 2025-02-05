package category

import (
	"context"
	"fmt"

	"github.com/masterkeysrd/saturn/internal/domain/general/lists"
	"github.com/masterkeysrd/saturn/internal/foundations/errors"
	"github.com/masterkeysrd/saturn/internal/foundations/uuid"
)

const CategoryListName = "finance_categories"

type Service struct {
	listService ListService
}

type ListService interface {
	Get(ctx context.Context, name string) (*lists.List, error)
	Save(ctx context.Context, list *lists.List) error
}

func NewService(listService ListService) *Service {
	return &Service{
		listService: listService,
	}
}

func (s *Service) Get(ctx context.Context, categoryType CategoryType, id ID) (*Category, error) {
	const op = errors.Op("category/service.Get")

	if err := categoryType.Validate(); err != nil {
		return nil, errors.New(op, errors.Invalid, fmt.Errorf("could not validate category type: %w", err))
	}

	if err := uuid.Validate(id); err != nil {
		return nil, errors.New(op, errors.Invalid, fmt.Errorf("could not validate id: %w", err))
	}

	list, err := s.listService.Get(ctx, fmt.Sprintf("%s_%s", CategoryListName, categoryType))
	if err != nil {
		return nil, errors.New(op, errors.Internal, fmt.Errorf("could not get list: %w", err))
	}

	for _, item := range list.Items {
		if item.ID == string(id) {
			return &Category{
				ID:   ID(item.ID),
				Name: item.Name,
			}, nil
		}
	}

	return nil, errors.New(op, errors.NotExist, fmt.Errorf("could not find category with id %s", id))
}

func (s *Service) List(ctx context.Context, categoryType CategoryType) ([]*Category, error) {
	const op = errors.Op("category/service.List")

	if err := categoryType.Validate(); err != nil {
		return nil, errors.New(op, errors.Invalid, fmt.Errorf("could not validate category type: %w", err))
	}

	list, err := s.listService.Get(ctx, fmt.Sprintf("%s_%s", CategoryListName, categoryType))
	if err != nil {
		return nil, errors.New(op, errors.Internal, fmt.Errorf("could not get list: %w", err))
	}

	categories := make([]*Category, 0, len(list.Items))
	for _, item := range list.Items {
		categories = append(categories, &Category{
			ID:   ID(item.ID),
			Name: item.Name,
		})
	}

	return categories, nil
}

func (s *Service) Create(ctx context.Context, categoryType CategoryType, category *Category) error {
	const op = errors.Op("category/service.Create")

	if err := categoryType.Validate(); err != nil {
		return errors.New(op, errors.Invalid, fmt.Errorf("could not validate category type: %w", err))
	}

	id, err := uuid.New()
	if err != nil {
		return errors.New(op, errors.Internal, fmt.Errorf("could not generate id: %w", err))
	}

	category.ID = ID(id)

	if err := category.Validate(); err != nil {
		return errors.New(op, errors.Invalid, fmt.Errorf("could not validate category: %w", err))
	}

	list, err := s.listService.Get(ctx, fmt.Sprintf("%s_%s", CategoryListName, categoryType))
	if err != nil {
		return errors.New(op, errors.Internal, fmt.Errorf("could not get list: %w", err))
	}

	if err := list.AddItem(&lists.Item{
		ID:   string(category.ID),
		Name: category.Name,
	}); err != nil {
		return errors.New(op, errors.Internal, fmt.Errorf("could not add item: %w", err))
	}

	if err := s.listService.Save(ctx, list); err != nil {
		return errors.New(op, errors.Internal, fmt.Errorf("could not save list: %w", err))
	}

	return nil
}

func (s *Service) Update(ctx context.Context, categoryType CategoryType, update *Category) error {
	const op = errors.Op("category/service.Update")

	if err := categoryType.Validate(); err != nil {
		return errors.New(op, errors.Invalid, fmt.Errorf("could not validate category type: %w", err))
	}

	if err := update.Validate(); err != nil {
		return errors.New(op, errors.Invalid, fmt.Errorf("could not validate category: %w", err))
	}

	list, err := s.listService.Get(ctx, fmt.Sprintf("%s_%s", CategoryListName, categoryType))
	if err != nil {
		return errors.New(op, errors.Internal, fmt.Errorf("could not get list: %w", err))
	}

	if err := list.UpdateItem(&lists.Item{
		ID:   string(update.ID),
		Name: update.Name,
	}); err != nil {
		return errors.New(op, errors.Internal, fmt.Errorf("could not update item: %w", err))
	}

	if err := s.listService.Save(ctx, list); err != nil {
		return errors.New(op, errors.Internal, fmt.Errorf("could not save list: %w", err))
	}

	return nil
}

func (s *Service) Delete(ctx context.Context, categoryType CategoryType, id ID) error {
	const op = errors.Op("category/service.Delete")

	if err := categoryType.Validate(); err != nil {
		return errors.New(op, errors.Invalid, fmt.Errorf("could not validate category type: %w", err))
	}

	list, err := s.listService.Get(ctx, fmt.Sprintf("%s_%s", CategoryListName, categoryType))
	if err != nil {
		return errors.New(op, errors.Internal, fmt.Errorf("could not get list: %w", err))
	}

	if err := list.RemoveItem(string(id)); err != nil {
		return errors.New(op, errors.Internal, fmt.Errorf("could not remove item: %w", err))
	}

	if err := s.listService.Save(ctx, list); err != nil {
		return errors.New(op, errors.Internal, fmt.Errorf("could not save list: %w", err))
	}

	return nil
}
