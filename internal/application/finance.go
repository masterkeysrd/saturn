package application

import (
	"context"
	"errors"
	"log"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/foundation/access"
	"github.com/masterkeysrd/saturn/internal/foundation/fieldmask"
)

type FinanceService interface {
	CreateBudget(context.Context, access.Principal, *finance.Budget) error
	ListBudgets(context.Context, access.Principal) ([]*finance.Budget, error)
	ListCurrencies(context.Context) ([]finance.Currency, error)
	CreateExchangeRate(context.Context, access.Principal, *finance.ExchangeRate) error
	ListExchangeRates(context.Context, access.Principal) ([]*finance.ExchangeRate, error)
	GetExchangeRate(context.Context, access.Principal, finance.CurrencyCode) (*finance.ExchangeRate, error)
	UpdateExchangeRate(context.Context, access.Principal, *finance.UpdateExchangeRateInput) (*finance.ExchangeRate, error)
	CreateSetting(context.Context, access.Principal, *finance.Setting) error
	GetSetting(context.Context, access.Principal) (*finance.Setting, error)
	UpdateSetting(context.Context, access.Principal, *finance.UpdateSettingInput) (*finance.Setting, error)
	ActivateSetting(context.Context, access.Principal) (*finance.Setting, error)
}

type FinanceApp struct {
	financeService FinanceService
}

func NewFinanceApp(financeService FinanceService) *FinanceApp {
	return &FinanceApp{
		financeService: financeService,
	}
}

func (app *FinanceApp) CreateBudget(ctx context.Context, budget *finance.Budget) error {
	principal, ok := access.GetPrincipal(ctx)
	if !ok {
		return errors.New("missing principal in context")
	}

	return app.financeService.CreateBudget(ctx, principal, budget)
}

func (app *FinanceApp) ListBudgets(ctx context.Context) ([]*finance.Budget, error) {
	log.Println("FinanceApp: ListBudgets called")
	principal, ok := access.GetPrincipal(ctx)
	if !ok {
		return nil, errors.New("missing principal in context")
	}

	return app.financeService.ListBudgets(ctx, principal)
}

func (app *FinanceApp) ListCurrencies(ctx context.Context) ([]finance.Currency, error) {
	return app.financeService.ListCurrencies(ctx)
}

func (app *FinanceApp) CreateExchangeRate(ctx context.Context, exchangeRate *finance.ExchangeRate) error {
	principal, ok := access.GetPrincipal(ctx)
	if !ok {
		return errors.New("missing principal in context")
	}

	return app.financeService.CreateExchangeRate(ctx, principal, exchangeRate)
}

func (app *FinanceApp) ListExchangeRates(ctx context.Context) ([]*finance.ExchangeRate, error) {
	principal, ok := access.GetPrincipal(ctx)
	if !ok {
		return nil, errors.New("missing principal in context")
	}

	return app.financeService.ListExchangeRates(ctx, principal)
}

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

func (app *FinanceApp) CreateSetting(ctx context.Context, setting *finance.Setting) error {
	principal, ok := access.GetPrincipal(ctx)
	if !ok {
		return errors.New("missing principal in context")
	}

	return app.financeService.CreateSetting(ctx, principal, setting)
}

func (app *FinanceApp) GetSetting(ctx context.Context) (*finance.Setting, error) {
	actor, ok := access.GetPrincipal(ctx)
	if !ok {
		return nil, errors.New("missing principal in context")
	}

	return app.financeService.GetSetting(ctx, actor)
}

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
