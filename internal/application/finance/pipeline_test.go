package financeapp

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
)

func TestIngestionState_Methods(t *testing.T) {
	t.Run("Copy", func(t *testing.T) {
		tests := []struct {
			name     string
			state    *IngestionState
			validate func(t *testing.T, orig, copy *IngestionState)
		}{
			{
				name:  "Nil state",
				state: nil,
				validate: func(t *testing.T, orig, copy *IngestionState) {
					if copy != nil {
						t.Errorf("expected nil copy for nil state")
					}
				},
			},
			{
				name: "Full state copy",
				state: func() *IngestionState {
					acc := "acc_1"
					bgt := "bgt_1"
					dup := "tx_1"
					return &IngestionState{
						SpaceID:              "spc_1",
						Request:              &IngestionRequest{TextContent: "text"},
						Classification:       "RECEIPT",
						Vendor:               "Apple",
						Amount:               999,
						Currency:             "USD",
						Date:                 "2026-09-17",
						CardLastFour:         "4321",
						SuggestedBudget:      "Tech",
						AccountID:            &acc,
						BudgetID:             &bgt,
						PotentialDuplicateID: &dup,
						Metadata: map[string]any{
							"key": "val",
						},
					}
				}(),
				validate: func(t *testing.T, orig, copy *IngestionState) {
					if copy == nil {
						t.Fatal("expected non-nil copy")
					}
					if copy.SpaceID != orig.SpaceID || copy.Vendor != orig.Vendor || copy.Amount != orig.Amount {
						t.Errorf("mismatched basic fields")
					}
					if copy.AccountID == orig.AccountID || *copy.AccountID != *orig.AccountID {
						t.Errorf("expected deep copy of AccountID pointer")
					}
					if copy.BudgetID == orig.BudgetID || *copy.BudgetID != *orig.BudgetID {
						t.Errorf("expected deep copy of BudgetID pointer")
					}
					if copy.PotentialDuplicateID == orig.PotentialDuplicateID || *copy.PotentialDuplicateID != *orig.PotentialDuplicateID {
						t.Errorf("expected deep copy of PotentialDuplicateID pointer")
					}
					copy.Metadata["key"] = "mutated"
					if orig.Metadata["key"] == "mutated" {
						t.Errorf("expected independent metadata copy")
					}
				},
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				c := tc.state.Copy()
				tc.validate(t, tc.state, c)
			})
		}
	})

	t.Run("MetadataString", func(t *testing.T) {
		tests := []struct {
			name     string
			state    *IngestionState
			key      string
			expected string
		}{
			{
				name:     "Nil state",
				state:    nil,
				key:      "any",
				expected: "",
			},
			{
				name:     "Nil metadata",
				state:    &IngestionState{},
				key:      "any",
				expected: "",
			},
			{
				name:     "Missing key",
				state:    &IngestionState{Metadata: map[string]any{"other": "val"}},
				key:      "target",
				expected: "",
			},
			{
				name:     "Non-string value",
				state:    &IngestionState{Metadata: map[string]any{"count": 123}},
				key:      "count",
				expected: "",
			},
			{
				name:     "String value present",
				state:    &IngestionState{Metadata: map[string]any{"vendor": "Uber"}},
				key:      "vendor",
				expected: "Uber",
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				got := tc.state.MetadataString(tc.key)
				if got != tc.expected {
					t.Errorf("MetadataString(%q) = %q, expected %q", tc.key, got, tc.expected)
				}
			})
		}
	})
}

