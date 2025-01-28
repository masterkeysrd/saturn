package income

import (
	"context"
	"encoding/json"

	"github.com/masterkeysrd/saturn/api"
	"github.com/masterkeysrd/saturn/internal/domain/income"
	"github.com/masterkeysrd/saturn/internal/foundations/transport"
)

type Service interface {
	Get(context.Context, income.ID) (*income.Income, error)
	List(context.Context) ([]*income.Income, error)
	Create(context.Context, *income.Income) error
	Update(context.Context, *income.Income) error
	Delete(context.Context, income.ID) error
}

type server struct {
	service Service
}

func NewServer(service Service) *server {
	return &server{service: service}
}

func (s *server) Get(ctx context.Context, payload []byte) (interface{}, error) {
	id := transport.PathParamFromCtx(ctx, "id")

	exp, err := s.service.Get(ctx, income.ID(id))
	if err != nil {
		return nil, err
	}

	return api.APIIncome(exp), nil
}

func (s *server) List(ctx context.Context, payload []byte) (interface{}, error) {
	exps, err := s.service.List(ctx)
	if err != nil {
		return nil, err
	}

	return api.APIIncomes(exps), nil
}

func (s *server) Create(ctx context.Context, payload []byte) (interface{}, error) {
	var req api.Income
	if err := json.Unmarshal(payload, &req); err != nil {
		return nil, err
	}

	exp := api.SaturnIncome(&req)
	if err := s.service.Create(ctx, exp); err != nil {
		return nil, err
	}

	return api.APIIncome(exp), nil
}

func (s *server) Update(ctx context.Context, payload []byte) (interface{}, error) {
	var req api.Income
	if err := json.Unmarshal(payload, &req); err != nil {
		return nil, err
	}

	id := transport.PathParamFromCtx(ctx, "id")
	req.Id = &id

	exp := api.SaturnIncome(&req)
	if err := s.service.Update(ctx, exp); err != nil {
		return nil, err
	}

	return api.APIIncome(exp), nil
}

func (s *server) Delete(ctx context.Context, payload []byte) (interface{}, error) {
	id := transport.PathParamFromCtx(ctx, "id")

	if err := s.service.Delete(ctx, income.ID(id)); err != nil {
		return nil, err
	}

	return nil, nil
}
