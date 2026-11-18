package mcpfinance

//go:generate go run github.com/masterkeysrd/saturn/tools/mockgen .

import (
	"context"
	"fmt"
	"strings"
	"time"

	financeaggregator "github.com/masterkeysrd/saturn/internal/aggregator/finance"
	financeapp "github.com/masterkeysrd/saturn/internal/application/finance"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
	mcptransport "github.com/masterkeysrd/saturn/internal/transport/mcp"
	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"
)

const (
	defaultListLimit = 20
	maxListLimit     = 100
)

// FinanceAggregator defines read-only hydrated finance queries.
// @Mock
type FinanceAggregator interface {
	ListAccounts(ctx context.Context, rCtx finance.Context, view financeaggregator.ViewType, filter financeaggregator.ListAccountsFilter) (*paging.Page[*financeaggregator.AggregatedAccount], error)
	ListBudgets(ctx context.Context, rCtx finance.Context, filter financeaggregator.ListBudgetsFilter) (*paging.Page[*financeaggregator.AggregatedBudget], error)
	GetTransaction(ctx context.Context, rCtx finance.Context, view financeaggregator.ViewType, id finance.TransactionID) (*financeaggregator.AggregatedTransaction, error)
	ListTransactions(ctx context.Context, rCtx finance.Context, view financeaggregator.ViewType, filter finance.TransactionFilter) (*paging.Page[*financeaggregator.AggregatedTransaction], error)
	ListInboxItems(ctx context.Context, rCtx finance.Context, filter finance.ListInboxItemsFilter) (*paging.Page[*finance.InboxItem], error)
	ListBorrowings(ctx context.Context, rCtx finance.Context, filter financeaggregator.ListBorrowingsFilter) ([]*finance.Borrowing, string, error)
	ListRecurringTransactions(ctx context.Context, rCtx finance.Context, view financeaggregator.ViewType, filter finance.ListRecurringTransactionsFilter) (*paging.Page[*financeaggregator.AggregatedRecurringTransaction], error)
	ListScheduledTransactions(ctx context.Context, rCtx finance.Context, view financeaggregator.ViewType, filter finance.ListScheduledTransactionsFilter) (*paging.Page[*financeaggregator.AggregatedScheduledTransaction], error)
}

// FinanceCoordinator defines finance context resolution, insights, and command operations.
// @Mock
type FinanceCoordinator interface {
	ResolveContext(ctx context.Context) (finance.Context, error)
	GetInsights(ctx context.Context, req *financeapp.GetInsightsRequest) (*finance.Insights, error)
	CreateExpense(ctx context.Context, req *financeapp.CreateExpenseRequest) (*finance.Transaction, error)
	CreateIncome(ctx context.Context, req *financeapp.CreateIncomeRequest) (*finance.Transaction, error)
	UpdateExpense(ctx context.Context, req *financeapp.UpdateExpenseRequest) (*finance.Transaction, error)
	UpdateIncome(ctx context.Context, req *financeapp.UpdateIncomeRequest) (*finance.Transaction, error)
	DeleteTransaction(ctx context.Context, id finance.TransactionID) error
	CreateTransfer(ctx context.Context, req *financeapp.CreateTransferRequest) (*finance.Transfer, error)
	DeleteTransfer(ctx context.Context, id finance.TransferID) error
	ListTransfers(ctx context.Context, req *financeapp.ListTransfersRequest) ([]*finance.Transfer, string, error)
	StageInboxItem(ctx context.Context, req *finance.StageInboxItem) (*finance.InboxItem, error)
	UpdateInboxItem(ctx context.Context, item *finance.InboxItem, mask []string) (*finance.InboxItem, error)
	DiscardInboxItem(ctx context.Context, id string) error
	ApproveInboxItem(ctx context.Context, id string) (*finance.InboxItem, error)
	CreateBudget(ctx context.Context, req *financeapp.CreateBudgetRequest) (*finance.Budget, error)
	UpdateBudget(ctx context.Context, req *financeapp.UpdateBudgetRequest) (*finance.Budget, error)
	GetBudget(ctx context.Context, id finance.BudgetID) (*finance.Budget, error)
	AdjustAccountBalance(ctx context.Context, req *financeapp.AdjustAccountBalanceRequest) (*finance.Account, error)
	LogBorrowingTransaction(ctx context.Context, req *financeapp.LogBorrowingTransactionRequest) (*finance.Transaction, error)
	ConfirmScheduledTransaction(ctx context.Context, req *financeapp.ConfirmScheduledTransactionRequest) (*finance.Transaction, error)
	SkipScheduledTransaction(ctx context.Context, id finance.ScheduledTransactionID) (*finance.ScheduledTransaction, error)
}

// Dependencies holds the collaborators required by the finance MCP handler.
type Dependencies struct {
	Aggregator  FinanceAggregator
	Coordinator FinanceCoordinator
}

// Handler adapts finance operations into curated MCP tools and resources.
type Handler struct {
	agg   FinanceAggregator
	coord FinanceCoordinator
}

// NewHandler constructs a new finance MCP Handler.
func NewHandler(deps Dependencies) *Handler {
	return &Handler{
		agg:   deps.Aggregator,
		coord: deps.Coordinator,
	}
}

// Register registers finance MCP tools and resources onto the registry.
func (h *Handler) Register(reg *mcptransport.Registry) {
	reg.RegisterTool(mcptransport.ToolSpec{
		Name:          "finance_list_accounts",
		Domain:        "finance",
		Title:         "List Finance Accounts",
		Description:   "Lists financial accounts in the workspace with current balances and base-currency equivalents.",
		RequiredScope: identity.ScopeFinanceRead,
		ReadOnly:      true,
	}, h.listAccounts)

	reg.RegisterTool(mcptransport.ToolSpec{
		Name:          "finance_list_budgets",
		Domain:        "finance",
		Title:         "List Budgets",
		Description:   "Lists workspace budgets along with active period spend and limit progress.",
		RequiredScope: identity.ScopeFinanceRead,
		ReadOnly:      true,
	}, h.listBudgets)

	reg.RegisterTool(mcptransport.ToolSpec{
		Name:          "finance_list_transactions",
		Domain:        "finance",
		Title:         "List Transactions",
		Description:   "Lists financial transactions with optional filters for budget, account, type, date range, and search query.",
		RequiredScope: identity.ScopeFinanceRead,
		ReadOnly:      true,
	}, h.listTransactions)

	reg.RegisterTool(mcptransport.ToolSpec{
		Name:          "finance_get_insights",
		Domain:        "finance",
		Title:         "Get Finance Insights",
		Description:   "Returns workspace spending and income analytics including budget usage, burn rate, and top expenses.",
		RequiredScope: identity.ScopeFinanceRead,
		ReadOnly:      true,
	}, h.getInsights)

	reg.RegisterTool(mcptransport.ToolSpec{
		Name:          "finance_list_inbox_items",
		Domain:        "finance",
		Title:         "List Finance Inbox Items",
		Description:   "Lists staged financial inbox items (receipts, invoices, bank notifications) awaiting review or resolved.",
		RequiredScope: identity.ScopeFinanceRead,
		ReadOnly:      true,
	}, h.listInboxItems)

	reg.RegisterTool(mcptransport.ToolSpec{
		Name:          "finance_list_borrowings",
		Domain:        "finance",
		Title:         "List Borrowings",
		Description:   "Lists active or settled personal borrowing and lending agreements.",
		RequiredScope: identity.ScopeFinanceRead,
		ReadOnly:      true,
	}, h.listBorrowings)

	reg.RegisterTool(mcptransport.ToolSpec{
		Name:          "finance_list_recurring",
		Domain:        "finance",
		Title:         "List Recurring Transactions",
		Description:   "Lists recurring expense and income templates with intervals and next due dates.",
		RequiredScope: identity.ScopeFinanceRead,
		ReadOnly:      true,
	}, h.listRecurring)

	reg.RegisterTool(mcptransport.ToolSpec{
		Name:          "finance_create_transaction",
		Domain:        "finance",
		Title:         "Create Transaction",
		Description:   "Records a new EXPENSE (requires budget_id) or INCOME transaction in cents.",
		RequiredScope: identity.ScopeFinanceWrite,
		ReadOnly:      false,
		Destructive:   false,
	}, h.createTransaction)

	reg.RegisterTool(mcptransport.ToolSpec{
		Name:          "finance_create_transfer",
		Domain:        "finance",
		Title:         "Create Account Transfer",
		Description:   "Transfers funds between two workspace financial accounts.",
		RequiredScope: identity.ScopeFinanceWrite,
		ReadOnly:      false,
		Destructive:   false,
	}, h.createTransfer)

	reg.RegisterTool(mcptransport.ToolSpec{
		Name:          "finance_create_inbox_item",
		Domain:        "finance",
		Title:         "Stage Finance Inbox Item",
		Description:   "Stages a candidate invoice, receipt, or bank notification into the finance inbox queue for review.",
		RequiredScope: identity.ScopeFinanceWrite,
		ReadOnly:      false,
		Destructive:   false,
	}, h.createInboxItem)

	reg.RegisterTool(mcptransport.ToolSpec{
		Name:          "finance_update_transaction",
		Domain:        "finance",
		Title:         "Update Transaction",
		Description:   "Updates an existing EXPENSE or INCOME transaction by merging partial fields onto the current record.",
		RequiredScope: identity.ScopeFinanceWrite,
		ReadOnly:      false,
		Destructive:   false,
	}, h.updateTransaction)

	reg.RegisterTool(mcptransport.ToolSpec{
		Name:          "finance_delete_transaction",
		Domain:        "finance",
		Title:         "Delete Transaction or Transfer",
		Description:   "Deletes a financial transaction or account transfer and reverts its balance impact.",
		RequiredScope: identity.ScopeFinanceWrite,
		ReadOnly:      false,
		Destructive:   true,
	}, h.deleteTransaction)

	reg.RegisterTool(mcptransport.ToolSpec{
		Name:          "finance_list_transfers",
		Domain:        "finance",
		Title:         "List Account Transfers",
		Description:   "Lists account-to-account transfers with optional account and date range filters.",
		RequiredScope: identity.ScopeFinanceRead,
		ReadOnly:      true,
	}, h.listTransfers)

	reg.RegisterTool(mcptransport.ToolSpec{
		Name:          "finance_review_inbox_item",
		Domain:        "finance",
		Title:         "Review Finance Inbox Item",
		Description:   "Approves (optionally patching fields first) or discards a staged finance inbox item.",
		RequiredScope: identity.ScopeFinanceWrite,
		ReadOnly:      false,
		Destructive:   false,
	}, h.reviewInboxItem)

	reg.RegisterTool(mcptransport.ToolSpec{
		Name:          "finance_manage_budget",
		Domain:        "finance",
		Title:         "Create or Update Budget",
		Description:   "Creates a new workspace budget (when id is omitted) or updates an existing budget template and period limit.",
		RequiredScope: identity.ScopeFinanceWrite,
		ReadOnly:      false,
		Destructive:   false,
	}, h.manageBudget)

	reg.RegisterTool(mcptransport.ToolSpec{
		Name:          "finance_adjust_account_balance",
		Domain:        "finance",
		Title:         "Adjust Account Balance",
		Description:   "Reconciles a financial account's live balance to a target balance in cents.",
		RequiredScope: identity.ScopeFinanceWrite,
		ReadOnly:      false,
		Destructive:   false,
	}, h.adjustAccountBalance)

	reg.RegisterTool(mcptransport.ToolSpec{
		Name:          "finance_log_borrowing_payment",
		Domain:        "finance",
		Title:         "Log Borrowing Payment",
		Description:   "Logs a repayment or additional disbursement against an active borrowing or lending record.",
		RequiredScope: identity.ScopeFinanceWrite,
		ReadOnly:      false,
		Destructive:   false,
	}, h.logBorrowingPayment)

	reg.RegisterTool(mcptransport.ToolSpec{
		Name:          "finance_list_scheduled",
		Domain:        "finance",
		Title:         "List Scheduled Transactions",
		Description:   "Lists upcoming or pending scheduled transaction obligations with optional status and date filters.",
		RequiredScope: identity.ScopeFinanceRead,
		ReadOnly:      true,
	}, h.listScheduled)

	reg.RegisterTool(mcptransport.ToolSpec{
		Name:          "finance_resolve_scheduled",
		Domain:        "finance",
		Title:         "Resolve Scheduled Transaction",
		Description:   "Confirms (converting to a real transaction with optional overrides) or skips a scheduled transaction.",
		RequiredScope: identity.ScopeFinanceWrite,
		ReadOnly:      false,
		Destructive:   false,
	}, h.resolveScheduled)

	reg.RegisterResource(mcptransport.ResourceSpec{
		URI:           "saturn://finance/accounts",
		Name:          "finance_accounts",
		Title:         "Workspace Finance Accounts",
		Description:   "Snapshot of active workspace financial accounts and balances.",
		MIMEType:      "application/json",
		RequiredScope: identity.ScopeFinanceRead,
	}, h.readAccountsResource)

	reg.RegisterResource(mcptransport.ResourceSpec{
		URI:           "saturn://finance/budgets",
		Name:          "finance_budgets",
		Title:         "Workspace Finance Budgets",
		Description:   "Snapshot of active workspace budgets and current period progress.",
		MIMEType:      "application/json",
		RequiredScope: identity.ScopeFinanceRead,
	}, h.readBudgetsResource)
}

