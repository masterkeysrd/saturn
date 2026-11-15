package financeapp

import (
	"context"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/platform/workflow"
)

// ListAccountsParams configures filtering for finance.accounts.
type ListAccountsParams struct {
	Currency string `json:"currency,omitempty" jsonschema:"Optional ISO-4217 currency code filter"`
	Type     string `json:"type,omitempty" jsonschema:"Optional account type filter (BANK, CREDIT_CARD, CASH, DIGITAL_ACCOUNT)"`
}

// AccountSummary is the workflow-facing projection of a finance.Account.
type AccountSummary struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Type         string `json:"type"`
	Currency     string `json:"currency"`
	LastFour     string `json:"last_four"`
	BalanceCents int64  `json:"balance_cents"`
	IsActive     bool   `json:"is_active"`
}

// ResolveAccountParams identifies an account by ID or fuzzy metadata for finance.account.
type ResolveAccountParams struct {
	ID       string `json:"id,omitempty" jsonschema:"Exact account ID"`
	Name     string `json:"name,omitempty" jsonschema:"Account or institution name"`
	LastFour string `json:"last_four,omitempty" jsonschema:"Last 4 card or account digits"`
	Currency string `json:"currency,omitempty" jsonschema:"Preferred ISO-4217 currency code"`
}

// ListBudgetsParams configures filtering for finance.budgets.
type ListBudgetsParams struct {
	Status string `json:"status,omitempty" jsonschema:"Optional budget status filter (active, paused, closed)"`
}

// BudgetSummary is the workflow-facing projection of a finance.Budget.
type BudgetSummary struct {
	ID               string `json:"id"`
	Name             string `json:"name"`
	LimitAmountCents int64  `json:"limit_amount_cents"`
	Currency         string `json:"currency"`
	Interval         string `json:"interval"`
	Status           string `json:"status"`
}

// ResolveBudgetParams identifies a budget by ID or name for finance.budget.
type ResolveBudgetParams struct {
	ID   string `json:"id,omitempty" jsonschema:"Exact budget ID"`
	Name string `json:"name,omitempty" jsonschema:"Case-insensitive budget name"`
}

// ListTransactionsParams configures deduplication/search filtering for finance.transactions.
type ListTransactionsParams struct {
	NearAmountCents *int64   `json:"near_amount_cents,omitempty" jsonschema:"Target transaction amount in cents"`
	TolerancePct    *float64 `json:"tolerance_pct,omitempty" jsonschema:"Relative amount tolerance (defaults to 0.30)"`
	NearDate        string   `json:"near_date,omitempty" jsonschema:"Target date (YYYY-MM-DD or RFC3339)"`
	WindowDays      *int     `json:"window_days,omitempty" jsonschema:"Date search radius in days (defaults to 10)"`
	Query           string   `json:"query,omitempty" jsonschema:"Optional text search query"`
	AccountID       string   `json:"account_id,omitempty" jsonschema:"Optional account ID filter"`
	Limit           int      `json:"limit,omitempty" jsonschema:"Maximum records to return (capped at 100)"`
}

// TransactionSummary is the workflow-facing projection of a finance.Transaction.
type TransactionSummary struct {
	ID              string  `json:"id"`
	Type            string  `json:"type"`
	AmountCents     int64   `json:"amount_cents"`
	Currency        string  `json:"currency"`
	Description     string  `json:"description"`
	TransactionDate string  `json:"transaction_date"`
	AccountID       *string `json:"account_id,omitempty"`
	BudgetID        *string `json:"budget_id,omitempty"`
}

// ListScheduledPaymentsParams configures filtering for finance.scheduled_payments.
type ListScheduledPaymentsParams struct {
	Status        string `json:"status,omitempty" jsonschema:"Optional status filter (pending, processing, skipped, paid)"`
	DueWithinDays int    `json:"due_within_days,omitempty" jsonschema:"Optional due horizon in days from now"`
	Type          string `json:"type,omitempty" jsonschema:"Optional transaction type filter (EXPENSE, INCOME)"`
}

