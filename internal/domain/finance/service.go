package finance

import (
	"context"
	"fmt"
	"time"

	"github.com/masterkeysrd/saturn/internal/pkg/deps"
	"github.com/masterkeysrd/saturn/internal/pkg/errors"
)

type Service struct {
	budgetStore       BudgetStore
	budgetPeriodStore BudgetPeriodStore
	currencyStore     CurrencyStore
	transactionStore  TransactionStore
}

type ServiceParams struct {
	deps.In

	BudgetStore      BudgetStore
	BudgetPeriod     BudgetPeriodStore
	CurrencyStore    CurrencyStore
	TransactionStore TransactionStore
}

func NewService(params ServiceParams) *Service {
	return &Service{
		budgetStore:       params.BudgetStore,
		budgetPeriodStore: params.BudgetPeriod,
		currencyStore:     params.CurrencyStore,
		transactionStore:  params.TransactionStore,
	}
}

func (s *Service) CreateExpense(ctx context.Context, exp *Expense) (*Transaction, error) {
	// Initialize and validates the budget.
	if err := exp.Initialize(); err != nil {
		return nil, fmt.Errorf("cannot initialize expense: %w", err)
	}
	if err := exp.Validate(); err != nil {
		return nil, fmt.Errorf("invalid expense: %w", err)
	}

	budgetPeriod, err := s.GetPeriodForDate(ctx, exp.BudgetID, exp.Date)
	if err != nil {
		return nil, fmt.Errorf("cannot get period for budget: %w", err)
	}

	// If the user does not set a rate in the expense, the
	// rate from the currency will be used.
	var rate float64
	if exp.ExchangeRate != nil {
		rate = *exp.ExchangeRate
	}

	// If the rate, is zero means that was not provided by the user,
	// look up the currency table to get the rate.
	if rate == 0 {
		currency, err := s.GetCurrency(ctx, budgetPeriod.Amount.Currency)
		if err != nil {
			return nil, fmt.Errorf("cannot get currency: %w", err)
		}
		rate = currency.Rate
	}

	transaction, err := exp.Transaction(&Currency{
		Code: budgetPeriod.Amount.Currency,
		Rate: rate,
	})
	if err != nil {
		return nil, fmt.Errorf("cannot create transaction: %w", err)
	}

	if err := transaction.Validate(); err != nil {
		return nil, fmt.Errorf("generated transaction is invalid: %w", err)
	}

	if err := s.transactionStore.Store(ctx, transaction); err != nil {
		return nil, fmt.Errorf("cannot store transaction: %w", err)
	}

	return transaction, nil
}

func (s *Service) ListTransactions(ctx context.Context) ([]*Transaction, error) {
	transactions, err := s.transactionStore.List(ctx)
	if err != nil {
		return nil, fmt.Errorf("cannot list transactions: %w", err)
	}
	return transactions, nil
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

func (s *Service) GetPeriodForDate(ctx context.Context, budgetID BudgetID, date time.Time) (*BudgetPeriod, error) {
	// Validate data
	budget, err := s.GetBudget(ctx, budgetID)
	if err != nil {
		return nil, fmt.Errorf("cannot get budget: %w", err)
	}

	period, err := s.budgetPeriodStore.GetByDate(ctx, budgetID, date)
	if err != nil && !errors.IsNotExists(err) {
		return nil, fmt.Errorf("cannot get budget period: %w", err)
	}

	if period != nil {
		return period, nil
	}

	// Get the currency for the period.
	currency, err := s.GetCurrency(ctx, budget.Amount.Currency)
	if err != nil {
		return nil, fmt.Errorf("cannot get currency: %w", err)
	}

	// Create the period for the date.
	period, err = budget.CreatePeriod(currency, time.Now())
	if err != nil {
		return nil, fmt.Errorf("cannot create period: %w", err)
	}

	if err := period.Validate(); err != nil {
		return nil, fmt.Errorf("budget period is invalid: %w", err)
	}

	if err := s.budgetPeriodStore.Store(ctx, period); err != nil {
		return nil, fmt.Errorf("cannot store budget period: %w", err)
	}

	return period, nil
}

func (s *Service) GetBudget(ctx context.Context, id BudgetID) (*Budget, error) {
	budget, err := s.budgetStore.Get(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("cannot get budget: %w", err)
	}

	return budget, nil
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