func TestPipeline_ClassifyNode(t *testing.T) {
	tests := []struct {
		name          string
		state         *IngestionState
		mockFn        func(ctx context.Context, spaceID string, doc string) (string, error)
		expectedCls   string
		expectedError bool
	}{
		{
			name: "Forwarding confirmation in subject",
			state: &IngestionState{
				SpaceID: "spc_1",
				Request: &IngestionRequest{
					Metadata: map[string]any{"subject": "Forwarding Confirmation email"},
				},
			},
			expectedCls:   "SYSTEM_VERIFICATION",
			expectedError: false,
		},
		{
			name: "Verification code in body",
			state: &IngestionState{
				SpaceID: "spc_1",
				Request: &IngestionRequest{
					TextContent: "Your verification code is 123456",
				},
			},
			expectedCls:   "SYSTEM_VERIFICATION",
			expectedError: false,
		},
		{
			name: "Forwarding noreply in sender",
			state: &IngestionState{
				SpaceID: "spc_1",
				Request: &IngestionRequest{
					Metadata: map[string]any{"sender": "forwarding-noreply@google.com"},
				},
			},
			expectedCls:   "SYSTEM_VERIFICATION",
			expectedError: false,
		},
		{
			name: "Microsoft noreply in sender",
			state: &IngestionState{
				SpaceID: "spc_1",
				Request: &IngestionRequest{
					Metadata: map[string]any{"sender": "no-reply@microsoft.com"},
				},
			},
			expectedCls:   "SYSTEM_VERIFICATION",
			expectedError: false,
		},
		{
			name: "Normal classifier success",
			state: &IngestionState{
				SpaceID: "spc_1",
				Request: &IngestionRequest{
					TextContent: "Store receipt",
				},
			},
			mockFn: func(ctx context.Context, spaceID string, doc string) (string, error) {
				return "RECEIPT", nil
			},
			expectedCls:   "RECEIPT",
			expectedError: false,
		},
		{
			name: "Classifier agent failure",
			state: &IngestionState{
				SpaceID: "spc_1",
				Request: &IngestionRequest{TextContent: "Error doc"},
			},
			mockFn: func(ctx context.Context, spaceID string, doc string) (string, error) {
				return "", errors.New("agent timeout")
			},
			expectedError: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			coord := &coordinator{
				classifier: &DocumentClassifierMock{ClassifyFunc: tc.mockFn},
			}
			cmd, err := coord.pipelineClassifyNode(context.Background(), tc.state)
			if tc.expectedError {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if cmd != nil {
				mutated := cmd.Apply(tc.state)
				if mutated.Classification != tc.expectedCls {
					t.Errorf("expected classification %s, got %s", tc.expectedCls, mutated.Classification)
				}
			}
		})
	}
}

