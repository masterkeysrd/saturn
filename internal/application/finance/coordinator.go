package financeapp

import (
	"context"
	"errors"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
)

// SpaceService defines the decoupled interface for workspace accessibility check.
type SpaceService interface {
	GetSpace(ctx context.Context, session space.Session) (*space.Space, error)
}

// FinanceService defines the interface for underlying finance domain rules.
type FinanceService interface {
	ConfigureFinance(ctx context.Context, settings *finance.FinanceSettings) (*finance.FinanceSettings, error)
	GetFinanceSettings(ctx context.Context, spaceID finance.SpaceID) (*finance.FinanceSettings, error)
	CreateBudget(ctx context.Context, budget *finance.Budget) (*finance.Budget, error)
	UpdateBudget(ctx context.Context, budget *finance.Budget) (*finance.Budget, error)
	DeleteBudget(ctx context.Context, id finance.BudgetID) error
	ListBudgets(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListBudgetsFilter) ([]*finance.Budget, string, error)
	GetOrCreatePeriod(ctx context.Context, budgetID finance.BudgetID, date time.Time) (*finance.BudgetPeriod, error)
	UpdatePeriodLimit(ctx context.Context, id finance.PeriodID, limit int64) error
	CreateExchangeRate(ctx context.Context, rate *finance.ExchangeRate) (*finance.ExchangeRate, error)
	ListExchangeRates(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListExchangeRatesFilter) ([]*finance.ExchangeRate, string, error)
	DeleteExchangeRate(ctx context.Context, spaceID finance.SpaceID, fromCurrency, toCurrency finance.Currency, rateDate time.Time) error
	CreateExpense(ctx context.Context, txn *finance.Transaction) (*finance.Transaction, error)
	UpdateExpense(ctx context.Context, txn *finance.Transaction) (*finance.Transaction, error)
	DeleteTransaction(ctx context.Context, id finance.TransactionID) error
	ListTransactions(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListTransactionsFilter) ([]*finance.Transaction, string, error)
	GetSpentInsights(ctx context.Context, req *finance.GetSpentInsightsRequest) (*finance.SpentInsights, error)
}

// Dependencies contains all parameters for Coordinator initialization.
type Dependencies struct {
	FinanceService FinanceService
	SpaceService   SpaceService
}

// Coordinator orchestrates requests across workspace and finance boundaries.
type Coordinator struct {
	financeService FinanceService
	spaceService   SpaceService
}

// NewCoordinator instantiates a new Coordinator.
func NewCoordinator(deps Dependencies) *Coordinator {
	return &Coordinator{
		financeService: deps.FinanceService,
		spaceService:   deps.SpaceService,
	}
}

// RequestContext encapsulates the active request context properties.
type RequestContext struct {
	SpaceID finance.SpaceID
	UserID  string
}

// resolveContext extracts space and user identity safely into a RequestContext struct.
func (c *Coordinator) resolveContext(ctx context.Context) (*RequestContext, error) {
	spaceIDStr, ok := auth.SpaceIDFromContext(ctx)
	if !ok {
		return nil, errors.New("access denied: missing space-id context")
	}

	principal, ok := auth.PrincipalFromContext(ctx)
	if !ok {
		return nil, errors.New("access denied: missing user principal")
	}

	return &RequestContext{
		SpaceID: finance.SpaceID(spaceIDStr),
		UserID:  principal.Subject,
	}, nil
}

// ConfigureFinanceRequest represents settings setup inputs.
type ConfigureFinanceRequest struct {
	BaseCurrency finance.Currency
}

// ConfigureFinance sets up base currency preferences for a workspace.
func (c *Coordinator) ConfigureFinance(ctx context.Context, req *ConfigureFinanceRequest) (*finance.FinanceSettings, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}

	settings := &finance.FinanceSettings{
		SpaceID:      rCtx.SpaceID,
		BaseCurrency: req.BaseCurrency,
	}

	return c.financeService.ConfigureFinance(ctx, settings)
}

// GetFinanceSettings fetches workspace configuration.
func (c *Coordinator) GetFinanceSettings(ctx context.Context) (*finance.FinanceSettings, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}

	return c.financeService.GetFinanceSettings(ctx, rCtx.SpaceID)
}
