package financeapp

import (
	"context"
	"sync"
	"time"

	agentapp "github.com/masterkeysrd/saturn/internal/application/agent"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
	"github.com/masterkeysrd/saturn/internal/platform/settings"
)

//go:generate go run github.com/masterkeysrd/saturn/tools/mockgen .

// SpaceService defines the decoupled interface for workspace accessibility check and settings.
// @Mock
type SpaceService interface {
	GetSpace(ctx context.Context, session space.Session) (*space.Space, error)
	GetSettings(ctx context.Context, session space.Session) (*settings.Entry[space.Settings], error)
}

// FinanceService defines the interface for underlying finance domain rules.
// @Mock
type FinanceService interface {
	ConfigureFinance(ctx context.Context, rCtx finance.Context, settings *finance.FinanceSettings) (*finance.FinanceSettings, error)
	GetFinanceSettings(ctx context.Context, rCtx finance.Context) (*finance.FinanceSettings, error)
	CreateBudget(ctx context.Context, rCtx finance.Context, budget *finance.Budget) (*finance.Budget, error)
	UpdateBudget(ctx context.Context, rCtx finance.Context, budget *finance.Budget, mask []string) (*finance.Budget, error)
	DeleteBudget(ctx context.Context, rCtx finance.Context, id finance.BudgetID, opts finance.DeleteOptions) error
	ListBudgets(ctx context.Context, rCtx finance.Context, filter *finance.ListBudgetsFilter) (*paging.Page[*finance.Budget], error)
	GetBudget(ctx context.Context, rCtx finance.Context, id finance.BudgetID) (*finance.Budget, error)
	GetOrCreatePeriod(ctx context.Context, rCtx finance.Context, budgetID finance.BudgetID, date time.Time) (*finance.BudgetPeriod, error)
	UpdatePeriodLimit(ctx context.Context, rCtx finance.Context, id finance.PeriodID, limit int64) error
	CreateExchangeRate(ctx context.Context, rCtx finance.Context, rate *finance.ExchangeRate) (*finance.ExchangeRate, error)
	GetExchangeRateByID(ctx context.Context, rCtx finance.Context, id string) (*finance.ExchangeRate, error)
	UpdateExchangeRate(ctx context.Context, rCtx finance.Context, id string, rate *finance.ExchangeRate) (*finance.ExchangeRate, error)
	ListExchangeRates(ctx context.Context, rCtx finance.Context, filter *finance.ListExchangeRatesFilter) ([]*finance.ExchangeRate, string, error)
	DeleteExchangeRateByID(ctx context.Context, rCtx finance.Context, id string) error
	CreateExpense(ctx context.Context, rCtx finance.Context, txn *finance.Transaction) (*finance.Transaction, error)
	CreateIncome(ctx context.Context, rCtx finance.Context, txn *finance.Transaction) (*finance.Transaction, error)
	GetTransaction(ctx context.Context, rCtx finance.Context, id finance.TransactionID) (*finance.Transaction, error)
	UpdateExpense(ctx context.Context, rCtx finance.Context, txn *finance.Transaction) (*finance.Transaction, error)
	UpdateIncome(ctx context.Context, rCtx finance.Context, txn *finance.Transaction) (*finance.Transaction, error)
	DeleteTransaction(ctx context.Context, rCtx finance.Context, id finance.TransactionID) error
	ListTransactions(ctx context.Context, rCtx finance.Context, filter *finance.TransactionFilter) (*paging.Page[*finance.Transaction], error)
	ListTransactionEvents(ctx context.Context, rCtx finance.Context, txnID finance.TransactionID) ([]*finance.TransactionEvent, error)
	GetSpentInsights(ctx context.Context, rCtx finance.Context, req *finance.GetSpentInsightsRequest) (*finance.SpentInsights, error)
	GetIncomeInsights(ctx context.Context, rCtx finance.Context, req *finance.GetSpentInsightsRequest) (*finance.IncomeInsights, error)

	CreateRecurringTransaction(ctx context.Context, rCtx finance.Context, transaction *finance.RecurringTransaction) (*finance.RecurringTransaction, error)
	GetRecurringTransaction(ctx context.Context, rCtx finance.Context, id finance.RecurringTransactionID) (*finance.RecurringTransaction, error)
	UpdateRecurringTransaction(ctx context.Context, rCtx finance.Context, transaction *finance.RecurringTransaction, mask []string) (*finance.RecurringTransaction, error)
	DeleteRecurringTransaction(ctx context.Context, rCtx finance.Context, id finance.RecurringTransactionID, opts finance.DeleteOptions) error
	ListRecurringTransactions(ctx context.Context, rCtx finance.Context, filter *finance.ListRecurringTransactionsFilter) (*paging.Page[*finance.RecurringTransaction], error)
	ListScheduledTransactions(ctx context.Context, rCtx finance.Context, filter *finance.ListScheduledTransactionsFilter) (*paging.Page[*finance.ScheduledTransaction], error)
	GetScheduledTransaction(ctx context.Context, rCtx finance.Context, id finance.ScheduledTransactionID) (*finance.ScheduledTransaction, error)
	ConfirmScheduledTransaction(ctx context.Context, rCtx finance.Context, req finance.ConfirmScheduledTransactionRequest) (*finance.Transaction, error)
	MatchScheduledTransaction(ctx context.Context, rCtx finance.Context, req finance.MatchScheduledTransactionRequest) (*finance.Transaction, error)
	SkipScheduledTransaction(ctx context.Context, rCtx finance.Context, id finance.ScheduledTransactionID) (*finance.ScheduledTransaction, error)
	GenerateScheduledTransactions(ctx context.Context) error

	CreateBorrowing(ctx context.Context, rCtx finance.Context, b *finance.Borrowing, createAsTransaction bool) (*finance.Borrowing, error)
	GetBorrowing(ctx context.Context, rCtx finance.Context, id finance.BorrowingID) (*finance.Borrowing, error)
	ListBorrowings(ctx context.Context, rCtx finance.Context, filter *finance.ListBorrowingsFilter) ([]*finance.Borrowing, string, error)
	UpdateBorrowing(ctx context.Context, rCtx finance.Context, b *finance.Borrowing, mask []string) (*finance.Borrowing, error)
	DeleteBorrowing(ctx context.Context, rCtx finance.Context, id finance.BorrowingID) error
	LogBorrowingTransaction(ctx context.Context, rCtx finance.Context, req finance.LogBorrowingTransactionRequest) (*finance.Transaction, error)
	UpdateBorrowingTransaction(ctx context.Context, rCtx finance.Context, req finance.UpdateBorrowingTransactionRequest) (*finance.Transaction, error)
	DeleteBorrowingTransaction(ctx context.Context, rCtx finance.Context, req finance.DeleteBorrowingTransactionRequest) error
	AdjustBorrowingBalance(ctx context.Context, rCtx finance.Context, req finance.AdjustBorrowingBalanceRequest) (*finance.Borrowing, error)
	ListCurrencies(ctx context.Context) ([]finance.CurrencyInfo, error)

	CreateAccount(ctx context.Context, rCtx finance.Context, account *finance.Account) (*finance.Account, error)
	GetAccount(ctx context.Context, rCtx finance.Context, id finance.AccountID) (*finance.Account, error)
	UpdateAccount(ctx context.Context, rCtx finance.Context, account *finance.Account, mask []string) (*finance.Account, error)
	AdjustAccountBalance(ctx context.Context, rCtx finance.Context, req finance.AdjustAccountBalanceRequest) (*finance.Account, error)
	DeleteAccount(ctx context.Context, rCtx finance.Context, id finance.AccountID, opts finance.DeleteOptions) error
	ListAccounts(ctx context.Context, rCtx finance.Context, filter *finance.ListAccountsFilter) (*paging.Page[*finance.Account], error)
	ResolveAccount(ctx context.Context, rCtx finance.Context, opts finance.ResolveAccountOpts) (*finance.Account, error)
	CreateTransfer(ctx context.Context, rCtx finance.Context, transfer *finance.Transfer) (*finance.Transfer, error)
	GetTransfer(ctx context.Context, rCtx finance.Context, id finance.TransferID) (*finance.Transfer, error)
	DeleteTransfer(ctx context.Context, rCtx finance.Context, id finance.TransferID) error
	ListTransfers(ctx context.Context, rCtx finance.Context, limit int32, pageToken string) ([]*finance.Transfer, string, error)

	StageInboxItem(ctx context.Context, rCtx finance.Context, req *finance.StageInboxItem) (*finance.InboxItem, error)
	UpdateInboxItem(ctx context.Context, rCtx finance.Context, item *finance.InboxItem) (*finance.InboxItem, error)
	DiscardInboxItem(ctx context.Context, rCtx finance.Context, id string) error
	ApproveInboxItem(ctx context.Context, rCtx finance.Context, id string) (*finance.InboxItem, error)

	CreateInstitution(ctx context.Context, rCtx finance.Context, inst *finance.Institution) (*finance.Institution, error)
	UpdateInstitution(ctx context.Context, rCtx finance.Context, inst *finance.Institution, mask []string) (*finance.Institution, error)
	DeleteInstitution(ctx context.Context, rCtx finance.Context, id finance.InstitutionID, opts finance.DeleteOptions) error
	ResolveInstitution(ctx context.Context, rCtx finance.Context, name string) (*finance.ResolveInstitutionResult, error)
	ListInstitutions(ctx context.Context, rCtx finance.Context, filter *finance.ListInstitutionsFilter) (*paging.Page[*finance.Institution], error)

	ImportStatement(ctx context.Context, rCtx finance.Context, accountID finance.AccountID, stmt *finance.Statement) (*finance.Statement, error)
	DeleteStatement(ctx context.Context, rCtx finance.Context, id finance.StatementID, opts finance.DeleteOptions) error
	UpdateStatement(ctx context.Context, rCtx finance.Context, stmt *finance.Statement, mask []string) (*finance.Statement, error)
	UpdateStatementLine(ctx context.Context, rCtx finance.Context, line *finance.StatementLine, mask []string) (*finance.StatementLine, error)
	CompleteStatement(ctx context.Context, rCtx finance.Context, id finance.StatementID) (*finance.Statement, error)
	InvertStatementSigns(ctx context.Context, rCtx finance.Context, id finance.StatementID) (*finance.Statement, []*finance.StatementLine, error)
}

