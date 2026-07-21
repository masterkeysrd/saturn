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

type ExchangeRateKey struct {
	SpaceID      SpaceID
	FromCurrency Currency
	ToCurrency   Currency
	RateDate     time.Time
}

// ExchangeRateStore defines persistence for exchange rates.
type ExchangeRateStore interface {
	Create(ctx context.Context, rate *ExchangeRate) error
	// GetRate retrieves the rate from fromCurrency to toCurrency on the closest date <= rateDate.
	GetRate(ctx context.Context, key ExchangeRateKey) (*ExchangeRate, error)
	ListBySpace(ctx context.Context, spaceID SpaceID, filter *ListExchangeRatesFilter) ([]*ExchangeRate, string, error)
	Delete(ctx context.Context, key ExchangeRateKey) error
}

// TransactionStore defines persistence for transactions.
type TransactionStore interface {
	Create(ctx context.Context, txn *Transaction) error
	GetByID(ctx context.Context, id TransactionID) (*Transaction, error)
	Delete(ctx context.Context, id TransactionID) error
	Update(ctx context.Context, txn *Transaction) error
	ListBySpace(ctx context.Context, spaceID SpaceID, filter *ListTransactionsFilter) ([]*Transaction, string, error)
	AggregateSpent(ctx context.Context, periodID PeriodID, budgetCurrency Currency, exchangeRateToBase float64) (spentInBase int64, spentAmount int64, err error)
}

// InsightsStore defines persistence for read-only aggregation queries.
type InsightsStore interface {
	GetSpentTrend(ctx context.Context, filter *SpentTrendFilter) ([]*SpentTrend, error)
	GetBudgetDistribution(ctx context.Context, filter *BudgetDistributionFilter) ([]*BudgetDistribution, error)
	GetTopExpenses(ctx context.Context, filter *TopExpensesFilter) ([]*TopExpense, error)
}

type SpentTrendFilter struct {
	SpaceID     SpaceID
	Granularity Granularity
	StartDate   time.Time
	EndDate     time.Time
}

type BudgetDistributionFilter struct {
	SpaceID   SpaceID
	StartDate time.Time
	EndDate   time.Time
}

type TopExpensesFilter struct {
	SpaceID   SpaceID
	StartDate time.Time
	EndDate   time.Time
	Limit     int
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

// ListTransactionsFilter encapsulates filtering parameters for transactions.
type ListTransactionsFilter struct {
	BudgetID      *BudgetID
	Type          *TransactionType
	SourceType    *string
	SourceID      *string
	PageSize      int32
	NextPageToken string
}

// RecurringExpenseStore defines persistence for recurring expense templates.
type RecurringExpenseStore interface {
	Create(ctx context.Context, expense *RecurringExpense) error
	GetByID(ctx context.Context, id RecurringExpenseID) (*RecurringExpense, error)
	Update(ctx context.Context, expense *RecurringExpense) error
	Delete(ctx context.Context, id RecurringExpenseID) error
	ListBySpace(ctx context.Context, spaceID SpaceID, filter *ListRecurringExpensesFilter) ([]*RecurringExpense, string, error)
	ListPendingGeneration(ctx context.Context, maxDueDate time.Time) ([]*RecurringExpense, error)
}

// ScheduledPaymentStore defines persistence for scheduled payment instances.
type ScheduledPaymentStore interface {
	Create(ctx context.Context, payment *ScheduledPayment) error
	GetByID(ctx context.Context, id ScheduledPaymentID) (*ScheduledPayment, error)
	UpdateStatus(ctx context.Context, id ScheduledPaymentID, status ScheduledPaymentStatus) error
	Delete(ctx context.Context, id ScheduledPaymentID) error
	ListBySpace(ctx context.Context, spaceID SpaceID, filter *ListScheduledPaymentsFilter) ([]*ScheduledPayment, string, error)
}

// ListRecurringExpensesFilter encapsulates filtering parameters for recurring expenses.
type ListRecurringExpensesFilter struct {
	Status        *RecurringExpenseStatus
	PageSize      int32
	NextPageToken string
}

// ListScheduledPaymentsFilter encapsulates filtering parameters for scheduled payments.
type ListScheduledPaymentsFilter struct {
	Status        *ScheduledPaymentStatus
	StartDate     *time.Time
	EndDate       *time.Time
	PageSize      int32
	NextPageToken string
}

// BorrowingStore defines persistence for personal borrowing/lending agreements.
type BorrowingStore interface {
	Create(ctx context.Context, b *Borrowing) error
	GetByID(ctx context.Context, id BorrowingID) (*Borrowing, error)
	Update(ctx context.Context, b *Borrowing) error
	Delete(ctx context.Context, id BorrowingID) error
	ListBySpace(ctx context.Context, spaceID SpaceID, filter *ListBorrowingsFilter) ([]*Borrowing, string, error)
}

// BorrowingRepaymentStore defines persistence for repayments.
type BorrowingRepaymentStore interface {
	Create(ctx context.Context, r *BorrowingRepayment) error
	GetByID(ctx context.Context, id BorrowingRepaymentID) (*BorrowingRepayment, error)
	Delete(ctx context.Context, id BorrowingRepaymentID) error
	ListByBorrowing(ctx context.Context, spaceID SpaceID, borrowingID BorrowingID) ([]*BorrowingRepayment, error)
}