// ListAccountsInput defines parameters for finance_list_accounts.
type ListAccountsInput struct {
	ActiveOnly  *bool  `json:"active_only,omitempty" jsonschema:"Filter to active accounts only"`
	SearchQuery string `json:"search_query,omitempty" jsonschema:"Search by account name"`
	Limit       int32  `json:"limit,omitempty" jsonschema:"Max results to return (1-100, default 20)"`
	PageToken   string `json:"page_token,omitempty" jsonschema:"Pagination cursor from previous response"`
}

// AccountItem summarizes a workspace financial account.
type AccountItem struct {
	ID                     string `json:"id"`
	Name                   string `json:"name"`
	Type                   string `json:"type"`
	Currency               string `json:"currency"`
	BalanceCents           int64  `json:"balance_cents"`
	FormattedBalance       string `json:"formatted_balance"`
	BalanceInBaseCents     int64  `json:"balance_in_base_cents"`
	FormattedBalanceInBase string `json:"formatted_balance_in_base"`
	BaseCurrency           string `json:"base_currency"`
	IsDefault              bool   `json:"is_default"`
	IsActive               bool   `json:"is_active"`
	LastFour               string `json:"last_four,omitempty"`
}

// ListAccountsOutput is returned by finance_list_accounts.
type ListAccountsOutput struct {
	Accounts      []AccountItem `json:"accounts"`
	NextPageToken string        `json:"next_page_token,omitempty"`
}

func (h *Handler) listAccounts(ctx context.Context, in ListAccountsInput) (ListAccountsOutput, error) {
	rCtx, err := h.coord.ResolveContext(ctx)
	if err != nil {
		return ListAccountsOutput{}, err
	}

	var searchPtr *string
	if q := strings.TrimSpace(in.SearchQuery); q != "" {
		searchPtr = new(q)
	}

	page, err := h.agg.ListAccounts(ctx, rCtx, financeaggregator.ViewFull, financeaggregator.ListAccountsFilter{
		PageSize:      mcptransport.ClampLimit(in.Limit, defaultListLimit, maxListLimit),
		NextPageToken: in.PageToken,
		ActiveOnly:    in.ActiveOnly,
		SearchQuery:   searchPtr,
	})
	if err != nil {
		return ListAccountsOutput{}, err
	}

	baseCurr := string(rCtx.BaseCurrency())
	items := make([]AccountItem, 0, len(page.Items))
	for _, a := range page.Items {
		curr := string(a.Currency)
		items = append(items, AccountItem{
			ID:                     string(a.ID),
			Name:                   a.Name,
			Type:                   string(a.Type),
			Currency:               curr,
			BalanceCents:           a.CurrentBalance,
			FormattedBalance:       formatMoney(a.CurrentBalance, curr),
			BalanceInBaseCents:     a.BalanceInBase,
			FormattedBalanceInBase: formatMoney(a.BalanceInBase, baseCurr),
			BaseCurrency:           baseCurr,
			IsDefault:              a.IsDefault,
			IsActive:               a.IsActive,
			LastFour:               a.LastFour,
		})
	}

	return ListAccountsOutput{
		Accounts:      items,
		NextPageToken: page.NextPageToken,
	}, nil
}

// ListBudgetsInput defines parameters for finance_list_budgets.
type ListBudgetsInput struct {
	Status      string `json:"status,omitempty" jsonschema:"Optional budget status ('active', 'paused', 'archived')"`
	SearchQuery string `json:"search_query,omitempty" jsonschema:"Search by budget name"`
	TargetDate  string `json:"target_date,omitempty" jsonschema:"Optional date (YYYY-MM-DD or RFC3339) for period calculation"`
	Limit       int32  `json:"limit,omitempty" jsonschema:"Max results to return (1-100, default 20)"`
	PageToken   string `json:"page_token,omitempty" jsonschema:"Pagination cursor"`
}

// BudgetItem summarizes a budget and its active period usage.
type BudgetItem struct {
	ID             string `json:"id"`
	Name           string `json:"name"`
	Currency       string `json:"currency"`
	Interval       string `json:"interval"`
	Status         string `json:"status"`
	LimitCents     int64  `json:"limit_cents"`
	FormattedLimit string `json:"formatted_limit"`
	SpentCents     int64  `json:"spent_cents"`
	FormattedSpent string `json:"formatted_spent"`
	PeriodStart    string `json:"period_start,omitempty"`
	PeriodEnd      string `json:"period_end,omitempty"`
}

// ListBudgetsOutput is returned by finance_list_budgets.
type ListBudgetsOutput struct {
	Budgets       []BudgetItem `json:"budgets"`
	NextPageToken string       `json:"next_page_token,omitempty"`
}

func (h *Handler) listBudgets(ctx context.Context, in ListBudgetsInput) (ListBudgetsOutput, error) {
	rCtx, err := h.coord.ResolveContext(ctx)
	if err != nil {
		return ListBudgetsOutput{}, err
	}

	filter := financeaggregator.ListBudgetsFilter{
		PageSize:      mcptransport.ClampLimit(in.Limit, defaultListLimit, maxListLimit),
		NextPageToken: in.PageToken,
		View:          financeaggregator.ViewFull,
	}
	if s := strings.TrimSpace(in.Status); s != "" {
		filter.Statuses = []finance.BudgetStatus{finance.BudgetStatus(strings.ToLower(s))}
	}
	if q := strings.TrimSpace(in.SearchQuery); q != "" {
		filter.SearchQuery = new(q)
	}
	if t, err := mcptransport.ParseOptionalTime(in.TargetDate, "target_date", rCtx.Location()); err != nil {
		return ListBudgetsOutput{}, err
	} else if t != nil {
		filter.TargetDate = *t
	}

	page, err := h.agg.ListBudgets(ctx, rCtx, filter)
	if err != nil {
		return ListBudgetsOutput{}, err
	}

	items := make([]BudgetItem, 0, len(page.Items))
	for _, b := range page.Items {
		curr := string(b.Currency)
		item := BudgetItem{
			ID:             string(b.ID),
			Name:           b.Name,
			Currency:       curr,
			Interval:       string(b.Interval),
			Status:         string(b.Status),
			LimitCents:     b.LimitAmount,
			FormattedLimit: formatMoney(b.LimitAmount, curr),
			FormattedSpent: formatMoney(0, curr),
		}
		if b.Period != nil && b.Period.BudgetPeriod != nil {
			item.LimitCents = b.Period.LimitAmount
			item.FormattedLimit = formatMoney(b.Period.LimitAmount, curr)
			item.SpentCents = b.Period.SpentAmount
			item.FormattedSpent = formatMoney(b.Period.SpentAmount, curr)
			item.PeriodStart = b.Period.StartDate.In(rCtx.Location()).Format("2006-01-02")
			item.PeriodEnd = b.Period.EndDate.In(rCtx.Location()).Format("2006-01-02")
		}
		items = append(items, item)
	}

	return ListBudgetsOutput{
		Budgets:       items,
		NextPageToken: page.NextPageToken,
	}, nil
}

// ListTransactionsInput defines parameters for finance_list_transactions.
type ListTransactionsInput struct {
	BudgetID    string   `json:"budget_id,omitempty" jsonschema:"Filter by budget ID"`
	AccountID   string   `json:"account_id,omitempty" jsonschema:"Filter by account ID"`
	Types       []string `json:"types,omitempty" jsonschema:"Filter by transaction types (EXPENSE, INCOME, TRANSFER_OUT, TRANSFER_IN)"`
	StartDate   string   `json:"start_date,omitempty" jsonschema:"Start date inclusive (YYYY-MM-DD or RFC3339)"`
	EndDate     string   `json:"end_date,omitempty" jsonschema:"End date inclusive (YYYY-MM-DD or RFC3339)"`
	SearchQuery string   `json:"search_query,omitempty" jsonschema:"Search by description"`
	Limit       int32    `json:"limit,omitempty" jsonschema:"Max results to return (1-100, default 20)"`
	PageToken   string   `json:"page_token,omitempty" jsonschema:"Pagination cursor"`
}

// TransactionItem summarizes a ledger transaction.
type TransactionItem struct {
	ID              string  `json:"id"`
	Type            string  `json:"type"`
	Description     string  `json:"description"`
	AmountCents     int64   `json:"amount_cents"`
	Currency        string  `json:"currency"`
	FormattedAmount string  `json:"formatted_amount"`
	AmountInBase    int64   `json:"amount_in_base_cents"`
	BudgetID        *string `json:"budget_id,omitempty"`
	BudgetName      string  `json:"budget_name,omitempty"`
	AccountID       *string `json:"account_id,omitempty"`
	AccountName     string  `json:"account_name,omitempty"`
	TransactionDate string  `json:"transaction_date"`
	EffectiveDate   string  `json:"effective_date"`
}

