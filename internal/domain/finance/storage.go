package finance

import (
	"context"
	"time"
)

// SettingsStore defines persistence for workspace settings.
type SettingsStore interface {
	Create(ctx context.Context, settings *FinanceSettings) error
	GetByID(ctx context.Context, spaceID SpaceID) (*FinanceSettings, error)
}

// BudgetStore defines persistence for budget templates.
type BudgetStore interface {
	Create(ctx context.Context, budget *Budget) error
	GetByID(ctx context.Context, id BudgetID) (*Budget, error)
	Update(ctx context.Context, budget *Budget) error
	Delete(ctx context.Context, id BudgetID) error
	ListBySpace(ctx context.Context, spaceID SpaceID, filter *ListBudgetsFilter) ([]*Budget, string, error)
}

// PeriodStore defines persistence for budget periods.
type PeriodStore interface {
	Create(ctx context.Context, period *BudgetPeriod) error
	GetByRange(ctx context.Context, budgetID BudgetID, startDate, endDate time.Time) (*BudgetPeriod, error)
	UpdateLimit(ctx context.Context, periodID PeriodID, limitAmount int64) error
	ListByBudget(ctx context.Context, budgetID BudgetID) ([]*BudgetPeriod, error)
}

// ExchangeRateStore defines persistence for exchange rates.
type ExchangeRateStore interface {
	Create(ctx context.Context, rate *ExchangeRate) error
	// GetRate retrieves the rate from fromCurrency to toCurrency on the closest date <= rateDate.
	GetRate(ctx context.Context, spaceID SpaceID, fromCurrency, toCurrency Currency, rateDate time.Time) (*ExchangeRate, error)
	ListBySpace(ctx context.Context, spaceID SpaceID, filter *ListExchangeRatesFilter) ([]*ExchangeRate, string, error)
	Delete(ctx context.Context, spaceID SpaceID, fromCurrency, toCurrency Currency, rateDate time.Time) error
}

// ListBudgetsFilter encapsulates filtering parameters for listing budgets.
type ListBudgetsFilter struct {
	PageSize      int32
	NextPageToken string
}

// ListExchangeRatesFilter encapsulates filtering parameters for exchange rates.
type ListExchangeRatesFilter struct {
	PageSize      int32
	NextPageToken string
}
