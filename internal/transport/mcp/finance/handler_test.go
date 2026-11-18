package mcpfinance

import (
	"context"
	"testing"
	"time"

	financeaggregator "github.com/masterkeysrd/saturn/internal/aggregator/finance"
	financeapp "github.com/masterkeysrd/saturn/internal/application/finance"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
	mcptransport "github.com/masterkeysrd/saturn/internal/transport/mcp"
	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestFinanceHandler_ReadToolsAndResources(t *testing.T) {
	loc, _ := time.LoadLocation("America/Santo_Domingo")
	rCtx := finance.NewRequestContext("spc_1", "usr_1", loc, "USD")

	tests := []struct {
		name       string
		toolName   string
		args       map[string]any
		setupMocks func(agg *FinanceAggregatorMock, coord *FinanceCoordinatorMock)
		wantErr    bool
		assertOut  func(t *testing.T, out map[string]any)
	}{
		{
			name:     "list accounts formats balances and clamps limit",
			toolName: "finance_list_accounts",
			args:     map[string]any{"limit": 500},
			setupMocks: func(agg *FinanceAggregatorMock, coord *FinanceCoordinatorMock) {
				coord.ResolveContextFunc = func(_ context.Context) (finance.Context, error) { return rCtx, nil }
				agg.ListAccountsFunc = func(_ context.Context, _ finance.Context, _ financeaggregator.ViewType, filter financeaggregator.ListAccountsFilter) (*paging.Page[*financeaggregator.AggregatedAccount], error) {
					if filter.PageSize != maxListLimit {
						t.Errorf("expected clamped PageSize %d, got %d", maxListLimit, filter.PageSize)
					}
					return &paging.Page[*financeaggregator.AggregatedAccount]{
						Items: []*financeaggregator.AggregatedAccount{
							{
								Account: &finance.Account{
									ID:             "acc_1",
									Name:           "Checking",
									Type:           finance.AccountTypeBank,
									Currency:       "USD",
									CurrentBalance: 12550,
									IsActive:       true,
								},
								BalanceInBase: 12550,
							},
						},
					}, nil
				}
			},
			assertOut: func(t *testing.T, out map[string]any) {
				accs := out["accounts"].([]any)
				first := accs[0].(map[string]any)
				if first["formatted_balance"] != "USD 125.50" {
					t.Errorf("formatted_balance = %v, want USD 125.50", first["formatted_balance"])
				}
			},
		},
		{
			name:     "list budgets returns period progress",
			toolName: "finance_list_budgets",
			args:     map[string]any{},
			setupMocks: func(agg *FinanceAggregatorMock, coord *FinanceCoordinatorMock) {
				coord.ResolveContextFunc = func(_ context.Context) (finance.Context, error) { return rCtx, nil }
				agg.ListBudgetsFunc = func(_ context.Context, _ finance.Context, _ financeaggregator.ListBudgetsFilter) (*paging.Page[*financeaggregator.AggregatedBudget], error) {
					return &paging.Page[*financeaggregator.AggregatedBudget]{
						Items: []*financeaggregator.AggregatedBudget{
							{
								Budget: &finance.Budget{
									ID:          "bgt_1",
									Name:        "Groceries",
									Currency:    "USD",
									Interval:    finance.IntervalMonthly,
									Status:      finance.BudgetStatusActive,
									LimitAmount: 50000,
								},
								Period: &financeaggregator.AggregatedBudgetPeriod{
									BudgetPeriod: &finance.BudgetPeriod{
										LimitAmount: 50000,
										StartDate:   time.Date(2026, 4, 1, 0, 0, 0, 0, loc),
										EndDate:     time.Date(2026, 4, 30, 0, 0, 0, 0, loc),
									},
									SpentAmount: 15000,
								},
							},
						},
					}, nil
				}
			},
			assertOut: func(t *testing.T, out map[string]any) {
				budgets := out["budgets"].([]any)
				first := budgets[0].(map[string]any)
				if first["formatted_spent"] != "USD 150.00" || first["formatted_limit"] != "USD 500.00" {
					t.Errorf("unexpected budget formatting: %+v", first)
				}
			},
		},
		{
			name:     "list transactions with invalid start_date returns error",
			toolName: "finance_list_transactions",
			args:     map[string]any{"start_date": "not-a-date"},
			setupMocks: func(_ *FinanceAggregatorMock, coord *FinanceCoordinatorMock) {
				coord.ResolveContextFunc = func(_ context.Context) (finance.Context, error) { return rCtx, nil }
			},
			wantErr: true,
		},
		{
			name:     "get insights formats totals",
			toolName: "finance_get_insights",
			args:     map[string]any{"granularity": "monthly"},
			setupMocks: func(_ *FinanceAggregatorMock, coord *FinanceCoordinatorMock) {
				coord.ResolveContextFunc = func(_ context.Context) (finance.Context, error) { return rCtx, nil }
				coord.GetInsightsFunc = func(_ context.Context, _ *financeapp.GetInsightsRequest) (*finance.Insights, error) {
					return &finance.Insights{
						Spent: &finance.SpentInsights{
							TotalLimit:      100000,
							TotalSpent:      40000,
							RemainingBudget: 60000,
						},
						Income: &finance.IncomeInsights{TotalIncome: 250000},
					}, nil
				}
			},
			assertOut: func(t *testing.T, out map[string]any) {
				if out["formatted_total_spent"] != "USD 400.00" || out["formatted_total_income"] != "USD 2500.00" {
					t.Errorf("unexpected insights: %+v", out)
				}
			},
		},
		{
			name:     "list inbox items",
			toolName: "finance_list_inbox_items",
			args:     map[string]any{"status": "pending"},
			setupMocks: func(agg *FinanceAggregatorMock, coord *FinanceCoordinatorMock) {
				coord.ResolveContextFunc = func(_ context.Context) (finance.Context, error) { return rCtx, nil }
				agg.ListInboxItemsFunc = func(_ context.Context, _ finance.Context, filter finance.ListInboxItemsFilter) (*paging.Page[*finance.InboxItem], error) {
					if !filter.ExcludePayload {
						t.Error("expected ExcludePayload=true")
					}
					return &paging.Page[*finance.InboxItem]{
						Items: []*finance.InboxItem{
							{
								ID:              "ibx_1",
								Status:          finance.InboxItemPending,
								DocType:         finance.InboxItemDocReceipt,
								VendorName:      "Coffee Shop",
								Amount:          550,
								Currency:        "USD",
								TransactionDate: time.Date(2026, 4, 15, 10, 0, 0, 0, loc),
							},
						},
					}, nil
				}
			},
			assertOut: func(t *testing.T, out map[string]any) {
				items := out["items"].([]any)
				if len(items) != 1 || items[0].(map[string]any)["vendor_name"] != "Coffee Shop" {
					t.Errorf("unexpected inbox items: %+v", items)
				}
			},
		},
		{
			name:     "list borrowings",
			toolName: "finance_list_borrowings",
			args:     map[string]any{"direction": "LENT"},
			setupMocks: func(agg *FinanceAggregatorMock, coord *FinanceCoordinatorMock) {
				coord.ResolveContextFunc = func(_ context.Context) (finance.Context, error) { return rCtx, nil }
				agg.ListBorrowingsFunc = func(_ context.Context, _ finance.Context, _ financeaggregator.ListBorrowingsFilter) ([]*finance.Borrowing, string, error) {
					return []*finance.Borrowing{
						{
							ID:              "brw_1",
							Direction:       finance.BorrowingDirectionLent,
							Counterparty:    "Alex",
							Status:          finance.BorrowingStatusActive,
							Currency:        "USD",
							TotalAmount:     10000,
							RemainingAmount: 5000,
						},
					}, "", nil
				}
			},
			assertOut: func(t *testing.T, out map[string]any) {
				list := out["borrowings"].([]any)
				if list[0].(map[string]any)["formatted_remaining"] != "USD 50.00" {
					t.Errorf("unexpected borrowing: %+v", list[0])
				}
			},
		},
		{
			name:     "list recurring transactions",
			toolName: "finance_list_recurring",
			args:     map[string]any{},
			setupMocks: func(agg *FinanceAggregatorMock, coord *FinanceCoordinatorMock) {
				coord.ResolveContextFunc = func(_ context.Context) (finance.Context, error) { return rCtx, nil }
				agg.ListRecurringTransactionsFunc = func(_ context.Context, _ finance.Context, _ financeaggregator.ViewType, _ finance.ListRecurringTransactionsFilter) (*paging.Page[*financeaggregator.AggregatedRecurringTransaction], error) {
					return &paging.Page[*financeaggregator.AggregatedRecurringTransaction]{
						Items: []*financeaggregator.AggregatedRecurringTransaction{
							{
								RecurringTransaction: &finance.RecurringTransaction{
									ID:          "rctx_1",
									Name:        "Rent",
									Type:        finance.TransactionTypeExpense,
									Status:      finance.RecurringTransactionActive,
									Amount:      120000,
									Currency:    "USD",
									Interval:    finance.IntervalMonthly,
									NextDueDate: time.Date(2026, 5, 1, 0, 0, 0, 0, loc),
								},
							},
						},
					}, nil
				}
			},
			assertOut: func(t *testing.T, out map[string]any) {
				list := out["recurring"].([]any)
				if list[0].(map[string]any)["formatted_amount"] != "USD 1200.00" {
					t.Errorf("unexpected recurring item: %+v", list[0])
				}
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			agg := &FinanceAggregatorMock{}
			coord := &FinanceCoordinatorMock{}
			if tc.setupMocks != nil {
				tc.setupMocks(agg, coord)
			}

			srv := mcptransport.NewServer(mcptransport.ServerConfig{})
			NewHandler(Dependencies{
				Aggregator:  agg,
				Coordinator: coord,
			}).Register(srv.Registry())

			ctx := auth.WithSpaceScope(
				auth.WithPrincipal(context.Background(), auth.Principal{
					Subject:  "usr_1",
					APIKeyID: "apk_1",
					Scopes:   []string{string(identity.ScopeFinanceRead)},
				}),
				"spc_1",
				string(space.RoleViewer),
			)
			session, err := srv.ConnectInMemory(ctx)
			if err != nil {
				t.Fatalf("ConnectInMemory failed: %v", err)
			}
			defer func() { _ = session.Close() }()

			// Verify write tools are hidden when only finance:read is granted
			toolsRes, err := session.ListTools(context.Background(), &sdkmcp.ListToolsParams{})
			if err != nil {
				t.Fatalf("ListTools failed: %v", err)
			}
			for _, tool := range toolsRes.Tools {
				if !tool.Annotations.ReadOnlyHint {
					t.Errorf("unexpected non-readonly tool %q exposed to read-only caller", tool.Name)
				}
			}

			res, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
				Name:      tc.toolName,
				Arguments: tc.args,
			})
			if err != nil {
				t.Fatalf("CallTool failed: %v", err)
			}
			if tc.wantErr {
				if !res.IsError {
					t.Fatal("expected IsError=true")
				}
				return
			}
			if res.IsError {
				t.Fatalf("unexpected tool error: %+v", res.Content)
			}
			tc.assertOut(t, res.StructuredContent.(map[string]any))
		})
	}
}

