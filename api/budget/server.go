package expense

import (
	"context"
	"encoding/json"

	"github.com/masterkeysrd/saturn/api"
	"github.com/masterkeysrd/saturn/internal/domain/budget"
	"github.com/masterkeysrd/saturn/internal/foundations/transport"
)

type Service interface {
	Get(context.Context, budget.ID) (*budget.Budget, error)
	List(context.Context) ([]*budget.Budget, error)
	Create(context.Context, *budget.Budget) error
	Update(context.Context, *budget.Budget) error
	Delete(context.Context, budget.ID) error
}

type server struct {
	service Service
}

func NewServer(service Service) *server {
	return &server{service: service}
}

func (s *server) Get(ctx context.Context, payload []byte) (interface{}, error) {
	id := transport.PathParamFromCtx(ctx, "id")

	exp, err := s.service.Get(ctx, budget.ID(id))
	if err != nil {
		return nil, err
	}

	return api.APIBudget(exp), nil
}

func (s *server) List(ctx context.Context, payload []byte) (interface{}, error) {
	exps, err := s.service.List(ctx)
	if err != nil {
		return nil, err
	}

	return api.APIBudgets(exps), nil
}

func (s *server) Create(ctx context.Context, payload []byte) (interface{}, error) {
	var req api.Budget
	if err := json.Unmarshal(payload, &req); err != nil {
		return nil, err
	}

	exp := api.SaturnBudget(&req)
	if err := s.service.Create(ctx, exp); err != nil {
		return nil, err
	}

	return api.APIBudget(exp), nil
}

func (s *server) Update(ctx context.Context, payload []byte) (interface{}, error) {
	var req api.Budget
	if err := json.Unmarshal(payload, &req); err != nil {
		return nil, err
	}

	id := transport.PathParamFromCtx(ctx, "id")
	req.Id = &id

	exp := api.SaturnBudget(&req)
	if err := s.service.Update(ctx, exp); err != nil {
		return nil, err
	}

	return api.APIBudget(exp), nil
}

func (s *server) Delete(ctx context.Context, payload []byte) (interface{}, error) {
	id := transport.PathParamFromCtx(ctx, "id")

	if err := s.service.Delete(ctx, budget.ID(id)); err != nil {
		return nil, err
	}

	return nil, nil
}