func TestPipeline_ExtractNode(t *testing.T) {
	tests := []struct {
		name           string
		state          *IngestionState
		mockBudgets    func(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListBudgetsFilter) (*paging.Page[*finance.Budget], error)
		mockAccounts   func(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListAccountsFilter) (*paging.Page[*finance.Account], error)
		mockPayments   func(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListScheduledTransactionsFilter) (*paging.Page[*finance.ScheduledTransaction], error)
		mockExpenses   func(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListRecurringTransactionsFilter) (*paging.Page[*finance.RecurringTransaction], error)
		mockBorrowings func(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListBorrowingsFilter) ([]*finance.Borrowing, string, error)
		mockParser     func(ctx context.Context, spaceID string, doc string, ingCtx IngestionContext) (*ParsedTransaction, error)
		expectedVendor string
		expectedError  bool
	}{
		{
			name: "SYSTEM_VERIFICATION with google sender",
			state: &IngestionState{
				Classification: "SYSTEM_VERIFICATION",
				Metadata:       map[string]any{"sender": "support@google.com"},
			},
			expectedVendor: "Google Email Forwarding",
			expectedError:  false,
		},
		{
			name: "SYSTEM_VERIFICATION with microsoft sender",
			state: &IngestionState{
				Classification: "SYSTEM_VERIFICATION",
				Metadata:       map[string]any{"sender": "support@microsoft.com"},
			},
			expectedVendor: "Microsoft Email Forwarding",
			expectedError:  false,
		},
		{
			name: "SYSTEM_VERIFICATION generic",
			state: &IngestionState{
				Classification: "SYSTEM_VERIFICATION",
				Metadata:       map[string]any{},
			},
			expectedVendor: "Email Forwarding Verification",
			expectedError:  false,
		},
		{
			name: "ListBudgets error",
			state: &IngestionState{
				SpaceID:        "spc_1",
				Classification: "RECEIPT",
				Metadata:       map[string]any{},
			},
			mockBudgets: func(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListBudgetsFilter) (*paging.Page[*finance.Budget], error) {
				return nil, errors.New("budget db error")
			},
			expectedError: true,
		},
		{
			name: "ListAccounts error",
			state: &IngestionState{
				SpaceID:        "spc_1",
				Classification: "RECEIPT",
				Metadata:       map[string]any{},
			},
			mockAccounts: func(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListAccountsFilter) (*paging.Page[*finance.Account], error) {
				return nil, errors.New("account db error")
			},
			expectedError: true,
		},
		{
			name: "ListScheduledTransactions error",
			state: &IngestionState{
				SpaceID:        "spc_1",
				Classification: "RECEIPT",
				Metadata:       map[string]any{},
			},
			mockPayments: func(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListScheduledTransactionsFilter) (*paging.Page[*finance.ScheduledTransaction], error) {
				return nil, errors.New("scheduled db error")
			},
			expectedError: true,
		},
		{
			name: "ListRecurringTransactions error",
			state: &IngestionState{
				SpaceID:        "spc_1",
				Classification: "RECEIPT",
				Metadata:       map[string]any{},
			},
			mockExpenses: func(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListRecurringTransactionsFilter) (*paging.Page[*finance.RecurringTransaction], error) {
				return nil, errors.New("recurring db error")
			},
			expectedError: true,
		},
		{
			name: "Parser error",
			state: &IngestionState{
				SpaceID:        "spc_1",
				Classification: "RECEIPT",
				Metadata:       map[string]any{},
			},
			mockParser: func(ctx context.Context, spaceID string, doc string, ingCtx IngestionContext) (*ParsedTransaction, error) {
				return nil, errors.New("parser fail")
			},
			expectedError: true,
		},
		{
			name: "Success with borrowing error tolerated",
			state: &IngestionState{
				SpaceID:        "spc_1",
				Classification: "RECEIPT",
				Metadata:       map[string]any{},
			},
			mockBorrowings: func(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListBorrowingsFilter) ([]*finance.Borrowing, string, error) {
				return nil, "", errors.New("borrowing query error")
			},
			mockParser: func(ctx context.Context, spaceID string, doc string, ingCtx IngestionContext) (*ParsedTransaction, error) {
				return &ParsedTransaction{
					Counterparty: "Target",
					Amount:       1500,
					Currency:     "USD",
				}, nil
			},
			expectedVendor: "Target",
			expectedError:  false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			fsMock := &FinanceServiceMock{
				ListBudgetsFunc: func(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListBudgetsFilter) (*paging.Page[*finance.Budget], error) {
					if tc.mockBudgets != nil {
						return tc.mockBudgets(ctx, spaceID, filter)
					}
					return &paging.Page[*finance.Budget]{}, nil
				},
				ListAccountsFunc: func(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListAccountsFilter) (*paging.Page[*finance.Account], error) {
					if tc.mockAccounts != nil {
						return tc.mockAccounts(ctx, spaceID, filter)
					}
					return &paging.Page[*finance.Account]{}, nil
				},
				ListInstitutionsFunc: func(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListInstitutionsFilter) (*paging.Page[*finance.Institution], error) {
					return &paging.Page[*finance.Institution]{}, nil
				},
				ListScheduledTransactionsFunc: func(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListScheduledTransactionsFilter) (*paging.Page[*finance.ScheduledTransaction], error) {
					if tc.mockPayments != nil {
						return tc.mockPayments(ctx, spaceID, filter)
					}
					return &paging.Page[*finance.ScheduledTransaction]{}, nil
				},
				ListRecurringTransactionsFunc: func(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListRecurringTransactionsFilter) (*paging.Page[*finance.RecurringTransaction], error) {
					if tc.mockExpenses != nil {
						return tc.mockExpenses(ctx, spaceID, filter)
					}
					return &paging.Page[*finance.RecurringTransaction]{}, nil
				},
				ListBorrowingsFunc: func(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListBorrowingsFilter) ([]*finance.Borrowing, string, error) {
					if tc.mockBorrowings != nil {
						return tc.mockBorrowings(ctx, spaceID, filter)
					}
					return nil, "", nil
				},
			}
			coord := &coordinator{
				financeService: fsMock,
				parser:         &IngestionParserMock{ParseFunc: tc.mockParser},
			}
			cmd, err := coord.pipelineExtractNode(context.Background(), tc.state)
			if tc.expectedError {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if cmd != nil {
				mutated := cmd.Apply(tc.state)
				if mutated.Vendor != tc.expectedVendor {
					t.Errorf("expected vendor %s, got %s", tc.expectedVendor, mutated.Vendor)
				}
			}
		})
	}
}

