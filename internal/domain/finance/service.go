package finance

import (
	"context"
	"fmt"
	"time"

	"github.com/masterkeysrd/saturn/internal/pkg/deps"
)

type Service struct {
	budgetStore       BudgetStore
	budgetPeriodStore BudgetPeriodStore
	currencyStore     CurrencyStore
}

type ServiceParams struct {
	deps.In

	BudgetStore   BudgetStore
	BudgetPeriod  BudgetPeriodStore
	CurrencyStore CurrencyStore
}

func NewService(params ServiceParams) *Service {
	return &Service{
		budgetStore:       params.BudgetStore,
		budgetPeriodStore: params.BudgetPeriod,
		currencyStore:     params.CurrencyStore,
	}
}

func (s *Service) CreateBudget(ctx context.Context, budget *Budget) error {
	// Initialize and validates the budget.
	if err := budget.Create(); err != nil {
		return fmt.Errorf("cannot initialize budget: %w", err)
	}
	if err := budget.Validate(); err != nil {
		return fmt.Errorf("invalid budget: %w", err)
	}

	// Get the currency for the period.
	currency, err := s.GetCurrency(ctx, budget.Amount.Currency)
	if err != nil {
		return fmt.Errorf("cannot get currency: %w", err)
	}

	if err := s.budgetStore.Store(ctx, budget); err != nil {
		return fmt.Errorf("cannot store budget: %w", err)
	}

	// Create the first period for the budget.
	period, err := budget.CreatePeriod(currency, time.Now())
	if err != nil {
		return fmt.Errorf("cannot create period: %w", err)
	}

	if err := period.Validate(); err != nil {
		return fmt.Errorf("budget period is invalid: %w", err)
	}

	if err := s.budgetPeriodStore.Store(ctx, period); err != nil {
		return fmt.Errorf("cannot store budget period: %w", err)
	}

	return nil
}

func (s *Service) ListBudgets(ctx context.Context) ([]*Budget, error) {
	budgets, err := s.budgetStore.List(ctx)
	if err != nil {
		return nil, fmt.Errorf("cannot list budgets: %s", err)
	}

	return budgets, nil
}

func (s *Service) GetCurrency(ctx context.Context, code CurrencyCode) (*Currency, error) {
	currency, err := s.currencyStore.Get(ctx, code)
	if err != nil {
		return nil, fmt.Errorf("cannot get currency: %w", err)
	}

	return currency, nil
}

func (s *Service) CreateCurrency(ctx context.Context, currency *Currency) error {
	if err := currency.Create(); err != nil {
		return fmt.Errorf("cannot initialize currency: %w", err)
	}

	if err := s.currencyStore.Store(ctx, currency); err != nil {
		return fmt.Errorf("cannot store currency: %w", err)
	}

	return nil
}

func (s *Service) ListCurrencies(ctx context.Context) ([]*Currency, error) {
	currencies, err := s.currencyStore.List(ctx)
	if err != nil {
		return nil, fmt.Errorf("cannot list currencies: %w", err)
	}
	return currencies, nil
}