// ListTransactionsOutput is returned by finance_list_transactions.
type ListTransactionsOutput struct {
	Transactions  []TransactionItem `json:"transactions"`
	NextPageToken string            `json:"next_page_token,omitempty"`
}

func (h *Handler) listTransactions(ctx context.Context, in ListTransactionsInput) (ListTransactionsOutput, error) {
	rCtx, err := h.coord.ResolveContext(ctx)
	if err != nil {
		return ListTransactionsOutput{}, err
	}

	filter := finance.TransactionFilter{
		PageSize:      mcptransport.ClampLimit(in.Limit, defaultListLimit, maxListLimit),
		NextPageToken: in.PageToken,
	}
	if bID := strings.TrimSpace(in.BudgetID); bID != "" {
		filter.BudgetID = new(finance.BudgetID(bID))
	}
	if aID := strings.TrimSpace(in.AccountID); aID != "" {
		filter.AccountID = new(finance.AccountID(aID))
	}
	if len(in.Types) > 0 {
		types := make([]finance.TransactionType, 0, len(in.Types))
		for _, t := range in.Types {
			types = append(types, finance.TransactionType(strings.ToUpper(strings.TrimSpace(t))))
		}
		filter.Types = types
	}
	if q := strings.TrimSpace(in.SearchQuery); q != "" {
		filter.SearchQuery = new(q)
	}
	if filter.StartDate, err = mcptransport.ParseOptionalTime(in.StartDate, "start_date", rCtx.Location()); err != nil {
		return ListTransactionsOutput{}, err
	}
	if filter.EndDate, err = mcptransport.ParseOptionalTime(in.EndDate, "end_date", rCtx.Location()); err != nil {
		return ListTransactionsOutput{}, err
	}

	page, err := h.agg.ListTransactions(ctx, rCtx, financeaggregator.ViewFull, filter)
	if err != nil {
		return ListTransactionsOutput{}, err
	}

	loc := rCtx.Location()
	items := make([]TransactionItem, 0, len(page.Items))
	for _, tx := range page.Items {
		item := TransactionItem{
			ID:              string(tx.ID),
			Type:            string(tx.Type),
			Description:     tx.Description,
			AmountCents:     tx.Amount,
			Currency:        string(tx.Currency),
			FormattedAmount: formatMoney(tx.Amount, string(tx.Currency)),
			AmountInBase:    tx.AmountInBase,
			TransactionDate: tx.TransactionDate.In(loc).Format(time.RFC3339),
			EffectiveDate:   tx.EffectiveDate.In(loc).Format("2006-01-02"),
		}
		if tx.BudgetID != nil {
			item.BudgetID = new(string(*tx.BudgetID))
		}
		if tx.Budget != nil && tx.Budget.Budget != nil {
			item.BudgetName = tx.Budget.Name
		}
		if tx.AccountID != nil {
			item.AccountID = new(string(*tx.AccountID))
		}
		if tx.Account != nil && tx.Account.Account != nil {
			item.AccountName = tx.Account.Name
		}
		items = append(items, item)
	}

	return ListTransactionsOutput{
		Transactions:  items,
		NextPageToken: page.NextPageToken,
	}, nil
}

// GetInsightsInput defines parameters for finance_get_insights.
type GetInsightsInput struct {
	Granularity string `json:"granularity,omitempty" jsonschema:"Bucket granularity ('daily', 'weekly', 'monthly', 'yearly')"`
	StartDate   string `json:"start_date,omitempty" jsonschema:"Start date (YYYY-MM-DD or RFC3339)"`
	EndDate     string `json:"end_date,omitempty" jsonschema:"End date (YYYY-MM-DD or RFC3339)"`
}

// BudgetUsageSummary summarizes spend against a budget in insights.
type BudgetUsageSummary struct {
	BudgetID        string  `json:"budget_id"`
	BudgetName      string  `json:"budget_name"`
	LimitCents      int64   `json:"limit_cents"`
	SpentCents      int64   `json:"spent_cents"`
	FormattedSpent  string  `json:"formatted_spent"`
	UsagePercentage float64 `json:"usage_percentage"`
}

// InsightsOutput summarizes workspace outflow and inflow analytics.
type InsightsOutput struct {
	BaseCurrency             string               `json:"base_currency"`
	TotalLimitCents          int64                `json:"total_limit_cents"`
	FormattedTotalLimit      string               `json:"formatted_total_limit"`
	TotalSpentCents          int64                `json:"total_spent_cents"`
	FormattedTotalSpent      string               `json:"formatted_total_spent"`
	RemainingBudgetCents     int64                `json:"remaining_budget_cents"`
	FormattedRemainingBudget string               `json:"formatted_remaining_budget"`
	DailyBurnRateCents       float64              `json:"daily_burn_rate_cents"`
	TotalIncomeCents         int64                `json:"total_income_cents"`
	FormattedTotalIncome     string               `json:"formatted_total_income"`
	BudgetDistributions      []BudgetUsageSummary `json:"budget_distributions"`
}

func (h *Handler) getInsights(ctx context.Context, in GetInsightsInput) (InsightsOutput, error) {
	rCtx, err := h.coord.ResolveContext(ctx)
	if err != nil {
		return InsightsOutput{}, err
	}

	req := &financeapp.GetInsightsRequest{
		Granularity: in.Granularity,
	}
	if t, err := mcptransport.ParseOptionalTime(in.StartDate, "start_date", rCtx.Location()); err != nil {
		return InsightsOutput{}, err
	} else if t != nil {
		req.StartDate = *t
	}
	if t, err := mcptransport.ParseOptionalTime(in.EndDate, "end_date", rCtx.Location()); err != nil {
		return InsightsOutput{}, err
	} else if t != nil {
		req.EndDate = *t
	}

	insights, err := h.coord.GetInsights(ctx, req)
	if err != nil {
		return InsightsOutput{}, err
	}

	baseCurr := string(rCtx.BaseCurrency())
	out := InsightsOutput{
		BaseCurrency: baseCurr,
	}
	if insights.Spent != nil {
		out.TotalLimitCents = insights.Spent.TotalLimit
		out.FormattedTotalLimit = formatMoney(insights.Spent.TotalLimit, baseCurr)
		out.TotalSpentCents = insights.Spent.TotalSpent
		out.FormattedTotalSpent = formatMoney(insights.Spent.TotalSpent, baseCurr)
		out.RemainingBudgetCents = insights.Spent.RemainingBudget
		out.FormattedRemainingBudget = formatMoney(insights.Spent.RemainingBudget, baseCurr)
		out.DailyBurnRateCents = insights.Spent.BurnRate
		for _, d := range insights.Spent.Distributions {
			out.BudgetDistributions = append(out.BudgetDistributions, BudgetUsageSummary{
				BudgetID:        d.BudgetID,
				BudgetName:      d.BudgetName,
				LimitCents:      d.Limit,
				SpentCents:      d.SpentInBase,
				FormattedSpent:  formatMoney(d.SpentInBase, baseCurr),
				UsagePercentage: d.UsagePercentage,
			})
		}
	}
	if insights.Income != nil {
		out.TotalIncomeCents = insights.Income.TotalIncome
		out.FormattedTotalIncome = formatMoney(insights.Income.TotalIncome, baseCurr)
	}

	return out, nil
}

// ListInboxItemsInput defines parameters for finance_list_inbox_items.
type ListInboxItemsInput struct {
	Status      string `json:"status,omitempty" jsonschema:"Filter by status ('pending', 'processing', 'resolved', 'archived')"`
	SearchQuery string `json:"search_query,omitempty" jsonschema:"Search by vendor name"`
	Limit       int32  `json:"limit,omitempty" jsonschema:"Max results to return (1-100, default 20)"`
	PageToken   string `json:"page_token,omitempty" jsonschema:"Pagination cursor"`
}

// InboxItemSummary represents a staged financial inbox item.
type InboxItemSummary struct {
	ID              string  `json:"id"`
	Status          string  `json:"status"`
	DocType         string  `json:"doc_type"`
	VendorName      string  `json:"vendor_name"`
	AmountCents     int64   `json:"amount_cents"`
	Currency        string  `json:"currency"`
	FormattedAmount string  `json:"formatted_amount"`
	TransactionDate string  `json:"transaction_date"`
	AccountID       *string `json:"account_id,omitempty"`
	BudgetID        *string `json:"budget_id,omitempty"`
}

// ListInboxItemsOutput is returned by finance_list_inbox_items.
type ListInboxItemsOutput struct {
	Items         []InboxItemSummary `json:"items"`
	NextPageToken string             `json:"next_page_token,omitempty"`
}

func (h *Handler) listInboxItems(ctx context.Context, in ListInboxItemsInput) (ListInboxItemsOutput, error) {
	rCtx, err := h.coord.ResolveContext(ctx)
	if err != nil {
		return ListInboxItemsOutput{}, err
	}

	filter := finance.ListInboxItemsFilter{
		PageSize:       mcptransport.ClampLimit(in.Limit, defaultListLimit, maxListLimit),
		NextPageToken:  in.PageToken,
		ExcludePayload: true,
	}
	if s := strings.TrimSpace(in.Status); s != "" {
		filter.Status = new(finance.InboxItemStatus(strings.ToLower(s)))
	}
	if q := strings.TrimSpace(in.SearchQuery); q != "" {
		filter.SearchQuery = new(q)
	}

	page, err := h.agg.ListInboxItems(ctx, rCtx, filter)
	if err != nil {
		return ListInboxItemsOutput{}, err
	}

	loc := rCtx.Location()
	items := make([]InboxItemSummary, 0, len(page.Items))
	for _, item := range page.Items {
		items = append(items, InboxItemSummary{
			ID:              item.ID,
			Status:          string(item.Status),
			DocType:         string(item.DocType),
			VendorName:      item.VendorName,
			AmountCents:     item.Amount,
			Currency:        item.Currency,
			FormattedAmount: formatMoney(item.Amount, item.Currency),
			TransactionDate: item.TransactionDate.In(loc).Format("2006-01-02"),
			AccountID:       item.AccountID,
			BudgetID:        item.BudgetID,
		})
	}

	return ListInboxItemsOutput{
		Items:         items,
		NextPageToken: page.NextPageToken,
	}, nil
}

// ListBorrowingsInput defines parameters for finance_list_borrowings.
type ListBorrowingsInput struct {
	Status    string `json:"status,omitempty" jsonschema:"Filter by status ('active', 'settled')"`
	Direction string `json:"direction,omitempty" jsonschema:"Filter by direction ('BORROWED', 'LENT')"`
	Limit     int32  `json:"limit,omitempty" jsonschema:"Max results to return (1-100, default 20)"`
	PageToken string `json:"page_token,omitempty" jsonschema:"Pagination cursor"`
}

// BorrowingSummary represents a borrowing or lending record.
type BorrowingSummary struct {
	ID                 string `json:"id"`
	Direction          string `json:"direction"`
	Counterparty       string `json:"counterparty"`
	Status             string `json:"status"`
	Currency           string `json:"currency"`
	TotalAmountCents   int64  `json:"total_amount_cents"`
	RemainingCents     int64  `json:"remaining_amount_cents"`
	FormattedRemaining string `json:"formatted_remaining"`
	DueAt              string `json:"due_at,omitempty"`
}

