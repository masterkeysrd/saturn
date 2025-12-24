package financegrpc

import (
	"context"

	financepb "github.com/masterkeysrd/saturn/gen/proto/go/saturn/finance/v1"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
)

var _ financepb.FinanceServer = (*Server)(nil)

// Application represents the identity application.
type Application interface {
	CreateBudget(context.Context, *finance.Budget) error
	ListBudgets(context.Context) ([]*finance.Budget, error)
	CreateExchangeRate(context.Context, *finance.ExchangeRate) error
}

type Server struct {
	financepb.UnimplementedFinanceServer

	app Application
}

func NewServer(app Application) *Server {
	return &Server{
		app: app,
	}
}

func (s *Server) CreateBudget(ctx context.Context, req *financepb.CreateBudgetRequest) (*financepb.Budget, error) {
	budget := Budget(req.GetBudget())
	if err := s.app.CreateBudget(ctx, budget); err != nil {
		return nil, err
	}
	return BudgetPb(budget), nil
}

func (s *Server) ListBudgets(ctx context.Context, req *financepb.ListBudgetsRequest) (*financepb.ListBudgetsResponse, error) {
	budgets, err := s.app.ListBudgets(ctx)
	if err != nil {
		return nil, err
	}
	return &financepb.ListBudgetsResponse{
		Budgets: BudgetsPb(budgets),
	}, nil
}

func (s *Server) CreateExchangeRate(ctx context.Context, req *financepb.CreateExchangeRateRequest) (*financepb.ExchangeRate, error) {
	exchangeRate, err := ExchangeRate(req.GetRate())
	if err != nil {
		return nil, err
	}

	if err := s.app.CreateExchangeRate(ctx, exchangeRate); err != nil {
		return nil, err
	}

	return ExchangeRatePb(exchangeRate), nil
}
