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
	ListTransactions(ctx context.Context, rCtx finance.Context, view financeaggregator.ViewType, filter finance.TransactionFilter) (*paging.Page[*financeaggregator.AggregatedTransaction], error)
	ListInboxItems(ctx context.Context, rCtx finance.Context, filter finance.ListInboxItemsFilter) (*paging.Page[*finance.InboxItem], error)
	ListBorrowings(ctx context.Context, rCtx finance.Context, filter financeaggregator.ListBorrowingsFilter) ([]*finance.Borrowing, string, error)
	ListRecurringTransactions(ctx context.Context, rCtx finance.Context, view financeaggregator.ViewType, filter finance.ListRecurringTransactionsFilter) (*paging.Page[*financeaggregator.AggregatedRecurringTransaction], error)
}

// FinanceCoordinator defines finance context resolution, insights, and command operations.
// @Mock
type FinanceCoordinator interface {
	ResolveContext(ctx context.Context) (finance.Context, error)
	GetInsights(ctx context.Context, req *financeapp.GetInsightsRequest) (*finance.Insights, error)
	CreateExpense(ctx context.Context, req *financeapp.CreateExpenseRequest) (*finance.Transaction, error)
	CreateIncome(ctx context.Context, req *financeapp.CreateIncomeRequest) (*finance.Transaction, error)
	CreateTransfer(ctx context.Context, req *financeapp.CreateTransferRequest) (*finance.Transfer, error)
	StageInboxItem(ctx context.Context, req *finance.StageInboxItem) (*finance.InboxItem, error)
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
	return fmt.Sprintf("%s %s%d.%02d", upper, sign, abs/100, abs%100)
}
