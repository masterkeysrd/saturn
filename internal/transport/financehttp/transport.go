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
	UpdateExpense(context.Context, *finance.UpdateExpenseInput) (*finance.Transaction, error)
	GetTransaction(context.Context, finance.TransactionID) (*finance.Transaction, error)
	ListTransactions(context.Context) ([]*finance.Transaction, error)

	GetInsights(context.Context, *finance.GetInsightsInput) (*finance.Insights, error)
}