// ListBorrowingsOutput is returned by finance_list_borrowings.
type ListBorrowingsOutput struct {
	Borrowings    []BorrowingSummary `json:"borrowings"`
	NextPageToken string             `json:"next_page_token,omitempty"`
}

func (h *Handler) listBorrowings(ctx context.Context, in ListBorrowingsInput) (ListBorrowingsOutput, error) {
	rCtx, err := h.coord.ResolveContext(ctx)
	if err != nil {
		return ListBorrowingsOutput{}, err
	}

	filter := financeaggregator.ListBorrowingsFilter{
		PageSize:      mcptransport.ClampLimit(in.Limit, defaultListLimit, maxListLimit),
		NextPageToken: in.PageToken,
	}
	if s := strings.TrimSpace(in.Status); s != "" {
		filter.Status = new(finance.BorrowingStatus(strings.ToLower(s)))
	}
	if d := strings.TrimSpace(in.Direction); d != "" {
		filter.Direction = new(finance.BorrowingDirection(strings.ToUpper(d)))
	}

	list, nextToken, err := h.agg.ListBorrowings(ctx, rCtx, filter)
	if err != nil {
		return ListBorrowingsOutput{}, err
	}

	loc := rCtx.Location()
	items := make([]BorrowingSummary, 0, len(list))
	for _, b := range list {
		curr := string(b.Currency)
		item := BorrowingSummary{
			ID:                 string(b.ID),
			Direction:          string(b.Direction),
			Counterparty:       b.Counterparty,
			Status:             string(b.Status),
			Currency:           curr,
			TotalAmountCents:   b.TotalAmount,
			RemainingCents:     b.RemainingAmount,
			FormattedRemaining: formatMoney(b.RemainingAmount, curr),
		}
		if b.DueAt != nil {
			item.DueAt = b.DueAt.In(loc).Format("2006-01-02")
		}
		items = append(items, item)
	}

	return ListBorrowingsOutput{
		Borrowings:    items,
		NextPageToken: nextToken,
	}, nil
}

// ListRecurringInput defines parameters for finance_list_recurring.
type ListRecurringInput struct {
	Status      string `json:"status,omitempty" jsonschema:"Filter by status ('active', 'paused', 'ended')"`
	SearchQuery string `json:"search_query,omitempty" jsonschema:"Search by template name"`
	Limit       int32  `json:"limit,omitempty" jsonschema:"Max results to return (1-100, default 20)"`
	PageToken   string `json:"page_token,omitempty" jsonschema:"Pagination cursor"`
}

// RecurringItem summarizes a recurring transaction template.
type RecurringItem struct {
	ID              string `json:"id"`
	Name            string `json:"name"`
	Type            string `json:"type"`
	Status          string `json:"status"`
	AmountCents     int64  `json:"amount_cents"`
	Currency        string `json:"currency"`
	FormattedAmount string `json:"formatted_amount"`
	Interval        string `json:"interval"`
	NextDueDate     string `json:"next_due_date"`
	BudgetName      string `json:"budget_name,omitempty"`
}

// ListRecurringOutput is returned by finance_list_recurring.
type ListRecurringOutput struct {
	Recurring     []RecurringItem `json:"recurring"`
	NextPageToken string          `json:"next_page_token,omitempty"`
}

func (h *Handler) listRecurring(ctx context.Context, in ListRecurringInput) (ListRecurringOutput, error) {
	rCtx, err := h.coord.ResolveContext(ctx)
	if err != nil {
		return ListRecurringOutput{}, err
	}

	filter := finance.ListRecurringTransactionsFilter{
		PageSize:      mcptransport.ClampLimit(in.Limit, defaultListLimit, maxListLimit),
		NextPageToken: in.PageToken,
	}
	if s := strings.TrimSpace(in.Status); s != "" {
		filter.Status = new(finance.RecurringTransactionStatus(strings.ToLower(s)))
	}
	if q := strings.TrimSpace(in.SearchQuery); q != "" {
		filter.SearchQuery = new(q)
	}

	page, err := h.agg.ListRecurringTransactions(ctx, rCtx, financeaggregator.ViewFull, filter)
	if err != nil {
		return ListRecurringOutput{}, err
	}

	loc := rCtx.Location()
	items := make([]RecurringItem, 0, len(page.Items))
	for _, r := range page.Items {
		curr := string(r.Currency)
		item := RecurringItem{
			ID:              string(r.ID),
			Name:            r.Name,
			Type:            string(r.Type),
			Status:          string(r.Status),
			AmountCents:     r.Amount,
			Currency:        curr,
			FormattedAmount: formatMoney(r.Amount, curr),
			Interval:        string(r.Interval),
			NextDueDate:     r.NextDueDate.In(loc).Format("2006-01-02"),
		}
		if r.Budget != nil && r.Budget.Budget != nil {
			item.BudgetName = r.Budget.Name
		}
		items = append(items, item)
	}

	return ListRecurringOutput{
		Recurring:     items,
		NextPageToken: page.NextPageToken,
	}, nil
}

// CreateTransactionInput defines parameters for finance_create_transaction.
type CreateTransactionInput struct {
	Type            string `json:"type" jsonschema:"Transaction type: 'EXPENSE' or 'INCOME'"`
	BudgetID        string `json:"budget_id,omitempty" jsonschema:"Budget ID (required when type is EXPENSE)"`
	AccountID       string `json:"account_id,omitempty" jsonschema:"Optional account ID"`
	AmountCents     int64  `json:"amount_cents" jsonschema:"Positive integer amount in minor currency units (cents)"`
	Currency        string `json:"currency" jsonschema:"3-letter ISO currency code (e.g. USD)"`
	Description     string `json:"description" jsonschema:"Transaction description"`
	TransactionDate string `json:"transaction_date,omitempty" jsonschema:"Optional date/time (YYYY-MM-DD or RFC3339); defaults to current workspace time"`
}

// CreateTransactionOutput returns the created transaction summary.
type CreateTransactionOutput struct {
	ID              string `json:"id"`
	Type            string `json:"type"`
	AmountCents     int64  `json:"amount_cents"`
	Currency        string `json:"currency"`
	FormattedAmount string `json:"formatted_amount"`
	Description     string `json:"description"`
	TransactionDate string `json:"transaction_date"`
}

func (h *Handler) createTransaction(ctx context.Context, in CreateTransactionInput) (CreateTransactionOutput, error) {
	rCtx, err := h.coord.ResolveContext(ctx)
	if err != nil {
		return CreateTransactionOutput{}, err
	}

	if in.AmountCents <= 0 {
		return CreateTransactionOutput{}, errors.E(errors.Invalid, "amount_cents must be greater than zero")
	}

	curr, err := finance.ParseCurrency(in.Currency)
	if err != nil {
		return CreateTransactionOutput{}, errors.E(errors.Invalid, err)
	}

	txDate := rCtx.Now()
	if t, err := mcptransport.ParseOptionalTime(in.TransactionDate, "transaction_date", rCtx.Location()); err != nil {
		return CreateTransactionOutput{}, err
	} else if t != nil {
		txDate = *t
	}

	var accID *finance.AccountID
	if s := strings.TrimSpace(in.AccountID); s != "" {
		accID = new(finance.AccountID(s))
	}

	txType := strings.ToUpper(strings.TrimSpace(in.Type))
	var created *finance.Transaction
	switch txType {
	case "EXPENSE", "":
		budgetID := strings.TrimSpace(in.BudgetID)
		if budgetID == "" {
			return CreateTransactionOutput{}, errors.E(errors.Invalid, "budget_id is required for EXPENSE transactions")
		}
		created, err = h.coord.CreateExpense(ctx, &financeapp.CreateExpenseRequest{
			BudgetID:        finance.BudgetID(budgetID),
			Amount:          in.AmountCents,
			Currency:        curr,
			Description:     strings.TrimSpace(in.Description),
			TransactionDate: txDate,
			AccountID:       accID,
		})
	case "INCOME":
		created, err = h.coord.CreateIncome(ctx, &financeapp.CreateIncomeRequest{
			Amount:          in.AmountCents,
			Currency:        curr,
			Description:     strings.TrimSpace(in.Description),
			TransactionDate: txDate,
			AccountID:       accID,
		})
	default:
		return CreateTransactionOutput{}, errors.E(errors.Invalid, fmt.Sprintf("unsupported transaction type %q (expected EXPENSE or INCOME)", in.Type))
	}
	if err != nil {
		return CreateTransactionOutput{}, err
	}

	return CreateTransactionOutput{
		ID:              string(created.ID),
		Type:            string(created.Type),
		AmountCents:     created.Amount,
		Currency:        string(created.Currency),
		FormattedAmount: formatMoney(created.Amount, string(created.Currency)),
		Description:     created.Description,
		TransactionDate: created.TransactionDate.In(rCtx.Location()).Format(time.RFC3339),
	}, nil
}

// CreateTransferInput defines parameters for finance_create_transfer.
type CreateTransferInput struct {
	SourceAccountID        string `json:"source_account_id" jsonschema:"Source account ID"`
	DestinationAccountID   string `json:"destination_account_id" jsonschema:"Destination account ID"`
	SourceAmountCents      int64  `json:"source_amount_cents" jsonschema:"Positive amount debited from source account in cents"`
	DestinationAmountCents int64  `json:"destination_amount_cents,omitempty" jsonschema:"Optional credited amount in cents (defaults to source_amount_cents)"`
	TransferDate           string `json:"transfer_date,omitempty" jsonschema:"Optional transfer date (YYYY-MM-DD or RFC3339)"`
	Notes                  string `json:"notes,omitempty" jsonschema:"Optional transfer notes"`
}

// CreateTransferOutput returns the created transfer summary.
type CreateTransferOutput struct {
	ID                   string `json:"id"`
	SourceAccountID      string `json:"source_account_id"`
	DestinationAccountID string `json:"destination_account_id"`
	SourceAmountCents    int64  `json:"source_amount_cents"`
	DestinationCents     int64  `json:"destination_amount_cents"`
	TransferDate         string `json:"transfer_date"`
}

