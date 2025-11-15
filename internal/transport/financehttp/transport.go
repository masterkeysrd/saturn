package financehttp

import (
	"context"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
)

type FinanceService interface {
	CreateBudget(context.Context, *finance.Budget) error
	ListBudgets(context.Context) ([]*finance.Budget, error)

	CreateCurrency(context.Context, *finance.Currency) error
	ListCurrencies(context.Context) ([]*finance.Currency, error)
	GetCurrency(context.Context, finance.CurrencyCode) (*finance.Currency, error)

	CreateExpense(context.Context, *finance.Expense) (*finance.Transaction, error)
	ListTransactions(context.Context) ([]*finance.Transaction, error)
}
