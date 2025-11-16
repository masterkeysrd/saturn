package finance

import (
	"context"
	"time"
)

type BudgetStore interface {
	Get(context.Context, BudgetID) (*Budget, error)
	List(context.Context) ([]*Budget, error)
	Store(context.Context, *Budget) error
}

type BudgetPeriodStore interface {
	GetByDate(context.Context, BudgetID, time.Time) (*BudgetPeriod, error)
	Store(context.Context, *BudgetPeriod) error
}

type CurrencyStore interface {
	Get(context.Context, CurrencyCode) (*Currency, error)
	List(context.Context) ([]*Currency, error)
	Store(context.Context, *Currency) error
}

type TransactionStore interface {
	List(context.Context) ([]*Transaction, error)
	Store(context.Context, *Transaction) error
}

type InsightsStore interface {
	GetSpendingSeries(context.Context, SpendingSeriesFilter) ([]*SpendingSeries, error)
}
