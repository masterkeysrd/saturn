package financeapp

import (
	"context"
	"time"

	agentapp "github.com/masterkeysrd/saturn/internal/application/agent"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
)

// SpaceService defines the decoupled interface for workspace accessibility check.
type SpaceService interface {
	GetSpace(ctx context.Context, session space.Session) (*space.Space, error)
}

// FinanceService defines the interface for underlying finance domain rules.
type FinanceService interface {
	ConfigureFinance(ctx context.Context, settings *finance.FinanceSettings) (*finance.FinanceSettings, error)
	GetFinanceSettings(ctx context.Context, spaceID finance.SpaceID) (*finance.FinanceSettings, error)
	CreateBudget(ctx context.Context, budget *finance.Budget) (*finance.Budget, error)
	UpdateBudget(ctx context.Context, budget *finance.Budget, mask []string) (*finance.Budget, error)
	DeleteBudget(ctx context.Context, spaceID finance.SpaceID, id finance.BudgetID, opts finance.DeleteOptions) error
	ListBudgets(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListBudgetsFilter) (*paging.Page[*finance.Budget], error)
	GetBudget(ctx context.Context, spaceID finance.SpaceID, id finance.BudgetID) (*finance.Budget, error)
	GetOrCreatePeriod(ctx context.Context, spaceID finance.SpaceID, budgetID finance.BudgetID, date time.Time) (*finance.BudgetPeriod, error)
	UpdatePeriodLimit(ctx context.Context, id finance.PeriodID, limit int64) error
	CreateExchangeRate(ctx context.Context, rate *finance.ExchangeRate) (*finance.ExchangeRate, error)
	GetExchangeRateByID(ctx context.Context, spaceID finance.SpaceID, id string) (*finance.ExchangeRate, error)
	UpdateExchangeRate(ctx context.Context, spaceID finance.SpaceID, id string, rate *finance.ExchangeRate) (*finance.ExchangeRate, error)
	ListExchangeRates(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListExchangeRatesFilter) ([]*finance.ExchangeRate, string, error)
	DeleteExchangeRateByID(ctx context.Context, spaceID finance.SpaceID, id string) error
	CreateExpense(ctx context.Context, txn *finance.Transaction) (*finance.Transaction, error)
	CreateIncome(ctx context.Context, txn *finance.Transaction) (*finance.Transaction, error)
	GetTransaction(ctx context.Context, spaceID finance.SpaceID, id finance.TransactionID) (*finance.Transaction, error)
	UpdateExpense(ctx context.Context, txn *finance.Transaction) (*finance.Transaction, error)
	UpdateIncome(ctx context.Context, txn *finance.Transaction) (*finance.Transaction, error)
	DeleteTransaction(ctx context.Context, spaceID finance.SpaceID, id finance.TransactionID) error
	ListTransactions(ctx context.Context, spaceID finance.SpaceID, filter *finance.TransactionFilter) (*paging.Page[*finance.Transaction], error)
	ListTransactionEvents(ctx context.Context, spaceID finance.SpaceID, txnID finance.TransactionID) ([]*finance.TransactionEvent, error)
	GetSpentInsights(ctx context.Context, req *finance.GetSpentInsightsRequest) (*finance.SpentInsights, error)
	GetIncomeInsights(ctx context.Context, req *finance.GetSpentInsightsRequest) (*finance.IncomeInsights, error)

	CreateRecurringTransaction(ctx context.Context, transaction *finance.RecurringTransaction) (*finance.RecurringTransaction, error)
	GetRecurringTransaction(ctx context.Context, spaceID finance.SpaceID, id finance.RecurringTransactionID) (*finance.RecurringTransaction, error)
	UpdateRecurringTransaction(ctx context.Context, transaction *finance.RecurringTransaction, mask []string) (*finance.RecurringTransaction, error)
	DeleteRecurringTransaction(ctx context.Context, id finance.RecurringTransactionID, opts finance.DeleteOptions) error
	ListRecurringTransactions(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListRecurringTransactionsFilter) (*paging.Page[*finance.RecurringTransaction], error)
	ListScheduledTransactions(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListScheduledTransactionsFilter) (*paging.Page[*finance.ScheduledTransaction], error)
	GetScheduledTransaction(ctx context.Context, spaceID finance.SpaceID, id finance.ScheduledTransactionID) (*finance.ScheduledTransaction, error)
	ConfirmScheduledTransaction(ctx context.Context, req finance.ConfirmScheduledTransactionRequest) (*finance.Transaction, error)
	MatchScheduledTransaction(ctx context.Context, req finance.MatchScheduledTransactionRequest) (*finance.Transaction, error)
	SkipScheduledTransaction(ctx context.Context, spaceID finance.SpaceID, id finance.ScheduledTransactionID) (*finance.ScheduledTransaction, error)
	GenerateScheduledTransactions(ctx context.Context) error

	CreateBorrowing(ctx context.Context, b *finance.Borrowing, createAsTransaction bool) (*finance.Borrowing, error)
	GetBorrowing(ctx context.Context, spaceID finance.SpaceID, id finance.BorrowingID) (*finance.Borrowing, error)
	ListBorrowings(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListBorrowingsFilter) ([]*finance.Borrowing, string, error)
	UpdateBorrowing(ctx context.Context, b *finance.Borrowing, mask []string) (*finance.Borrowing, error)
	DeleteBorrowing(ctx context.Context, spaceID finance.SpaceID, id finance.BorrowingID) error
	LogBorrowingTransaction(ctx context.Context, req finance.LogBorrowingTransactionRequest) (*finance.Transaction, error)
	UpdateBorrowingTransaction(ctx context.Context, req finance.UpdateBorrowingTransactionRequest) (*finance.Transaction, error)
	DeleteBorrowingTransaction(ctx context.Context, req finance.DeleteBorrowingTransactionRequest) error
	AdjustBorrowingBalance(ctx context.Context, req finance.AdjustBorrowingBalanceRequest) (*finance.Borrowing, error)
	ListCurrencies(ctx context.Context) ([]finance.CurrencyInfo, error)

	CreateAccount(ctx context.Context, account *finance.Account) (*finance.Account, error)
	GetAccount(ctx context.Context, spaceID finance.SpaceID, id finance.AccountID) (*finance.Account, error)
	UpdateAccount(ctx context.Context, account *finance.Account, mask []string) (*finance.Account, error)
	AdjustAccountBalance(ctx context.Context, spaceID finance.SpaceID, accountID finance.AccountID, targetBalance int64, adjustmentDate string, note string) (*finance.Account, error)
	DeleteAccount(ctx context.Context, spaceID finance.SpaceID, id finance.AccountID, opts finance.DeleteOptions) error
	ListAccounts(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListAccountsFilter) (*paging.Page[*finance.Account], error)
	ResolveAccount(ctx context.Context, spaceID finance.SpaceID, opts finance.ResolveAccountOpts) (*finance.Account, error)
	CreateTransfer(ctx context.Context, transfer *finance.Transfer) (*finance.Transfer, error)
	GetTransfer(ctx context.Context, spaceID finance.SpaceID, id finance.TransferID) (*finance.Transfer, error)
	DeleteTransfer(ctx context.Context, spaceID finance.SpaceID, id finance.TransferID) error
	ListTransfers(ctx context.Context, spaceID finance.SpaceID, limit int32, pageToken string) ([]*finance.Transfer, string, error)

	StageInboxItem(ctx context.Context, spaceID finance.SpaceID, req *finance.StageInboxItem) (*finance.InboxItem, error)
	UpdateInboxItem(ctx context.Context, spaceID finance.SpaceID, item *finance.InboxItem) (*finance.InboxItem, error)
	DiscardInboxItem(ctx context.Context, spaceID finance.SpaceID, id string) error
	ApproveInboxItem(ctx context.Context, spaceID finance.SpaceID, id string) (*finance.InboxItem, error)

	CreateInstitution(ctx context.Context, inst *finance.Institution) (*finance.Institution, error)
	UpdateInstitution(ctx context.Context, inst *finance.Institution, mask []string) (*finance.Institution, error)
	DeleteInstitution(ctx context.Context, spaceID finance.SpaceID, id finance.InstitutionID, opts finance.DeleteOptions) error
	ResolveInstitution(ctx context.Context, spaceID finance.SpaceID, name string) (*finance.ResolveInstitutionResult, error)
	ListInstitutions(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListInstitutionsFilter) (*paging.Page[*finance.Institution], error)

	ImportStatement(ctx context.Context, accountID finance.AccountID, stmt *finance.Statement) (*finance.Statement, error)
	DeleteStatement(ctx context.Context, spaceID finance.SpaceID, id finance.StatementID, opts finance.DeleteOptions) error
	UpdateStatement(ctx context.Context, spaceID finance.SpaceID, stmt *finance.Statement, mask []string) (*finance.Statement, error)
	UpdateStatementLine(ctx context.Context, spaceID finance.SpaceID, line *finance.StatementLine, mask []string) (*finance.StatementLine, error)
	CompleteStatement(ctx context.Context, spaceID finance.SpaceID, id finance.StatementID) (*finance.Statement, error)
	InvertStatementSigns(ctx context.Context, spaceID finance.SpaceID, id finance.StatementID) (*finance.Statement, []*finance.StatementLine, error)
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
type DocumentClassifier interface {
	Classify(ctx context.Context, spaceID string, doc string) (string, error)
}

// IngestionParser defines the interface for running transaction metadata extraction.
type IngestionParser interface {
	Parse(ctx context.Context, spaceID string, doc string, context IngestionContext) (*ParsedTransaction, error)
}

// DeduplicationResult represents semantic duplicate checking output from the agent.
type DeduplicationResult struct {
	IsDuplicate            bool
	DuplicateTransactionID string
	Reason                 string
}

// IngestionDeduplicator defines the interface for running semantic transaction deduplication.
type IngestionDeduplicator interface {
	Deduplicate(ctx context.Context, spaceID string, tx *ParsedTransaction, recent []*finance.Transaction) (*DeduplicationResult, error)
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
type Coordinator interface {
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
	AdjustAccountBalance(ctx context.Context, id finance.AccountID, targetBalance int64, adjustmentDate string, note string) (*finance.Account, error)

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

	ProcessSignalPipeline(ctx context.Context, spaceID string, req *IngestionRequest) (*IngestionState, error)
	GetSignalSuggestions(ctx context.Context, spaceID string, req *IngestionRequest) (*SignalSuggestion, error)
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

// RequestContext encapsulates the active request context properties.
type RequestContext struct {
	SpaceID finance.SpaceID
	UserID  string
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
		SpaceID: finance.SpaceID(spaceIDStr),
		UserID:  principal.Subject,
	}, nil
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
		SpaceID:      rCtx.SpaceID,
		BaseCurrency: req.BaseCurrency,
	}

	return c.financeService.ConfigureFinance(ctx, settings)
}

// GetFinanceSettings fetches workspace configuration.
func (c *coordinator) GetFinanceSettings(ctx context.Context) (*finance.FinanceSettings, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}

	return c.financeService.GetFinanceSettings(ctx, rCtx.SpaceID)
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
	stmt.SpaceID = rCtx.SpaceID
	return c.financeService.ImportStatement(ctx, accountID, stmt)
}