// ScheduledPaymentSummary is the workflow-facing projection of a finance.ScheduledTransaction.
type ScheduledPaymentSummary struct {
	ID          string  `json:"id"`
	Type        string  `json:"type"`
	SourceType  string  `json:"source_type"`
	AmountCents int64   `json:"amount_cents"`
	Currency    string  `json:"currency"`
	DueDate     string  `json:"due_date"`
	Status      string  `json:"status"`
	Name        string  `json:"name"`
	VendorName  string  `json:"vendor_name"`
	AccountID   *string `json:"account_id,omitempty"`
	BudgetID    *string `json:"budget_id,omitempty"`
}

// ListBorrowingsParams configures filtering for finance.borrowings.
type ListBorrowingsParams struct {
	Status string `json:"status,omitempty" jsonschema:"Optional borrowing status filter"`
}

// BorrowingSummary is the workflow-facing projection of a finance.Borrowing.
type BorrowingSummary struct {
	ID              string `json:"id"`
	Direction       string `json:"direction"`
	Counterparty    string `json:"counterparty"`
	TotalAmount     int64  `json:"total_amount"`
	RemainingAmount int64  `json:"remaining_amount"`
	Currency        string `json:"currency"`
	Status          string `json:"status"`
}

// ListRecurringTemplatesParams configures filtering for finance.recurring_templates.
type ListRecurringTemplatesParams struct {
	Status string `json:"status,omitempty" jsonschema:"Optional recurring template status filter (active, paused, ended)"`
}

// RecurringTemplateSummary is the workflow-facing projection of a finance.RecurringTransaction.
type RecurringTemplateSummary struct {
	ID          string `json:"id"`
	Type        string `json:"type"`
	Name        string `json:"name"`
	AmountCents int64  `json:"amount_cents"`
	Currency    string `json:"currency"`
	Interval    string `json:"interval"`
	NextDueDate string `json:"next_due_date"`
	Status      string `json:"status"`
}

