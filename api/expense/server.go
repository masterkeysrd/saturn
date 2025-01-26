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

type Server struct {
	service Service
}

func NewServer(service Service) *Server {
	return &Server{service: service}
}

func (s *Server) Get(ctx context.Context, payload []byte) (interface{}, error) {
	id := transport.PathParamFromCtx(ctx, "id")

	exp, err := s.service.Get(ctx, expense.ID(id))
	if err != nil {
		return nil, err
	}

	return api.APIExpense(exp), nil
}

func (s *Server) List(ctx context.Context, payload []byte) (interface{}, error) {
	exps, err := s.service.List(ctx)
	if err != nil {
		return nil, err
	}

	return api.APIExpenses(exps), nil
}

func (s *Server) Create(ctx context.Context, payload []byte) (interface{}, error) {
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

func (s *Server) Update(ctx context.Context, payload []byte) (interface{}, error) {
	var req api.Expense
	if err := json.Unmarshal(payload, &req); err != nil {
		return nil, err
	}

	exp := api.SaturnExpense(&req)
	if err := s.service.Update(ctx, exp); err != nil {
		return nil, err
	}

	return api.APIExpense(exp), nil
}

func (s *Server) Delete(ctx context.Context, payload []byte) (interface{}, error) {
	id := transport.PathParamFromCtx(ctx, "id")

	err := s.service.Delete(ctx, expense.ID(id))
	if err != nil {
		return nil, err
	}

	return nil, nil
}
