package financeapp

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
	"github.com/masterkeysrd/saturn/internal/platform/settings"
	"github.com/masterkeysrd/saturn/internal/platform/workflow"
)

func genAccountID(t *testing.T) finance.AccountID {
	t.Helper()
	id, err := finance.NewAccountID()
	if err != nil {
		t.Fatalf("NewAccountID() error = %v", err)
	}
	return id
}

func genBudgetID(t *testing.T) finance.BudgetID {
	t.Helper()
	id, err := finance.NewBudgetID()
	if err != nil {
		t.Fatalf("NewBudgetID() error = %v", err)
	}
	return id
}

type stubAgentExecutor struct {
	fn func(ctx context.Context, req workflow.LLMRequest) (*workflow.LLMResponse, error)
}

func (s *stubAgentExecutor) Execute(ctx context.Context, req workflow.LLMRequest) (*workflow.LLMResponse, error) {
	return s.fn(ctx, req)
}

func newWorkflowTestEngine(t *testing.T, deps WorkflowDependencies, agentExec workflow.AgentExecutor) (*workflow.Engine, *workflow.Registry) {
	t.Helper()
	reg := workflow.NewRegistry()
	RegisterWorkflows(reg, deps)
	engine, err := workflow.NewEngine(workflow.Dependencies{
		Registry:      reg,
		AgentExecutor: agentExec,
	})
	if err != nil {
		t.Fatalf("NewEngine() error = %v", err)
	}
	return engine, reg
}

func defaultSpaceAndFinanceMocks() (*SpaceServiceMock, *FinanceServiceMock) {
	spaceSvc := &SpaceServiceMock{
		GetSettingsFunc: func(_ context.Context, _ space.Session) (*settings.Entry[space.Settings], error) {
			return &settings.Entry[space.Settings]{
				Value: space.Settings{Timezone: "America/Santo_Domingo"},
			}, nil
		},
	}
	finSvc := &FinanceServiceMock{
		GetSettingsFunc: func(_ context.Context, _ finance.SpaceID) (*settings.Entry[finance.Settings], error) {
			return &settings.Entry[finance.Settings]{
				Value: finance.Settings{BaseCurrency: "DOP"},
			}, nil
		},
	}
	return spaceSvc, finSvc
}

func TestRegisterWorkflows(t *testing.T) {
	t.Run("RegistersLoadersStepsAndBlueprints", func(t *testing.T) {
		reg := workflow.NewRegistry()
		RegisterWorkflows(reg, WorkflowDependencies{})

		wantLoaders := []string{
			"finance.accounts",
			"finance.account",
			"finance.budgets",
			"finance.budget",
			"finance.transactions",
			"finance.scheduled_payments",
			"finance.borrowings",
			"finance.recurring_templates",
		}
		for _, name := range wantLoaders {
			if !reg.HasLoader(name) {
				t.Errorf("expected loader %q to be registered", name)
			}
		}

		wantSteps := []string{
			"finance.create_inbox_item",
			"finance.import_statement_draft",
		}
		for _, stepType := range wantSteps {
			desc, handler, ok := reg.GetStep(stepType)
			if !ok || handler == nil {
				t.Fatalf("expected step %q with non-nil handler to be registered", stepType)
			}
			if len(desc.InvalidatesPrefixes) == 0 || desc.InvalidatesPrefixes[0] != "finance." {
				t.Errorf("step %q InvalidatesPrefixes = %v, want [finance.]", stepType, desc.InvalidatesPrefixes)
			}
		}

		wantFlows := []string{
			SystemFlowInboxIngestion,
			SystemFlowTransactionSuggestions,
			SystemFlowStatementIngestion,
		}
		for _, key := range wantFlows {
			bp, ok := reg.GetSystemFlow(key)
			if !ok || bp.Build == nil {
				t.Errorf("expected system flow blueprint %q to be registered", key)
			}
		}
	})
}