func registerFinanceLoaders(reg *workflow.Registry, deps WorkflowDependencies) {
	reg.RegisterLoader(workflow.LoaderDescriptor{
		Name:        "finance.accounts",
		Owner:       "finance",
		DisplayName: "Finance Accounts",
		Description: "Lists workspace financial accounts, optionally filtered by currency or type.",
	}, func(ctx context.Context, spaceID string, params ListAccountsParams) ([]AccountSummary, error) {
		fCtx := resolveWorkflowFinanceContext(ctx, deps, spaceID)
		activeOnly := true
		page, err := deps.FinanceService.ListAccounts(ctx, fCtx, &finance.ListAccountsFilter{
			PageSize:   1000,
			ActiveOnly: &activeOnly,
		})
		if err != nil {
			return nil, err
		}

		curFilter := strings.ToUpper(strings.TrimSpace(params.Currency))
		typeFilter := strings.ToLower(strings.TrimSpace(params.Type))

		var items []*finance.Account
		if page != nil {
			items = page.Items
		}
		out := make([]AccountSummary, 0, len(items))
		for _, acc := range items {
			if curFilter != "" && strings.ToUpper(string(acc.Currency)) != curFilter {
				continue
			}
			if typeFilter != "" && strings.ToLower(string(acc.Type)) != typeFilter {
				continue
			}
			out = append(out, accountToSummary(acc))
		}
		return out, nil
	})

	reg.RegisterLoader(workflow.LoaderDescriptor{
		Name:        "finance.account",
		Owner:       "finance",
		DisplayName: "Resolve Finance Account",
		Description: "Resolves a single account by exact ID in the workspace, falling back to name, last four digits, and currency.",
	}, func(ctx context.Context, spaceID string, params ResolveAccountParams) (*AccountSummary, error) {
		fCtx := resolveWorkflowFinanceContext(ctx, deps, spaceID)

		idParam := strings.TrimSpace(params.ID)
		if idParam != "" {
			if accID, err := finance.ParseAccountID(idParam); err == nil {
				if acc, getErr := deps.FinanceService.GetAccount(ctx, fCtx, accID); getErr == nil && acc != nil {
					summary := accountToSummary(acc)
					return &summary, nil
				}
			}
		}

		name := strings.TrimSpace(params.Name)
		lastFour := strings.TrimSpace(params.LastFour)
		currency := strings.ToUpper(strings.TrimSpace(params.Currency))
		if idParam == "" && name == "" && lastFour == "" {
			return nil, nil
		}

		acc, err := deps.FinanceService.ResolveAccount(ctx, fCtx, finance.ResolveAccountOpts{
			AccountID:   idParam,
			AccountName: name,
			LastFour:    lastFour,
			Currency:    currency,
		})
		if err != nil {
			return nil, err
		}
		if acc == nil {
			return nil, nil
		}
		summary := accountToSummary(acc)
		return &summary, nil
	})

	reg.RegisterLoader(workflow.LoaderDescriptor{
		Name:        "finance.budgets",
		Owner:       "finance",
		DisplayName: "Finance Budgets",
		Description: "Lists workspace budgets, optionally filtered by status.",
	}, func(ctx context.Context, spaceID string, params ListBudgetsParams) ([]BudgetSummary, error) {
		fCtx := resolveWorkflowFinanceContext(ctx, deps, spaceID)
		filter := &finance.ListBudgetsFilter{PageSize: 1000}
		if status := strings.ToLower(strings.TrimSpace(params.Status)); status != "" {
			filter.Statuses = []finance.BudgetStatus{finance.BudgetStatus(status)}
		}
		page, err := deps.FinanceService.ListBudgets(ctx, fCtx, filter)
		if err != nil {
			return nil, err
		}
		var items []*finance.Budget
		if page != nil {
			items = page.Items
		}
		out := make([]BudgetSummary, 0, len(items))
		for _, b := range items {
			out = append(out, budgetToSummary(b))
		}
		return out, nil
	})

	reg.RegisterLoader(workflow.LoaderDescriptor{
		Name:        "finance.budget",
		Owner:       "finance",
		DisplayName: "Resolve Finance Budget",
		Description: "Resolves a single budget by ID first, then case-insensitive name.",
	}, func(ctx context.Context, spaceID string, params ResolveBudgetParams) (*BudgetSummary, error) {
		fCtx := resolveWorkflowFinanceContext(ctx, deps, spaceID)

		idParam := strings.TrimSpace(params.ID)
		if idParam != "" {
			if bID, err := finance.ParseBudgetID(idParam); err == nil {
				if b, getErr := deps.FinanceService.GetBudget(ctx, fCtx, bID); getErr == nil && b != nil {
					summary := budgetToSummary(b)
					return &summary, nil
				}
			}
		}

		name := strings.TrimSpace(params.Name)
		if name == "" {
			return nil, nil
		}

		page, err := deps.FinanceService.ListBudgets(ctx, fCtx, &finance.ListBudgetsFilter{PageSize: 1000})
		if err != nil {
			return nil, err
		}
		if page != nil {
			for _, b := range page.Items {
				if strings.EqualFold(b.Name, name) {
					summary := budgetToSummary(b)
					return &summary, nil
				}
			}
		}
		return nil, nil
	})

	reg.RegisterLoader(workflow.LoaderDescriptor{
		Name:        "finance.transactions",
		Owner:       "finance",
		DisplayName: "Finance Transactions",
		Description: "Queries recent ledger transactions with optional amount tolerance, date window, account, and search filters (capped at 100).",
	}, func(ctx context.Context, spaceID string, params ListTransactionsParams) ([]TransactionSummary, error) {
		fCtx := resolveWorkflowFinanceContext(ctx, deps, spaceID)

		limit := params.Limit
		if limit <= 0 {
			limit = 25
		}
		if limit > 100 {
			limit = 100
		}

		filter := &finance.TransactionFilter{
			PageSize: int32(limit),
		}
		if q := strings.TrimSpace(params.Query); q != "" {
			filter.SearchQuery = &q
		}
		if accID := strings.TrimSpace(params.AccountID); accID != "" {
			if parsed, err := finance.ParseAccountID(accID); err == nil {
				filter.AccountID = &parsed
			}
		}
		if params.NearAmountCents != nil && *params.NearAmountCents > 0 {
			nearAmt := *params.NearAmountCents
			tol := 0.30
			if params.TolerancePct != nil {
				tol = *params.TolerancePct
			}
			if tol < 0 {
				tol = 0
			}
			minAmt := int64(math.Floor(float64(nearAmt) * (1.0 - tol)))
			maxAmt := int64(math.Ceil(float64(nearAmt) * (1.0 + tol)))
			filter.MinAmount = &minAmt
			filter.MaxAmount = &maxAmt
		}
		if nearDateStr := strings.TrimSpace(params.NearDate); nearDateStr != "" {
			if parsedDate, err := parseFlexibleDate(nearDateStr); err == nil {
				window := 10
				if params.WindowDays != nil {
					window = *params.WindowDays
				}
				if window < 0 {
					window = 0
				}
				start := parsedDate.AddDate(0, 0, -window)
				end := parsedDate.AddDate(0, 0, window)
				filter.StartDate = &start
				filter.EndDate = &end
			}
		}

		page, err := deps.FinanceService.ListTransactions(ctx, fCtx, filter)
		if err != nil {
			return nil, err
		}
		var items []*finance.Transaction
		if page != nil {
			items = page.Items
		}
		out := make([]TransactionSummary, 0, len(items))
		for _, txn := range items {
			row := TransactionSummary{
				ID:              string(txn.ID),
				Type:            string(txn.Type),
				AmountCents:     txn.Amount,
				Currency:        string(txn.Currency),
				Description:     txn.Description,
				TransactionDate: txn.TransactionDate.Format("2006-01-02"),
			}
			if txn.AccountID != nil {
				row.AccountID = new(string(*txn.AccountID))
			}
			if txn.BudgetID != nil {
				row.BudgetID = new(string(*txn.BudgetID))
			}
			out = append(out, row)
		}
		return out, nil
	})

	reg.RegisterLoader(workflow.LoaderDescriptor{
		Name:        "finance.scheduled_payments",
		Owner:       "finance",
		DisplayName: "Scheduled Payments",
		Description: "Lists scheduled transactions, optionally filtered by status, type, or due window.",
	}, func(ctx context.Context, spaceID string, params ListScheduledPaymentsParams) ([]ScheduledPaymentSummary, error) {
		fCtx := resolveWorkflowFinanceContext(ctx, deps, spaceID)
		filter := &finance.ListScheduledTransactionsFilter{PageSize: 100}
		if st := strings.ToLower(strings.TrimSpace(params.Status)); st != "" {
			statusVal := finance.ScheduledTransactionStatus(st)
			filter.Status = &statusVal
		}
		typeFilter := strings.ToUpper(strings.TrimSpace(params.Type))
		if params.DueWithinDays > 0 {
			end := fCtx.Now().AddDate(0, 0, params.DueWithinDays)
			filter.EndDate = &end
		}

		page, err := deps.FinanceService.ListScheduledTransactions(ctx, fCtx, filter)
		if err != nil {
			return nil, err
		}
		var items []*finance.ScheduledTransaction
		if page != nil {
			items = page.Items
		}
		out := make([]ScheduledPaymentSummary, 0, len(items))
		for _, p := range items {
			if typeFilter != "" && strings.ToUpper(string(p.Type)) != typeFilter {
				continue
			}
			row := ScheduledPaymentSummary{
				ID:          string(p.ID),
				Type:        string(p.Type),
				SourceType:  p.SourceType,
				AmountCents: p.Amount,
				Currency:    string(p.Currency),
				DueDate:     p.DueDate.Format("2006-01-02"),
				Status:      string(p.Status),
				Name:        p.Metadata.Name,
				VendorName:  p.Metadata.VendorName,
			}
			if p.AccountID != nil {
				row.AccountID = new(string(*p.AccountID))
			}
			if p.BudgetID != nil {
				row.BudgetID = new(string(*p.BudgetID))
			}
			out = append(out, row)
		}
		return out, nil
	})

	reg.RegisterLoader(workflow.LoaderDescriptor{
		Name:        "finance.borrowings",
		Owner:       "finance",
		DisplayName: "Borrowings & Loans",
		Description: "Lists workspace borrowing/lending agreements, optionally filtered by status.",
	}, func(ctx context.Context, spaceID string, params ListBorrowingsParams) ([]BorrowingSummary, error) {
		fCtx := resolveWorkflowFinanceContext(ctx, deps, spaceID)
		filter := &finance.ListBorrowingsFilter{PageSize: 100}
		if st := strings.ToLower(strings.TrimSpace(params.Status)); st != "" {
			statusVal := finance.BorrowingStatus(st)
			filter.Status = &statusVal
		}
		items, _, err := deps.FinanceService.ListBorrowings(ctx, fCtx, filter)
		if err != nil {
			return nil, err
		}
		out := make([]BorrowingSummary, 0, len(items))
		for _, b := range items {
			out = append(out, BorrowingSummary{
				ID:              string(b.ID),
				Direction:       string(b.Direction),
				Counterparty:    b.Counterparty,
				TotalAmount:     b.TotalAmount,
				RemainingAmount: b.RemainingAmount,
				Currency:        string(b.Currency),
				Status:          string(b.Status),
			})
		}
		return out, nil
	})

	reg.RegisterLoader(workflow.LoaderDescriptor{
		Name:        "finance.recurring_templates",
		Owner:       "finance",
		DisplayName: "Recurring Templates",
		Description: "Lists recurring transaction templates, optionally filtered by status.",
	}, func(ctx context.Context, spaceID string, params ListRecurringTemplatesParams) ([]RecurringTemplateSummary, error) {
		fCtx := resolveWorkflowFinanceContext(ctx, deps, spaceID)
		filter := &finance.ListRecurringTransactionsFilter{PageSize: 100}
		if st := strings.ToLower(strings.TrimSpace(params.Status)); st != "" {
			statusVal := finance.RecurringTransactionStatus(st)
			filter.Status = &statusVal
		}
		page, err := deps.FinanceService.ListRecurringTransactions(ctx, fCtx, filter)
		if err != nil {
			return nil, err
		}
		var items []*finance.RecurringTransaction
		if page != nil {
			items = page.Items
		}
		out := make([]RecurringTemplateSummary, 0, len(items))
		for _, r := range items {
			out = append(out, RecurringTemplateSummary{
				ID:          string(r.ID),
				Type:        string(r.Type),
				Name:        r.Name,
				AmountCents: r.Amount,
				Currency:    string(r.Currency),
				Interval:    string(r.Interval),
				NextDueDate: r.NextDueDate.Format("2006-01-02"),
				Status:      string(r.Status),
			})
		}
		return out, nil
	})
}

func accountToSummary(acc *finance.Account) AccountSummary {
	return AccountSummary{
		ID:           string(acc.ID),
		Name:         acc.Name,
		Type:         string(acc.Type),
		Currency:     string(acc.Currency),
		LastFour:     acc.LastFour,
		BalanceCents: acc.CurrentBalance,
		IsActive:     acc.IsActive,
	}
}

func budgetToSummary(b *finance.Budget) BudgetSummary {
	return BudgetSummary{
		ID:               string(b.ID),
		Name:             b.Name,
		LimitAmountCents: b.LimitAmount,
		Currency:         string(b.Currency),
		Interval:         string(b.Interval),
		Status:           string(b.Status),
	}
}

func parseFlexibleDate(s string) (time.Time, error) {
	if t, err := time.Parse("2006-01-02", s); err == nil {
		return t, nil
	}
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return t, nil
	}
	return time.Time{}, fmt.Errorf("invalid date %q", s)
}