// ParsedTransaction represents structured transaction data parsed by an ingestion agent.
type ParsedTransaction struct {
	ReferenceNumber      string
	TransactionType      string
	Date                 string
	Amount               int64 // In minor units
	Currency             string
	Counterparty         string
	CardLastFour         string
	SourceAccountID      string
	SourceAccountName    string
	DestAccountID        string
	DestAccountName      string
	DestAccountLastFour  string
	SuggestedBudget      string
	SuggestedBorrowing   string
	SuggestedTransferLeg string
	RawOutput            string
}

// IngestionContext provides workspace entity context to guide the polymorphic ingestion agent suggestions.
type IngestionContext struct {
	Budgets               []*finance.Budget
	Accounts              []*finance.Account
	Institutions          []*finance.Institution
	ScheduledTransactions []*finance.ScheduledTransaction
	RecurringTransactions []*finance.RecurringTransaction
	Borrowings            []*finance.Borrowing
	ReferenceDate         time.Time
}

// DocumentClassifier defines the interface for running document-type classification.
// @Mock
type DocumentClassifier interface {
	Classify(ctx context.Context, fCtx finance.Context, doc string) (string, error)
}

// IngestionParser defines the interface for running transaction metadata extraction.
// @Mock
type IngestionParser interface {
	Parse(ctx context.Context, fCtx finance.Context, doc string, ingCtx IngestionContext) (*ParsedTransaction, error)
}