// DeleteStatement deletes a statement for the session's workspace.
func (c *coordinator) DeleteStatement(ctx context.Context, id finance.StatementID, opts finance.DeleteOptions) error {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return err
	}
	return c.financeService.DeleteStatement(ctx, rCtx.SpaceID, id, opts)
}

// UpdateStatement updates statement metadata and balances.
func (c *coordinator) UpdateStatement(ctx context.Context, stmt *finance.Statement, mask []string) (*finance.Statement, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}
	return c.financeService.UpdateStatement(ctx, rCtx.SpaceID, stmt, mask)
}

// UpdateStatementLine updates draft decisions on a statement line.
func (c *coordinator) UpdateStatementLine(ctx context.Context, line *finance.StatementLine, mask []string) (*finance.StatementLine, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}
	return c.financeService.UpdateStatementLine(ctx, rCtx.SpaceID, line, mask)
}

// CompleteStatement finalizes statement reconciliation.
func (c *coordinator) CompleteStatement(ctx context.Context, id finance.StatementID) (*finance.Statement, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}
	return c.financeService.CompleteStatement(ctx, rCtx.SpaceID, id)
}

// InvertStatementSigns inverts all line amounts and negates statement starting/ending balances.
func (c *coordinator) InvertStatementSigns(ctx context.Context, id finance.StatementID) (*finance.Statement, []*finance.StatementLine, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, nil, err
	}
	return c.financeService.InvertStatementSigns(ctx, rCtx.SpaceID, id)
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
	return c.statementPipeline.IngestDocument(ctx, string(rCtx.SpaceID), req)
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
	return c.statementPipeline.AnalyzeDocument(ctx, string(rCtx.SpaceID), req)
}
