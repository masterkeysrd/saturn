package finance

import (
	"context"
)

type BudgetStore interface {
	List(context.Context) ([]*Budget, error)
	Store(context.Context, *Budget) error
}

type BudgetPeriodStore interface {
	Store(context.Context, *BudgetPeriod) error
}

type CurrencyStore interface {
	Get(context.Context, CurrencyCode) (*Currency, error)
	List(context.Context) ([]*Currency, error)
	Store(context.Context, *Currency) error
}