// DeduplicationResult represents semantic duplicate checking output from the agent.
type DeduplicationResult struct {
	IsDuplicate            bool
	DuplicateTransactionID string
	Reason                 string
}

// IngestionDeduplicator defines the interface for running semantic transaction deduplication.
// @Mock
type IngestionDeduplicator interface {
	Deduplicate(ctx context.Context, fCtx finance.Context, tx *ParsedTransaction, recent []*finance.Transaction) (*DeduplicationResult, error)
}

// Dependencies contains all parameters for Coordinator initialization.
type Dependencies struct {
	FinanceService    FinanceService
	SpaceService      SpaceService
	Classifier        DocumentClassifier
	Parser            IngestionParser
	Deduplicator      IngestionDeduplicator
	StatementPipeline *StatementPipeline
}

//go:generate go run github.com/masterkeysrd/saturn/tools/txgen -target=Coordinator
//go:generate go run github.com/masterkeysrd/saturn/tools/loggen -target=Coordinator -component=finance

// Coordinator orchestrates requests across workspace and finance boundaries.
// @Mock
type Coordinator interface {
	// @nolog
	ResolveContext(ctx context.Context) (finance.Context, error)

	// @transactional
	ConfigureFinance(ctx context.Context, req *ConfigureFinanceRequest) (*finance.FinanceSettings, error)
	GetFinanceSettings(ctx context.Context) (*finance.FinanceSettings, error)
	ListCurrencies(ctx context.Context) ([]finance.CurrencyInfo, error)

	// @transactional
	ImportStatement(ctx context.Context, accountID finance.AccountID, stmt *finance.Statement) (*finance.Statement, error)
	// @transactional
	DeleteStatement(ctx context.Context, id finance.StatementID, opts finance.DeleteOptions) error
	// @transactional
	UpdateStatement(ctx context.Context, stmt *finance.Statement, mask []string) (*finance.Statement, error)
	// @transactional
	UpdateStatementLine(ctx context.Context, line *finance.StatementLine, mask []string) (*finance.StatementLine, error)
	// @transactional
	CompleteStatement(ctx context.Context, id finance.StatementID) (*finance.Statement, error)
	// @transactional
	InvertStatementSigns(ctx context.Context, id finance.StatementID) (*finance.Statement, []*finance.StatementLine, error)
	IngestStatementDocument(ctx context.Context, req *StatementDocumentRequest) (*IngestStatementResult, error)
	AnalyzeStatementDocument(ctx context.Context, req *StatementDocumentRequest) (*StatementIngestionState, error)

	// @transactional
	CreateAccount(ctx context.Context, req *CreateAccountRequest) (*finance.Account, error)
	// @transactional
	UpdateAccount(ctx context.Context, req *UpdateAccountRequest) (*finance.Account, error)
	// @transactional
	DeleteAccount(ctx context.Context, id finance.AccountID, opts finance.DeleteOptions) error
	// @transactional
	AdjustAccountBalance(ctx context.Context, req *AdjustAccountBalanceRequest) (*finance.Account, error)

	// @transactional
	CreateBorrowing(ctx context.Context, req *CreateBorrowingRequest) (*finance.Borrowing, error)
	// @transactional
	UpdateBorrowing(ctx context.Context, req *UpdateBorrowingRequest) (*finance.Borrowing, error)
	// @transactional
	DeleteBorrowing(ctx context.Context, id finance.BorrowingID) error
	// @transactional
	AdjustBorrowingBalance(ctx context.Context, req *AdjustBorrowingBalanceRequest) (*finance.Borrowing, error)
	// @transactional
	LogBorrowingTransaction(ctx context.Context, req *LogBorrowingTransactionRequest) (*finance.Transaction, error)
	// @transactional
	UpdateBorrowingTransaction(ctx context.Context, req *UpdateBorrowingTransactionRequest) (*finance.Transaction, error)
	// @transactional
	DeleteBorrowingTransaction(ctx context.Context, req *DeleteBorrowingTransactionRequest) error

	// @transactional
	CreateBudget(ctx context.Context, req *CreateBudgetRequest) (*finance.Budget, error)
	// @transactional
	UpdateBudget(ctx context.Context, req *UpdateBudgetRequest) (*finance.Budget, error)
	GetBudget(ctx context.Context, id finance.BudgetID) (*finance.Budget, error)
	// @transactional
	DeleteBudget(ctx context.Context, req *DeleteBudgetRequest) error

	GetInsights(ctx context.Context, req *GetInsightsRequest) (*finance.Insights, error)

	// @transactional
	CreateInstitution(ctx context.Context, inst *finance.Institution) (*finance.Institution, error)
	// @transactional
	UpdateInstitution(ctx context.Context, inst *finance.Institution, mask []string) (*finance.Institution, error)
	// @transactional
	DeleteInstitution(ctx context.Context, id finance.InstitutionID, opts finance.DeleteOptions) error
	ResolveInstitution(ctx context.Context, name string) (*finance.ResolveInstitutionResult, error)

	// @transactional
	CreateExchangeRate(ctx context.Context, req *CreateExchangeRateRequest) (*finance.ExchangeRate, error)
	GetExchangeRate(ctx context.Context, req *GetExchangeRateRequest) (*finance.ExchangeRate, error)
	// @transactional
	UpdateExchangeRate(ctx context.Context, req *UpdateExchangeRateRequest) (*finance.ExchangeRate, error)
	ListExchangeRates(ctx context.Context, req *ListExchangeRatesRequest) ([]*finance.ExchangeRate, string, error)
	// @transactional
	DeleteExchangeRate(ctx context.Context, req *DeleteExchangeRateRequest) error

	// @transactional
	CreateRecurringTransaction(ctx context.Context, req *CreateRecurringTransactionRequest) (*finance.RecurringTransaction, error)
	// @transactional
	UpdateRecurringTransaction(ctx context.Context, req *UpdateRecurringTransactionRequest) (*finance.RecurringTransaction, error)
	// @transactional
	DeleteRecurringTransaction(ctx context.Context, id finance.RecurringTransactionID, opts finance.DeleteOptions) error
	// @transactional
	ConfirmScheduledTransaction(ctx context.Context, req *ConfirmScheduledTransactionRequest) (*finance.Transaction, error)
	// @transactional
	MatchScheduledTransaction(ctx context.Context, req *MatchScheduledTransactionRequest) (*finance.Transaction, error)
	// @transactional
	SkipScheduledTransaction(ctx context.Context, id finance.ScheduledTransactionID) (*finance.ScheduledTransaction, error)
	GetScheduledTransaction(ctx context.Context, id finance.ScheduledTransactionID) (*finance.ScheduledTransaction, error)
	// @transactional
	GenerateScheduledTransactions(ctx context.Context) error

	// @transactional
	CreateExpense(ctx context.Context, req *CreateExpenseRequest) (*finance.Transaction, error)
	// @transactional
	CreateIncome(ctx context.Context, req *CreateIncomeRequest) (*finance.Transaction, error)
	// @transactional
	UpdateExpense(ctx context.Context, req *UpdateExpenseRequest) (*finance.Transaction, error)
	// @transactional
	UpdateIncome(ctx context.Context, req *UpdateIncomeRequest) (*finance.Transaction, error)
	// @transactional
	DeleteTransaction(ctx context.Context, id finance.TransactionID) error
	ListTransactionEvents(ctx context.Context, req *ListTransactionEventsRequest) ([]*finance.TransactionEvent, error)

	// @transactional
	CreateTransfer(ctx context.Context, req *CreateTransferRequest) (*finance.Transfer, error)
	GetTransfer(ctx context.Context, id finance.TransferID) (*finance.Transfer, error)
	// @transactional
	DeleteTransfer(ctx context.Context, id finance.TransferID) error
	ListTransfers(ctx context.Context, req *ListTransfersRequest) ([]*finance.Transfer, string, error)

	IngestEmail(ctx context.Context, spaceID string, integrationID string, sender, subject, body string) (*finance.InboxItem, error)
	// @transactional
	DiscardInboxItem(ctx context.Context, id string) error
	GetTransactionSuggestions(ctx context.Context, req *IngestionRequest) (*SignalSuggestion, error)
	ProcessSuggestions(ctx context.Context, spaceID string, req *agentapp.SuggestionRequest) (map[string]any, error)
	// @transactional
	UpdateInboxItem(ctx context.Context, item *finance.InboxItem) (*finance.InboxItem, error)
	// @transactional
	ApproveInboxItem(ctx context.Context, id string) (*finance.InboxItem, error)

	ProcessSignalPipeline(ctx context.Context, fCtx finance.Context, req *IngestionRequest) (*IngestionState, error)
	GetSignalSuggestions(ctx context.Context, fCtx finance.Context, req *IngestionRequest) (*SignalSuggestion, error)
}

