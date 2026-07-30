package finance

import (
	"context"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/paging"
	"github.com/masterkeysrd/saturn/internal/platform/sorting"
)

// SettingsStore defines persistence for workspace settings.
type SettingsStore interface {
	Create(ctx context.Context, settings *FinanceSettings) error
	GetByID(ctx context.Context, spaceID SpaceID) (*FinanceSettings, error)
}

// DeleteOptions defines optional parameters for entity deletion (e.g. optimistic lock version checks).
type DeleteOptions struct {
	Version int64
}

// BudgetStore defines persistence for budget templates.
type BudgetStore interface {
	Create(ctx context.Context, budget *Budget) error
	GetByID(ctx context.Context, spaceID SpaceID, id BudgetID) (*Budget, error)
	GetByIDs(ctx context.Context, spaceID SpaceID, ids []BudgetID) ([]*Budget, error)
	Update(ctx context.Context, budget *Budget) error
	Delete(ctx context.Context, spaceID SpaceID, id BudgetID, opts DeleteOptions) error
	ListBySpace(ctx context.Context, spaceID SpaceID, filter *ListBudgetsFilter) (*paging.Page[*Budget], error)
}

type PeriodRangeKey struct {
	BudgetID  BudgetID
	StartDate time.Time
	EndDate   time.Time
}

// PeriodStore defines persistence for budget periods.
type PeriodStore interface {
	Create(ctx context.Context, period *BudgetPeriod) error
	GetByRange(ctx context.Context, budgetID BudgetID, startDate, endDate time.Time) (*BudgetPeriod, error)
	GetByRanges(ctx context.Context, keys []PeriodRangeKey) ([]*BudgetPeriod, error)
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
	Update(ctx context.Context, rate *ExchangeRate) error
	// GetRate retrieves the rate from fromCurrency to toCurrency on the closest date <= rateDate.
	GetRate(ctx context.Context, key ExchangeRateKey) (*ExchangeRate, error)
	// GetExactRate retrieves the exact rate for the given key on rateDate.
	GetExactRate(ctx context.Context, key ExchangeRateKey) (*ExchangeRate, error)
	// GetNextRate retrieves the rate from fromCurrency to toCurrency on the closest date > rateDate.
	GetNextRate(ctx context.Context, key ExchangeRateKey) (*ExchangeRate, error)
	ListBySpace(ctx context.Context, spaceID SpaceID, filter *ListExchangeRatesFilter) ([]*ExchangeRate, string, error)
	GetLatestRates(ctx context.Context, spaceID SpaceID, fromCurrencies []Currency, toCurrency Currency) ([]*ExchangeRate, error)
	Delete(ctx context.Context, key ExchangeRateKey) error
}

type PeriodSpent struct {
	PeriodID    PeriodID
	SpentInBase int64
	SpentAmount int64
}

// TransactionStore defines persistence for transactions.
type TransactionStore interface {
	Create(ctx context.Context, txn *Transaction) error
	GetByID(ctx context.Context, spaceID SpaceID, id TransactionID) (*Transaction, error)
	Delete(ctx context.Context, id TransactionID) error
	Update(ctx context.Context, txn *Transaction) error
	ListBySpace(ctx context.Context, spaceID SpaceID, filter *TransactionFilter) (*paging.Page[*Transaction], error)
	HasTransactions(ctx context.Context, spaceID SpaceID, filter *TransactionFilter) (bool, error)
	AggregateSpent(ctx context.Context, periodID PeriodID, budgetCurrency Currency, exchangeRateToBase float64) (spentInBase int64, spentAmount int64, err error)
	AggregateSpentBatch(ctx context.Context, periodIDs []PeriodID) ([]PeriodSpent, error)
}

// TransactionEventStore defines persistence for transaction events.
type TransactionEventStore interface {
	Create(ctx context.Context, event *TransactionEvent) error
	ListByTransaction(ctx context.Context, spaceID SpaceID, txnID TransactionID) ([]*TransactionEvent, error)
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
	ActiveOnly    *bool
	SearchQuery   *string
	Sort          sorting.SortOrder
}

// ListAccountsFilter encapsulates filtering parameters for listing accounts.
type ListAccountsFilter struct {
	PageSize      int32
	NextPageToken string
	ActiveOnly    *bool
	SearchQuery   *string
	Sort          sorting.SortOrder
}

// ListExchangeRatesFilter encapsulates filtering parameters for exchange rates.
type ListExchangeRatesFilter struct {
	PageSize      int32
	NextPageToken string
	FromCurrency  *Currency
	ToCurrency    *Currency
	StartDate     *time.Time
	EndDate       *time.Time
	Sort          sorting.SortOrder
}

// TransactionFilter encapsulates filtering parameters for transactions.
type TransactionFilter struct {
	BudgetID      *BudgetID
	Type          *TransactionType
	SourceType    *string
	SourceID      *string
	AccountID     *AccountID
	TransferID    *TransferID
	PageSize      int32
	NextPageToken string
	Sort          sorting.SortOrder

	// Deduplication / search filters
	MinAmount   *int64
	MaxAmount   *int64
	StartDate   *time.Time
	EndDate     *time.Time
	SearchQuery *string
}