func TestFinanceWorkflowLoaders(t *testing.T) {
	t.Run("finance.accounts", func(t *testing.T) {
		tests := []struct {
			name      string
			params    map[string]any
			deps      WorkflowDependencies
			wantCount int
			wantErr   bool
		}{
			{
				name: "FiltersByCurrencyAndType",
				params: map[string]any{
					"currency": "usd",
					"type":     "credit_card",
				},
				deps: func() WorkflowDependencies {
					spaceSvc, finSvc := defaultSpaceAndFinanceMocks()
					finSvc.ListAccountsFunc = func(_ context.Context, fCtx finance.Context, f *finance.ListAccountsFilter) (*paging.Page[*finance.Account], error) {
						if fCtx.BaseCurrency() != "DOP" || f.PageSize != 1000 || f.ActiveOnly == nil || !*f.ActiveOnly {
							t.Errorf("unexpected context or filter: currency=%s filter=%+v", fCtx.BaseCurrency(), f)
						}
						return &paging.Page[*finance.Account]{
							Items: []*finance.Account{
								{ID: "acc_1", Name: "Visa USD", Type: finance.AccountTypeCreditCard, Currency: "USD", LastFour: "1234", IsActive: true},
								{ID: "acc_2", Name: "Visa DOP", Type: finance.AccountTypeCreditCard, Currency: "DOP", LastFour: "1234", IsActive: true},
								{ID: "acc_3", Name: "Checking USD", Type: finance.AccountTypeBank, Currency: "USD", IsActive: true},
							},
						}, nil
					}
					return WorkflowDependencies{SpaceService: spaceSvc, FinanceService: finSvc}
				}(),
				wantCount: 1,
			},
			{
				name: "ServiceErrorPropagates",
				deps: func() WorkflowDependencies {
					spaceSvc, finSvc := defaultSpaceAndFinanceMocks()
					finSvc.ListAccountsFunc = func(_ context.Context, _ finance.Context, _ *finance.ListAccountsFilter) (*paging.Page[*finance.Account], error) {
						return nil, errors.New("db error")
					}
					return WorkflowDependencies{SpaceService: spaceSvc, FinanceService: finSvc}
				}(),
				wantErr: true,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				reg := workflow.NewRegistry()
				RegisterWorkflows(reg, tc.deps)
				_, loader, _ := reg.GetLoader("finance.accounts")
				res, err := loader.Load(context.Background(), "spc_1", tc.params)
				if tc.wantErr {
					if err == nil {
						t.Fatal("expected error, got nil")
					}
					return
				}
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				items := res.([]any)
				if len(items) != tc.wantCount {
					t.Fatalf("got %d items, want %d (%+v)", len(items), tc.wantCount, items)
				}
				if items[0].(map[string]any)["id"] != "acc_1" {
					t.Errorf("got id %v, want acc_1", items[0].(map[string]any)["id"])
				}
			})
		}
	})

	t.Run("finance.account", func(t *testing.T) {
		acc1 := genAccountID(t)
		tests := []struct {
			name    string
			params  map[string]any
			setup   func(*FinanceServiceMock)
			wantID  string
			wantNil bool
		}{
			{
				name:   "ExactIDLookup",
				params: map[string]any{"id": string(acc1)},
				setup: func(m *FinanceServiceMock) {
					m.GetAccountFunc = func(_ context.Context, _ finance.Context, id finance.AccountID) (*finance.Account, error) {
						return &finance.Account{ID: id, Name: "Primary", Currency: "USD", Type: finance.AccountTypeBank}, nil
					}
				},
				wantID: string(acc1),
			},
			{
				name:   "FallbackResolveAccount",
				params: map[string]any{"name": "Popular", "last_four": "9988", "currency": "dop"},
				setup: func(m *FinanceServiceMock) {
					m.ResolveAccountFunc = func(_ context.Context, _ finance.Context, opts finance.ResolveAccountOpts) (*finance.Account, error) {
						if opts.AccountName != "Popular" || opts.LastFour != "9988" || opts.Currency != "DOP" {
							t.Errorf("unexpected ResolveAccount opts: %+v", opts)
						}
						return &finance.Account{ID: "acc_pop", Name: "Popular", Currency: "DOP", LastFour: "9988", Type: finance.AccountTypeCreditCard}, nil
					}
				},
				wantID: "acc_pop",
			},
			{
				name:    "EmptyParamsReturnsNil",
				params:  map[string]any{},
				wantNil: true,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				spaceSvc, finSvc := defaultSpaceAndFinanceMocks()
				if tc.setup != nil {
					tc.setup(finSvc)
				}
				reg := workflow.NewRegistry()
				RegisterWorkflows(reg, WorkflowDependencies{SpaceService: spaceSvc, FinanceService: finSvc})
				_, loader, _ := reg.GetLoader("finance.account")
				res, err := loader.Load(context.Background(), "spc_1", tc.params)
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if tc.wantNil {
					if res != nil {
						t.Fatalf("expected nil, got %+v", res)
					}
					return
				}
				m := res.(map[string]any)
				if m["id"] != tc.wantID {
					t.Errorf("got id %v, want %s", m["id"], tc.wantID)
				}
			})
		}
	})

	t.Run("finance.budgets_and_budget", func(t *testing.T) {
		bdg1 := genBudgetID(t)
		bdg2 := genBudgetID(t)
		spaceSvc, finSvc := defaultSpaceAndFinanceMocks()
		finSvc.ListBudgetsFunc = func(_ context.Context, _ finance.Context, f *finance.ListBudgetsFilter) (*paging.Page[*finance.Budget], error) {
			return &paging.Page[*finance.Budget]{
				Items: []*finance.Budget{
					{ID: bdg1, Name: "Groceries", LimitAmount: 50000, Currency: "USD", Interval: finance.IntervalMonthly, Status: finance.BudgetStatusActive},
					{ID: bdg2, Name: "Travel", LimitAmount: 100000, Currency: "USD", Interval: finance.IntervalMonthly, Status: finance.BudgetStatusClosed},
				},
			}, nil
		}
		finSvc.GetBudgetFunc = func(_ context.Context, _ finance.Context, id finance.BudgetID) (*finance.Budget, error) {
			if id == bdg1 {
				return &finance.Budget{ID: bdg1, Name: "Groceries", Status: finance.BudgetStatusActive, Currency: "USD"}, nil
			}
			return nil, errors.New("not found")
		}

		reg := workflow.NewRegistry()
		RegisterWorkflows(reg, WorkflowDependencies{SpaceService: spaceSvc, FinanceService: finSvc})

		_, budgetsLoader, _ := reg.GetLoader("finance.budgets")
		listRes, err := budgetsLoader.Load(context.Background(), "spc_1", map[string]any{"status": "active"})
		if err != nil {
			t.Fatalf("finance.budgets error = %v", err)
		}
		if len(listRes.([]any)) != 2 {
			t.Fatalf("expected 2 items from mock, got %v", listRes)
		}

		_, budgetLoader, _ := reg.GetLoader("finance.budget")
		byID, err := budgetLoader.Load(context.Background(), "spc_1", map[string]any{"id": string(bdg1)})
		if err != nil || byID.(map[string]any)["id"] != string(bdg1) {
			t.Fatalf("byID = %+v, err = %v", byID, err)
		}
		byName, err := budgetLoader.Load(context.Background(), "spc_1", map[string]any{"name": "groceries"})
		if err != nil || byName.(map[string]any)["id"] != string(bdg1) {
			t.Fatalf("byName = %+v, err = %v", byName, err)
		}
	})

	t.Run("finance.transactions", func(t *testing.T) {
		accID := genAccountID(t)
		bdgID := genBudgetID(t)
		spaceSvc, finSvc := defaultSpaceAndFinanceMocks()
		var capturedFilter *finance.TransactionFilter
		finSvc.ListTransactionsFunc = func(_ context.Context, _ finance.Context, f *finance.TransactionFilter) (*paging.Page[*finance.Transaction], error) {
			capturedFilter = f
			return &paging.Page[*finance.Transaction]{
				Items: []*finance.Transaction{
					{
						ID:              "txn_1",
						Type:            finance.TransactionTypeExpense,
						Amount:          10000,
						Currency:        "USD",
						Description:     "Uber",
						TransactionDate: time.Date(2026, 4, 15, 0, 0, 0, 0, time.UTC),
						AccountID:       &accID,
						BudgetID:        &bdgID,
					},
				},
			}, nil
		}

		reg := workflow.NewRegistry()
		RegisterWorkflows(reg, WorkflowDependencies{SpaceService: spaceSvc, FinanceService: finSvc})
		_, loader, _ := reg.GetLoader("finance.transactions")

		res, err := loader.Load(context.Background(), "spc_1", map[string]any{
			"near_amount_cents": int64(10000),
			"tolerance_pct":     0.25,
			"near_date":         "2026-04-15",
			"window_days":       5,
			"query":             "Uber",
			"account_id":        string(accID),
			"limit":             250,
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if capturedFilter == nil {
			t.Fatal("expected ListTransactions to be called")
		}
		if capturedFilter.PageSize != 100 {
			t.Errorf("PageSize = %d, want hard cap 100", capturedFilter.PageSize)
		}
		if *capturedFilter.MinAmount != 7500 || *capturedFilter.MaxAmount != 12500 {
			t.Errorf("amount window = [%d, %d], want [7500, 12500]", *capturedFilter.MinAmount, *capturedFilter.MaxAmount)
		}
		if capturedFilter.StartDate.Format("2006-01-02") != "2026-04-10" || capturedFilter.EndDate.Format("2006-01-02") != "2026-04-20" {
			t.Errorf("date window = [%s, %s], want [2026-04-10, 2026-04-20]", capturedFilter.StartDate.Format("2006-01-02"), capturedFilter.EndDate.Format("2006-01-02"))
		}
		rows := res.([]any)
		if len(rows) != 1 || rows[0].(map[string]any)["id"] != "txn_1" || rows[0].(map[string]any)["account_id"] != string(accID) {
			t.Errorf("unexpected rows: %+v", rows)
		}
	})

	t.Run("finance.scheduled_payments_borrowings_and_recurring", func(t *testing.T) {
		spaceSvc, finSvc := defaultSpaceAndFinanceMocks()
		accID := finance.AccountID("acc_1")
		finSvc.ListScheduledTransactionsFunc = func(_ context.Context, _ finance.Context, f *finance.ListScheduledTransactionsFilter) (*paging.Page[*finance.ScheduledTransaction], error) {
			if f.EndDate == nil || f.Status == nil || *f.Status != finance.ScheduledTransactionPending {
				t.Errorf("unexpected scheduled filter: %+v", f)
			}
			return &paging.Page[*finance.ScheduledTransaction]{
				Items: []*finance.ScheduledTransaction{
					{
						ID:         "sch_1",
						Type:       finance.TransactionTypeExpense,
						SourceType: "recurring",
						Amount:     2500,
						Currency:   "USD",
						DueDate:    time.Date(2026, 4, 20, 0, 0, 0, 0, time.UTC),
						Status:     finance.ScheduledTransactionPending,
						AccountID:  &accID,
						Metadata:   finance.ScheduledTransactionMetadata{Name: "Netflix", VendorName: "Netflix"},
					},
				},
			}, nil
		}
		finSvc.ListBorrowingsFunc = func(_ context.Context, _ finance.Context, _ *finance.ListBorrowingsFilter) ([]*finance.Borrowing, string, error) {
			return []*finance.Borrowing{
				{ID: "bor_1", Direction: finance.BorrowingDirectionLent, Counterparty: "Alice", TotalAmount: 50000, RemainingAmount: 25000, Currency: "USD", Status: finance.BorrowingStatusActive},
			}, "", nil
		}
		finSvc.ListRecurringTransactionsFunc = func(_ context.Context, _ finance.Context, _ *finance.ListRecurringTransactionsFilter) (*paging.Page[*finance.RecurringTransaction], error) {
			return &paging.Page[*finance.RecurringTransaction]{
				Items: []*finance.RecurringTransaction{
					{ID: "rec_1", Type: finance.TransactionTypeExpense, Name: "Rent", Amount: 120000, Currency: "USD", Interval: finance.IntervalMonthly, NextDueDate: time.Date(2026, 5, 1, 0, 0, 0, 0, time.UTC), Status: finance.RecurringTransactionActive},
				},
			}, nil
		}

		reg := workflow.NewRegistry()
		RegisterWorkflows(reg, WorkflowDependencies{SpaceService: spaceSvc, FinanceService: finSvc})

		_, schedLoader, _ := reg.GetLoader("finance.scheduled_payments")
		schedRes, err := schedLoader.Load(context.Background(), "spc_1", map[string]any{"status": "pending", "due_within_days": 7})
		if err != nil || len(schedRes.([]any)) != 1 {
			t.Fatalf("scheduled_payments = %+v, err = %v", schedRes, err)
		}

		_, borLoader, _ := reg.GetLoader("finance.borrowings")
		borRes, err := borLoader.Load(context.Background(), "spc_1", map[string]any{"status": "active"})
		if err != nil || len(borRes.([]any)) != 1 {
			t.Fatalf("borrowings = %+v, err = %v", borRes, err)
		}

		_, recLoader, _ := reg.GetLoader("finance.recurring_templates")
		recRes, err := recLoader.Load(context.Background(), "spc_1", map[string]any{"status": "active"})
		if err != nil || len(recRes.([]any)) != 1 {
			t.Fatalf("recurring_templates = %+v, err = %v", recRes, err)
		}
	})
}

func TestFinanceWorkflowSteps(t *testing.T) {
	t.Run("finance.create_inbox_item", func(t *testing.T) {
		tests := []struct {
			name             string
			flowRunID        string
			inputs           map[string]any
			stageFn          func(ctx context.Context, rCtx finance.Context, req *finance.StageInboxItem) (*finance.InboxItem, error)
			wantID           string
			wantDeduplicated bool
			wantErr          bool
		}{
			{
				name:      "StagesNewItem",
				flowRunID: "fr_new",
				inputs: map[string]any{
					"idempotency_key":        "mail:msg_1",
					"doc_type":               "receipt",
					"vendor":                 "Amazon",
					"amount_cents":           int64(4299),
					"currency":               "usd",
					"date":                   "2026-04-15",
					"account_id":             "acc_1",
					"destination_account_id": "acc_2",
					"budget_id":              "bdg_1",
					"borrowing_id":           "bor_1",
					"potential_duplicate_id": "txn_dup",
					"raw_payload":            "raw text",
					"metadata":               map[string]any{"source": "email"},
				},
				stageFn: func(_ context.Context, _ finance.Context, req *finance.StageInboxItem) (*finance.InboxItem, error) {
					if req.FlowRunID == nil || *req.FlowRunID != "fr_new" {
						t.Errorf("FlowRunID = %v, want fr_new", req.FlowRunID)
					}
					if req.IdempotencyKey == nil || *req.IdempotencyKey != "mail:msg_1" {
						t.Errorf("IdempotencyKey = %v, want mail:msg_1", req.IdempotencyKey)
					}
					if req.Currency != "USD" || req.Amount != 4299 || req.SuggestedBudget != "bdg_1" {
						t.Errorf("unexpected stage payload: %+v", req)
					}
					if req.Metadata["destination_account_id"] != "acc_2" || req.Metadata["potential_duplicate_id"] != "txn_dup" || req.Metadata["suggested_borrowing_id"] != "bor_1" {
						t.Errorf("unexpected metadata: %+v", req.Metadata)
					}
					return &finance.InboxItem{ID: "inb_1", FlowRunID: req.FlowRunID}, nil
				},
				wantID:           "inb_1",
				wantDeduplicated: false,
			},
			{
				name:      "DeduplicatesExistingItemFromPriorRun",
				flowRunID: "fr_retry",
				inputs: map[string]any{
					"idempotency_key": "mail:msg_1",
					"doc_type":        "receipt",
					"vendor":          "Amazon",
					"amount_cents":    int64(4299),
					"currency":        "USD",
					"date":            "2026-04-15",
				},
				stageFn: func(_ context.Context, _ finance.Context, _ *finance.StageInboxItem) (*finance.InboxItem, error) {
					return &finance.InboxItem{ID: "inb_existing", FlowRunID: new("fr_original")}, nil
				},
				wantID:           "inb_existing",
				wantDeduplicated: true,
			},
			{
				name:      "ServiceErrorPropagates",
				flowRunID: "fr_err",
				inputs: map[string]any{
					"doc_type":     "receipt",
					"vendor":       "Amazon",
					"amount_cents": int64(100),
					"currency":     "USD",
					"date":         "2026-04-15",
				},
				stageFn: func(_ context.Context, _ finance.Context, _ *finance.StageInboxItem) (*finance.InboxItem, error) {
					return nil, errors.New("db failure")
				},
				wantErr: true,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				spaceSvc, finSvc := defaultSpaceAndFinanceMocks()
				finSvc.StageInboxItemFunc = tc.stageFn

				reg := workflow.NewRegistry()
				RegisterWorkflows(reg, WorkflowDependencies{SpaceService: spaceSvc, FinanceService: finSvc})
				_, handler, _ := reg.GetStep("finance.create_inbox_item")

				out, err := handler.Execute(context.Background(), &workflow.StepExecutionContext{
					SpaceID:   "spc_1",
					FlowRunID: tc.flowRunID,
					Inputs:    tc.inputs,
				})
				if tc.wantErr {
					if err == nil {
						t.Fatal("expected error, got nil")
					}
					return
				}
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if out["inbox_item_id"] != tc.wantID || out["deduplicated"] != tc.wantDeduplicated {
					t.Errorf("got %+v, want id=%s deduplicated=%v", out, tc.wantID, tc.wantDeduplicated)
				}
			})
		}
	})

	t.Run("finance.import_statement_draft", func(t *testing.T) {
		accDOP := genAccountID(t)
		accCC := genAccountID(t)
		accCCB := genAccountID(t)
		accDry := genAccountID(t)
		tests := []struct {
			name              string
			inputs            map[string]any
			setup             func(*FinanceServiceMock, *[]*finance.Statement)
			wantStatements    int
			wantUnmapped      []string
			checkSectionRepFn func(*testing.T, []any)
			wantErr           bool
		}{
			{
				name: "MultiCurrencySplitAndPriorityMapping",
				inputs: map[string]any{
					"filename":         "multi.pdf",
					"statement_date":   "2026-04-30",
					"institution_name": "Banco Popular",
					"sections": []any{
						map[string]any{
							"currency":             "DOP",
							"suggested_account_id": string(accDOP),
							"starting_balance":     1000.00,
							"ending_balance":       900.00,
							"lines": []any{
								map[string]any{"date_str": "2026-04-10", "description": "Supermercado", "amount": -100.00, "reference": "REF1"},
							},
						},
						map[string]any{
							"currency":         "USD",
							"card_last_four":   "4321",
							"starting_balance": 0.00,
							"ending_balance":   -50.00,
							"lines": []any{
								map[string]any{"date_str": "2026-04-12", "description": "Netflix", "amount": -50.00},
							},
						},
						map[string]any{
							"currency":         "EUR",
							"starting_balance": 100.00,
							"ending_balance":   100.00,
							"lines":            []any{},
						},
					},
				},
				setup: func(m *FinanceServiceMock, imported *[]*finance.Statement) {
					m.GetAccountFunc = func(_ context.Context, _ finance.Context, id finance.AccountID) (*finance.Account, error) {
						if id == accDOP {
							return &finance.Account{ID: accDOP, Name: "Checking DOP", Currency: "DOP", Type: finance.AccountTypeBank}, nil
						}
						return nil, errors.New("not found")
					}
					m.ResolveAccountFunc = func(_ context.Context, _ finance.Context, opts finance.ResolveAccountOpts) (*finance.Account, error) {
						if opts.Currency == "USD" && opts.LastFour == "4321" {
							return &finance.Account{ID: "acc_usd_cc", Name: "Visa USD", Currency: "USD", LastFour: "4321", Type: finance.AccountTypeCreditCard}, nil
						}
						return nil, errors.New("not found")
					}
					m.ImportStatementFunc = func(_ context.Context, _ finance.Context, accID finance.AccountID, stmt *finance.Statement) (*finance.Statement, error) {
						stmt.ID = finance.StatementID("stmt_" + string(accID))
						*imported = append(*imported, stmt)
						return stmt, nil
					}
				},
				wantStatements: 2,
				wantUnmapped:   []string{"EUR"},
				checkSectionRepFn: func(t *testing.T, reps []any) {
					t.Helper()
					if len(reps) != 3 {
						t.Fatalf("got %d reports, want 3", len(reps))
					}
					for _, raw := range reps {
						r := raw.(map[string]any)
						if isBal, _ := r["is_balanced"].(bool); !isBal {
							t.Errorf("section %v not balanced: %+v", r["currency"], r)
						}
					}
				},
			},
			{
				name: "CreditCardCaseA_PositivePurchasesAndPositiveBalancesInverted",
				inputs: map[string]any{
					"filename":       "cc_case_a.pdf",
					"statement_date": "2026-04-30",
					"card_last_four": "8899",
					"sections": []any{
						map[string]any{
							"currency":             "USD",
							"suggested_account_id": string(accCC),
							"starting_balance":     100.00, // printed positive debt
							"ending_balance":       250.00, // printed positive debt
							"lines": []any{
								map[string]any{"date_str": "2026-04-05", "description": "Hotel", "amount": 200.00},   // positive purchase
								map[string]any{"date_str": "2026-04-15", "description": "Payment", "amount": -50.00}, // negative payment
							},
						},
					},
				},
				setup: func(m *FinanceServiceMock, imported *[]*finance.Statement) {
					m.GetAccountFunc = func(_ context.Context, _ finance.Context, id finance.AccountID) (*finance.Account, error) {
						return &finance.Account{ID: id, Type: finance.AccountTypeCreditCard, Currency: "USD", LastFour: "8899"}, nil
					}
					m.ImportStatementFunc = func(_ context.Context, _ finance.Context, _ finance.AccountID, stmt *finance.Statement) (*finance.Statement, error) {
						stmt.ID = "stmt_cc_a"
						*imported = append(*imported, stmt)
						return stmt, nil
					}
				},
				wantStatements: 1,
				checkSectionRepFn: func(t *testing.T, reps []any) {
					t.Helper()
					r := reps[0].(map[string]any)
					if r["starting_balance"].(int64) != -10000 || r["ending_balance"].(int64) != -25000 || r["discrepancy"].(int64) != 0 {
						t.Errorf("Case A sign inversion failed: %+v", r)
					}
				},
			},
			{
				name: "CreditCardCaseB_NegativePurchasesAndPositiveBalancesNormalized",
				inputs: map[string]any{
					"filename":       "cc_case_b.pdf",
					"statement_date": "2026-04-30",
					"card_last_four": "7766",
					"sections": []any{
						map[string]any{
							"currency":             "USD",
							"suggested_account_id": string(accCCB),
							"starting_balance":     200.00, // positive debt
							"ending_balance":       300.00, // positive debt
							"lines": []any{
								map[string]any{"date_str": "2026-04-05", "description": "Flight", "amount": -150.00}, // negative purchase
								map[string]any{"date_str": "2026-04-15", "description": "Payment", "amount": 50.00},  // positive payment
							},
						},
					},
				},
				setup: func(m *FinanceServiceMock, imported *[]*finance.Statement) {
					m.GetAccountFunc = func(_ context.Context, _ finance.Context, id finance.AccountID) (*finance.Account, error) {
						return &finance.Account{ID: id, Type: finance.AccountTypeCreditCard, Currency: "USD", LastFour: "7766"}, nil
					}
					m.ImportStatementFunc = func(_ context.Context, _ finance.Context, _ finance.AccountID, stmt *finance.Statement) (*finance.Statement, error) {
						stmt.ID = "stmt_cc_b"
						*imported = append(*imported, stmt)
						return stmt, nil
					}
				},
				wantStatements: 1,
				checkSectionRepFn: func(t *testing.T, reps []any) {
					t.Helper()
					r := reps[0].(map[string]any)
					if r["starting_balance"].(int64) != -20000 || r["ending_balance"].(int64) != -30000 || r["discrepancy"].(int64) != 0 {
						t.Errorf("Case B sign normalization failed: %+v", r)
					}
				},
			},
			{
				name: "DryRunSkipsImportStatement",
				inputs: map[string]any{
					"dry_run": true,
					"sections": []any{
						map[string]any{
							"currency":             "USD",
							"suggested_account_id": string(accDry),
							"starting_balance":     100.00,
							"ending_balance":       80.00,
							"lines": []any{
								map[string]any{"date_str": "2026-04-05", "description": "Coffee", "amount": -20.00},
							},
						},
					},
				},
				setup: func(m *FinanceServiceMock, _ *[]*finance.Statement) {
					m.GetAccountFunc = func(_ context.Context, _ finance.Context, id finance.AccountID) (*finance.Account, error) {
						return &finance.Account{ID: id, Type: finance.AccountTypeBank, Currency: "USD"}, nil
					}
					m.ImportStatementFunc = func(_ context.Context, _ finance.Context, _ finance.AccountID, _ *finance.Statement) (*finance.Statement, error) {
						t.Fatal("ImportStatement must not be called when dry_run is true")
						return nil, nil
					}
				},
				wantStatements: 0,
			},
			{
				name:    "EmptySectionsReturnsError",
				inputs:  map[string]any{"sections": []any{}},
				wantErr: true,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				spaceSvc, finSvc := defaultSpaceAndFinanceMocks()
				var imported []*finance.Statement
				if tc.setup != nil {
					tc.setup(finSvc, &imported)
				}

				reg := workflow.NewRegistry()
				RegisterWorkflows(reg, WorkflowDependencies{SpaceService: spaceSvc, FinanceService: finSvc})
				_, handler, _ := reg.GetStep("finance.import_statement_draft")

				out, err := handler.Execute(context.Background(), &workflow.StepExecutionContext{
					SpaceID: "spc_1",
					Inputs:  tc.inputs,
				})
				if tc.wantErr {
					if err == nil {
						t.Fatal("expected error, got nil")
					}
					return
				}
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				created := out["created_statements"].([]any)
				if len(created) != tc.wantStatements {
					t.Errorf("got %d created statements, want %d", len(created), tc.wantStatements)
				}
				unmapped := out["unmapped_sections"].([]any)
				if len(unmapped) != len(tc.wantUnmapped) {
					t.Errorf("unmapped = %v, want %v", unmapped, tc.wantUnmapped)
				}
				if tc.checkSectionRepFn != nil {
					tc.checkSectionRepFn(t, out["section_reports"].([]any))
				}
			})
		}
	})
}

