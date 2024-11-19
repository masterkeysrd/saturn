package expense

import (
	"context"
	"encoding/json"

	"github.com/masterkeysrd/saturn/api"
	"github.com/masterkeysrd/saturn/internal/domain/expense"
	"github.com/masterkeysrd/saturn/internal/foundations/transport"
)

type Service interface {
	Get(context.Context, expense.ID) (*expense.Expense, error)
	List(context.Context) ([]*expense.Expense, error)
	Create(context.Context, *expense.Expense) error
	Update(context.Context, *expense.Expense) error
	Delete(context.Context, expense.ID) error
}

type server struct {
	service Service
}

func NewServer(service Service) *server {
	return &server{service: service}
}

func (s *server) Get(ctx context.Context, payload []byte) (interface{}, error) {
	id := transport.PathParam(ctx, "id")

	exp, err := s.service.Get(ctx, expense.ID(id))
	if err != nil {
		return nil, err
	}

	return api.APIExpense(exp), nil
}

func (s *server) List(ctx context.Context, payload []byte) (interface{}, error) {
	exps, err := s.service.List(ctx)
	if err != nil {
		return nil, err
	}

	return api.APIExpenses(exps), nil
}

func (s *server) Create(ctx context.Context, payload []byte) (interface{}, error) {
	var req api.Expense
	if err := json.Unmarshal(payload, &req); err != nil {
		return nil, err
	}

	exp := api.SaturnExpense(&req)
	if err := s.service.Create(ctx, exp); err != nil {
		return nil, err
	}

	return api.APIExpense(exp), nil
}

func (s *server) Update(ctx context.Context, payload []byte) (interface{}, error) {
	var req api.Expense
	if err := json.Unmarshal(payload, &req); err != nil {
		return nil, err
	}

	id := transport.PathParam(ctx, "id")
	req.Id = &id

	exp := api.SaturnExpense(&req)
	if err := s.service.Update(ctx, exp); err != nil {
		return nil, err
	}

	return api.APIExpense(exp), nil
}

func (s *server) Delete(ctx context.Context, payload []byte) (interface{}, error) {
	id := transport.PathParam(ctx, "id")

	if err := s.service.Delete(ctx, expense.ID(id)); err != nil {
		return nil, err
	}

	return nil, nil
}