// coordinator orchestrates requests across workspace and finance boundaries.
type coordinator struct {
	financeService    FinanceService
	spaceService      SpaceService
	classifier        DocumentClassifier
	parser            IngestionParser
	deduplicator      IngestionDeduplicator
	statementPipeline *StatementPipeline
}

// NewCoordinator instantiates a new Coordinator.
func NewCoordinator(deps Dependencies) Coordinator {
	return &coordinator{
		financeService:    deps.FinanceService,
		spaceService:      deps.SpaceService,
		classifier:        deps.Classifier,
		parser:            deps.Parser,
		deduplicator:      deps.Deduplicator,
		statementPipeline: deps.StatementPipeline,
	}
}

var _ Coordinator = (*coordinator)(nil)

// RequestContext encapsulates the active workspace execution context for an application request.
// It implements finance.Context with lazy resolution of workspace and finance configurations.
type RequestContext struct {
	spaceID finance.SpaceID
	userID  string
	ctx     context.Context
	coord   *coordinator

	spaceSettings     *space.Settings
	spaceSettingsOnce sync.Once

	financeSettings     *finance.FinanceSettings
	financeSettingsOnce sync.Once

	loc          *time.Location
	baseCurrency finance.Currency
}

var _ finance.RequestContext = (*RequestContext)(nil)
var _ finance.Context = (*RequestContext)(nil)