func TestFinanceSystemFlows(t *testing.T) {
	t.Run("AllBlueprintsPassEngineValidateFlow", func(t *testing.T) {
		spaceSvc, finSvc := defaultSpaceAndFinanceMocks()
		engine, reg := newWorkflowTestEngine(t, WorkflowDependencies{
			SpaceService:   spaceSvc,
			FinanceService: finSvc,
		}, &stubAgentExecutor{})

		for _, bp := range reg.ListSystemFlows() {
			flow, triggers := bp.Build("spc_1")
			if err := engine.ValidateFlow(flow); err != nil {
				t.Errorf("ValidateFlow(%s) error = %v", bp.SystemKey, err)
			}
			for i := range triggers {
				if err := triggers[i].Validate(); err != nil {
					t.Errorf("Trigger[%d].Validate() for %s error = %v", i, bp.SystemKey, err)
				}
			}
		}
	})

	t.Run("InboxIngestionTriggerFilterAndMapping", func(t *testing.T) {
		spaceSvc, finSvc := defaultSpaceAndFinanceMocks()
		engine, reg := newWorkflowTestEngine(t, WorkflowDependencies{
			SpaceService:   spaceSvc,
			FinanceService: finSvc,
		}, &stubAgentExecutor{})

		bp, _ := reg.GetSystemFlow(SystemFlowInboxIngestion)
		_, triggers := bp.Build("spc_1")
		mailTrigger := &triggers[0]

		pass, err := engine.EvaluateTriggerFilter(mailTrigger, workflow.SpaceContext{ID: "spc_1"}, map[string]any{
			"message": map[string]any{
				"id":          "msg_1",
				"subject":     "Receipt",
				"body_plain":  "",
				"attachments": []any{},
			},
		})
		if err != nil {
			t.Fatalf("EvaluateTriggerFilter error = %v", err)
		}
		if pass {
			t.Fatal("expected empty message without attachments to be filtered out")
		}

		payload := map[string]any{
			"message": map[string]any{
				"id":         "msg_2",
				"subject":    "Purchase Alert",
				"body_plain": "You spent $25.50 at Starbucks",
				"attachments": []any{
					map[string]any{"id": "att_1", "filename": "receipt.pdf", "content_type": "application/pdf"},
				},
			},
		}
		pass, err = engine.EvaluateTriggerFilter(mailTrigger, workflow.SpaceContext{ID: "spc_1"}, payload)
		if err != nil || !pass {
			t.Fatalf("expected valid message to pass filter, pass=%v err=%v", pass, err)
		}
		mapped, err := engine.MapTriggerInput(mailTrigger, workflow.SpaceContext{ID: "spc_1"}, payload)
		if err != nil {
			t.Fatalf("MapTriggerInput error = %v", err)
		}
		if mapped["idempotency_key"] != "mail:msg_2" {
			t.Errorf("idempotency_key = %v, want mail:msg_2", mapped["idempotency_key"])
		}
		docs := mapped["documents"].([]any)
		if len(docs) != 1 || docs[0].(map[string]any)["ref"] != "mail://msg_2/att_1" {
			t.Errorf("unexpected documents mapping: %+v", docs)
		}
	})

	t.Run("InboxIngestionExecute_IgnoreHaltsWithFiltered", func(t *testing.T) {
		spaceSvc, finSvc := defaultSpaceAndFinanceMocks()
		finSvc.StageInboxItemFunc = func(_ context.Context, _ finance.Context, _ *finance.StageInboxItem) (*finance.InboxItem, error) {
			t.Fatal("StageInboxItem must not be called for ignored signals")
			return nil, nil
		}
		agentExec := &stubAgentExecutor{
			fn: func(_ context.Context, _ workflow.LLMRequest) (*workflow.LLMResponse, error) {
				return &workflow.LLMResponse{
					ParsedJSON: map[string]any{
						"category":   "ignore",
						"confidence": 0.99,
						"reason":     "OTP verification code",
					},
				}, nil
			},
		}

		engine, reg := newWorkflowTestEngine(t, WorkflowDependencies{
			SpaceService:   spaceSvc,
			FinanceService: finSvc,
		}, agentExec)
		bp, _ := reg.GetSystemFlow(SystemFlowInboxIngestion)
		flow, _ := bp.Build("spc_1")

		run, err := engine.Execute(context.Background(), workflow.ExecuteOptions{
			Flow:    flow,
			Space:   workflow.SpaceContext{ID: "spc_1", Timezone: "UTC"},
			Input:   map[string]any{"text": "Your OTP code is 123456"},
			Persist: false,
		})
		if err != nil {
			t.Fatalf("Execute() error = %v", err)
		}
		if run.Status != workflow.RunFiltered {
			t.Errorf("run.Status = %s, want %s", run.Status, workflow.RunFiltered)
		}
	})

	t.Run("InboxIngestionExecute_StagesItemEvenIfDedupFails", func(t *testing.T) {
		accVisa := genAccountID(t)
		bdgFood := genBudgetID(t)
		spaceSvc, finSvc := defaultSpaceAndFinanceMocks()
		finSvc.ListAccountsFunc = func(_ context.Context, _ finance.Context, _ *finance.ListAccountsFilter) (*paging.Page[*finance.Account], error) {
			return &paging.Page[*finance.Account]{Items: []*finance.Account{{ID: accVisa, Name: "Visa", Currency: "USD", LastFour: "1234", Type: finance.AccountTypeCreditCard}}}, nil
		}
		finSvc.ListBudgetsFunc = func(_ context.Context, _ finance.Context, _ *finance.ListBudgetsFilter) (*paging.Page[*finance.Budget], error) {
			return &paging.Page[*finance.Budget]{Items: []*finance.Budget{{ID: bdgFood, Name: "Dining", Currency: "USD", Status: finance.BudgetStatusActive}}}, nil
		}
		finSvc.ListScheduledTransactionsFunc = func(_ context.Context, _ finance.Context, _ *finance.ListScheduledTransactionsFilter) (*paging.Page[*finance.ScheduledTransaction], error) {
			return &paging.Page[*finance.ScheduledTransaction]{}, nil
		}
		finSvc.ListRecurringTransactionsFunc = func(_ context.Context, _ finance.Context, _ *finance.ListRecurringTransactionsFilter) (*paging.Page[*finance.RecurringTransaction], error) {
			return &paging.Page[*finance.RecurringTransaction]{}, nil
		}
		finSvc.ListBorrowingsFunc = func(_ context.Context, _ finance.Context, _ *finance.ListBorrowingsFilter) ([]*finance.Borrowing, string, error) {
			return nil, "", nil
		}
		finSvc.GetAccountFunc = func(_ context.Context, _ finance.Context, id finance.AccountID) (*finance.Account, error) {
			return &finance.Account{ID: id, Name: "Visa", Currency: "USD", LastFour: "1234", Type: finance.AccountTypeCreditCard}, nil
		}
		finSvc.GetBudgetFunc = func(_ context.Context, _ finance.Context, id finance.BudgetID) (*finance.Budget, error) {
			return &finance.Budget{ID: id, Name: "Dining", Currency: "USD", Status: finance.BudgetStatusActive}, nil
		}
		finSvc.ListTransactionsFunc = func(_ context.Context, _ finance.Context, _ *finance.TransactionFilter) (*paging.Page[*finance.Transaction], error) {
			return &paging.Page[*finance.Transaction]{}, nil
		}

		var stagedReq *finance.StageInboxItem
		finSvc.StageInboxItemFunc = func(_ context.Context, _ finance.Context, req *finance.StageInboxItem) (*finance.InboxItem, error) {
			stagedReq = req
			return &finance.InboxItem{ID: "inb_staged_1", FlowRunID: req.FlowRunID}, nil
		}

		callIdx := 0
		agentExec := &stubAgentExecutor{
			fn: func(_ context.Context, req workflow.LLMRequest) (*workflow.LLMResponse, error) {
				callIdx++
				switch callIdx {
				case 1:
					return &workflow.LLMResponse{
						ParsedJSON: map[string]any{"category": "receipt", "confidence": 0.95, "reason": "Merchant receipt"},
					}, nil
				case 2:
					return &workflow.LLMResponse{
						ParsedJSON: map[string]any{
							"transaction_type":  "EXPENSE",
							"vendor":            "Starbucks",
							"amount":            14.75,
							"currency":          "USD",
							"date":              "2026-04-15",
							"card_last_four":    "1234",
							"source_account_id": string(accVisa),
							"budget_id":         string(bdgFood),
						},
					}, nil
				default:
					return nil, errors.New("temporary dedup timeout")
				}
			},
		}

		engine, reg := newWorkflowTestEngine(t, WorkflowDependencies{
			SpaceService:   spaceSvc,
			FinanceService: finSvc,
		}, agentExec)
		bp, _ := reg.GetSystemFlow(SystemFlowInboxIngestion)
		flow, _ := bp.Build("spc_1")

		run, err := engine.Execute(context.Background(), workflow.ExecuteOptions{
			Flow:    flow,
			Space:   workflow.SpaceContext{ID: "spc_1", Timezone: "UTC"},
			Input:   map[string]any{"text": "Starbucks receipt $14.75", "idempotency_key": "mail:m1"},
			Persist: false,
		})
		if err != nil {
			t.Fatalf("Execute() error = %v", err)
		}
		if run.Status != workflow.RunCompleted {
			t.Fatalf("run.Status = %s, want %s (err=%+v)", run.Status, workflow.RunCompleted, run.Error)
		}
		if stagedReq == nil || stagedReq.Amount != 1475 || stagedReq.AccountID == nil || *stagedReq.AccountID != string(accVisa) || stagedReq.SuggestedBudget != string(bdgFood) {
			t.Fatalf("unexpected staged request: %+v", stagedReq)
		}
	})

	t.Run("TransactionSuggestionsExecute_ReturnsOutputWithoutStaging", func(t *testing.T) {
		spaceSvc, finSvc := defaultSpaceAndFinanceMocks()
		finSvc.ListAccountsFunc = func(_ context.Context, _ finance.Context, _ *finance.ListAccountsFilter) (*paging.Page[*finance.Account], error) {
			return &paging.Page[*finance.Account]{}, nil
		}
		finSvc.ListBudgetsFunc = func(_ context.Context, _ finance.Context, _ *finance.ListBudgetsFilter) (*paging.Page[*finance.Budget], error) {
			return &paging.Page[*finance.Budget]{}, nil
		}
		finSvc.ListScheduledTransactionsFunc = func(_ context.Context, _ finance.Context, _ *finance.ListScheduledTransactionsFilter) (*paging.Page[*finance.ScheduledTransaction], error) {
			return &paging.Page[*finance.ScheduledTransaction]{}, nil
		}
		finSvc.ListRecurringTransactionsFunc = func(_ context.Context, _ finance.Context, _ *finance.ListRecurringTransactionsFilter) (*paging.Page[*finance.RecurringTransaction], error) {
			return &paging.Page[*finance.RecurringTransaction]{}, nil
		}
		finSvc.ListBorrowingsFunc = func(_ context.Context, _ finance.Context, _ *finance.ListBorrowingsFilter) ([]*finance.Borrowing, string, error) {
			return nil, "", nil
		}
		finSvc.ListTransactionsFunc = func(_ context.Context, _ finance.Context, _ *finance.TransactionFilter) (*paging.Page[*finance.Transaction], error) {
			return &paging.Page[*finance.Transaction]{}, nil
		}
		finSvc.StageInboxItemFunc = func(_ context.Context, _ finance.Context, _ *finance.StageInboxItem) (*finance.InboxItem, error) {
			t.Fatal("transaction_suggestions must be side-effect-free")
			return nil, nil
		}

		callIdx := 0
		agentExec := &stubAgentExecutor{
			fn: func(_ context.Context, _ workflow.LLMRequest) (*workflow.LLMResponse, error) {
				callIdx++
				switch callIdx {
				case 1:
					return &workflow.LLMResponse{
						ParsedJSON: map[string]any{"category": "receipt", "confidence": 0.9, "reason": "Receipt"},
					}, nil
				case 2:
					return &workflow.LLMResponse{
						ParsedJSON: map[string]any{
							"transaction_type": "EXPENSE",
							"vendor":           "Whole Foods",
							"amount":           89.10,
							"currency":         "USD",
							"date":             "2026-04-16",
						},
					}, nil
				default:
					return &workflow.LLMResponse{
						ParsedJSON: map[string]any{
							"is_duplicate":             true,
							"duplicate_transaction_id": "txn_old_9",
							"reason":                   "Same amount and merchant",
						},
					}, nil
				}
			},
		}

		engine, reg := newWorkflowTestEngine(t, WorkflowDependencies{
			SpaceService:   spaceSvc,
			FinanceService: finSvc,
		}, agentExec)
		bp, _ := reg.GetSystemFlow(SystemFlowTransactionSuggestions)
		flow, _ := bp.Build("spc_1")

		run, err := engine.Execute(context.Background(), workflow.ExecuteOptions{
			Flow:    flow,
			Space:   workflow.SpaceContext{ID: "spc_1", Timezone: "UTC"},
			Input:   map[string]any{"text": "Whole Foods $89.10"},
			Persist: false,
		})
		if err != nil {
			t.Fatalf("Execute() error = %v", err)
		}
		if run.Status != workflow.RunCompleted {
			t.Fatalf("run.Status = %s, want %s", run.Status, workflow.RunCompleted)
		}
		if run.Output["vendor"] != "Whole Foods" || run.Output["amount_cents"] != int64(8910) || run.Output["potential_duplicate_id"] != "txn_old_9" {
			t.Errorf("unexpected suggestion output: %+v", run.Output)
		}
	})

	t.Run("StatementIngestionExecute_EmptyTextExitsViaGuardSwitch", func(t *testing.T) {
		spaceSvc, finSvc := defaultSpaceAndFinanceMocks()
		agentExec := &stubAgentExecutor{
			fn: func(_ context.Context, _ workflow.LLMRequest) (*workflow.LLMResponse, error) {
				t.Fatal("LLM must not be called for unreadable statement")
				return nil, nil
			},
		}
		engine, reg := newWorkflowTestEngine(t, WorkflowDependencies{
			SpaceService:   spaceSvc,
			FinanceService: finSvc,
		}, agentExec)
		bp, _ := reg.GetSystemFlow(SystemFlowStatementIngestion)
		flow, _ := bp.Build("spc_1")

		run, err := engine.Execute(context.Background(), workflow.ExecuteOptions{
			Flow:  flow,
			Space: workflow.SpaceContext{ID: "spc_1", Timezone: "UTC"},
			Input: map[string]any{"document": "ephemeral://empty", "filename": "empty.txt", "content_type": "text/plain"},
			EphemeralArtifacts: map[string]workflow.ResolvedArtifact{
				"ephemeral://empty": {Ref: "ephemeral://empty", Filename: "empty.txt", ContentType: "text/plain", Data: []byte("")},
			},
			Persist: false,
		})
		if err != nil {
			t.Fatalf("Execute() error = %v", err)
		}
		if run.Status != workflow.RunCompleted {
			t.Fatalf("run.Status = %s, want %s", run.Status, workflow.RunCompleted)
		}
		errs, ok := run.Output["errors"].([]any)
		if !ok || len(errs) == 0 || !strings.Contains(errs[0].(string), "no readable text") {
			t.Errorf("expected unreadable error output, got %+v", run.Output)
		}
	})

	t.Run("StatementIngestionExecute_ParsesAndStagesDraft", func(t *testing.T) {
		accChk := genAccountID(t)
		spaceSvc, finSvc := defaultSpaceAndFinanceMocks()
		finSvc.ListAccountsFunc = func(_ context.Context, _ finance.Context, _ *finance.ListAccountsFilter) (*paging.Page[*finance.Account], error) {
			return &paging.Page[*finance.Account]{
				Items: []*finance.Account{{ID: accChk, Name: "Checking", Type: finance.AccountTypeBank, Currency: "USD", IsActive: true}},
			}, nil
		}
		finSvc.GetAccountFunc = func(_ context.Context, _ finance.Context, id finance.AccountID) (*finance.Account, error) {
			return &finance.Account{ID: id, Name: "Checking", Type: finance.AccountTypeBank, Currency: "USD"}, nil
		}
		finSvc.ImportStatementFunc = func(_ context.Context, _ finance.Context, accID finance.AccountID, stmt *finance.Statement) (*finance.Statement, error) {
			stmt.ID = "stmt_101"
			return stmt, nil
		}

		agentExec := &stubAgentExecutor{
			fn: func(_ context.Context, _ workflow.LLMRequest) (*workflow.LLMResponse, error) {
				return &workflow.LLMResponse{
					ParsedJSON: map[string]any{
						"institution_name": "Chase",
						"statement_date":   "2026-04-30",
						"sections": []any{
							map[string]any{
								"currency":             "USD",
								"suggested_account_id": string(accChk),
								"starting_balance":     500.00,
								"ending_balance":       450.00,
								"lines": []any{
									map[string]any{"date_str": "2026-04-02", "description": "Grocery", "amount": -50.00},
								},
							},
						},
					},
				}, nil
			},
		}

		engine, reg := newWorkflowTestEngine(t, WorkflowDependencies{
			SpaceService:   spaceSvc,
			FinanceService: finSvc,
		}, agentExec)
		bp, _ := reg.GetSystemFlow(SystemFlowStatementIngestion)
		flow, _ := bp.Build("spc_1")

		run, err := engine.Execute(context.Background(), workflow.ExecuteOptions{
			Flow:  flow,
			Space: workflow.SpaceContext{ID: "spc_1", Timezone: "UTC"},
			Input: map[string]any{"document": "ephemeral://stmt", "filename": "chase.csv", "content_type": "text/csv"},
			EphemeralArtifacts: map[string]workflow.ResolvedArtifact{
				"ephemeral://stmt": {Ref: "ephemeral://stmt", Filename: "chase.csv", ContentType: "text/csv", Data: []byte("Date,Desc,Amount\n2026-04-02,Grocery,-50.00\n")},
			},
			Persist: false,
		})
		if err != nil {
			t.Fatalf("Execute() error = %v", err)
		}
		if run.Status != workflow.RunCompleted {
			t.Fatalf("run.Status = %s, want %s (err=%+v)", run.Status, workflow.RunCompleted, run.Error)
		}
		created := run.Output["created_statements"].([]any)
		if len(created) != 1 || created[0].(map[string]any)["id"] != "stmt_101" {
			t.Errorf("unexpected output: %+v", run.Output)
		}
	})
}