func TestPipeline_ResolveNode(t *testing.T) {
	defaultAccID := finance.AccountID("acc_default")

	tests := []struct {
		name              string
		state             *IngestionState
		mockResolveAcc    func(ctx context.Context, spaceID finance.SpaceID, opts finance.ResolveAccountOpts) (*finance.Account, error)
		mockGetBudget     func(ctx context.Context, spaceID finance.SpaceID, id finance.BudgetID) (*finance.Budget, error)
		mockListBudgets   func(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListBudgetsFilter) (*paging.Page[*finance.Budget], error)
		expectedAccountID *string
		expectedBudgetID  *string
	}{
		{
			name: "Resolve budget by named match and fallback to default account",
			state: &IngestionState{
				SpaceID:         "spc_1",
				SuggestedBudget: "Groceries",
				Metadata:        map[string]any{},
			},
			mockResolveAcc: func(ctx context.Context, spaceID finance.SpaceID, opts finance.ResolveAccountOpts) (*finance.Account, error) {
				return nil, errors.New("not resolved")
			},
			mockListBudgets: func(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListBudgetsFilter) (*paging.Page[*finance.Budget], error) {
				return &paging.Page[*finance.Budget]{
					Items: []*finance.Budget{
						{ID: "bgt_groceries", Name: "Groceries", DefaultAccountID: &defaultAccID},
					},
				}, nil
			},
			expectedAccountID: new(string("acc_default")),
			expectedBudgetID:  new(string("bgt_groceries")),
		},
		{
			name: "Resolve destination account for transfer",
			state: &IngestionState{
				SpaceID: "spc_1",
				Metadata: map[string]any{
					"destination_account_id": "acc_dest_1",
				},
			},
			mockResolveAcc: func(ctx context.Context, spaceID finance.SpaceID, opts finance.ResolveAccountOpts) (*finance.Account, error) {
				if opts.AccountID == "acc_dest_1" {
					return &finance.Account{ID: "acc_dest_resolved"}, nil
				}
				return nil, nil
			},
			expectedAccountID: nil,
			expectedBudgetID:  nil,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			fsMock := &FinanceServiceMock{
				ResolveAccountFunc: tc.mockResolveAcc,
				GetBudgetFunc:      tc.mockGetBudget,
				ListBudgetsFunc: func(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListBudgetsFilter) (*paging.Page[*finance.Budget], error) {
					if tc.mockListBudgets != nil {
						return tc.mockListBudgets(ctx, spaceID, filter)
					}
					return &paging.Page[*finance.Budget]{}, nil
				},
			}
			coord := &coordinator{financeService: fsMock}
			cmd, err := coord.pipelineResolveNode(context.Background(), tc.state)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			mutated := cmd.Apply(tc.state)
			if tc.expectedAccountID != nil {
				if mutated.AccountID == nil || *mutated.AccountID != *tc.expectedAccountID {
					t.Errorf("expected account ID %v, got %v", *tc.expectedAccountID, mutated.AccountID)
				}
			}
			if tc.expectedBudgetID != nil {
				if mutated.BudgetID == nil || *mutated.BudgetID != *tc.expectedBudgetID {
					t.Errorf("expected budget ID %v, got %v", *tc.expectedBudgetID, mutated.BudgetID)
				}
			}
		})
	}
}