func (h *Handler) createTransfer(ctx context.Context, in CreateTransferInput) (CreateTransferOutput, error) {
	rCtx, err := h.coord.ResolveContext(ctx)
	if err != nil {
		return CreateTransferOutput{}, err
	}
	if strings.TrimSpace(in.SourceAccountID) == "" || strings.TrimSpace(in.DestinationAccountID) == "" {
		return CreateTransferOutput{}, errors.E(errors.Invalid, "source_account_id and destination_account_id are required")
	}
	if in.SourceAmountCents <= 0 {
		return CreateTransferOutput{}, errors.E(errors.Invalid, "source_amount_cents must be greater than zero")
	}

	destAmount := in.DestinationAmountCents
	if destAmount <= 0 {
		destAmount = in.SourceAmountCents
	}

	transferDate := rCtx.Now()
	if t, err := mcptransport.ParseOptionalTime(in.TransferDate, "transfer_date", rCtx.Location()); err != nil {
		return CreateTransferOutput{}, err
	} else if t != nil {
		transferDate = *t
	}

	tr, err := h.coord.CreateTransfer(ctx, &financeapp.CreateTransferRequest{
		SourceAccountID:      strings.TrimSpace(in.SourceAccountID),
		DestinationAccountID: strings.TrimSpace(in.DestinationAccountID),
		SourceAmount:         in.SourceAmountCents,
		DestinationAmount:    destAmount,
		TransferDate:         transferDate,
		Notes:                strings.TrimSpace(in.Notes),
	})
	if err != nil {
		return CreateTransferOutput{}, err
	}

	return CreateTransferOutput{
		ID:                   string(tr.ID),
		SourceAccountID:      string(tr.SourceAccountID),
		DestinationAccountID: string(tr.DestinationAccountID),
		SourceAmountCents:    tr.SourceAmount,
		DestinationCents:     tr.DestinationAmount,
		TransferDate:         tr.TransferDate.In(rCtx.Location()).Format(time.RFC3339),
	}, nil
}

// CreateInboxItemInput defines parameters for finance_create_inbox_item.
type CreateInboxItemInput struct {
	DocType         string `json:"doc_type" jsonschema:"Document type: 'INVOICE', 'RECEIPT', 'BANK_NOTIFICATION', or 'UNKNOWN'"`
	Vendor          string `json:"vendor" jsonschema:"Vendor or merchant name"`
	AmountCents     int64  `json:"amount_cents" jsonschema:"Positive amount in cents"`
	Currency        string `json:"currency" jsonschema:"3-letter ISO currency code"`
	Date            string `json:"date,omitempty" jsonschema:"Optional transaction date (YYYY-MM-DD)"`
	AccountID       string `json:"account_id,omitempty" jsonschema:"Optional target account ID"`
	SuggestedBudget string `json:"suggested_budget,omitempty" jsonschema:"Optional budget name or ID hint"`
	RawPayload      string `json:"raw_payload,omitempty" jsonschema:"Optional source text or memo"`
}

// CreateInboxItemOutput returns the staged inbox item summary.
type CreateInboxItemOutput struct {
	ID              string `json:"id"`
	Status          string `json:"status"`
	DocType         string `json:"doc_type"`
	VendorName      string `json:"vendor_name"`
	AmountCents     int64  `json:"amount_cents"`
	Currency        string `json:"currency"`
	FormattedAmount string `json:"formatted_amount"`
	TransactionDate string `json:"transaction_date"`
}

func (h *Handler) createInboxItem(ctx context.Context, in CreateInboxItemInput) (CreateInboxItemOutput, error) {
	rCtx, err := h.coord.ResolveContext(ctx)
	if err != nil {
		return CreateInboxItemOutput{}, err
	}
	if in.AmountCents <= 0 {
		return CreateInboxItemOutput{}, errors.E(errors.Invalid, "amount_cents must be greater than zero")
	}
	if strings.TrimSpace(in.Vendor) == "" {
		return CreateInboxItemOutput{}, errors.E(errors.Invalid, "vendor is required")
	}

	curr, err := finance.ParseCurrency(in.Currency)
	if err != nil {
		return CreateInboxItemOutput{}, errors.E(errors.Invalid, err)
	}

	dateStr := strings.TrimSpace(in.Date)
	if dateStr == "" {
		dateStr = rCtx.Now().Format("2006-01-02")
	}

	var accID *string
	if s := strings.TrimSpace(in.AccountID); s != "" {
		accID = new(s)
	}

	staged, err := h.coord.StageInboxItem(ctx, &finance.StageInboxItem{
		DocType:         finance.ParseInboxItemDocType(in.DocType),
		Vendor:          strings.TrimSpace(in.Vendor),
		Amount:          in.AmountCents,
		Currency:        string(curr),
		AccountID:       accID,
		SuggestedBudget: strings.TrimSpace(in.SuggestedBudget),
		Date:            dateStr,
		RawPayload:      strings.TrimSpace(in.RawPayload),
	})
	if err != nil {
		return CreateInboxItemOutput{}, err
	}

	return CreateInboxItemOutput{
		ID:              staged.ID,
		Status:          string(staged.Status),
		DocType:         string(staged.DocType),
		VendorName:      staged.VendorName,
		AmountCents:     staged.Amount,
		Currency:        staged.Currency,
		FormattedAmount: formatMoney(staged.Amount, staged.Currency),
		TransactionDate: staged.TransactionDate.In(rCtx.Location()).Format("2006-01-02"),
	}, nil
}

// UpdateTransactionInput defines parameters for finance_update_transaction.
type UpdateTransactionInput struct {
	ID          string  `json:"id" jsonschema:"Transaction ID (txn_...) to update"`
	AmountCents *int64  `json:"amount_cents,omitempty" jsonschema:"Updated positive amount in minor currency units (cents)"`
	Currency    string  `json:"currency,omitempty" jsonschema:"Updated 3-letter ISO currency code (e.g. USD)"`
	Description *string `json:"description,omitempty" jsonschema:"Updated transaction description"`
	BudgetID    *string `json:"budget_id,omitempty" jsonschema:"Updated budget ID (applicable to EXPENSE transactions)"`
	AccountID   *string `json:"account_id,omitempty" jsonschema:"Updated account ID (pass empty string to clear)"`
	Date        string  `json:"date,omitempty" jsonschema:"Updated transaction date/time (YYYY-MM-DD or RFC3339)"`
	Notes       *string `json:"notes,omitempty" jsonschema:"Optional updated notes (used as description if description is omitted)"`
}

// TransactionSummary summarizes a created or updated transaction.
type TransactionSummary struct {
	ID              string  `json:"id"`
	Type            string  `json:"type"`
	AmountCents     int64   `json:"amount_cents"`
	Currency        string  `json:"currency"`
	FormattedAmount string  `json:"formatted_amount"`
	Description     string  `json:"description"`
	BudgetID        *string `json:"budget_id,omitempty"`
	AccountID       *string `json:"account_id,omitempty"`
	TransactionDate string  `json:"transaction_date"`
}

func toTransactionSummary(txn *finance.Transaction, loc *time.Location) TransactionSummary {
	out := TransactionSummary{
		ID:              string(txn.ID),
		Type:            string(txn.Type),
		AmountCents:     txn.Amount,
		Currency:        string(txn.Currency),
		FormattedAmount: formatMoney(txn.Amount, string(txn.Currency)),
		Description:     txn.Description,
		TransactionDate: txn.TransactionDate.In(loc).Format(time.RFC3339),
	}
	if txn.BudgetID != nil {
		out.BudgetID = new(string(*txn.BudgetID))
	}
	if txn.AccountID != nil {
		out.AccountID = new(string(*txn.AccountID))
	}
	return out
}

func (h *Handler) updateTransaction(ctx context.Context, in UpdateTransactionInput) (TransactionSummary, error) {
	rCtx, err := h.coord.ResolveContext(ctx)
	if err != nil {
		return TransactionSummary{}, err
	}

	id := strings.TrimSpace(in.ID)
	if id == "" {
		return TransactionSummary{}, errors.E(errors.Invalid, "transaction id is required")
	}

	if in.AmountCents == nil && strings.TrimSpace(in.Currency) == "" && in.Description == nil &&
		in.BudgetID == nil && in.AccountID == nil && strings.TrimSpace(in.Date) == "" && in.Notes == nil {
		return TransactionSummary{}, errors.E(errors.Invalid, "at least one field to update must be provided")
	}

	existing, err := h.agg.GetTransaction(ctx, rCtx, financeaggregator.ViewBasic, finance.TransactionID(id))
	if err != nil {
		return TransactionSummary{}, err
	}

	amount := existing.Amount
	if in.AmountCents != nil {
		if *in.AmountCents <= 0 {
			return TransactionSummary{}, errors.E(errors.Invalid, "amount_cents must be greater than zero")
		}
		amount = *in.AmountCents
	}

	curr := existing.Currency
	if strings.TrimSpace(in.Currency) != "" {
		parsedCurr, cErr := finance.ParseCurrency(in.Currency)
		if cErr != nil {
			return TransactionSummary{}, errors.E(errors.Invalid, cErr)
		}
		curr = parsedCurr
	}

	desc := existing.Description
	if in.Description != nil {
		desc = strings.TrimSpace(*in.Description)
	} else if in.Notes != nil {
		desc = strings.TrimSpace(*in.Notes)
	}

	txDate := existing.TransactionDate
	effDate := existing.EffectiveDate
	if t, tErr := mcptransport.ParseOptionalTime(in.Date, "date", rCtx.Location()); tErr != nil {
		return TransactionSummary{}, tErr
	} else if t != nil {
		txDate = *t
		effDate = *t
	}

	accID := existing.AccountID
	if in.AccountID != nil {
		if s := strings.TrimSpace(*in.AccountID); s == "" {
			accID = nil
		} else {
			accID = new(finance.AccountID(s))
		}
	}

	var updated *finance.Transaction
	switch existing.Type {
	case finance.TransactionTypeExpense:
		var budgetID finance.BudgetID
		if existing.BudgetID != nil {
			budgetID = *existing.BudgetID
		}
		if in.BudgetID != nil {
			budgetID = finance.BudgetID(strings.TrimSpace(*in.BudgetID))
		}
		if budgetID == "" {
			return TransactionSummary{}, errors.E(errors.Invalid, "budget_id is required for EXPENSE transactions")
		}
		updated, err = h.coord.UpdateExpense(ctx, &financeapp.UpdateExpenseRequest{
			TransactionID:   existing.ID,
			BudgetID:        budgetID,
			Amount:          amount,
			Currency:        curr,
			Description:     desc,
			TransactionDate: txDate,
			EffectiveDate:   effDate,
			AccountID:       accID,
		})
	case finance.TransactionTypeIncome:
		updated, err = h.coord.UpdateIncome(ctx, &financeapp.UpdateIncomeRequest{
			TransactionID:   existing.ID,
			Amount:          amount,
			Currency:        curr,
			Description:     desc,
			TransactionDate: txDate,
			EffectiveDate:   effDate,
			AccountID:       accID,
		})
	default:
		return TransactionSummary{}, errors.E(errors.Invalid, fmt.Sprintf("transactions of type %s cannot be updated directly", existing.Type))
	}
	if err != nil {
		return TransactionSummary{}, err
	}

	return toTransactionSummary(updated, rCtx.Location()), nil
}

// DeleteTransactionInput defines parameters for finance_delete_transaction.
type DeleteTransactionInput struct {
	ID   string `json:"id" jsonschema:"Transaction ID (txn_...) or transfer ID (trsf_...) to delete"`
	Kind string `json:"kind,omitempty" jsonschema:"Optional entity kind: 'transaction' (default) or 'transfer'"`
}

// DeleteTransactionOutput confirms deletion of a transaction or transfer.
type DeleteTransactionOutput struct {
	ID      string `json:"id"`
	Kind    string `json:"kind"`
	Deleted bool   `json:"deleted"`
}

