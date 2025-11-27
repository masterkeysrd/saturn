package finance

import (
	"context"
)

type CurrencyStore interface {
	Get(context.Context, CurrencyCode) (*Currency, error)
	List(context.Context) ([]*Currency, error)
	Store(context.Context, *Currency) error
}

type InsightsStore interface {
	GetSpendingSeries(context.Context, SpendingSeriesFilter) ([]*SpendingSeries, error)
}
