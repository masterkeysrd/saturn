package application

import (
	"context"
	"errors"
	"log"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/foundation/access"
	"github.com/masterkeysrd/saturn/internal/foundation/fieldmask"
)

// FinanceService defines the interface for finance-related operations.
type FinanceService interface {
	CreateBudget(context.Context, access.Principal, *finance.Budget) error
	ListBudgets(context.Context, access.Principal) ([]*finance.Budget, error)
	GetBudget(context.Context, access.Principal, finance.BudgetID) (*finance.Budget, error)
	UpdateBudget(context.Context, access.Principal, *finance.UpdateBudgetInput) (*finance.Budget, error)

	ListCurrencies(context.Context) ([]finance.Currency, error)

	CreateExchangeRate(context.Context, access.Principal, *finance.ExchangeRate) error
	ListExchangeRates(context.Context, access.Principal) ([]*finance.ExchangeRate, error)
	GetExchangeRate(context.Context, access.Principal, finance.CurrencyCode) (*finance.ExchangeRate, error)
	UpdateExchangeRate(context.Context, access.Principal, *finance.UpdateExchangeRateInput) (*finance.ExchangeRate, error)

	CreateExpense(context.Context, access.Principal, *finance.Expense) (*finance.Transaction, error)

	CreateSetting(context.Context, access.Principal, *finance.Setting) error
	GetSetting(context.Context, access.Principal) (*finance.Setting, error)
	UpdateSetting(context.Context, access.Principal, *finance.UpdateSettingInput) (*finance.Setting, error)
	ActivateSetting(context.Context, access.Principal) (*finance.Setting, error)
}

// FinanceApp provides application-level operations for finance management.
type FinanceApp struct {
	financeService FinanceService
}

// NewFinanceApp creates a new instance of FinanceApp.
func NewFinanceApp(financeService FinanceService) *FinanceApp {
	return &FinanceApp{
		financeService: financeService,
	}
}

// CreateBudget creates a new budget.
func (app *FinanceApp) CreateBudget(ctx context.Context, budget *finance.Budget) error {
	principal, ok := access.GetPrincipal(ctx)
	if !ok {
		return errors.New("missing principal in context")
	}

	return app.financeService.CreateBudget(ctx, principal, budget)
}

// ListBudgets lists all budgets for the principal.
func (app *FinanceApp) ListBudgets(ctx context.Context) ([]*finance.Budget, error) {
	log.Println("FinanceApp: ListBudgets called")
	principal, ok := access.GetPrincipal(ctx)
	if !ok {
		return nil, errors.New("missing principal in context")
	}

	return app.financeService.ListBudgets(ctx, principal)
}

// GetBudget retrieves a budget by its ID.
func (app *FinanceApp) GetBudget(ctx context.Context, budgetID finance.BudgetID) (*finance.Budget, error) {
	principal, ok := access.GetPrincipal(ctx)
	if !ok {
		return nil, errors.New("missing principal in context")
	}

	budget, err := app.financeService.GetBudget(ctx, principal, budgetID)
	if err != nil {
		return nil, err
	}

	return budget, nil
}

// UpdateBudget updates an existing budget.
func (app *FinanceApp) UpdateBudget(ctx context.Context, in *finance.UpdateBudgetInput) (*finance.Budget, error) {
	principal, ok := access.GetPrincipal(ctx)
	if !ok {
		return nil, errors.New("missing principal in context")
	}

	return app.financeService.UpdateBudget(ctx, principal, in)
}

// ListCurrencies lists all available currencies.
func (app *FinanceApp) ListCurrencies(ctx context.Context) ([]finance.Currency, error) {
	return app.financeService.ListCurrencies(ctx)
}

// CreateExchangeRate creates a new exchange rate.
func (app *FinanceApp) CreateExchangeRate(ctx context.Context, exchangeRate *finance.ExchangeRate) error {
	principal, ok := access.GetPrincipal(ctx)
	if !ok {
		return errors.New("missing principal in context")
	}

	return app.financeService.CreateExchangeRate(ctx, principal, exchangeRate)
}

// ListExchangeRates lists all exchange rates for the principal.
func (app *FinanceApp) ListExchangeRates(ctx context.Context) ([]*finance.ExchangeRate, error) {
	principal, ok := access.GetPrincipal(ctx)
	if !ok {
		return nil, errors.New("missing principal in context")
	}

	return app.financeService.ListExchangeRates(ctx, principal)
}

// GetExchangeRate retrieves an exchange rate by currency code.
func (app *FinanceApp) GetExchangeRate(ctx context.Context, currencyCode finance.CurrencyCode) (*finance.ExchangeRate, error) {
	principal, ok := access.GetPrincipal(ctx)

	if !ok {
		return nil, errors.New("missing principal in context")
	}

	return app.financeService.GetExchangeRate(ctx, principal, currencyCode)
}

func (app *FinanceApp) UpdateExchangeRate(ctx context.Context, in *finance.UpdateExchangeRateInput) (*finance.ExchangeRate, error) {
	principal, ok := access.GetPrincipal(ctx)
	if !ok {
		return nil, errors.New("missing principal in context")
	}

	return app.financeService.UpdateExchangeRate(ctx, principal, in)
}

// CreateExpense creates a new expense and its associated transaction.
func (app *FinanceApp) CreateExpense(ctx context.Context, expense *finance.Expense) (*finance.Transaction, error) {
	principal, ok := access.GetPrincipal(ctx)
	if !ok {
		return nil, errors.New("missing principal in context")
	}

	return app.financeService.CreateExpense(ctx, principal, expense)
}

// CreateSetting creates a new finance setting.
func (app *FinanceApp) CreateSetting(ctx context.Context, setting *finance.Setting) error {
	principal, ok := access.GetPrincipal(ctx)
	if !ok {
		return errors.New("missing principal in context")
	}

	return app.financeService.CreateSetting(ctx, principal, setting)
}

// GetSetting retrieves the finance setting for the principal.
func (app *FinanceApp) GetSetting(ctx context.Context) (*finance.Setting, error) {
	actor, ok := access.GetPrincipal(ctx)
	if !ok {
		return nil, errors.New("missing principal in context")
	}

	return app.financeService.GetSetting(ctx, actor)
}

// UpdateSetting updates the finance setting for the principal.
func (app *FinanceApp) UpdateSetting(ctx context.Context, setting *finance.Setting, updateMask *fieldmask.FieldMask) (*finance.Setting, error) {
	principal, ok := access.GetPrincipal(ctx)
	if !ok {
		return nil, errors.New("missing principal in context")
	}

	return app.financeService.UpdateSetting(ctx, principal, &finance.UpdateSettingInput{
		Setting:    setting,
		UpdateMask: updateMask,
	})
}

// ActivateSetting activates the finance setting for the principal.
func (app *FinanceApp) ActivateSetting(ctx context.Context) (*finance.Setting, error) {
	principal, ok := access.GetPrincipal(ctx)
	if !ok {
		return nil, errors.New("missing principal in context")
	}

	setting, err := app.financeService.ActivateSetting(ctx, principal)
	if err != nil {
		return nil, err
	}

	return setting, nil
}
