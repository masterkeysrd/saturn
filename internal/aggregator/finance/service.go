package financeaggregator

import (
	"context"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
)

//go:generate go run github.com/masterkeysrd/saturn/tools/mockgen .

// FinanceService defines the decoupled domain operations required by the finance aggregator.
// @Mock
type FinanceService interface {
	// Accounts
	ListAccounts(ctx context.Context, rCtx finance.Context, filter *finance.ListAccountsFilter) (*paging.Page[*finance.Account], error)
	GetAccount(ctx context.Context, rCtx finance.Context, id finance.AccountID) (*finance.Account, error)
	GetAccounts(ctx context.Context, rCtx finance.Context, ids []finance.AccountID) ([]*finance.Account, error)

	// Settings & Exchange Rates
	GetFinanceSettings(ctx context.Context, rCtx finance.Context) (*finance.FinanceSettings, error)
	GetLatestRates(ctx context.Context, rCtx finance.Context, fromCurrencies []finance.Currency, toCurrency finance.Currency) ([]*finance.ExchangeRate, error)
	ListExchangeRates(ctx context.Context, rCtx finance.Context, filter *finance.ListExchangeRatesFilter) ([]*finance.ExchangeRate, string, error)
	GetExchangeRateByID(ctx context.Context, rCtx finance.Context, id string) (*finance.ExchangeRate, error)

	// Institutions
	GetInstitutionsByIDs(ctx context.Context, rCtx finance.Context, ids []finance.InstitutionID) ([]*finance.Institution, error)
	ListInstitutions(ctx context.Context, rCtx finance.Context, filter *finance.ListInstitutionsFilter) (*paging.Page[*finance.Institution], error)

	// Borrowings
	ListBorrowings(ctx context.Context, rCtx finance.Context, filter *finance.ListBorrowingsFilter) ([]*finance.Borrowing, string, error)
	GetBorrowing(ctx context.Context, rCtx finance.Context, id finance.BorrowingID) (*finance.Borrowing, error)

	// Budgets
	ListBudgets(ctx context.Context, rCtx finance.Context, filter *finance.ListBudgetsFilter) (*paging.Page[*finance.Budget], error)
	GetBudget(ctx context.Context, rCtx finance.Context, id finance.BudgetID) (*finance.Budget, error)
	GetBudgets(ctx context.Context, rCtx finance.Context, ids []finance.BudgetID) ([]*finance.Budget, error)
	GetOrCreatePeriods(ctx context.Context, rCtx finance.Context, budgets []*finance.Budget, date time.Time) (map[finance.BudgetID]*finance.BudgetPeriod, error)
	AggregateSpentBatch(ctx context.Context, rCtx finance.Context, periodIDs []finance.PeriodID) ([]finance.PeriodSpent, error)

	// Recurring & Scheduled Transactions
	ListRecurringTransactions(ctx context.Context, rCtx finance.Context, filter *finance.ListRecurringTransactionsFilter) (*paging.Page[*finance.RecurringTransaction], error)
	GetRecurringTransactions(ctx context.Context, rCtx finance.Context, ids []finance.RecurringTransactionID) ([]*finance.RecurringTransaction, error)
	ListScheduledTransactions(ctx context.Context, rCtx finance.Context, filter *finance.ListScheduledTransactionsFilter) (*paging.Page[*finance.ScheduledTransaction], error)

	// Transactions
	GetTransaction(ctx context.Context, rCtx finance.Context, id finance.TransactionID) (*finance.Transaction, error)
	ListTransactions(ctx context.Context, rCtx finance.Context, filter *finance.TransactionFilter) (*paging.Page[*finance.Transaction], error)

	// Statements
	GetStatement(ctx context.Context, rCtx finance.Context, id finance.StatementID) (*finance.Statement, error)
	ListStatements(ctx context.Context, rCtx finance.Context, filter *finance.ListStatementsFilter) (*paging.Page[*finance.Statement], error)
	ListStatementLines(ctx context.Context, rCtx finance.Context, statementID finance.StatementID) ([]*finance.StatementLine, error)

	// Inbox
	ListInboxItems(ctx context.Context, rCtx finance.Context, filter *finance.ListInboxItemsFilter) (*paging.Page[*finance.InboxItem], error)
}

// Service coordinates data fetching across multiple domain operations for aggregated queries.
type Service struct {
	financeService FinanceService
}

// NewService instantiates a new Service with a decoupled FinanceService dependency.
func NewService(fs FinanceService) *Service {
	return &Service{
		financeService: fs,
	}
}
