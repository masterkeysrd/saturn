package financehttp

import (
	"context"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
)

type FinanceService interface {
	GetBudget(context.Context, finance.BudgetID) (*finance.Budget, error)
	CreateBudget(context.Context, *finance.Budget) error
	UpdateBudget(context.Context, *finance.UpdateBudgetInput) (*finance.Budget, error)
	ListBudgets(context.Context) ([]*finance.Budget, error)
	DeleteBudget(context.Context, finance.BudgetID) error

	CreateCurrency(context.Context, *finance.Currency) error
	ListCurrencies(context.Context) ([]*finance.Currency, error)
	GetCurrency(context.Context, finance.CurrencyCode) (*finance.Currency, error)

	CreateExpense(context.Context, *finance.Expense) (*finance.Transaction, error)
	UpdateExpense(context.Context, *finance.UpdateExpenseInput) (*finance.Transaction, error)
	GetTransaction(context.Context, finance.TransactionID) (*finance.Transaction, error)
	ListTransactions(context.Context) ([]*finance.Transaction, error)
	DeleteTransaction(context.Context, finance.TransactionID) error

	GetInsights(context.Context, *finance.GetInsightsInput) (*finance.Insights, error)
}

type FinanceSearchService interface {
	SearchBudgets(context.Context, *finance.BudgetSearchInput) (finance.BudgetPage, error)
	SearchTransactions(context.Context, *finance.TransactionSearchInput) (finance.TransactionPage, error)
}