func (h *Handler) deleteTransaction(ctx context.Context, in DeleteTransactionInput) (DeleteTransactionOutput, error) {
	if _, err := h.coord.ResolveContext(ctx); err != nil {
		return DeleteTransactionOutput{}, err
	}

	id := strings.TrimSpace(in.ID)
	if id == "" {
		return DeleteTransactionOutput{}, errors.E(errors.Invalid, "id is required")
	}

	kind := strings.ToLower(strings.TrimSpace(in.Kind))
	if kind == "" {
		if strings.HasPrefix(id, "trf_") || strings.HasPrefix(id, "trsf_") {
			kind = "transfer"
		} else {
			kind = "transaction"
		}
	}

	switch kind {
	case "transfer":
		if err := h.coord.DeleteTransfer(ctx, finance.TransferID(id)); err != nil {
			return DeleteTransactionOutput{}, err
		}
	case "transaction":
		if err := h.coord.DeleteTransaction(ctx, finance.TransactionID(id)); err != nil {
			return DeleteTransactionOutput{}, err
		}
	default:
		return DeleteTransactionOutput{}, errors.E(errors.Invalid, fmt.Sprintf("unsupported kind %q (expected 'transaction' or 'transfer')", in.Kind))
	}

	return DeleteTransactionOutput{
		ID:      id,
		Kind:    kind,
		Deleted: true,
	}, nil
}

// ListTransfersInput defines parameters for finance_list_transfers.
type ListTransfersInput struct {
	AccountID string `json:"account_id,omitempty" jsonschema:"Filter transfers involving this account ID"`
	StartDate string `json:"start_date,omitempty" jsonschema:"Optional start date inclusive (YYYY-MM-DD or RFC3339)"`
	EndDate   string `json:"end_date,omitempty" jsonschema:"Optional end date inclusive (YYYY-MM-DD or RFC3339)"`
	Limit     int32  `json:"limit,omitempty" jsonschema:"Max results to return (1-100, default 20)"`
	PageToken string `json:"page_token,omitempty" jsonschema:"Pagination cursor"`
}

// TransferSummary summarizes an account-to-account transfer.
type TransferSummary struct {
	ID                         string `json:"id"`
	SourceAccountID            string `json:"source_account_id"`
	DestinationAccountID       string `json:"destination_account_id"`
	SourceAmountCents          int64  `json:"source_amount_cents"`
	DestinationAmountCents     int64  `json:"destination_amount_cents"`
	FormattedSourceAmount      string `json:"formatted_source_amount"`
	FormattedDestinationAmount string `json:"formatted_destination_amount"`
	TransferDate               string `json:"transfer_date"`
	Notes                      string `json:"notes,omitempty"`
}

// ListTransfersOutput is returned by finance_list_transfers.
type ListTransfersOutput struct {
	Transfers     []TransferSummary `json:"transfers"`
	NextPageToken string            `json:"next_page_token,omitempty"`
}

func (h *Handler) listTransfers(ctx context.Context, in ListTransfersInput) (ListTransfersOutput, error) {
	rCtx, err := h.coord.ResolveContext(ctx)
	if err != nil {
		return ListTransfersOutput{}, err
	}

	loc := rCtx.Location()
	startDate, err := mcptransport.ParseOptionalTime(in.StartDate, "start_date", loc)
	if err != nil {
		return ListTransfersOutput{}, err
	}
	endDate, err := mcptransport.ParseOptionalTime(in.EndDate, "end_date", loc)
	if err != nil {
		return ListTransfersOutput{}, err
	}
	if endDate != nil && len(strings.TrimSpace(in.EndDate)) == 10 {
		eod := endDate.Add(24*time.Hour - time.Nanosecond)
		endDate = &eod
	}

	list, nextToken, err := h.coord.ListTransfers(ctx, &financeapp.ListTransfersRequest{
		Limit:     mcptransport.ClampLimit(in.Limit, defaultListLimit, maxListLimit),
		PageToken: in.PageToken,
	})
	if err != nil {
		return ListTransfersOutput{}, err
	}

	accFilter := strings.TrimSpace(in.AccountID)
	baseCurr := string(rCtx.BaseCurrency())
	items := make([]TransferSummary, 0, len(list))
	for _, tr := range list {
		if accFilter != "" && string(tr.SourceAccountID) != accFilter && string(tr.DestinationAccountID) != accFilter {
			continue
		}
		localized := tr.TransferDate.In(loc)
		if startDate != nil && localized.Before(*startDate) {
			continue
		}
		if endDate != nil && localized.After(*endDate) {
			continue
		}
		items = append(items, TransferSummary{
			ID:                         string(tr.ID),
			SourceAccountID:            string(tr.SourceAccountID),
			DestinationAccountID:       string(tr.DestinationAccountID),
			SourceAmountCents:          tr.SourceAmount,
			DestinationAmountCents:     tr.DestinationAmount,
			FormattedSourceAmount:      formatMoney(tr.SourceAmount, baseCurr),
			FormattedDestinationAmount: formatMoney(tr.DestinationAmount, baseCurr),
			TransferDate:               localized.Format(time.RFC3339),
			Notes:                      tr.Notes,
		})
	}

	return ListTransfersOutput{
		Transfers:     items,
		NextPageToken: nextToken,
	}, nil
}

// ReviewInboxItemInput defines parameters for finance_review_inbox_item.
type ReviewInboxItemInput struct {
	ID          string  `json:"id" jsonschema:"Inbox item ID (ibx_...) to review"`
	Action      string  `json:"action" jsonschema:"Review action: 'approve' or 'discard'"`
	Vendor      *string `json:"vendor,omitempty" jsonschema:"Optional vendor name override before approving"`
	AmountCents *int64  `json:"amount_cents,omitempty" jsonschema:"Optional positive amount override in cents before approving"`
	Currency    string  `json:"currency,omitempty" jsonschema:"Optional 3-letter ISO currency code override before approving"`
	BudgetID    *string `json:"budget_id,omitempty" jsonschema:"Optional budget ID override before approving"`
	AccountID   *string `json:"account_id,omitempty" jsonschema:"Optional account ID override before approving"`
	Date        string  `json:"date,omitempty" jsonschema:"Optional transaction date override (YYYY-MM-DD or RFC3339) before approving"`
	Description *string `json:"description,omitempty" jsonschema:"Optional description override before approving"`
	BorrowingID *string `json:"borrowing_id,omitempty" jsonschema:"Optional borrowing ID link override before approving"`
}

func (h *Handler) reviewInboxItem(ctx context.Context, in ReviewInboxItemInput) (InboxItemSummary, error) {
	rCtx, err := h.coord.ResolveContext(ctx)
	if err != nil {
		return InboxItemSummary{}, err
	}

	id := strings.TrimSpace(in.ID)
	if id == "" {
		return InboxItemSummary{}, errors.E(errors.Invalid, "inbox item id is required")
	}

	action := strings.ToLower(strings.TrimSpace(in.Action))
	switch action {
	case "discard":
		if err := h.coord.DiscardInboxItem(ctx, id); err != nil {
			return InboxItemSummary{}, err
		}
		return InboxItemSummary{
			ID:     id,
			Status: "discarded",
		}, nil

	case "approve":
		patchItem := &finance.InboxItem{ID: id}
		var mask []string

		if in.Vendor != nil {
			patchItem.VendorName = strings.TrimSpace(*in.Vendor)
			mask = append(mask, "vendor_name")
		} else if in.Description != nil {
			patchItem.VendorName = strings.TrimSpace(*in.Description)
			mask = append(mask, "vendor_name")
		}
		if in.AmountCents != nil {
			if *in.AmountCents <= 0 {
				return InboxItemSummary{}, errors.E(errors.Invalid, "amount_cents must be greater than zero")
			}
			patchItem.Amount = *in.AmountCents
			mask = append(mask, "amount")
		}
		if strings.TrimSpace(in.Currency) != "" {
			curr, cErr := finance.ParseCurrency(in.Currency)
			if cErr != nil {
				return InboxItemSummary{}, errors.E(errors.Invalid, cErr)
			}
			patchItem.Currency = string(curr)
			mask = append(mask, "currency")
		}
		if in.BudgetID != nil {
			if b := strings.TrimSpace(*in.BudgetID); b == "" {
				patchItem.BudgetID = nil
			} else {
				patchItem.BudgetID = new(b)
			}
			mask = append(mask, "budget_id")
		}
		if in.AccountID != nil {
			if a := strings.TrimSpace(*in.AccountID); a == "" {
				patchItem.AccountID = nil
			} else {
				patchItem.AccountID = new(a)
			}
			mask = append(mask, "account_id")
		}
		if t, tErr := mcptransport.ParseOptionalTime(in.Date, "date", rCtx.Location()); tErr != nil {
			return InboxItemSummary{}, tErr
		} else if t != nil {
			patchItem.TransactionDate = *t
			mask = append(mask, "transaction_date")
		}
		if in.BorrowingID != nil {
			if br := strings.TrimSpace(*in.BorrowingID); br == "" {
				patchItem.BorrowingID = nil
			} else {
				patchItem.BorrowingID = new(br)
			}
			mask = append(mask, "borrowing_id")
		}

		if len(mask) > 0 {
			if _, err := h.coord.UpdateInboxItem(ctx, patchItem, mask); err != nil {
				return InboxItemSummary{}, err
			}
		}

		approved, err := h.coord.ApproveInboxItem(ctx, id)
		if err != nil {
			return InboxItemSummary{}, err
		}

		return InboxItemSummary{
			ID:              approved.ID,
			Status:          string(approved.Status),
			DocType:         string(approved.DocType),
			VendorName:      approved.VendorName,
			AmountCents:     approved.Amount,
			Currency:        approved.Currency,
			FormattedAmount: formatMoney(approved.Amount, approved.Currency),
			TransactionDate: approved.TransactionDate.In(rCtx.Location()).Format("2006-01-02"),
			AccountID:       approved.AccountID,
			BudgetID:        approved.BudgetID,
		}, nil

	default:
		return InboxItemSummary{}, errors.E(errors.Invalid, fmt.Sprintf("unsupported action %q (expected 'approve' or 'discard')", in.Action))
	}
}

// ManageBudgetInput defines parameters for finance_manage_budget.
type ManageBudgetInput struct {
	ID          string `json:"id,omitempty" jsonschema:"Budget ID (bgt_...) to update; omit to create a new budget"`
	Name        string `json:"name,omitempty" jsonschema:"Budget name (required when creating)"`
	LimitCents  *int64 `json:"limit_cents,omitempty" jsonschema:"Positive budget limit in cents (required when creating)"`
	Currency    string `json:"currency,omitempty" jsonschema:"3-letter ISO currency code (defaults to workspace base currency on create)"`
	Interval    string `json:"interval,omitempty" jsonschema:"Recurrence interval: 'weekly', 'monthly' (default), 'yearly', or 'one_time'"`
	Status      string `json:"status,omitempty" jsonschema:"Budget status: 'active', 'paused', or 'closed'"`
	Color       string `json:"color,omitempty" jsonschema:"Optional color token or hex code"`
	Propagation string `json:"propagation,omitempty" jsonschema:"Limit propagation on update: 'current_period' (default) or 'next_periods_only'"`
}

