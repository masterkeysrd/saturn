package finance

import (
	"context"
	"errors"
	"fmt"
	"time"
)

// Dependencies defines the required persistence adapters for the service.
type Dependencies struct {
	SettingsStore     SettingsStore
	BudgetStore       BudgetStore
	PeriodStore       PeriodStore
	ExchangeRateStore ExchangeRateStore
}

// Service implements the domain-level finance operations.
type Service struct {
	deps Dependencies
}

// NewService instantiates a new Service.
func NewService(deps Dependencies) *Service {
	return &Service{deps: deps}
}

// ConfigureFinance creates or updates the workspace base currency settings.
func (s *Service) ConfigureFinance(ctx context.Context, settings *FinanceSettings) (*FinanceSettings, error) {
	if err := settings.Validate(); err != nil {
		return nil, err
	}

	settings.CreateTime = time.Now().UTC()
	settings.UpdateTime = time.Now().UTC()

	existing, err := s.deps.SettingsStore.GetByID(ctx, settings.SpaceID)
	if err == nil {
		// Base currency is immutable once configured
		return existing, nil
	}

	if !errors.Is(err, ErrSettingsNotFound) {
		return nil, err
	}

	if err := s.deps.SettingsStore.Create(ctx, settings); err != nil {
		return nil, err
	}

	return settings, nil
}

// GetFinanceSettings retrieves settings for a workspace.
func (s *Service) GetFinanceSettings(ctx context.Context, spaceID SpaceID) (*FinanceSettings, error) {
	if string(spaceID) == "" {
		return nil, errors.New("space ID is required")
	}
	return s.deps.SettingsStore.GetByID(ctx, spaceID)
}

// CreateBudget creates a new budget template in a workspace.
func (s *Service) CreateBudget(ctx context.Context, budget *Budget) (*Budget, error) {
	if string(budget.ID) == "" {
		bID, err := NewBudgetID()
		if err != nil {
			return nil, err
		}
		budget.ID = bID
	}

	if err := budget.Validate(); err != nil {
		return nil, err
	}

	// Verify workspace settings exist
	_, err := s.deps.SettingsStore.GetByID(ctx, budget.SpaceID)
	if err != nil {
		return nil, fmt.Errorf("verify workspace settings: %w", err)
	}

	budget.IsActive = true
	budget.CreateTime = time.Now().UTC()
	budget.UpdateTime = time.Now().UTC()

	if err := s.deps.BudgetStore.Create(ctx, budget); err != nil {
		return nil, err
	}

	return budget, nil
}

// UpdateBudget modifies an existing budget template.
func (s *Service) UpdateBudget(ctx context.Context, budget *Budget) (*Budget, error) {
	existing, err := s.deps.BudgetStore.GetByID(ctx, budget.ID)
	if err != nil {
		return nil, err
	}

	existing.Name = budget.Name
	existing.LimitAmount = budget.LimitAmount
	existing.Currency = budget.Currency
	existing.Interval = budget.Interval
	existing.IsActive = budget.IsActive
	existing.UpdateTime = time.Now().UTC()

	if err := existing.Validate(); err != nil {
		return nil, err
	}

	if err := s.deps.BudgetStore.Update(ctx, existing); err != nil {
		return nil, err
	}

	return existing, nil
}

// DeleteBudget removes a budget.
func (s *Service) DeleteBudget(ctx context.Context, id BudgetID) error {
	if string(id) == "" {
		return errors.New("budget ID is required")
	}
	return s.deps.BudgetStore.Delete(ctx, id)
}

// ListBudgets returns the workspace's budgets.
func (s *Service) ListBudgets(ctx context.Context, spaceID SpaceID, filter *ListBudgetsFilter) ([]*Budget, string, error) {
	if string(spaceID) == "" {
		return nil, "", errors.New("space ID is required")
	}
	return s.deps.BudgetStore.ListBySpace(ctx, spaceID, filter)
}