// SpaceID returns the workspace identifier.
func (r *RequestContext) SpaceID() finance.SpaceID {
	if r == nil {
		return ""
	}
	return r.spaceID
}

// UserID returns the authenticated user identifier.
func (r *RequestContext) UserID() string {
	if r == nil {
		return ""
	}
	return r.userID
}

// SpaceSettings lazily loads and returns the workspace space.Settings.
func (r *RequestContext) SpaceSettings() *space.Settings {
	if r == nil {
		return nil
	}
	r.spaceSettingsOnce.Do(func() {
		if r.coord == nil || r.coord.spaceService == nil {
			fallback := space.DefaultSettings()
			r.spaceSettings = &fallback
			r.loc = time.UTC
			return
		}
		session := space.Session{
			SpaceID: space.SpaceID(r.spaceID),
			UserID:  space.SpaceID(r.userID),
		}
		entry, err := r.coord.spaceService.GetSettings(r.ctx, session)
		if err != nil || entry == nil || entry.Value.Timezone == "" {
			fallback := space.DefaultSettings()
			r.spaceSettings = &fallback
			r.loc = time.UTC
			return
		}
		r.spaceSettings = &entry.Value
		loc, err := time.LoadLocation(entry.Value.Timezone)
		if err != nil {
			loc = time.UTC
		}
		r.loc = loc
	})
	return r.spaceSettings
}

