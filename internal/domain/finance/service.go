package finance

import (
	"context"
	"fmt"
	"time"

	"github.com/masterkeysrd/saturn/internal/pkg/deps"
	"github.com/masterkeysrd/saturn/internal/pkg/errors"
	"github.com/masterkeysrd/saturn/internal/pkg/id"
)

type Service struct {
	budgetStore       BudgetStore
	budgetPeriodStore BudgetPeriodStore
	currencyStore     CurrencyStore
	transactionStore  TransactionStore
	insightsStore     InsightsStore
}

type ServiceParams struct {
	deps.In

	BudgetStore      BudgetStore
	BudgetPeriod     BudgetPeriodStore
	CurrencyStore    CurrencyStore
	TransactionStore TransactionStore
	InsightsStore    InsightsStore
}

func NewService(params ServiceParams) *Service {
	return &Service{
		budgetStore:       params.BudgetStore,
		budgetPeriodStore: params.BudgetPeriod,
		currencyStore:     params.CurrencyStore,
		transactionStore:  params.TransactionStore,
		insightsStore:     params.InsightsStore,
	}
}

func (s *Service) CreateExpense(ctx context.Context, exp *Expense) (*Transaction, error) {
	// Initialize and validates the budget.
	if err := exp.Initialize(); err != nil {
		return nil, fmt.Errorf("cannot initialize expense: %w", err)
	}
	if err := exp.ValidateForCreate(); err != nil {
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

func (s *Service) UpdateExpense(ctx context.Context, in *UpdateExpenseInput) (*Transaction, error) {
	if err := in.Validate(); err != nil {
		return nil, fmt.Errorf("invalid expense for update: %w", err)
	}

	// Clean and trim the input.
	in.Expense.Sanitize()

	// Validate for update with field mask
	if err := in.Expense.ValidateForUpdate(in.UpdateMask); err != nil {
		return nil, fmt.Errorf("invalid expense: %w", err)
	}

	// Get existing transaction
	existing, err := s.GetTransaction(ctx, in.ID)
	if err != nil {
		return nil, fmt.Errorf("cannot get transaction: %w", err)
	}

	if err := in.Expense.UpdateTransaction(existing, in.UpdateMask); err != nil {
		return nil, fmt.Errorf("cannot update transaction: %w", err)
	}

	if err := existing.Validate(); err != nil {
		return nil, fmt.Errorf("updated transaction is invalid: %w", err)
	}

	if err := s.transactionStore.Store(ctx, existing); err != nil {
		return nil, fmt.Errorf("cannot store transaction: %w", err)
	}

	return existing, nil
}

func (s *Service) ListTransactions(ctx context.Context) ([]*Transaction, error) {
	transactions, err := s.transactionStore.List(ctx)
	if err != nil {
		return nil, fmt.Errorf("cannot list transactions: %w", err)
	}
	return transactions, nil
}

func (s *Service) DeleteTransaction(ctx context.Context, tid TransactionID) error {
	if err := id.Validate(tid); err != nil {
		return fmt.Errorf("invalid transaction id: %s", err)
	}
	if _, err := s.transactionStore.Get(ctx, tid); err != nil {
		return fmt.Errorf("cannot get transaction: %w", err)
	}
	if err := s.transactionStore.Delete(ctx, tid); err != nil {
		return fmt.Errorf("cannot delete transaction: %s", err)
	}
	return nil
}

func (s *Service) GetTransaction(ctx context.Context, tid TransactionID) (*Transaction, error) {
	if err := id.Validate(tid); err != nil {
		return nil, fmt.Errorf("invalid id: %w", err)
	}

	transaction, err := s.transactionStore.Get(ctx, tid)
	if err != nil {
		return nil, fmt.Errorf("cannot get transaction: %w", err)
	}

	return transaction, nil
}

func (s *Service) CreateBudget(ctx context.Context, budget *Budget) error {
	// Initialize and validates the budget.
	if err := budget.Initialize(); err != nil {
		return fmt.Errorf("cannot initialize budget: %w", err)
	}

	budget.sanitize()
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

func (s *Service) UpdateBudget(ctx context.Context, in *UpdateBudgetInput) (*Budget, error) {
	if err := id.Validate(in.ID); err != nil {
		return nil, fmt.Errorf("invalid budget update input: %w", err)
	}

	budget, err := s.GetBudget(ctx, in.ID)
	if err != nil {
		return nil, fmt.Errorf("cannot get budget: %w", err)
	}

	if err := budget.Update(in.Budget, in.UpdateMask); err != nil {
		return nil, fmt.Errorf("cannot update the budget: %w", err)
	}

	budget.sanitize()
	if err := budget.Validate(); err != nil {
		return nil, fmt.Errorf("invalid budget: %w", err)
	}

	if err := s.budgetStore.Store(ctx, budget); err != nil {
		return nil, fmt.Errorf("cannot store budget: %w", err)
	}

	if !in.UpdateMask.Contains("amount") {
		return budget, nil
	}

	period, err := s.GetPeriodForDate(ctx, budget.ID, time.Now())
	if err != nil {
		return nil, fmt.Errorf("cannot get period for budget: %w", err)
	}

	currency, err := s.GetCurrency(ctx, budget.Amount.Currency)
	if err != nil {
		return nil, fmt.Errorf("cannot get currency: %w", err)
	}

	if err := budget.SyncPeriod(period, currency); err != nil {
		return nil, fmt.Errorf("cannot sync budget period: %w", err)
	}

	if err := period.Validate(); err != nil {
		return nil, fmt.Errorf("budget period is invalid: %w", err)
	}

	if err := s.budgetPeriodStore.Store(ctx, period); err != nil {
		return nil, fmt.Errorf("cannot store budget period: %w", err)
	}

	return budget, nil
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
	period, err = budget.CreatePeriod(currency, date)
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
	if err := code.Validate(); err != nil {
		return nil, errors.New("currency code is invalid")
	}

	if code == DefaultBaseCurrency {
		return &Currency{
			Code: code,
			Rate: 1,
		}, nil
	}

	currency, err := s.currencyStore.Get(ctx, code)
	if err != nil {
		return nil, fmt.Errorf("cannot get currency: %w", err)
	}

	return currency, nil
}

func (s *Service) CreateCurrency(ctx context.Context, currency *Currency) error {
	if err := currency.Initialize(); err != nil {
		return fmt.Errorf("cannot initialize currency: %w", err)
	}

	if err := currency.Validate(); err != nil {
		return fmt.Errorf("invalid currency: %w", err)
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

func (s *Service) GetInsights(ctx context.Context, in *GetInsightsInput) (*Insights, error) {
	if err := in.Validate(); err != nil {
		return nil, fmt.Errorf("invalid input: %w", err)
	}

	spendingSeries, err := s.insightsStore.GetSpendingSeries(ctx, SpendingSeriesFilter{
		StartDate: in.StartDate,
		EndState:  in.EndState,
		Budgets:   in.Budgets,
	})
	if err != nil {
		return nil, fmt.Errorf("cannot get spending series: %w", err)
	}

	spendingInsights := NewSpendingInsights()
	spendingInsights.Process(spendingSeries)

	return &Insights{
		Spending: spendingInsights,
	}, nil
}
