package expense

import (
	"context"
	"encoding/json"

	"github.com/masterkeysrd/saturn/api"
	"github.com/masterkeysrd/saturn/internal/domain/category"
	"github.com/masterkeysrd/saturn/internal/foundations/transport"
)

type Service interface {
	Get(context.Context, category.CategoryType, category.ID) (*category.Category, error)
	List(context.Context, category.CategoryType) ([]*category.Category, error)
	Create(context.Context, category.CategoryType, *category.Category) error
	Update(context.Context, category.CategoryType, *category.Category) error
	Delete(context.Context, category.CategoryType, category.ID) error
}

type server struct {
	service Service
}

func NewServer(service Service) *server {
	return &server{service: service}
}

func (s *server) Get(ctx context.Context, payload []byte) (interface{}, error) {
	id := transport.PathParamFromCtx(ctx, "id")

	categoryType := transport.PathParamFromCtx(ctx, "categoryType")

	exp, err := s.service.Get(ctx, category.CategoryType(categoryType), category.ID(id))
	if err != nil {
		return nil, err
	}

	return api.APICategory(exp), nil
}

func (s *server) List(ctx context.Context, payload []byte) (interface{}, error) {
	categoryType := transport.PathParamFromCtx(ctx, "categoryType")
	exps, err := s.service.List(ctx, category.CategoryType(categoryType))
	if err != nil {
		return nil, err
	}

	return api.APICategories(exps), nil
}

func (s *server) Create(ctx context.Context, payload []byte) (interface{}, error) {
	categoryType := transport.PathParamFromCtx(ctx, "categoryType")

	var req api.Category
	if err := json.Unmarshal(payload, &req); err != nil {
		return nil, err
	}

	exp := api.SaturnCategory(&req)
	if err := s.service.Create(ctx, category.CategoryType(categoryType), exp); err != nil {
		return nil, err
	}

	return api.APICategory(exp), nil
}

func (s *server) Update(ctx context.Context, payload []byte) (interface{}, error) {
	categoryType := transport.PathParamFromCtx(ctx, "categoryType")

	var req api.Category
	if err := json.Unmarshal(payload, &req); err != nil {
		return nil, err
	}

	id := transport.PathParamFromCtx(ctx, "id")
	req.Id = &id

	exp := api.SaturnCategory(&req)
	if err := s.service.Update(ctx, category.CategoryType(categoryType), exp); err != nil {
		return nil, err
	}

	return api.APICategory(exp), nil
}

func (s *server) Delete(ctx context.Context, payload []byte) (interface{}, error) {
	id := transport.PathParamFromCtx(ctx, "id")
	categoryType := transport.PathParamFromCtx(ctx, "categoryType")

	if err := s.service.Delete(ctx, category.CategoryType(categoryType), category.ID(id)); err != nil {
		return nil, err
	}

	return nil, nil
}