// Location returns the workspace location, resolving it lazily if not yet loaded.
func (r *RequestContext) Location() *time.Location {
	if r == nil {
		return time.UTC
	}
	r.SpaceSettings()
	if r.loc == nil {
		if r.spaceSettings != nil && r.spaceSettings.Timezone != "" {
			if loc, err := time.LoadLocation(r.spaceSettings.Timezone); err == nil {
				r.loc = loc
				return r.loc
			}
		}
		return time.UTC
	}
	return r.loc
}

// FinanceSettings lazily loads and returns the workspace finance.FinanceSettings.
func (r *RequestContext) FinanceSettings() *finance.FinanceSettings {
	if r == nil {
		return nil
	}
	r.financeSettingsOnce.Do(func() {
		if r.coord == nil || r.coord.financeService == nil {
			r.baseCurrency = "USD"
			return
		}
		settings, err := r.coord.financeService.GetFinanceSettings(r.ctx, r)
		if err != nil || settings == nil {
			r.baseCurrency = "USD"
			return
		}
		r.financeSettings = settings
		r.baseCurrency = settings.BaseCurrency
	})
	return r.financeSettings
}

// BaseCurrency returns the workspace base currency, resolving it lazily if not yet loaded.
func (r *RequestContext) BaseCurrency() finance.Currency {
	if r == nil {
		return "USD"
	}
	r.FinanceSettings()
	if r.baseCurrency == "" {
		return "USD"
	}
	return r.baseCurrency
}

// Now returns the current time in the workspace timezone.
func (r *RequestContext) Now() time.Time {
	return time.Now().In(r.Location())
}

// Date returns t converted to the workspace timezone, defaulting to Now() if zero.
func (r *RequestContext) Date(t time.Time) time.Time {
	if t.IsZero() {
		return r.Now()
	}
	return t.In(r.Location())
}

// ResolveContext extracts space and user identity safely into a RequestContext implementing finance.Context.
func (c *coordinator) ResolveContext(ctx context.Context) (finance.Context, error) {
	return c.resolveContext(ctx)
}

// resolveContext extracts space and user identity safely into a RequestContext struct.
func (c *coordinator) resolveContext(ctx context.Context) (*RequestContext, error) {
	const op errors.Op = "application/finance.resolveContext"

	spaceIDStr, ok := auth.SpaceIDFromContext(ctx)
	if !ok {
		return nil, errors.E(op, errors.Unauthenticated, "access denied: missing space-id context")
	}

	principal, ok := auth.PrincipalFromContext(ctx)
	if !ok {
		return nil, errors.E(op, errors.Unauthenticated, "access denied: missing user principal")
	}

	return &RequestContext{
		spaceID: finance.SpaceID(spaceIDStr),
		userID:  principal.Subject,
		ctx:     ctx,
		coord:   c,
	}, nil
}

