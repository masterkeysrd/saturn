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
	ListAccounts(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListAccountsFilter) (*paging.Page[*finance.Account], error)
	GetAccount(ctx context.Context, spaceID finance.SpaceID, id finance.AccountID) (*finance.Account, error)
	GetAccounts(ctx context.Context, spaceID finance.SpaceID, ids []finance.AccountID) ([]*finance.Account, error)

	// Settings & Exchange Rates
	GetFinanceSettings(ctx context.Context, spaceID finance.SpaceID) (*finance.FinanceSettings, error)
	GetLatestRates(ctx context.Context, spaceID finance.SpaceID, fromCurrencies []finance.Currency, toCurrency finance.Currency) ([]*finance.ExchangeRate, error)
	ListExchangeRates(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListExchangeRatesFilter) ([]*finance.ExchangeRate, string, error)
	GetExchangeRateByID(ctx context.Context, spaceID finance.SpaceID, id string) (*finance.ExchangeRate, error)

	// Institutions
	GetInstitutionsByIDs(ctx context.Context, spaceID finance.SpaceID, ids []finance.InstitutionID) ([]*finance.Institution, error)
	ListInstitutions(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListInstitutionsFilter) (*paging.Page[*finance.Institution], error)

	// Borrowings
	ListBorrowings(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListBorrowingsFilter) ([]*finance.Borrowing, string, error)
	GetBorrowing(ctx context.Context, spaceID finance.SpaceID, id finance.BorrowingID) (*finance.Borrowing, error)

	// Budgets
	ListBudgets(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListBudgetsFilter) (*paging.Page[*finance.Budget], error)
	GetBudget(ctx context.Context, spaceID finance.SpaceID, id finance.BudgetID) (*finance.Budget, error)
	GetBudgets(ctx context.Context, spaceID finance.SpaceID, ids []finance.BudgetID) ([]*finance.Budget, error)
	GetOrCreatePeriods(ctx context.Context, budgets []*finance.Budget, date time.Time) (map[finance.BudgetID]*finance.BudgetPeriod, error)
	AggregateSpentBatch(ctx context.Context, periodIDs []finance.PeriodID) ([]finance.PeriodSpent, error)

	// Recurring & Scheduled Transactions
	ListRecurringTransactions(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListRecurringTransactionsFilter) (*paging.Page[*finance.RecurringTransaction], error)
	GetRecurringTransactions(ctx context.Context, spaceID finance.SpaceID, ids []finance.RecurringTransactionID) ([]*finance.RecurringTransaction, error)
	ListScheduledTransactions(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListScheduledTransactionsFilter) (*paging.Page[*finance.ScheduledTransaction], error)

	// Transactions
	GetTransaction(ctx context.Context, spaceID finance.SpaceID, id finance.TransactionID) (*finance.Transaction, error)
	ListTransactions(ctx context.Context, spaceID finance.SpaceID, filter *finance.TransactionFilter) (*paging.Page[*finance.Transaction], error)

	// Statements
	GetStatement(ctx context.Context, spaceID finance.SpaceID, id finance.StatementID) (*finance.Statement, error)
	ListStatements(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListStatementsFilter) (*paging.Page[*finance.Statement], error)
	ListStatementLines(ctx context.Context, spaceID finance.SpaceID, statementID finance.StatementID) ([]*finance.StatementLine, error)

	// Inbox
	ListInboxItems(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListInboxItemsFilter) (*paging.Page[*finance.InboxItem], error)
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