// BudgetSummary summarizes a created or updated budget.
type BudgetSummary struct {
	ID             string `json:"id"`
	Name           string `json:"name"`
	Currency       string `json:"currency"`
	Interval       string `json:"interval"`
	Status         string `json:"status"`
	LimitCents     int64  `json:"limit_cents"`
	FormattedLimit string `json:"formatted_limit"`
	Color          string `json:"color,omitempty"`
	Version        int64  `json:"version"`
}

func (h *Handler) manageBudget(ctx context.Context, in ManageBudgetInput) (BudgetSummary, error) {
	rCtx, err := h.coord.ResolveContext(ctx)
	if err != nil {
		return BudgetSummary{}, err
	}

	id := strings.TrimSpace(in.ID)
	if id == "" {
		name := strings.TrimSpace(in.Name)
		if name == "" {
			return BudgetSummary{}, errors.E(errors.Invalid, "name is required when creating a budget")
		}
		if in.LimitCents == nil || *in.LimitCents <= 0 {
			return BudgetSummary{}, errors.E(errors.Invalid, "limit_cents must be greater than zero when creating a budget")
		}

		currStr := strings.TrimSpace(in.Currency)
		if currStr == "" {
			currStr = string(rCtx.BaseCurrency())
		}
		curr, cErr := finance.ParseCurrency(currStr)
		if cErr != nil {
			return BudgetSummary{}, errors.E(errors.Invalid, cErr)
		}

		interval := finance.IntervalMonthly
		if strings.TrimSpace(in.Interval) != "" {
			parsedInterval, iErr := parseBudgetInterval(in.Interval)
			if iErr != nil {
				return BudgetSummary{}, iErr
			}
			interval = parsedInterval
		}

		status := finance.BudgetStatusActive
		if strings.TrimSpace(in.Status) != "" {
			parsedStatus, sErr := parseBudgetStatus(in.Status)
			if sErr != nil {
				return BudgetSummary{}, sErr
			}
			status = parsedStatus
		}

		created, cErr := h.coord.CreateBudget(ctx, &financeapp.CreateBudgetRequest{
			Budget: &finance.Budget{
				Name:        name,
				LimitAmount: *in.LimitCents,
				Currency:    curr,
				Interval:    interval,
				Status:      status,
				Color:       strings.TrimSpace(in.Color),
			},
		})
		if cErr != nil {
			return BudgetSummary{}, cErr
		}
		return toBudgetSummary(created), nil
	}

	existing, err := h.coord.GetBudget(ctx, finance.BudgetID(id))
	if err != nil {
		return BudgetSummary{}, err
	}

	patchBudget := &finance.Budget{
		ID:      existing.ID,
		Version: existing.Version,
	}
	var mask []string

	if name := strings.TrimSpace(in.Name); name != "" {
		patchBudget.Name = name
		mask = append(mask, "name")
	}
	if in.LimitCents != nil {
		if *in.LimitCents <= 0 {
			return BudgetSummary{}, errors.E(errors.Invalid, "limit_cents must be greater than zero")
		}
		patchBudget.LimitAmount = *in.LimitCents
		mask = append(mask, "limit_amount")
	}
	if strings.TrimSpace(in.Currency) != "" {
		curr, cErr := finance.ParseCurrency(in.Currency)
		if cErr != nil {
			return BudgetSummary{}, errors.E(errors.Invalid, cErr)
		}
		patchBudget.Currency = curr
		mask = append(mask, "currency")
	}
	if strings.TrimSpace(in.Interval) != "" {
		interval, iErr := parseBudgetInterval(in.Interval)
		if iErr != nil {
			return BudgetSummary{}, iErr
		}
		patchBudget.Interval = interval
		mask = append(mask, "interval")
	}
	if strings.TrimSpace(in.Status) != "" {
		status, sErr := parseBudgetStatus(in.Status)
		if sErr != nil {
			return BudgetSummary{}, sErr
		}
		patchBudget.Status = status
		mask = append(mask, "status")
	}
	if color := strings.TrimSpace(in.Color); color != "" {
		patchBudget.Color = color
		mask = append(mask, "color")
	}
	if len(mask) == 0 {
		return BudgetSummary{}, errors.E(errors.Invalid, "at least one field to update must be provided")
	}

	propagation, err := parseLimitPropagation(in.Propagation)
	if err != nil {
		return BudgetSummary{}, err
	}

	updated, err := h.coord.UpdateBudget(ctx, &financeapp.UpdateBudgetRequest{
		Budget:      patchBudget,
		Propagation: propagation,
		UpdateMask:  mask,
	})
	if err != nil {
		return BudgetSummary{}, err
	}

	return toBudgetSummary(updated), nil
}

func toBudgetSummary(b *finance.Budget) BudgetSummary {
	curr := string(b.Currency)
	return BudgetSummary{
		ID:             string(b.ID),
		Name:           b.Name,
		Currency:       curr,
		Interval:       string(b.Interval),
		Status:         string(b.Status),
		LimitCents:     b.LimitAmount,
		FormattedLimit: formatMoney(b.LimitAmount, curr),
		Color:          b.Color,
		Version:        b.Version,
	}
}

func parseBudgetInterval(raw string) (finance.RecurrenceInterval, error) {
	normalized := finance.RecurrenceInterval(strings.ToLower(strings.TrimSpace(raw)))
	if err := normalized.Validate(); err != nil {
		return "", errors.E(errors.Invalid, err)
	}
	return normalized, nil
}

func parseBudgetStatus(raw string) (finance.BudgetStatus, error) {
	switch finance.BudgetStatus(strings.ToLower(strings.TrimSpace(raw))) {
	case finance.BudgetStatusActive:
		return finance.BudgetStatusActive, nil
	case finance.BudgetStatusPaused:
		return finance.BudgetStatusPaused, nil
	case finance.BudgetStatusClosed:
		return finance.BudgetStatusClosed, nil
	default:
		return "", errors.E(errors.Invalid, fmt.Sprintf("invalid budget status %q (expected active, paused, or closed)", raw))
	}
}

func parseLimitPropagation(raw string) (finance.LimitPropagation, error) {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "", "current_period", "current_and_future":
		return finance.PropagationCurrentPeriod, nil
	case "next_periods_only":
		return finance.PropagationNextPeriodsOnly, nil
	default:
		return "", errors.E(errors.Invalid, fmt.Sprintf("invalid propagation %q (expected current_period or next_periods_only)", raw))
	}
}

// AdjustAccountBalanceInput defines parameters for finance_adjust_account_balance.
type AdjustAccountBalanceInput struct {
	AccountID       string `json:"account_id" jsonschema:"Account ID (acc_...) to reconcile"`
	NewBalanceCents int64  `json:"new_balance_cents" jsonschema:"Target live balance in minor currency units (cents)"`
	Notes           string `json:"notes,omitempty" jsonschema:"Optional reconciliation note"`
	Reason          string `json:"reason,omitempty" jsonschema:"Optional reason for the balance adjustment (used if notes is empty)"`
	AdjustmentDate  string `json:"adjustment_date,omitempty" jsonschema:"Optional adjustment date (YYYY-MM-DD or RFC3339)"`
}

// AccountSummary summarizes an updated account after balance adjustment.
type AccountSummary struct {
	ID               string `json:"id"`
	Name             string `json:"name"`
	Type             string `json:"type"`
	Currency         string `json:"currency"`
	BalanceCents     int64  `json:"balance_cents"`
	FormattedBalance string `json:"formatted_balance"`
	IsDefault        bool   `json:"is_default"`
	IsActive         bool   `json:"is_active"`
	LastFour         string `json:"last_four,omitempty"`
}

func (h *Handler) adjustAccountBalance(ctx context.Context, in AdjustAccountBalanceInput) (AccountSummary, error) {
	rCtx, err := h.coord.ResolveContext(ctx)
	if err != nil {
		return AccountSummary{}, err
	}

	accID := strings.TrimSpace(in.AccountID)
	if accID == "" {
		return AccountSummary{}, errors.E(errors.Invalid, "account_id is required")
	}

	note := strings.TrimSpace(in.Notes)
	if note == "" {
		note = strings.TrimSpace(in.Reason)
	}

	var adjDate string
	if t, tErr := mcptransport.ParseOptionalTime(in.AdjustmentDate, "adjustment_date", rCtx.Location()); tErr != nil {
		return AccountSummary{}, tErr
	} else if t != nil {
		adjDate = t.Format(time.RFC3339)
	}

	acc, err := h.coord.AdjustAccountBalance(ctx, &financeapp.AdjustAccountBalanceRequest{
		AccountID:      finance.AccountID(accID),
		TargetBalance:  in.NewBalanceCents,
		AdjustmentDate: adjDate,
		Note:           note,
	})
	if err != nil {
		return AccountSummary{}, err
	}

	curr := string(acc.Currency)
	return AccountSummary{
		ID:               string(acc.ID),
		Name:             acc.Name,
		Type:             string(acc.Type),
		Currency:         curr,
		BalanceCents:     acc.CurrentBalance,
		FormattedBalance: formatMoney(acc.CurrentBalance, curr),
		IsDefault:        acc.IsDefault,
		IsActive:         acc.IsActive,
		LastFour:         acc.LastFour,
	}, nil
}

// LogBorrowingPaymentInput defines parameters for finance_log_borrowing_payment.
type LogBorrowingPaymentInput struct {
	BorrowingID string `json:"borrowing_id" jsonschema:"Borrowing ID (bor_...) to record a payment or disbursement against"`
	AmountCents int64  `json:"amount_cents" jsonschema:"Positive amount in minor currency units (cents)"`
	Type        string `json:"type,omitempty" jsonschema:"Borrowing transaction type: 'PAYMENT' (default) or 'DISBURSEMENT'"`
	AccountID   string `json:"account_id,omitempty" jsonschema:"Optional linked financial account ID"`
	Date        string `json:"date,omitempty" jsonschema:"Optional transaction date (YYYY-MM-DD or RFC3339)"`
	Notes       string `json:"notes,omitempty" jsonschema:"Optional payment notes"`
}