// systemContext creates a RequestContext for background/system operations in a space.
func (c *coordinator) systemContext(ctx context.Context, spaceID string) *RequestContext {
	return &RequestContext{
		spaceID: finance.SpaceID(spaceID),
		userID:  "system",
		ctx:     ctx,
		coord:   c,
	}
}

// toLocation converts a non-zero time to loc, preserving zero times.
func toLocation(t time.Time, loc *time.Location) time.Time {
	if t.IsZero() {
		return t
	}
	if loc == nil {
		return t.UTC()
	}
	return t.In(loc)
}

// ConfigureFinanceRequest represents settings setup inputs.
type ConfigureFinanceRequest struct {
	BaseCurrency finance.Currency
}

// ConfigureFinance sets up base currency preferences for a workspace.
func (c *coordinator) ConfigureFinance(ctx context.Context, req *ConfigureFinanceRequest) (*finance.FinanceSettings, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}

	settings := &finance.FinanceSettings{
		BaseCurrency: req.BaseCurrency,
	}

	return c.financeService.ConfigureFinance(ctx, rCtx, settings)
}

// GetFinanceSettings fetches workspace configuration.
func (c *coordinator) GetFinanceSettings(ctx context.Context) (*finance.FinanceSettings, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}

	return c.financeService.GetFinanceSettings(ctx, rCtx)
}

// ListCurrencies returns the list of supported currencies.
func (c *coordinator) ListCurrencies(ctx context.Context) ([]finance.CurrencyInfo, error) {
	_, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}
	return c.financeService.ListCurrencies(ctx)
}

// ImportStatement imports a statement for the session's workspace.
func (c *coordinator) ImportStatement(ctx context.Context, accountID finance.AccountID, stmt *finance.Statement) (*finance.Statement, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}
	return c.financeService.ImportStatement(ctx, rCtx, accountID, stmt)
}

// DeleteStatement deletes a statement for the session's workspace.
func (c *coordinator) DeleteStatement(ctx context.Context, id finance.StatementID, opts finance.DeleteOptions) error {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return err
	}
	return c.financeService.DeleteStatement(ctx, rCtx, id, opts)
}

// UpdateStatement updates statement metadata and balances.
func (c *coordinator) UpdateStatement(ctx context.Context, stmt *finance.Statement, mask []string) (*finance.Statement, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}
	return c.financeService.UpdateStatement(ctx, rCtx, stmt, mask)
}

// UpdateStatementLine updates draft decisions on a statement line.
func (c *coordinator) UpdateStatementLine(ctx context.Context, line *finance.StatementLine, mask []string) (*finance.StatementLine, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}
	return c.financeService.UpdateStatementLine(ctx, rCtx, line, mask)
}

// CompleteStatement finalizes statement reconciliation.
func (c *coordinator) CompleteStatement(ctx context.Context, id finance.StatementID) (*finance.Statement, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}
	return c.financeService.CompleteStatement(ctx, rCtx, id)
}

// InvertStatementSigns inverts all line amounts and negates statement starting/ending balances.
func (c *coordinator) InvertStatementSigns(ctx context.Context, id finance.StatementID) (*finance.Statement, []*finance.StatementLine, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, nil, err
	}
	return c.financeService.InvertStatementSigns(ctx, rCtx, id)
}

// IngestStatementDocument executes statement document ingestion for the session's workspace.
func (c *coordinator) IngestStatementDocument(ctx context.Context, req *StatementDocumentRequest) (*IngestStatementResult, error) {
	const op errors.Op = "application/finance.IngestStatementDocument"
	if c.statementPipeline == nil {
		return nil, errors.E(op, errors.Internal, "statement pipeline is not configured")
	}
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}
	return c.statementPipeline.IngestDocument(ctx, rCtx, req)
}

// AnalyzeStatementDocument analyzes statement document without persisting drafts (preview mode).
func (c *coordinator) AnalyzeStatementDocument(ctx context.Context, req *StatementDocumentRequest) (*StatementIngestionState, error) {
	const op errors.Op = "application/finance.AnalyzeStatementDocument"
	if c.statementPipeline == nil {
		return nil, errors.E(op, errors.Internal, "statement pipeline is not configured")
	}
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}
	return c.statementPipeline.AnalyzeDocument(ctx, rCtx, req)
}