func TestPipeline_DeduplicateNode(t *testing.T) {
	tests := []struct {
		name          string
		state         *IngestionState
		mockListTx    func(ctx context.Context, spaceID finance.SpaceID, filter *finance.TransactionFilter) (*paging.Page[*finance.Transaction], error)
		mockDedup     func(ctx context.Context, spaceID string, tx *ParsedTransaction, recent []*finance.Transaction) (*DeduplicationResult, error)
		expectedDupID *string
		expectedError bool
	}{
		{
			name: "Date in RFC3339 format, duplicate detected",
			state: &IngestionState{
				SpaceID:  "spc_1",
				Amount:   5000,
				Currency: "USD",
				Vendor:   "Target",
				Date:     time.Now().Format(time.RFC3339),
				Metadata: map[string]any{},
			},
			mockListTx: func(ctx context.Context, spaceID finance.SpaceID, filter *finance.TransactionFilter) (*paging.Page[*finance.Transaction], error) {
				return &paging.Page[*finance.Transaction]{Items: []*finance.Transaction{{ID: "tx_orig_1"}}}, nil
			},
			mockDedup: func(ctx context.Context, spaceID string, tx *ParsedTransaction, recent []*finance.Transaction) (*DeduplicationResult, error) {
				return &DeduplicationResult{IsDuplicate: true, DuplicateTransactionID: "tx_orig_1"}, nil
			},
			expectedDupID: new(string("tx_orig_1")),
			expectedError: false,
		},
		{
			name: "Date in YYYY-MM-DD format, no duplicate",
			state: &IngestionState{
				SpaceID:  "spc_1",
				Amount:   2000,
				Currency: "EUR",
				Date:     "2026-09-17",
				Metadata: map[string]any{},
			},
			mockListTx: func(ctx context.Context, spaceID finance.SpaceID, filter *finance.TransactionFilter) (*paging.Page[*finance.Transaction], error) {
				return &paging.Page[*finance.Transaction]{}, nil
			},
			mockDedup: func(ctx context.Context, spaceID string, tx *ParsedTransaction, recent []*finance.Transaction) (*DeduplicationResult, error) {
				return &DeduplicationResult{IsDuplicate: false}, nil
			},
			expectedDupID: nil,
			expectedError: false,
		},
		{
			name: "Deduplicator error falls back gracefully without error",
			state: &IngestionState{
				SpaceID:  "spc_1",
				Amount:   1000,
				Date:     "",
				Metadata: map[string]any{},
			},
			mockListTx: func(ctx context.Context, spaceID finance.SpaceID, filter *finance.TransactionFilter) (*paging.Page[*finance.Transaction], error) {
				return &paging.Page[*finance.Transaction]{}, nil
			},
			mockDedup: func(ctx context.Context, spaceID string, tx *ParsedTransaction, recent []*finance.Transaction) (*DeduplicationResult, error) {
				return nil, errors.New("dedup failure")
			},
			expectedDupID: nil,
			expectedError: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			coord := &coordinator{
				financeService: &FinanceServiceMock{ListTransactionsFunc: tc.mockListTx},
				deduplicator:   &IngestionDeduplicatorMock{DeduplicateFunc: tc.mockDedup},
			}
			cmd, err := coord.pipelineDeduplicateNode(context.Background(), tc.state)
			if tc.expectedError {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			mutated := cmd.Apply(tc.state)
			if tc.expectedDupID != nil {
				if mutated.PotentialDuplicateID == nil || *mutated.PotentialDuplicateID != *tc.expectedDupID {
					t.Errorf("expected dup ID %v, got %v", *tc.expectedDupID, mutated.PotentialDuplicateID)
				}
			} else {
				if mutated.PotentialDuplicateID != nil {
					t.Errorf("expected nil duplicate ID, got %v", *mutated.PotentialDuplicateID)
				}
			}
		})
	}
}