// GetOrCreatePeriod retrieves or lazily spawns a budget period for a target date.
func (s *Service) GetOrCreatePeriod(ctx context.Context, budgetID BudgetID, date time.Time) (*BudgetPeriod, error) {
	budget, err := s.deps.BudgetStore.GetByID(ctx, budgetID)
	if err != nil {
		return nil, err
	}

	settings, err := s.deps.SettingsStore.GetByID(ctx, budget.SpaceID)
	if err != nil {
		return nil, fmt.Errorf("fetch workspace base currency settings: %w", err)
	}

	startDate, endDate := budget.CalculateBounds(date)

	// Try lookup
	period, err := s.deps.PeriodStore.GetByRange(ctx, budgetID, startDate, endDate)
	if err == nil {
		return period, nil
	}
	if !errors.Is(err, ErrPeriodNotFound) {
		return nil, err
	}

	// Determine exchange rate to base currency
	var rate float64 = 1.0
	if budget.Currency != settings.BaseCurrency {
		rateRecord, err := s.deps.ExchangeRateStore.GetRate(ctx, budget.SpaceID, budget.Currency, settings.BaseCurrency, date)
		if err != nil {
			return nil, fmt.Errorf("fetch exchange rate from %s to %s for date %s: %w", budget.Currency, settings.BaseCurrency, date.Format("2006-01-02"), err)
		}
		rate = rateRecord.Rate
	}

	periodID, err := NewPeriodID()
	if err != nil {
		return nil, err
	}

	newPeriod := &BudgetPeriod{
		ID:                 periodID,
		BudgetID:           budget.ID,
		SpaceID:            budget.SpaceID,
		StartDate:          startDate,
		EndDate:            endDate,
		LimitAmount:        budget.LimitAmount,
		Currency:           budget.Currency,
		BaseCurrency:       settings.BaseCurrency,
		ExchangeRateToBase: rate,
		CreateTime:         time.Now().UTC(),
		UpdateTime:         time.Now().UTC(),
	}

	if err := newPeriod.Validate(); err != nil {
		return nil, err
	}

	if err := s.deps.PeriodStore.Create(ctx, newPeriod); err != nil {
		return nil, err
	}

	return newPeriod, nil
}

// UpdatePeriodLimit modifies the budget limit of a specific period.
func (s *Service) UpdatePeriodLimit(ctx context.Context, id PeriodID, limit int64) error {
	if limit <= 0 {
		return errors.New("limit must be greater than zero")
	}
	return s.deps.PeriodStore.UpdateLimit(ctx, id, limit)
}

// CreateExchangeRate registers a new daily rate record.
func (s *Service) CreateExchangeRate(ctx context.Context, rate *ExchangeRate) (*ExchangeRate, error) {
	if err := rate.Validate(); err != nil {
		return nil, fmt.Errorf("validate exchange rate: %w", err)
	}
	rate.CreateTime = time.Now().UTC()

	if err := s.deps.ExchangeRateStore.Create(ctx, rate); err != nil {
		return nil, err
	}
	return rate, nil
}

// ListExchangeRates retrieves paginated rate records.
func (s *Service) ListExchangeRates(ctx context.Context, spaceID SpaceID, filter *ListExchangeRatesFilter) ([]*ExchangeRate, string, error) {
	if err := spaceID.Validate(); err != nil {
		return nil, "", fmt.Errorf("validate space ID: %w", err)
	}
	return s.deps.ExchangeRateStore.ListBySpace(ctx, spaceID, filter)
}

// DeleteExchangeRate removes a daily rate conversion rule.
func (s *Service) DeleteExchangeRate(ctx context.Context, spaceID SpaceID, fromCurrency, toCurrency Currency, rateDate time.Time) error {
	if err := spaceID.Validate(); err != nil {
		return fmt.Errorf("validate space ID: %w", err)
	}
	if err := fromCurrency.Validate(); err != nil {
		return fmt.Errorf("validate from currency: %w", err)
	}
	if err := toCurrency.Validate(); err != nil {
		return fmt.Errorf("validate to currency: %w", err)
	}
	if rateDate.IsZero() {
		return errors.New("rate date is required")
	}
	return s.deps.ExchangeRateStore.Delete(ctx, spaceID, fromCurrency, toCurrency, rateDate)
}