func (h *Handler) logBorrowingPayment(ctx context.Context, in LogBorrowingPaymentInput) (TransactionSummary, error) {
	rCtx, err := h.coord.ResolveContext(ctx)
	if err != nil {
		return TransactionSummary{}, err
	}

	bID := strings.TrimSpace(in.BorrowingID)
	if bID == "" {
		return TransactionSummary{}, errors.E(errors.Invalid, "borrowing_id is required")
	}
	if in.AmountCents <= 0 {
		return TransactionSummary{}, errors.E(errors.Invalid, "amount_cents must be greater than zero")
	}

	var txType finance.BorrowingTransactionType
	switch strings.ToUpper(strings.TrimSpace(in.Type)) {
	case "", "PAYMENT":
		txType = finance.BorrowingTransactionTypePayment
	case "DISBURSEMENT":
		txType = finance.BorrowingTransactionTypeDisbursement
	default:
		return TransactionSummary{}, errors.E(errors.Invalid, fmt.Sprintf("invalid borrowing transaction type %q (expected PAYMENT or DISBURSEMENT)", in.Type))
	}

	var accID *finance.AccountID
	if s := strings.TrimSpace(in.AccountID); s != "" {
		accID = new(finance.AccountID(s))
	}

	txDate := rCtx.Now()
	if t, tErr := mcptransport.ParseOptionalTime(in.Date, "date", rCtx.Location()); tErr != nil {
		return TransactionSummary{}, tErr
	} else if t != nil {
		txDate = *t
	}

	txn, err := h.coord.LogBorrowingTransaction(ctx, &financeapp.LogBorrowingTransactionRequest{
		BorrowingID:     finance.BorrowingID(bID),
		Type:            txType,
		Amount:          in.AmountCents,
		TransactionDate: txDate,
		AccountID:       accID,
		Notes:           strings.TrimSpace(in.Notes),
	})
	if err != nil {
		return TransactionSummary{}, err
	}

	return toTransactionSummary(txn, rCtx.Location()), nil
}

// ListScheduledInput defines parameters for finance_list_scheduled.
type ListScheduledInput struct {
	Status    string `json:"status,omitempty" jsonschema:"Filter by status ('pending', 'processing', 'skipped', 'paid', or 'all'); defaults to 'pending'"`
	StartDate string `json:"start_date,omitempty" jsonschema:"Optional due date start filter (YYYY-MM-DD or RFC3339)"`
	EndDate   string `json:"end_date,omitempty" jsonschema:"Optional due date end filter (YYYY-MM-DD or RFC3339)"`
	Limit     int32  `json:"limit,omitempty" jsonschema:"Max results to return (1-100, default 20)"`
	PageToken string `json:"page_token,omitempty" jsonschema:"Pagination cursor"`
}

// ScheduledItem summarizes an upcoming or resolved scheduled transaction obligation.
type ScheduledItem struct {
	ID              string  `json:"id"`
	Type            string  `json:"type"`
	Status          string  `json:"status"`
	SourceType      string  `json:"source_type"`
	SourceID        string  `json:"source_id"`
	Description     string  `json:"description"`
	AmountCents     int64   `json:"amount_cents"`
	Currency        string  `json:"currency"`
	FormattedAmount string  `json:"formatted_amount"`
	DueDate         string  `json:"due_date"`
	BudgetID        *string `json:"budget_id,omitempty"`
	BudgetName      string  `json:"budget_name,omitempty"`
	AccountID       *string `json:"account_id,omitempty"`
}

// ListScheduledOutput is returned by finance_list_scheduled.
type ListScheduledOutput struct {
	Scheduled     []ScheduledItem `json:"scheduled"`
	NextPageToken string          `json:"next_page_token,omitempty"`
}

func (h *Handler) listScheduled(ctx context.Context, in ListScheduledInput) (ListScheduledOutput, error) {
	rCtx, err := h.coord.ResolveContext(ctx)
	if err != nil {
		return ListScheduledOutput{}, err
	}

	filter := finance.ListScheduledTransactionsFilter{
		PageSize:      mcptransport.ClampLimit(in.Limit, defaultListLimit, maxListLimit),
		NextPageToken: in.PageToken,
	}

	switch st := strings.ToLower(strings.TrimSpace(in.Status)); st {
	case "":
		filter.Status = new(finance.ScheduledTransactionPending)
	case "all":
		filter.Status = nil
	case string(finance.ScheduledTransactionPending),
		string(finance.ScheduledTransactionProcessing),
		string(finance.ScheduledTransactionSkipped),
		string(finance.ScheduledTransactionPaid):
		filter.Status = new(finance.ScheduledTransactionStatus(st))
	default:
		return ListScheduledOutput{}, errors.E(errors.Invalid, fmt.Sprintf("invalid status %q (expected pending, processing, skipped, paid, or all)", in.Status))
	}

	loc := rCtx.Location()
	if filter.StartDate, err = mcptransport.ParseOptionalTime(in.StartDate, "start_date", loc); err != nil {
		return ListScheduledOutput{}, err
	}
	if filter.EndDate, err = mcptransport.ParseOptionalTime(in.EndDate, "end_date", loc); err != nil {
		return ListScheduledOutput{}, err
	}

	page, err := h.agg.ListScheduledTransactions(ctx, rCtx, financeaggregator.ViewFull, filter)
	if err != nil {
		return ListScheduledOutput{}, err
	}

	items := make([]ScheduledItem, 0, len(page.Items))
	for _, s := range page.Items {
		curr := string(s.Currency)
		desc := s.Metadata.Description
		if desc == "" {
			desc = s.Metadata.Name
		}
		if desc == "" {
			desc = s.Metadata.VendorName
		}
		item := ScheduledItem{
			ID:              string(s.ID),
			Type:            string(s.Type),
			Status:          string(s.Status),
			SourceType:      s.SourceType,
			SourceID:        s.SourceID,
			Description:     desc,
			AmountCents:     s.Amount,
			Currency:        curr,
			FormattedAmount: formatMoney(s.Amount, curr),
			DueDate:         s.DueDate.In(loc).Format("2006-01-02"),
		}
		if s.BudgetID != nil {
			item.BudgetID = new(string(*s.BudgetID))
		}
		if s.Budget != nil && s.Budget.Budget != nil {
			item.BudgetName = s.Budget.Name
		}
		if s.AccountID != nil {
			item.AccountID = new(string(*s.AccountID))
		}
		items = append(items, item)
	}

	return ListScheduledOutput{
		Scheduled:     items,
		NextPageToken: page.NextPageToken,
	}, nil
}

// ResolveScheduledInput defines parameters for finance_resolve_scheduled.
type ResolveScheduledInput struct {
	ID          string `json:"id" jsonschema:"Scheduled transaction ID (sctx_... or sch_...) to resolve"`
	Action      string `json:"action" jsonschema:"Resolution action: 'confirm' or 'skip'"`
	AmountCents *int64 `json:"amount_cents,omitempty" jsonschema:"Optional actual amount override in cents when confirming"`
	AccountID   string `json:"account_id,omitempty" jsonschema:"Optional settlement account ID override when confirming"`
	BudgetID    string `json:"budget_id,omitempty" jsonschema:"Optional budget ID override when confirming"`
	Date        string `json:"date,omitempty" jsonschema:"Optional transaction date override (YYYY-MM-DD or RFC3339) when confirming"`
	Description string `json:"description,omitempty" jsonschema:"Optional description override when confirming"`
}

// ResolveScheduledOutput summarizes the confirmed or skipped scheduled transaction.
type ResolveScheduledOutput struct {
	ID              string `json:"id"`
	Action          string `json:"action"`
	Status          string `json:"status"`
	TransactionID   string `json:"transaction_id,omitempty"`
	AmountCents     int64  `json:"amount_cents"`
	Currency        string `json:"currency"`
	FormattedAmount string `json:"formatted_amount"`
	TransactionDate string `json:"transaction_date,omitempty"`
	DueDate         string `json:"due_date,omitempty"`
}

func (h *Handler) resolveScheduled(ctx context.Context, in ResolveScheduledInput) (ResolveScheduledOutput, error) {
	rCtx, err := h.coord.ResolveContext(ctx)
	if err != nil {
		return ResolveScheduledOutput{}, err
	}

	id := strings.TrimSpace(in.ID)
	if id == "" {
		return ResolveScheduledOutput{}, errors.E(errors.Invalid, "scheduled transaction id is required")
	}

	loc := rCtx.Location()
	action := strings.ToLower(strings.TrimSpace(in.Action))
	switch action {
	case "skip":
		sp, err := h.coord.SkipScheduledTransaction(ctx, finance.ScheduledTransactionID(id))
		if err != nil {
			return ResolveScheduledOutput{}, err
		}
		curr := string(sp.Currency)
		return ResolveScheduledOutput{
			ID:              string(sp.ID),
			Action:          "skip",
			Status:          string(sp.Status),
			AmountCents:     sp.Amount,
			Currency:        curr,
			FormattedAmount: formatMoney(sp.Amount, curr),
			DueDate:         sp.DueDate.In(loc).Format("2006-01-02"),
		}, nil

	case "confirm":
		req := &financeapp.ConfirmScheduledTransactionRequest{
			TransactionID: finance.ScheduledTransactionID(id),
			Description:   strings.TrimSpace(in.Description),
		}
		if in.AmountCents != nil {
			if *in.AmountCents <= 0 {
				return ResolveScheduledOutput{}, errors.E(errors.Invalid, "amount_cents must be greater than zero")
			}
			req.ActualAmount = *in.AmountCents
		}
		if s := strings.TrimSpace(in.AccountID); s != "" {
			req.AccountID = new(finance.AccountID(s))
		}
		if s := strings.TrimSpace(in.BudgetID); s != "" {
			req.BudgetID = new(finance.BudgetID(s))
		}
		if t, tErr := mcptransport.ParseOptionalTime(in.Date, "date", loc); tErr != nil {
			return ResolveScheduledOutput{}, tErr
		} else if t != nil {
			req.TransactionDate = *t
			req.EffectiveDate = *t
		}

		txn, err := h.coord.ConfirmScheduledTransaction(ctx, req)
		if err != nil {
			return ResolveScheduledOutput{}, err
		}
		curr := string(txn.Currency)
		return ResolveScheduledOutput{
			ID:              id,
			Action:          "confirm",
			Status:          string(finance.ScheduledTransactionPaid),
			TransactionID:   string(txn.ID),
			AmountCents:     txn.Amount,
			Currency:        curr,
			FormattedAmount: formatMoney(txn.Amount, curr),
			TransactionDate: txn.TransactionDate.In(loc).Format(time.RFC3339),
		}, nil

	default:
		return ResolveScheduledOutput{}, errors.E(errors.Invalid, fmt.Sprintf("unsupported action %q (expected 'confirm' or 'skip')", in.Action))
	}
}

func (h *Handler) readAccountsResource(ctx context.Context, uri string) ([]*sdkmcp.ResourceContents, error) {
	out, err := h.listAccounts(ctx, ListAccountsInput{ActiveOnly: new(true), Limit: maxListLimit})
	if err != nil {
		return nil, err
	}
	return mcptransport.JSONResource(uri, out)
}

func (h *Handler) readBudgetsResource(ctx context.Context, uri string) ([]*sdkmcp.ResourceContents, error) {
	out, err := h.listBudgets(ctx, ListBudgetsInput{Limit: maxListLimit})
	if err != nil {
		return nil, err
	}
	return mcptransport.JSONResource(uri, out)
}

func formatMoney(cents int64, currency string) string {
	upper := strings.ToUpper(strings.TrimSpace(currency))
	if upper == "JPY" {
		return fmt.Sprintf("%s %d", upper, cents)
	}
	sign := ""
	abs := cents
	if abs < 0 {
		sign = "-"
		abs = -abs
	}
	if upper == "" {
		return fmt.Sprintf("%s%d.%02d", sign, abs/100, abs%100)
	}
	return fmt.Sprintf("%s %s%d.%02d", upper, sign, abs/100, abs%100)
}
