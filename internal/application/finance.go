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
	CreateExchangeRate(context.Context, access.Principal, *finance.ExchangeRate) error
	CreateSetting(context.Context, access.Principal, *finance.Setting) error
	GetSetting(context.Context, access.Principal) (*finance.Setting, error)
	UpdateSetting(context.Context, access.Principal, *finance.UpdateSettingInput) (*finance.Setting, error)
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

func (app *FinanceApp) CreateExchangeRate(ctx context.Context, exchangeRate *finance.ExchangeRate) error {
	principal, ok := access.GetPrincipal(ctx)
	if !ok {
		return errors.New("missing principal in context")
	}

	return app.financeService.CreateExchangeRate(ctx, principal, exchangeRate)
}

func (app *FinanceApp) CreateSetting(ctx context.Context, setting *finance.Setting) error {
	principal, ok := access.GetPrincipal(ctx)
	if !ok {
		return errors.New("missing principal in context")
	}

	return app.financeService.CreateSetting(ctx, principal, setting)
}

func (app *FinanceApp) GetSetting(context.Context) (*finance.Setting, error) {
	return nil, errors.New("GetSetting method not implemented")
	// actor, ok := access.GetPrincipal(ctx)
	// if !ok {
	// 	return nil, errors.New("missing principal in context")
	// }
	//
	// app.financeService.GetSetting(ctx, principal)
}

func (app *FinanceApp) UpdateSetting(ctx context.Context, setting *finance.Setting, updateMask *fieldmask.FieldMask) (*finance.Setting, error) {
	return nil, errors.New("UpdateSetting method not implemented")
	// principal, ok := access.GetPrincipal(ctx)
	// if !ok {
	// 	return nil, errors.New("missing principal in context")
	// }
	//
	// return app.financeService.UpdateSetting(ctx, principal, &finance.UpdateSettingInput{
	// 	Setting:    setting,
	// 	UpdateMask: updateMask,
	// })
}
