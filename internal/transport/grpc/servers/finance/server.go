package financegrpc

import (
	"context"

	financepb "github.com/masterkeysrd/saturn/gen/proto/go/saturn/finance/v1"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/foundation/fieldmask"
	"github.com/masterkeysrd/saturn/internal/transport/grpc/encoding"
	"google.golang.org/protobuf/types/known/emptypb"
)

var _ financepb.FinanceServer = (*Server)(nil)

// Application represents the identity application.
type Application interface {
	CreateBudget(context.Context, *finance.Budget) error
	ListBudgets(context.Context) ([]*finance.Budget, error)
	CreateExchangeRate(context.Context, *finance.ExchangeRate) error
	GetSetting(context.Context) (*finance.Setting, error)
	UpdateSetting(context.Context, *finance.Setting, *fieldmask.FieldMask) (*finance.Setting, error)
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

func (s *Server) GetSettings(ctx context.Context, _ *emptypb.Empty) (*financepb.Setting, error) {
	settings, err := s.app.GetSetting(ctx)
	if err != nil {
		return nil, err
	}
	return SettingPb(settings), nil
}

func (s *Server) UpdateSettings(ctx context.Context, req *financepb.UpdateSettingRequest) (*financepb.Setting, error) {
	settings, updateMask := Setting(req.GetSetting()), encoding.FieldMask(req.GetUpdateMask())
	updatedSettings, err := s.app.UpdateSetting(ctx, settings, updateMask)
	if err != nil {
		return nil, err
	}
	return SettingPb(updatedSettings), nil
}