func TestFinanceHandler_WriteTools(t *testing.T) {
	rCtx := finance.NewRequestContext("spc_1", "usr_1", time.UTC, "USD")

	tests := []struct {
		name       string
		toolName   string
		args       map[string]any
		setupMocks func(coord *FinanceCoordinatorMock)
		wantErr    bool
	}{
		{
			name:     "create expense succeeds",
			toolName: "finance_create_transaction",
			args: map[string]any{
				"type":         "EXPENSE",
				"budget_id":    "bgt_1",
				"amount_cents": 2500,
				"currency":     "USD",
				"description":  "Lunch",
			},
			setupMocks: func(coord *FinanceCoordinatorMock) {
				coord.ResolveContextFunc = func(_ context.Context) (finance.Context, error) { return rCtx, nil }
				coord.CreateExpenseFunc = func(_ context.Context, req *financeapp.CreateExpenseRequest) (*finance.Transaction, error) {
					if req.BudgetID != "bgt_1" || req.Amount != 2500 {
						t.Errorf("unexpected expense request: %+v", req)
					}
					return &finance.Transaction{
						ID:              "txn_1",
						Type:            finance.TransactionTypeExpense,
						Amount:          2500,
						Currency:        "USD",
						Description:     req.Description,
						TransactionDate: rCtx.Now(),
					}, nil
				}
			},
		},
		{
			name:     "create expense missing budget_id fails",
			toolName: "finance_create_transaction",
			args: map[string]any{
				"type":         "EXPENSE",
				"amount_cents": 2500,
				"currency":     "USD",
				"description":  "Lunch",
			},
			setupMocks: func(coord *FinanceCoordinatorMock) {
				coord.ResolveContextFunc = func(_ context.Context) (finance.Context, error) { return rCtx, nil }
			},
			wantErr: true,
		},
		{
			name:     "create transfer succeeds",
			toolName: "finance_create_transfer",
			args: map[string]any{
				"source_account_id":      "acc_1",
				"destination_account_id": "acc_2",
				"source_amount_cents":    10000,
			},
			setupMocks: func(coord *FinanceCoordinatorMock) {
				coord.ResolveContextFunc = func(_ context.Context) (finance.Context, error) { return rCtx, nil }
				coord.CreateTransferFunc = func(_ context.Context, req *financeapp.CreateTransferRequest) (*finance.Transfer, error) {
					if req.DestinationAmount != 10000 {
						t.Errorf("expected destination default 10000, got %d", req.DestinationAmount)
					}
					return &finance.Transfer{
						ID:                   "trf_1",
						SourceAccountID:      "acc_1",
						DestinationAccountID: "acc_2",
						SourceAmount:         10000,
						DestinationAmount:    10000,
						TransferDate:         rCtx.Now(),
					}, nil
				}
			},
		},
		{
			name:     "create inbox item stages item",
			toolName: "finance_create_inbox_item",
			args: map[string]any{
				"doc_type":     "RECEIPT",
				"vendor":       "Whole Foods",
				"amount_cents": 4500,
				"currency":     "USD",
			},
			setupMocks: func(coord *FinanceCoordinatorMock) {
				coord.ResolveContextFunc = func(_ context.Context) (finance.Context, error) { return rCtx, nil }
				coord.StageInboxItemFunc = func(_ context.Context, req *finance.StageInboxItem) (*finance.InboxItem, error) {
					if req.Vendor != "Whole Foods" || req.Amount != 4500 {
						t.Errorf("unexpected stage request: %+v", req)
					}
					return &finance.InboxItem{
						ID:              "ibx_1",
						Status:          finance.InboxItemPending,
						DocType:         req.DocType,
						VendorName:      req.Vendor,
						Amount:          req.Amount,
						Currency:        req.Currency,
						TransactionDate: rCtx.Now(),
					}, nil
				}
			},
		},
		{
			name:     "propagates coordinator domain error",
			toolName: "finance_create_transfer",
			args: map[string]any{
				"source_account_id":      "acc_1",
				"destination_account_id": "acc_1",
				"source_amount_cents":    1000,
			},
			setupMocks: func(coord *FinanceCoordinatorMock) {
				coord.ResolveContextFunc = func(_ context.Context) (finance.Context, error) { return rCtx, nil }
				coord.CreateTransferFunc = func(_ context.Context, _ *financeapp.CreateTransferRequest) (*finance.Transfer, error) {
					return nil, errors.E(errors.Invalid, "source and destination accounts must differ")
				}
			},
			wantErr: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			agg := &FinanceAggregatorMock{}
			coord := &FinanceCoordinatorMock{}
			if tc.setupMocks != nil {
				tc.setupMocks(coord)
			}

			srv := mcptransport.NewServer(mcptransport.ServerConfig{})
			NewHandler(Dependencies{
				Aggregator:  agg,
				Coordinator: coord,
			}).Register(srv.Registry())

			ctx := auth.WithSpaceScope(
				auth.WithPrincipal(context.Background(), auth.Principal{Subject: "usr_1"}),
				"spc_1",
				string(space.RoleMember),
			)
			session, err := srv.ConnectInMemory(ctx)
			if err != nil {
				t.Fatalf("ConnectInMemory failed: %v", err)
			}
			defer func() { _ = session.Close() }()

			res, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
				Name:      tc.toolName,
				Arguments: tc.args,
			})
			if err != nil {
				t.Fatalf("CallTool failed: %v", err)
			}
			if tc.wantErr {
				if !res.IsError {
					t.Fatal("expected IsError=true")
				}
				return
			}
			if res.IsError {
				t.Fatalf("unexpected tool error: %+v", res.Content)
			}
		})
	}
}
