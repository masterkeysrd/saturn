package financeapp

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/domain/space"
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

// ConfigureFinanceRequest represents settings setup inputs.
type ConfigureFinanceRequest struct {
	SpaceID      finance.SpaceID
	UserID       string // The requestor's user ID
	BaseCurrency finance.Currency
}

// GetFinanceSettingsRequest represents settings retrieval inputs.
type GetFinanceSettingsRequest struct {
	SpaceID finance.SpaceID
	UserID  string
}

// authorize checks if the user is a member of the workspace.
func (c *Coordinator) authorize(ctx context.Context, spaceID finance.SpaceID, userID string) (finance.SpaceID, error) {
	spID, err := space.ParseSpaceID(string(spaceID))
	if err != nil {
		return "", fmt.Errorf("invalid space ID: %w", err)
	}
	usrID, err := identity.ParseUserID(userID)
	if err != nil {
		return "", fmt.Errorf("invalid user ID: %w", err)
	}

	session := space.Session{
		SpaceID: spID,
		UserID:  space.SpaceID(usrID),
	}
	_, err = c.spaceService.GetSpace(ctx, session)
	if err != nil {
		return "", errors.New("access denied: user is not a member of this workspace")
	}

	return spaceID, nil
}

// ConfigureFinance sets up base currency preferences for a workspace.
func (c *Coordinator) ConfigureFinance(ctx context.Context, req *ConfigureFinanceRequest) (*finance.FinanceSettings, error) {
	spaceID, err := c.authorize(ctx, req.SpaceID, req.UserID)
	if err != nil {
		return nil, err
	}

	settings := &finance.FinanceSettings{
		SpaceID:      spaceID,
		BaseCurrency: req.BaseCurrency,
	}

	return c.financeService.ConfigureFinance(ctx, settings)
}

// GetFinanceSettings fetches workspace configuration.
func (c *Coordinator) GetFinanceSettings(ctx context.Context, req *GetFinanceSettingsRequest) (*finance.FinanceSettings, error) {
	spaceID, err := c.authorize(ctx, req.SpaceID, req.UserID)
	if err != nil {
		return nil, err
	}

	return c.financeService.GetFinanceSettings(ctx, spaceID)
}