func TestCoordinator_IngestEmail(t *testing.T) {
	tests := []struct {
		name          string
		sender        string
		subject       string
		body          string
		classifyFn    func(ctx context.Context, spaceID string, doc string) (string, error)
		parserFn      func(ctx context.Context, spaceID string, doc string, ingCtx IngestionContext) (*ParsedTransaction, error)
		stageFn       func(ctx context.Context, spaceID finance.SpaceID, item *finance.StageInboxItem) (*finance.InboxItem, error)
		expectedError bool
		expectedID    string
	}{
		{
			name:    "Success receipt email",
			sender:  "billing@uber.com",
			subject: "Your Uber receipt",
			body:    "Trip receipt: $25.50",
			classifyFn: func(ctx context.Context, spaceID string, doc string) (string, error) {
				return "RECEIPT", nil
			},
			parserFn: func(ctx context.Context, spaceID string, doc string, ingCtx IngestionContext) (*ParsedTransaction, error) {
				return &ParsedTransaction{
					Counterparty: "Uber",
					Amount:       2550,
					Currency:     "USD",
				}, nil
			},
			stageFn: func(ctx context.Context, spaceID finance.SpaceID, item *finance.StageInboxItem) (*finance.InboxItem, error) {
				if item.Vendor != "Uber" || item.Amount != 2550 || item.DocType != finance.InboxItemDocReceipt {
					t.Errorf("unexpected stage item: %+v", item)
				}
				return &finance.InboxItem{ID: "inbox_staged_1", VendorName: item.Vendor, Amount: item.Amount}, nil
			},
			expectedError: false,
			expectedID:    "inbox_staged_1",
		},
		{
			name:    "Unknown classification error",
			sender:  "newsletter@test.com",
			subject: "Weekly update",
			body:    "Hello world",
			classifyFn: func(ctx context.Context, spaceID string, doc string) (string, error) {
				return "UNKNOWN", nil
			},
			expectedError: true,
		},
		{
			name:    "Pipeline classification failure",
			sender:  "someone@test.com",
			subject: "Test",
			body:    "Test body",
			classifyFn: func(ctx context.Context, spaceID string, doc string) (string, error) {
				return "", errors.New("classify failed")
			},
			expectedError: true,
		},
		{
			name:    "Stage inbox item failure",
			sender:  "billing@store.com",
			subject: "Invoice",
			body:    "Invoice body",
			classifyFn: func(ctx context.Context, spaceID string, doc string) (string, error) {
				return "INVOICE", nil
			},
			parserFn: func(ctx context.Context, spaceID string, doc string, ingCtx IngestionContext) (*ParsedTransaction, error) {
				return &ParsedTransaction{Counterparty: "Store", Amount: 1000}, nil
			},
			stageFn: func(ctx context.Context, spaceID finance.SpaceID, item *finance.StageInboxItem) (*finance.InboxItem, error) {
				return nil, errors.New("database failure")
			},
			expectedError: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			deps := Dependencies{
				FinanceService: &FinanceServiceMock{
					ListBudgetsFunc: func(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListBudgetsFilter) (*paging.Page[*finance.Budget], error) {
						return &paging.Page[*finance.Budget]{}, nil
					},
					ListAccountsFunc: func(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListAccountsFilter) (*paging.Page[*finance.Account], error) {
						return &paging.Page[*finance.Account]{}, nil
					},
					ListInstitutionsFunc: func(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListInstitutionsFilter) (*paging.Page[*finance.Institution], error) {
						return &paging.Page[*finance.Institution]{}, nil
					},
					ListScheduledTransactionsFunc: func(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListScheduledTransactionsFilter) (*paging.Page[*finance.ScheduledTransaction], error) {
						return &paging.Page[*finance.ScheduledTransaction]{}, nil
					},
					ListRecurringTransactionsFunc: func(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListRecurringTransactionsFilter) (*paging.Page[*finance.RecurringTransaction], error) {
						return &paging.Page[*finance.RecurringTransaction]{}, nil
					},
					ListBorrowingsFunc: func(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListBorrowingsFilter) ([]*finance.Borrowing, string, error) {
						return nil, "", nil
					},
					ListTransactionsFunc: func(ctx context.Context, spaceID finance.SpaceID, filter *finance.TransactionFilter) (*paging.Page[*finance.Transaction], error) {
						return &paging.Page[*finance.Transaction]{}, nil
					},
					StageInboxItemFunc: tc.stageFn,
					ResolveAccountFunc: func(ctx context.Context, spaceID finance.SpaceID, opts finance.ResolveAccountOpts) (*finance.Account, error) {
						return nil, nil
					},
				},
				Classifier: &DocumentClassifierMock{ClassifyFunc: tc.classifyFn},
				Parser:     &IngestionParserMock{ParseFunc: tc.parserFn},
				Deduplicator: &IngestionDeduplicatorMock{
					DeduplicateFunc: func(ctx context.Context, spaceID string, tx *ParsedTransaction, recent []*finance.Transaction) (*DeduplicationResult, error) {
						return &DeduplicationResult{IsDuplicate: false}, nil
					},
				},
			}

			coord := NewCoordinator(deps)
			item, err := coord.IngestEmail(context.Background(), "spc_1", "int_1", tc.sender, tc.subject, tc.body)
			if tc.expectedError {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if item == nil || item.ID != tc.expectedID {
				t.Errorf("expected item ID %s, got %+v", tc.expectedID, item)
			}
		})
	}
}
