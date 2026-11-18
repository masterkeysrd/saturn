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
		{
			name:     "list transfers formats amounts and filters by account and date",
			toolName: "finance_list_transfers",
			args: map[string]any{
				"account_id": "acc_1",
				"start_date": "2026-04-01",
				"end_date":   "2026-04-30",
			},
			setupMocks: func(_ *FinanceAggregatorMock, coord *FinanceCoordinatorMock) {
				coord.ResolveContextFunc = func(_ context.Context) (finance.Context, error) { return rCtx, nil }
				coord.ListTransfersFunc = func(_ context.Context, _ *financeapp.ListTransfersRequest) ([]*finance.Transfer, string, error) {
					return []*finance.Transfer{
						{
							ID:                   "trsf_1",
							SourceAccountID:      "acc_1",
							DestinationAccountID: "acc_2",
							SourceAmount:         15000,
							DestinationAmount:    15000,
							TransferDate:         time.Date(2026, 4, 15, 12, 0, 0, 0, loc),
							Notes:                "Savings",
						},
						{
							ID:                   "trsf_2",
							SourceAccountID:      "acc_3",
							DestinationAccountID: "acc_4",
							SourceAmount:         5000,
							DestinationAmount:    5000,
							TransferDate:         time.Date(2026, 4, 15, 12, 0, 0, 0, loc),
						},
					}, "next_tok", nil
				}
			},
			assertOut: func(t *testing.T, out map[string]any) {
				list := out["transfers"].([]any)
				if len(list) != 1 {
					t.Fatalf("expected 1 filtered transfer, got %d", len(list))
				}
				first := list[0].(map[string]any)
				if first["formatted_source_amount"] != "USD 150.00" || out["next_page_token"] != "next_tok" {
					t.Errorf("unexpected transfer output: %+v", out)
				}
			},
		},
		{
			name:     "list transfers with invalid start_date returns error",
			toolName: "finance_list_transfers",
			args:     map[string]any{"start_date": "bad-date"},
			setupMocks: func(_ *FinanceAggregatorMock, coord *FinanceCoordinatorMock) {
				coord.ResolveContextFunc = func(_ context.Context) (finance.Context, error) { return rCtx, nil }
			},
			wantErr: true,
		},
		{
			name:     "list scheduled defaults to pending status and formats amount",
			toolName: "finance_list_scheduled",
			args:     map[string]any{},
			setupMocks: func(agg *FinanceAggregatorMock, coord *FinanceCoordinatorMock) {
				coord.ResolveContextFunc = func(_ context.Context) (finance.Context, error) { return rCtx, nil }
				agg.ListScheduledTransactionsFunc = func(_ context.Context, _ finance.Context, _ financeaggregator.ViewType, filter finance.ListScheduledTransactionsFilter) (*paging.Page[*financeaggregator.AggregatedScheduledTransaction], error) {
					if filter.Status == nil || *filter.Status != finance.ScheduledTransactionPending {
						t.Errorf("expected default pending status filter, got %v", filter.Status)
					}
					return &paging.Page[*financeaggregator.AggregatedScheduledTransaction]{
						Items: []*financeaggregator.AggregatedScheduledTransaction{
							{
								ScheduledTransaction: &finance.ScheduledTransaction{
									ID:         "sctx_1",
									Type:       finance.TransactionTypeExpense,
									Status:     finance.ScheduledTransactionPending,
									SourceType: "recurrent_transaction",
									SourceID:   "rctx_1",
									Amount:     9900,
									Currency:   "USD",
									DueDate:    time.Date(2026, 4, 20, 0, 0, 0, 0, loc),
									Metadata:   finance.ScheduledTransactionMetadata{Description: "Internet"},
								},
								Budget: &financeaggregator.AggregatedBudget{
									Budget: &finance.Budget{ID: "bgt_1", Name: "Utilities"},
								},
							},
						},
					}, nil
				}
			},
			assertOut: func(t *testing.T, out map[string]any) {
				list := out["scheduled"].([]any)
				if len(list) != 1 || list[0].(map[string]any)["formatted_amount"] != "USD 99.00" {
					t.Errorf("unexpected scheduled output: %+v", list)
				}
			},
		},
		{
			name:     "list scheduled propagates aggregator error",
			toolName: "finance_list_scheduled",
			args:     map[string]any{"status": "paid"},
			setupMocks: func(agg *FinanceAggregatorMock, coord *FinanceCoordinatorMock) {
				coord.ResolveContextFunc = func(_ context.Context) (finance.Context, error) { return rCtx, nil }
				agg.ListScheduledTransactionsFunc = func(_ context.Context, _ finance.Context, _ financeaggregator.ViewType, _ finance.ListScheduledTransactionsFilter) (*paging.Page[*financeaggregator.AggregatedScheduledTransaction], error) {
					return nil, errors.E(errors.Internal, "db unavailable")
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
		setupMocks func(agg *FinanceAggregatorMock, coord *FinanceCoordinatorMock)
		wantErr    bool
		assertOut  func(t *testing.T, out map[string]any)
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
			setupMocks: func(_ *FinanceAggregatorMock, coord *FinanceCoordinatorMock) {
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
			setupMocks: func(_ *FinanceAggregatorMock, coord *FinanceCoordinatorMock) {
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
			setupMocks: func(_ *FinanceAggregatorMock, coord *FinanceCoordinatorMock) {
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
			setupMocks: func(_ *FinanceAggregatorMock, coord *FinanceCoordinatorMock) {
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
			setupMocks: func(_ *FinanceAggregatorMock, coord *FinanceCoordinatorMock) {
				coord.ResolveContextFunc = func(_ context.Context) (finance.Context, error) { return rCtx, nil }
				coord.CreateTransferFunc = func(_ context.Context, _ *financeapp.CreateTransferRequest) (*finance.Transfer, error) {
					return nil, errors.E(errors.Invalid, "source and destination accounts must differ")
				}
			},
			wantErr: true,
		},
		{
			name:     "update transaction merges partial expense fields",
			toolName: "finance_update_transaction",
			args: map[string]any{
				"id":           "txn_1",
				"amount_cents": 3500,
				"description":  "Updated Dinner",
			},
			setupMocks: func(agg *FinanceAggregatorMock, coord *FinanceCoordinatorMock) {
				coord.ResolveContextFunc = func(_ context.Context) (finance.Context, error) { return rCtx, nil }
				agg.GetTransactionFunc = func(_ context.Context, _ finance.Context, _ financeaggregator.ViewType, id finance.TransactionID) (*financeaggregator.AggregatedTransaction, error) {
					bID := finance.BudgetID("bgt_1")
					aID := finance.AccountID("acc_1")
					return &financeaggregator.AggregatedTransaction{
						Transaction: &finance.Transaction{
							ID:              id,
							Type:            finance.TransactionTypeExpense,
							BudgetID:        &bID,
							AccountID:       &aID,
							Amount:          2000,
							Currency:        "USD",
							Description:     "Dinner",
							TransactionDate: time.Date(2026, 4, 10, 12, 0, 0, 0, time.UTC),
							EffectiveDate:   time.Date(2026, 4, 10, 12, 0, 0, 0, time.UTC),
						},
					}, nil
				}
				coord.UpdateExpenseFunc = func(_ context.Context, req *financeapp.UpdateExpenseRequest) (*finance.Transaction, error) {
					if req.Amount != 3500 || req.BudgetID != "bgt_1" || req.Description != "Updated Dinner" {
						t.Errorf("unexpected update expense request: %+v", req)
					}
					return &finance.Transaction{
						ID:              req.TransactionID,
						Type:            finance.TransactionTypeExpense,
						BudgetID:        &req.BudgetID,
						AccountID:       req.AccountID,
						Amount:          req.Amount,
						Currency:        req.Currency,
						Description:     req.Description,
						TransactionDate: req.TransactionDate,
					}, nil
				}
			},
			assertOut: func(t *testing.T, out map[string]any) {
				if out["formatted_amount"] != "USD 35.00" || out["description"] != "Updated Dinner" {
					t.Errorf("unexpected updated transaction: %+v", out)
				}
			},
		},
		{
			name:     "update transaction updates income",
			toolName: "finance_update_transaction",
			args: map[string]any{
				"id":          "txn_inc",
				"description": "Bonus",
			},
			setupMocks: func(agg *FinanceAggregatorMock, coord *FinanceCoordinatorMock) {
				coord.ResolveContextFunc = func(_ context.Context) (finance.Context, error) { return rCtx, nil }
				agg.GetTransactionFunc = func(_ context.Context, _ finance.Context, _ financeaggregator.ViewType, id finance.TransactionID) (*financeaggregator.AggregatedTransaction, error) {
					return &financeaggregator.AggregatedTransaction{
						Transaction: &finance.Transaction{
							ID:              id,
							Type:            finance.TransactionTypeIncome,
							Amount:          50000,
							Currency:        "USD",
							Description:     "Salary",
							TransactionDate: time.Date(2026, 4, 1, 0, 0, 0, 0, time.UTC),
						},
					}, nil
				}
				coord.UpdateIncomeFunc = func(_ context.Context, req *financeapp.UpdateIncomeRequest) (*finance.Transaction, error) {
					return &finance.Transaction{
						ID:              req.TransactionID,
						Type:            finance.TransactionTypeIncome,
						Amount:          req.Amount,
						Currency:        req.Currency,
						Description:     req.Description,
						TransactionDate: req.TransactionDate,
					}, nil
				}
			},
			assertOut: func(t *testing.T, out map[string]any) {
				if out["formatted_amount"] != "USD 500.00" || out["description"] != "Bonus" {
					t.Errorf("unexpected income update output: %+v", out)
				}
			},
		},
		{
			name:     "update transaction with no fields fails",
			toolName: "finance_update_transaction",
			args:     map[string]any{"id": "txn_1"},
			setupMocks: func(_ *FinanceAggregatorMock, coord *FinanceCoordinatorMock) {
				coord.ResolveContextFunc = func(_ context.Context) (finance.Context, error) { return rCtx, nil }
			},
			wantErr: true,
		},
		{
			name:     "delete transaction deletes regular transaction",
			toolName: "finance_delete_transaction",
			args:     map[string]any{"id": "txn_1"},
			setupMocks: func(_ *FinanceAggregatorMock, coord *FinanceCoordinatorMock) {
				coord.ResolveContextFunc = func(_ context.Context) (finance.Context, error) { return rCtx, nil }
				coord.DeleteTransactionFunc = func(_ context.Context, id finance.TransactionID) error {
					if id != "txn_1" {
						t.Errorf("unexpected id %q", id)
					}
					return nil
				}
			},
			assertOut: func(t *testing.T, out map[string]any) {
				if out["deleted"] != true || out["kind"] != "transaction" {
					t.Errorf("unexpected delete output: %+v", out)
				}
			},
		},
		{
			name:     "delete transaction detects transfer prefix",
			toolName: "finance_delete_transaction",
			args:     map[string]any{"id": "trf_1"},
			setupMocks: func(_ *FinanceAggregatorMock, coord *FinanceCoordinatorMock) {
				coord.ResolveContextFunc = func(_ context.Context) (finance.Context, error) { return rCtx, nil }
				coord.DeleteTransferFunc = func(_ context.Context, id finance.TransferID) error {
					if id != "trf_1" {
						t.Errorf("unexpected transfer id %q", id)
					}
					return nil
				}
			},
			assertOut: func(t *testing.T, out map[string]any) {
				if out["deleted"] != true || out["kind"] != "transfer" {
					t.Errorf("unexpected delete transfer output: %+v", out)
				}
			},
		},
		{
			name:     "delete transaction propagates error",
			toolName: "finance_delete_transaction",
			args:     map[string]any{"id": "txn_missing"},
			setupMocks: func(_ *FinanceAggregatorMock, coord *FinanceCoordinatorMock) {
				coord.ResolveContextFunc = func(_ context.Context) (finance.Context, error) { return rCtx, nil }
				coord.DeleteTransactionFunc = func(_ context.Context, _ finance.TransactionID) error {
					return errors.E(errors.NotExist, "not found")
				}
			},
			wantErr: true,
		},
		{
			name:     "review inbox item patches overrides and approves",
			toolName: "finance_review_inbox_item",
			args: map[string]any{
				"id":           "ibx_1",
				"action":       "approve",
				"vendor":       "Trader Joes",
				"amount_cents": 4200,
				"budget_id":    "bgt_1",
			},
			setupMocks: func(_ *FinanceAggregatorMock, coord *FinanceCoordinatorMock) {
				coord.ResolveContextFunc = func(_ context.Context) (finance.Context, error) { return rCtx, nil }
				coord.UpdateInboxItemFunc = func(_ context.Context, item *finance.InboxItem, mask []string) (*finance.InboxItem, error) {
					if item.VendorName != "Trader Joes" || item.Amount != 4200 || len(mask) != 3 {
						t.Errorf("unexpected patch: item=%+v mask=%v", item, mask)
					}
					return item, nil
				}
				coord.ApproveInboxItemFunc = func(_ context.Context, id string) (*finance.InboxItem, error) {
					return &finance.InboxItem{
						ID:              id,
						Status:          finance.InboxItemResolved,
						DocType:         finance.InboxItemDocReceipt,
						VendorName:      "Trader Joes",
						Amount:          4200,
						Currency:        "USD",
						TransactionDate: time.Date(2026, 4, 15, 0, 0, 0, 0, time.UTC),
					}, nil
				}
			},
			assertOut: func(t *testing.T, out map[string]any) {
				if out["status"] != "resolved" || out["formatted_amount"] != "USD 42.00" {
					t.Errorf("unexpected approved inbox item: %+v", out)
				}
			},
		},
		{
			name:     "review inbox item discards item",
			toolName: "finance_review_inbox_item",
			args:     map[string]any{"id": "ibx_2", "action": "discard"},
			setupMocks: func(_ *FinanceAggregatorMock, coord *FinanceCoordinatorMock) {
				coord.ResolveContextFunc = func(_ context.Context) (finance.Context, error) { return rCtx, nil }
				coord.DiscardInboxItemFunc = func(_ context.Context, id string) error {
					if id != "ibx_2" {
						t.Errorf("unexpected id %q", id)
					}
					return nil
				}
			},
			assertOut: func(t *testing.T, out map[string]any) {
				if out["status"] != "discarded" || out["id"] != "ibx_2" {
					t.Errorf("unexpected discard output: %+v", out)
				}
			},
		},
		{
			name:     "review inbox item rejects invalid action",
			toolName: "finance_review_inbox_item",
			args:     map[string]any{"id": "ibx_1", "action": "archive"},
			setupMocks: func(_ *FinanceAggregatorMock, coord *FinanceCoordinatorMock) {
				coord.ResolveContextFunc = func(_ context.Context) (finance.Context, error) { return rCtx, nil }
			},
			wantErr: true,
		},
		{
			name:     "manage budget creates new budget",
			toolName: "finance_manage_budget",
			args: map[string]any{
				"name":        "Dining Out",
				"limit_cents": 30000,
				"interval":    "MONTHLY",
			},
			setupMocks: func(_ *FinanceAggregatorMock, coord *FinanceCoordinatorMock) {
				coord.ResolveContextFunc = func(_ context.Context) (finance.Context, error) { return rCtx, nil }
				coord.CreateBudgetFunc = func(_ context.Context, req *financeapp.CreateBudgetRequest) (*finance.Budget, error) {
					if req.Budget.Name != "Dining Out" || req.Budget.LimitAmount != 30000 || req.Budget.Currency != "USD" {
						t.Errorf("unexpected create budget request: %+v", req.Budget)
					}
					return &finance.Budget{
						ID:          "bgt_new",
						Name:        req.Budget.Name,
						LimitAmount: req.Budget.LimitAmount,
						Currency:    req.Budget.Currency,
						Interval:    req.Budget.Interval,
						Status:      req.Budget.Status,
						Version:     1,
					}, nil
				}
			},
			assertOut: func(t *testing.T, out map[string]any) {
				if out["id"] != "bgt_new" || out["formatted_limit"] != "USD 300.00" {
					t.Errorf("unexpected budget summary: %+v", out)
				}
			},
		},
		{
			name:     "manage budget updates existing budget with current version",
			toolName: "finance_manage_budget",
			args: map[string]any{
				"id":          "bgt_1",
				"limit_cents": 60000,
				"propagation": "CURRENT_AND_FUTURE",
			},
			setupMocks: func(_ *FinanceAggregatorMock, coord *FinanceCoordinatorMock) {
				coord.ResolveContextFunc = func(_ context.Context) (finance.Context, error) { return rCtx, nil }
				coord.GetBudgetFunc = func(_ context.Context, id finance.BudgetID) (*finance.Budget, error) {
					return &finance.Budget{
						ID:          id,
						Name:        "Groceries",
						LimitAmount: 50000,
						Currency:    "USD",
						Interval:    finance.IntervalMonthly,
						Status:      finance.BudgetStatusActive,
						Version:     4,
					}, nil
				}
				coord.UpdateBudgetFunc = func(_ context.Context, req *financeapp.UpdateBudgetRequest) (*finance.Budget, error) {
					if req.Budget.Version != 4 || req.Propagation != finance.PropagationCurrentPeriod {
						t.Errorf("unexpected update budget req: version=%d propagation=%s", req.Budget.Version, req.Propagation)
					}
					return &finance.Budget{
						ID:          req.Budget.ID,
						Name:        "Groceries",
						LimitAmount: req.Budget.LimitAmount,
						Currency:    "USD",
						Interval:    finance.IntervalMonthly,
						Status:      finance.BudgetStatusActive,
						Version:     5,
					}, nil
				}
			},
			assertOut: func(t *testing.T, out map[string]any) {
				if out["formatted_limit"] != "USD 600.00" || out["version"] != float64(5) {
					t.Errorf("unexpected updated budget: %+v", out)
				}
			},
		},
		{
			name:     "manage budget missing name on create fails",
			toolName: "finance_manage_budget",
			args:     map[string]any{"limit_cents": 10000},
			setupMocks: func(_ *FinanceAggregatorMock, coord *FinanceCoordinatorMock) {
				coord.ResolveContextFunc = func(_ context.Context) (finance.Context, error) { return rCtx, nil }
			},
			wantErr: true,
		},
		{
			name:     "adjust account balance succeeds",
			toolName: "finance_adjust_account_balance",
			args: map[string]any{
				"account_id":        "acc_1",
				"new_balance_cents": 250000,
				"reason":            "Bank statement match",
			},
			setupMocks: func(_ *FinanceAggregatorMock, coord *FinanceCoordinatorMock) {
				coord.ResolveContextFunc = func(_ context.Context) (finance.Context, error) { return rCtx, nil }
				coord.AdjustAccountBalanceFunc = func(_ context.Context, req *financeapp.AdjustAccountBalanceRequest) (*finance.Account, error) {
					if req.AccountID != "acc_1" || req.TargetBalance != 250000 || req.Note != "Bank statement match" {
						t.Errorf("unexpected adjust balance req: %+v", req)
					}
					return &finance.Account{
						ID:             req.AccountID,
						Name:           "Checking",
						Type:           finance.AccountTypeBank,
						Currency:       "USD",
						CurrentBalance: req.TargetBalance,
						IsActive:       true,
					}, nil
				}
			},
			assertOut: func(t *testing.T, out map[string]any) {
				if out["formatted_balance"] != "USD 2500.00" {
					t.Errorf("unexpected account balance summary: %+v", out)
				}
			},
		},
		{
			name:     "adjust account balance missing account_id fails",
			toolName: "finance_adjust_account_balance",
			args:     map[string]any{"new_balance_cents": 1000},
			setupMocks: func(_ *FinanceAggregatorMock, coord *FinanceCoordinatorMock) {
				coord.ResolveContextFunc = func(_ context.Context) (finance.Context, error) { return rCtx, nil }
			},
			wantErr: true,
		},
		{
			name:     "log borrowing payment succeeds",
			toolName: "finance_log_borrowing_payment",
			args: map[string]any{
				"borrowing_id": "bor_1",
				"amount_cents": 7500,
				"account_id":   "acc_1",
				"notes":        "Installment 2",
			},
			setupMocks: func(_ *FinanceAggregatorMock, coord *FinanceCoordinatorMock) {
				coord.ResolveContextFunc = func(_ context.Context) (finance.Context, error) { return rCtx, nil }
				coord.LogBorrowingTransactionFunc = func(_ context.Context, req *financeapp.LogBorrowingTransactionRequest) (*finance.Transaction, error) {
					if req.BorrowingID != "bor_1" || req.Type != finance.BorrowingTransactionTypePayment || req.Amount != 7500 {
						t.Errorf("unexpected borrowing payment req: %+v", req)
					}
					return &finance.Transaction{
						ID:              "txn_bor_1",
						Type:            finance.TransactionTypeIncome,
						AccountID:       req.AccountID,
						Amount:          7500,
						Currency:        "USD",
						Description:     req.Notes,
						TransactionDate: req.TransactionDate,
					}, nil
				}
			},
			assertOut: func(t *testing.T, out map[string]any) {
				if out["formatted_amount"] != "USD 75.00" || out["id"] != "txn_bor_1" {
					t.Errorf("unexpected borrowing payment output: %+v", out)
				}
			},
		},
		{
			name:     "log borrowing payment rejects non-positive amount",
			toolName: "finance_log_borrowing_payment",
			args:     map[string]any{"borrowing_id": "bor_1", "amount_cents": 0},
			setupMocks: func(_ *FinanceAggregatorMock, coord *FinanceCoordinatorMock) {
				coord.ResolveContextFunc = func(_ context.Context) (finance.Context, error) { return rCtx, nil }
			},
			wantErr: true,
		},
		{
			name:     "resolve scheduled confirms with overrides",
			toolName: "finance_resolve_scheduled",
			args: map[string]any{
				"id":           "sctx_1",
				"action":       "confirm",
				"amount_cents": 10500,
				"account_id":   "acc_1",
			},
			setupMocks: func(_ *FinanceAggregatorMock, coord *FinanceCoordinatorMock) {
				coord.ResolveContextFunc = func(_ context.Context) (finance.Context, error) { return rCtx, nil }
				coord.ConfirmScheduledTransactionFunc = func(_ context.Context, req *financeapp.ConfirmScheduledTransactionRequest) (*finance.Transaction, error) {
					if req.TransactionID != "sctx_1" || req.ActualAmount != 10500 {
						t.Errorf("unexpected confirm req: %+v", req)
					}
					return &finance.Transaction{
						ID:              "txn_conf_1",
						Type:            finance.TransactionTypeExpense,
						Amount:          10500,
						Currency:        "USD",
						TransactionDate: rCtx.Now(),
					}, nil
				}
			},
			assertOut: func(t *testing.T, out map[string]any) {
				if out["status"] != "paid" || out["transaction_id"] != "txn_conf_1" || out["formatted_amount"] != "USD 105.00" {
					t.Errorf("unexpected resolve confirm output: %+v", out)
				}
			},
		},
		{
			name:     "resolve scheduled skips occurrence",
			toolName: "finance_resolve_scheduled",
			args:     map[string]any{"id": "sctx_2", "action": "skip"},
			setupMocks: func(_ *FinanceAggregatorMock, coord *FinanceCoordinatorMock) {
				coord.ResolveContextFunc = func(_ context.Context) (finance.Context, error) { return rCtx, nil }
				coord.SkipScheduledTransactionFunc = func(_ context.Context, id finance.ScheduledTransactionID) (*finance.ScheduledTransaction, error) {
					return &finance.ScheduledTransaction{
						ID:       id,
						Amount:   5000,
						Currency: "USD",
						Status:   finance.ScheduledTransactionSkipped,
						DueDate:  time.Date(2026, 4, 25, 0, 0, 0, 0, time.UTC),
					}, nil
				}
			},
			assertOut: func(t *testing.T, out map[string]any) {
				if out["status"] != "skipped" || out["formatted_amount"] != "USD 50.00" {
					t.Errorf("unexpected resolve skip output: %+v", out)
				}
			},
		},
		{
			name:     "resolve scheduled propagates domain error",
			toolName: "finance_resolve_scheduled",
			args:     map[string]any{"id": "sctx_missing", "action": "skip"},
			setupMocks: func(_ *FinanceAggregatorMock, coord *FinanceCoordinatorMock) {
				coord.ResolveContextFunc = func(_ context.Context) (finance.Context, error) { return rCtx, nil }
				coord.SkipScheduledTransactionFunc = func(_ context.Context, _ finance.ScheduledTransactionID) (*finance.ScheduledTransaction, error) {
					return nil, errors.E(errors.NotExist, "scheduled transaction not found")
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
				tc.setupMocks(agg, coord)
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
			if tc.assertOut != nil {
				tc.assertOut(t, res.StructuredContent.(map[string]any))
			}
		})
	}
}