// RecurringExpenseStore defines persistence for recurring expense templates.
type RecurringExpenseStore interface {
	Create(ctx context.Context, expense *RecurringExpense) error
	GetByID(ctx context.Context, spaceID SpaceID, id RecurringExpenseID) (*RecurringExpense, error)
	GetByIDs(ctx context.Context, spaceID SpaceID, ids []RecurringExpenseID) ([]*RecurringExpense, error)
	Update(ctx context.Context, expense *RecurringExpense) error
	Delete(ctx context.Context, id RecurringExpenseID) error
	ListBySpace(ctx context.Context, spaceID SpaceID, filter *ListRecurringExpensesFilter) (*paging.Page[*RecurringExpense], error)
	ListPendingGeneration(ctx context.Context, maxDueDate time.Time) ([]*RecurringExpense, error)
}

// ScheduledPaymentStore defines persistence for scheduled payment instances.
type ScheduledPaymentStore interface {
	Create(ctx context.Context, payment *ScheduledPayment) error
	GetByID(ctx context.Context, spaceID SpaceID, id ScheduledPaymentID) (*ScheduledPayment, error)
	UpdateStatus(ctx context.Context, id ScheduledPaymentID, status ScheduledPaymentStatus) error
	Delete(ctx context.Context, id ScheduledPaymentID) error
	ListBySpace(ctx context.Context, spaceID SpaceID, filter *ListScheduledPaymentsFilter) (*paging.Page[*ScheduledPayment], error)
	HasScheduledPayments(ctx context.Context, spaceID SpaceID, filter *ListScheduledPaymentsFilter) (bool, error)
}

// ListRecurringExpensesFilter encapsulates filtering parameters for recurring expenses.
type ListRecurringExpensesFilter struct {
	Status        *RecurringExpenseStatus
	PageSize      int32
	NextPageToken string
	SearchQuery   *string
	Sort          sorting.SortOrder
}

// ListScheduledPaymentsFilter encapsulates filtering parameters for scheduled payments.
type ListScheduledPaymentsFilter struct {
	BudgetID      *BudgetID
	Status        *ScheduledPaymentStatus
	StartDate     *time.Time
	EndDate       *time.Time
	PageSize      int32
	NextPageToken string
	SearchQuery   *string
	Sort          sorting.SortOrder
}

// BorrowingStore defines persistence for personal borrowing/lending agreements.
type BorrowingStore interface {
	Create(ctx context.Context, b *Borrowing) error
	GetByID(ctx context.Context, spaceID SpaceID, id BorrowingID) (*Borrowing, error)
	Update(ctx context.Context, b *Borrowing) error
	Delete(ctx context.Context, id BorrowingID) error
	ListBySpace(ctx context.Context, spaceID SpaceID, filter *ListBorrowingsFilter) ([]*Borrowing, string, error)
}

// BorrowingRepaymentStore defines persistence for repayments.
type BorrowingRepaymentStore interface {
	Create(ctx context.Context, r *BorrowingRepayment) error
	GetByID(ctx context.Context, spaceID SpaceID, id BorrowingRepaymentID) (*BorrowingRepayment, error)
	Delete(ctx context.Context, id BorrowingRepaymentID) error
	ListByBorrowing(ctx context.Context, spaceID SpaceID, borrowingID BorrowingID) ([]*BorrowingRepayment, error)
}

// AccountStore defines persistence for physical or digital payment accounts.
type AccountStore interface {
	Create(ctx context.Context, account *Account) error
	GetByID(ctx context.Context, spaceID SpaceID, id AccountID) (*Account, error)
	GetByIDs(ctx context.Context, spaceID SpaceID, ids []AccountID) ([]*Account, error)
	Update(ctx context.Context, account *Account) error
	Delete(ctx context.Context, id AccountID) error
	ListBySpace(ctx context.Context, spaceID SpaceID, filter *ListAccountsFilter) (*paging.Page[*Account], error)
	HasDefault(ctx context.Context, spaceID SpaceID) (bool, error)
	UnsetDefaultsExcept(ctx context.Context, spaceID SpaceID, id AccountID) error
	HasAny(ctx context.Context, spaceID SpaceID) (bool, error)
}

// TransferStore defines persistence for parent transfer logs.
type TransferStore interface {
	Create(ctx context.Context, transfer *Transfer) error
	GetByID(ctx context.Context, spaceID SpaceID, id TransferID) (*Transfer, error)
	Delete(ctx context.Context, id TransferID) error
	ListBySpace(ctx context.Context, spaceID SpaceID, limit int32, pageToken string) ([]*Transfer, string, error)
}

type ListInboxItemsFilter struct {
	PageSize       int32
	NextPageToken  string
	SearchQuery    *string
	Status         *InboxItemStatus
	DocType        *InboxItemDocType
	Sort           sorting.SortOrder
	ExcludePayload bool
}

// InboxItemStore defines repository operations for staged inbox items.
type InboxItemStore interface {
	Insert(ctx context.Context, item *InboxItem) error
	Get(ctx context.Context, spaceID, id string) (*InboxItem, error)
	ListBySpace(ctx context.Context, spaceID string, filter *ListInboxItemsFilter) (*paging.Page[*InboxItem], error)
	Update(ctx context.Context, item *InboxItem) error
	Delete(ctx context.Context, spaceID, id string) error
}
