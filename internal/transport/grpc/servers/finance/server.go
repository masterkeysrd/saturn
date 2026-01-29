package financegrpc

import (
	"context"
	"log/slog"

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
	SearchBudgets(context.Context, *finance.SearchBudgetsInput) (*finance.BudgetPage, error)
	FindBudget(context.Context, *finance.FindBudgetInput) (*finance.BudgetItem, error)
	UpdateBudget(context.Context, *finance.UpdateBudgetInput) (*finance.Budget, error)
	ListCurrencies(context.Context) ([]finance.Currency, error)
	CreateExchangeRate(context.Context, *finance.ExchangeRate) error
	ListExchangeRates(context.Context) ([]*finance.ExchangeRate, error)
	GetExchangeRate(context.Context, finance.CurrencyCode) (*finance.ExchangeRate, error)
	UpdateExchangeRate(context.Context, *finance.UpdateExchangeRateInput) (*finance.ExchangeRate, error)
	CreateExpense(context.Context, *finance.Expense) (*finance.Transaction, error)
	SearchTransactions(context.Context, *finance.SearchTransactionsInput) (*finance.TransactionPage, error)
	GetSetting(context.Context) (*finance.Setting, error)
	UpdateSetting(context.Context, *finance.Setting, *fieldmask.FieldMask) (*finance.Setting, error)
	ActivateSetting(context.Context) (*finance.Setting, error)
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

func (s *Server) ListCurrencies(ctx context.Context, _ *emptypb.Empty) (*financepb.ListCurrenciesResponse, error) {
	currencies, err := s.app.ListCurrencies(ctx)
	if err != nil {
		return nil, err
	}
	return &financepb.ListCurrenciesResponse{
		Currencies: CurrenciesPb(currencies),
	}, nil
}

func (s *Server) CreateBudget(ctx context.Context, req *financepb.CreateBudgetRequest) (*financepb.Budget, error) {
	budget := Budget(req.GetBudget())
	if err := s.app.CreateBudget(ctx, budget); err != nil {
		return nil, err
	}
	return BudgetPb(budget), nil
}

func (s *Server) ListBudgets(ctx context.Context, req *financepb.ListBudgetsRequest) (*financepb.ListBudgetsResponse, error) {
	page, err := s.app.SearchBudgets(ctx, SearchBudgetsInput(req))
	if err != nil {
		return nil, err
	}
	return &financepb.ListBudgetsResponse{
		Budgets:   BudgetsItemsPb(page.Items),
		TotalSize: int32(page.TotalCount),
	}, nil
}

func (s *Server) GetBudget(ctx context.Context, req *financepb.GetBudgetRequest) (*financepb.Budget, error) {
	budget, err := s.app.FindBudget(ctx, FindBudgetInput(req))
	if err != nil {
		return nil, err
	}
	return BudgetItemPb(budget), nil
}

func (s *Server) UpdateBudget(ctx context.Context, req *financepb.UpdateBudgetRequest) (*financepb.Budget, error) {
	input, err := UpdateBudgetInput(req)
	if err != nil {
		return nil, err
	}

	budget, err := s.app.UpdateBudget(ctx, input)
	if err != nil {
		return nil, err
	}

	return BudgetPb(budget), nil
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

func (s *Server) ListExchangeRates(ctx context.Context, req *financepb.ListExchangeRatesRequest) (*financepb.ListExchangeRatesResponse, error) {
	exchangeRates, err := s.app.ListExchangeRates(ctx)
	if err != nil {
		return nil, err
	}
	return &financepb.ListExchangeRatesResponse{
		Rates: ExchangeRatesPb(exchangeRates),
	}, nil
}

func (s *Server) GetExchangeRate(ctx context.Context, req *financepb.GetExchangeRateRequest) (*financepb.ExchangeRate, error) {
	exchangeRate, err := s.app.GetExchangeRate(ctx, finance.CurrencyCode(req.GetCurrencyCode()))
	if err != nil {
		return nil, err
	}
	return ExchangeRatePb(exchangeRate), nil
}

func (s *Server) UpdateExchangeRate(ctx context.Context, req *financepb.UpdateExchangeRateRequest) (*financepb.ExchangeRate, error) {
	slog.Info("UpdateExchangeRate called", slog.Any("request", req))
	input, err := UpdateExchangeRateInput(req)
	if err != nil {
		return nil, err
	}

	rate, err := s.app.UpdateExchangeRate(ctx, input)
	if err != nil {
		return nil, err
	}

	return ExchangeRatePb(rate), nil
}

func (s *Server) CreateExpense(ctx context.Context, req *financepb.CreateExpenseRequest) (*financepb.Transaction, error) {
	expense, err := Expense(req.GetExpense())
	if err != nil {
		return nil, err
	}

	trx, err := s.app.CreateExpense(ctx, expense)
	if err != nil {
		return nil, err
	}

	return TransactionPb(trx), nil
}

func (s *Server) ListTransactions(ctx context.Context, req *financepb.ListTransactionsRequest) (*financepb.ListTransactionsResponse, error) {
	page, err := s.app.SearchTransactions(ctx, SearchTransactionsInput(req))
	if err != nil {
		return nil, err
	}
	return &financepb.ListTransactionsResponse{
		Transactions: TransactionsItemsPb(page.Items),
	}, nil
}

func (s *Server) GetSetting(ctx context.Context, _ *emptypb.Empty) (*financepb.Setting, error) {
	settings, err := s.app.GetSetting(ctx)
	if err != nil {
		return nil, err
	}
	return SettingPb(settings), nil
}

func (s *Server) UpdateSetting(ctx context.Context, req *financepb.UpdateSettingRequest) (*financepb.Setting, error) {
	settings, updateMask := Setting(req.GetSetting()), encoding.FieldMask(req.GetUpdateMask())
	updatedSettings, err := s.app.UpdateSetting(ctx, settings, updateMask)
	if err != nil {
		return nil, err
	}
	return SettingPb(updatedSettings), nil
}

func (s *Server) ActivateSetting(ctx context.Context, _ *emptypb.Empty) (*financepb.Setting, error) {
	settings, err := s.app.ActivateSetting(ctx)
	if err != nil {
		return nil, err
	}
	return SettingPb(settings), nil
}
