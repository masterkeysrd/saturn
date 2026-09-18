package financeapp

import (
	"context"
	"testing"
	"time"

	agentapp "github.com/masterkeysrd/saturn/internal/application/agent"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/log"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
)

func TestCoordinator_SettingsAndCurrencies(t *testing.T) {
	t.Run("ConfigureFinance", func(t *testing.T) {
		tests := []struct {
			name          string
			ctx           context.Context
			req           *ConfigureFinanceRequest
			mockFn        func(ctx context.Context, settings *finance.FinanceSettings) (*finance.FinanceSettings, error)
			expectedError bool
		}{
			{
				name: "Success",
				ctx:  newTestContext("spc_1", "usr_1"),
				req:  &ConfigureFinanceRequest{BaseCurrency: "USD"},
				mockFn: func(ctx context.Context, settings *finance.FinanceSettings) (*finance.FinanceSettings, error) {
					if settings.SpaceID != "spc_1" || settings.BaseCurrency != "USD" {
						t.Errorf("unexpected settings payload: %+v", settings)
					}
					return &finance.FinanceSettings{SpaceID: settings.SpaceID, BaseCurrency: settings.BaseCurrency}, nil
				},
				expectedError: false,
			},
			{
				name:          "Unauthenticated",
				ctx:           context.Background(),
				req:           &ConfigureFinanceRequest{BaseCurrency: "USD"},
				expectedError: true,
			},
			{
				name: "Domain error",
				ctx:  newTestContext("spc_1", "usr_1"),
				req:  &ConfigureFinanceRequest{BaseCurrency: "USD"},
				mockFn: func(ctx context.Context, settings *finance.FinanceSettings) (*finance.FinanceSettings, error) {
					return nil, errors.New("cannot configure finance")
				},
				expectedError: true,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				fsMock := &FinanceServiceMock{ConfigureFinanceFunc: tc.mockFn}
				coord := NewCoordinator(Dependencies{FinanceService: fsMock})
				res, err := coord.ConfigureFinance(tc.ctx, tc.req)
				if tc.expectedError {
					if err == nil {
						t.Fatal("expected error, got nil")
					}
					return
				}
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if res == nil || res.BaseCurrency != tc.req.BaseCurrency {
					t.Errorf("expected currency %v, got %+v", tc.req.BaseCurrency, res)
				}
			})
		}
	})

	t.Run("GetFinanceSettings", func(t *testing.T) {
		tests := []struct {
			name          string
			ctx           context.Context
			mockFn        func(ctx context.Context, spaceID finance.SpaceID) (*finance.FinanceSettings, error)
			expectedError bool
		}{
			{
				name: "Success",
				ctx:  newTestContext("spc_1", "usr_1"),
				mockFn: func(ctx context.Context, spaceID finance.SpaceID) (*finance.FinanceSettings, error) {
					if spaceID != "spc_1" {
						t.Errorf("unexpected space ID: %v", spaceID)
					}
					return &finance.FinanceSettings{SpaceID: spaceID, BaseCurrency: "EUR"}, nil
				},
				expectedError: false,
			},
			{
				name:          "Unauthenticated",
				ctx:           context.Background(),
				expectedError: true,
			},
			{
				name: "Domain error",
				ctx:  newTestContext("spc_1", "usr_1"),
				mockFn: func(ctx context.Context, spaceID finance.SpaceID) (*finance.FinanceSettings, error) {
					return nil, errors.New("settings not found")
				},
				expectedError: true,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				fsMock := &FinanceServiceMock{GetFinanceSettingsFunc: tc.mockFn}
				coord := NewCoordinator(Dependencies{FinanceService: fsMock})
				res, err := coord.GetFinanceSettings(tc.ctx)
				if tc.expectedError {
					if err == nil {
						t.Fatal("expected error, got nil")
					}
					return
				}
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if res == nil || res.BaseCurrency != "EUR" {
					t.Errorf("expected EUR, got %+v", res)
				}
			})
		}
	})

	t.Run("ListCurrencies", func(t *testing.T) {
		tests := []struct {
			name          string
			ctx           context.Context
			mockFn        func(ctx context.Context) ([]finance.CurrencyInfo, error)
			expectedCount int
			expectedError bool
		}{
			{
				name: "Success",
				ctx:  newTestContext("spc_1", "usr_1"),
				mockFn: func(ctx context.Context) ([]finance.CurrencyInfo, error) {
					return []finance.CurrencyInfo{
						{Code: "USD", Name: "US Dollar"},
						{Code: "EUR", Name: "Euro"},
					}, nil
				},
				expectedCount: 2,
				expectedError: false,
			},
			{
				name:          "Unauthenticated",
				ctx:           context.Background(),
				expectedError: true,
			},
			{
				name: "Domain error",
				ctx:  newTestContext("spc_1", "usr_1"),
				mockFn: func(ctx context.Context) ([]finance.CurrencyInfo, error) {
					return nil, errors.New("currency fetch failure")
				},
				expectedError: true,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				fsMock := &FinanceServiceMock{ListCurrenciesFunc: tc.mockFn}
				coord := NewCoordinator(Dependencies{FinanceService: fsMock})
				list, err := coord.ListCurrencies(tc.ctx)
				if tc.expectedError {
					if err == nil {
						t.Fatal("expected error, got nil")
					}
					return
				}
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if len(list) != tc.expectedCount {
					t.Errorf("expected %d currencies, got %d", tc.expectedCount, len(list))
				}
			})
		}
	})
}

func TestCoordinator_GetInsights(t *testing.T) {
	now := time.Now().UTC()
	req := &GetInsightsRequest{
		Granularity: "monthly",
		StartDate:   now.AddDate(0, -1, 0),
		EndDate:     now,
	}

	tests := []struct {
		name          string
		ctx           context.Context
		mockSpentFn   func(ctx context.Context, req *finance.GetSpentInsightsRequest) (*finance.SpentInsights, error)
		mockIncomeFn  func(ctx context.Context, req *finance.GetSpentInsightsRequest) (*finance.IncomeInsights, error)
		expectedError bool
	}{
		{
			name: "Success",
			ctx:  newTestContext("spc_1", "usr_1"),
			mockSpentFn: func(ctx context.Context, req *finance.GetSpentInsightsRequest) (*finance.SpentInsights, error) {
				return &finance.SpentInsights{TotalSpent: 50000}, nil
			},
			mockIncomeFn: func(ctx context.Context, req *finance.GetSpentInsightsRequest) (*finance.IncomeInsights, error) {
				return &finance.IncomeInsights{TotalIncome: 80000}, nil
			},
			expectedError: false,
		},
		{
			name:          "Unauthenticated",
			ctx:           context.Background(),
			expectedError: true,
		},
		{
			name: "Spent insights error",
			ctx:  newTestContext("spc_1", "usr_1"),
			mockSpentFn: func(ctx context.Context, req *finance.GetSpentInsightsRequest) (*finance.SpentInsights, error) {
				return nil, errors.New("spent error")
			},
			expectedError: true,
		},
		{
			name: "Income insights error",
			ctx:  newTestContext("spc_1", "usr_1"),
			mockSpentFn: func(ctx context.Context, req *finance.GetSpentInsightsRequest) (*finance.SpentInsights, error) {
				return &finance.SpentInsights{TotalSpent: 50000}, nil
			},
			mockIncomeFn: func(ctx context.Context, req *finance.GetSpentInsightsRequest) (*finance.IncomeInsights, error) {
				return nil, errors.New("income error")
			},
			expectedError: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			fsMock := &FinanceServiceMock{
				GetSpentInsightsFunc:  tc.mockSpentFn,
				GetIncomeInsightsFunc: tc.mockIncomeFn,
			}
			coord := NewCoordinator(Dependencies{FinanceService: fsMock})
			res, err := coord.GetInsights(tc.ctx, req)
			if tc.expectedError {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if res == nil || res.Spent == nil || res.Income == nil {
				t.Errorf("expected complete insights, got %+v", res)
			}
		})
	}
}

func TestCoordinator_Institutions(t *testing.T) {
	t.Run("CreateInstitution", func(t *testing.T) {
		tests := []struct {
			name          string
			ctx           context.Context
			inst          *finance.Institution
			mockFn        func(ctx context.Context, inst *finance.Institution) (*finance.Institution, error)
			expectedID    finance.InstitutionID
			expectedError bool
		}{
			{
				name: "Success",
				ctx:  newTestContext("spc_1", "usr_1"),
				inst: &finance.Institution{Name: "Chase"},
				mockFn: func(ctx context.Context, inst *finance.Institution) (*finance.Institution, error) {
					if inst.SpaceID != "spc_1" || inst.Name != "Chase" {
						t.Errorf("unexpected institution: %+v", inst)
					}
					return &finance.Institution{ID: "inst_1", SpaceID: inst.SpaceID, Name: inst.Name}, nil
				},
				expectedID:    "inst_1",
				expectedError: false,
			},
			{
				name:          "Unauthenticated",
				ctx:           context.Background(),
				inst:          &finance.Institution{Name: "Chase"},
				expectedError: true,
			},
			{
				name: "Domain error",
				ctx:  newTestContext("spc_1", "usr_1"),
				inst: &finance.Institution{Name: "Chase"},
				mockFn: func(ctx context.Context, inst *finance.Institution) (*finance.Institution, error) {
					return nil, errors.New("institution exists")
				},
				expectedError: true,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				fsMock := &FinanceServiceMock{CreateInstitutionFunc: tc.mockFn}
				coord := NewCoordinator(Dependencies{FinanceService: fsMock})
				res, err := coord.CreateInstitution(tc.ctx, tc.inst)
				if tc.expectedError {
					if err == nil {
						t.Fatal("expected error, got nil")
					}
					return
				}
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if res == nil || res.ID != tc.expectedID {
					t.Errorf("expected ID %v, got %+v", tc.expectedID, res)
				}
			})
		}
	})

	t.Run("UpdateInstitution", func(t *testing.T) {
		tests := []struct {
			name          string
			ctx           context.Context
			inst          *finance.Institution
			mask          []string
			mockFn        func(ctx context.Context, inst *finance.Institution, mask []string) (*finance.Institution, error)
			expectedID    finance.InstitutionID
			expectedError bool
		}{
			{
				name: "Success",
				ctx:  newTestContext("spc_1", "usr_1"),
				inst: &finance.Institution{ID: "inst_1", Name: "Chase Bank"},
				mask: []string{"name"},
				mockFn: func(ctx context.Context, inst *finance.Institution, mask []string) (*finance.Institution, error) {
					if inst.SpaceID != "spc_1" || len(mask) != 1 {
						t.Errorf("unexpected update args: %+v, mask=%v", inst, mask)
					}
					return &finance.Institution{ID: inst.ID}, nil
				},
				expectedID:    "inst_1",
				expectedError: false,
			},
			{
				name:          "Unauthenticated",
				ctx:           context.Background(),
				inst:          &finance.Institution{ID: "inst_1"},
				expectedError: true,
			},
			{
				name: "Domain error",
				ctx:  newTestContext("spc_1", "usr_1"),
				inst: &finance.Institution{ID: "inst_1"},
				mockFn: func(ctx context.Context, inst *finance.Institution, mask []string) (*finance.Institution, error) {
					return nil, errors.New("update error")
				},
				expectedError: true,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				fsMock := &FinanceServiceMock{UpdateInstitutionFunc: tc.mockFn}
				coord := NewCoordinator(Dependencies{FinanceService: fsMock})
				res, err := coord.UpdateInstitution(tc.ctx, tc.inst, tc.mask)
				if tc.expectedError {
					if err == nil {
						t.Fatal("expected error, got nil")
					}
					return
				}
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if res == nil || res.ID != tc.expectedID {
					t.Errorf("expected ID %v, got %+v", tc.expectedID, res)
				}
			})
		}
	})

	t.Run("DeleteInstitution", func(t *testing.T) {
		tests := []struct {
			name          string
			ctx           context.Context
			id            finance.InstitutionID
			opts          finance.DeleteOptions
			mockFn        func(ctx context.Context, spaceID finance.SpaceID, id finance.InstitutionID, opts finance.DeleteOptions) error
			expectedError bool
		}{
			{
				name: "Success",
				ctx:  newTestContext("spc_1", "usr_1"),
				id:   "inst_1",
				opts: finance.DeleteOptions{Version: 1},
				mockFn: func(ctx context.Context, spaceID finance.SpaceID, id finance.InstitutionID, opts finance.DeleteOptions) error {
					if spaceID != "spc_1" || id != "inst_1" {
						t.Errorf("unexpected delete args: space=%v id=%v", spaceID, id)
					}
					return nil
				},
				expectedError: false,
			},
			{
				name:          "Unauthenticated",
				ctx:           context.Background(),
				id:            "inst_1",
				expectedError: true,
			},
			{
				name: "Domain error",
				ctx:  newTestContext("spc_1", "usr_1"),
				id:   "inst_1",
				mockFn: func(ctx context.Context, spaceID finance.SpaceID, id finance.InstitutionID, opts finance.DeleteOptions) error {
					return errors.New("cannot delete institution")
				},
				expectedError: true,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				fsMock := &FinanceServiceMock{DeleteInstitutionFunc: tc.mockFn}
				coord := NewCoordinator(Dependencies{FinanceService: fsMock})
				err := coord.DeleteInstitution(tc.ctx, tc.id, tc.opts)
				if tc.expectedError {
					if err == nil {
						t.Fatal("expected error, got nil")
					}
					return
				}
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
			})
		}
	})

	t.Run("ResolveInstitution", func(t *testing.T) {
		tests := []struct {
			name          string
			ctx           context.Context
			instName      string
			mockFn        func(ctx context.Context, spaceID finance.SpaceID, name string) (*finance.ResolveInstitutionResult, error)
			expectedError bool
		}{
			{
				name:     "Success",
				ctx:      newTestContext("spc_1", "usr_1"),
				instName: "Chase",
				mockFn: func(ctx context.Context, spaceID finance.SpaceID, name string) (*finance.ResolveInstitutionResult, error) {
					return &finance.ResolveInstitutionResult{Domain: "chase.com", Color: "#117aca"}, nil
				},
				expectedError: false,
			},
			{
				name:          "Unauthenticated",
				ctx:           context.Background(),
				instName:      "Chase",
				expectedError: true,
			},
			{
				name:     "Domain error",
				ctx:      newTestContext("spc_1", "usr_1"),
				instName: "Chase",
				mockFn: func(ctx context.Context, spaceID finance.SpaceID, name string) (*finance.ResolveInstitutionResult, error) {
					return nil, errors.New("resolve failed")
				},
				expectedError: true,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				fsMock := &FinanceServiceMock{ResolveInstitutionFunc: tc.mockFn}
				coord := NewCoordinator(Dependencies{FinanceService: fsMock})
				res, err := coord.ResolveInstitution(tc.ctx, tc.instName)
				if tc.expectedError {
					if err == nil {
						t.Fatal("expected error, got nil")
					}
					return
				}
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if res == nil || res.Domain != "chase.com" {
					t.Errorf("unexpected resolve result: %+v", res)
				}
			})
		}
	})
}

func TestCleanJSON(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "Raw JSON",
			input:    `{"vendor": "Starbucks"}`,
			expected: `{"vendor": "Starbucks"}`,
		},
		{
			name:     "Markdown JSON block with newline",
			input:    "```json\n{\"vendor\": \"Starbucks\"}\n```",
			expected: `{"vendor": "Starbucks"}`,
		},
		{
			name:     "Markdown block without language tag",
			input:    "```\n{\"vendor\": \"Starbucks\"}\n```",
			expected: `{"vendor": "Starbucks"}`,
		},
		{
			name:     "Markdown inline without newline",
			input:    "```json {\"a\": 1}```",
			expected: `{"a": 1}`,
		},
		{
			name:     "Prefixed with json word",
			input:    "json {\"amount\": 100}",
			expected: `{"amount": 100}`,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := cleanJSON(tc.input)
			if got != tc.expected {
				t.Errorf("cleanJSON(%q) = %q, expected %q", tc.input, got, tc.expected)
			}
		})
	}
}

func TestCoordinator_Integrations(t *testing.T) {
	t.Run("DiscardInboxItem", func(t *testing.T) {
		tests := []struct {
			name          string
			ctx           context.Context
			id            string
			mockFn        func(ctx context.Context, spaceID finance.SpaceID, id string) error
			expectedError bool
		}{
			{
				name: "Success",
				ctx:  newTestContext("spc_1", "usr_1"),
				id:   "inbox_1",
				mockFn: func(ctx context.Context, spaceID finance.SpaceID, id string) error {
					if spaceID != "spc_1" || id != "inbox_1" {
						t.Errorf("unexpected discard args: space=%v id=%v", spaceID, id)
					}
					return nil
				},
				expectedError: false,
			},
			{
				name:          "Unauthenticated",
				ctx:           context.Background(),
				id:            "inbox_1",
				expectedError: true,
			},
			{
				name: "Domain error",
				ctx:  newTestContext("spc_1", "usr_1"),
				id:   "inbox_1",
				mockFn: func(ctx context.Context, spaceID finance.SpaceID, id string) error {
					return errors.New("discard failed")
				},
				expectedError: true,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				fsMock := &FinanceServiceMock{DiscardInboxItemFunc: tc.mockFn}
				coord := NewCoordinator(Dependencies{FinanceService: fsMock})
				err := coord.DiscardInboxItem(tc.ctx, tc.id)
				if tc.expectedError {
					if err == nil {
						t.Fatal("expected error, got nil")
					}
					return
				}
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
			})
		}
	})

	t.Run("UpdateInboxItem", func(t *testing.T) {
		tests := []struct {
			name          string
			ctx           context.Context
			item          *finance.InboxItem
			mockFn        func(ctx context.Context, spaceID finance.SpaceID, item *finance.InboxItem) (*finance.InboxItem, error)
			expectedID    string
			expectedError bool
		}{
			{
				name: "Success",
				ctx:  newTestContext("spc_1", "usr_1"),
				item: &finance.InboxItem{ID: "inbox_1", VendorName: "Uber"},
				mockFn: func(ctx context.Context, spaceID finance.SpaceID, item *finance.InboxItem) (*finance.InboxItem, error) {
					return item, nil
				},
				expectedID:    "inbox_1",
				expectedError: false,
			},
			{
				name:          "Unauthenticated",
				ctx:           context.Background(),
				item:          &finance.InboxItem{ID: "inbox_1"},
				expectedError: true,
			},
			{
				name: "Domain error",
				ctx:  newTestContext("spc_1", "usr_1"),
				item: &finance.InboxItem{ID: "inbox_1"},
				mockFn: func(ctx context.Context, spaceID finance.SpaceID, item *finance.InboxItem) (*finance.InboxItem, error) {
					return nil, errors.New("update failed")
				},
				expectedError: true,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				fsMock := &FinanceServiceMock{UpdateInboxItemFunc: tc.mockFn}
				coord := NewCoordinator(Dependencies{FinanceService: fsMock})
				res, err := coord.UpdateInboxItem(tc.ctx, tc.item)
				if tc.expectedError {
					if err == nil {
						t.Fatal("expected error, got nil")
					}
					return
				}
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if res == nil || res.ID != tc.expectedID {
					t.Errorf("expected ID %v, got %+v", tc.expectedID, res)
				}
			})
		}
	})

	t.Run("ApproveInboxItem", func(t *testing.T) {
		tests := []struct {
			name          string
			ctx           context.Context
			id            string
			mockFn        func(ctx context.Context, spaceID finance.SpaceID, id string) (*finance.InboxItem, error)
			expectedID    string
			expectedError bool
		}{
			{
				name: "Success",
				ctx:  newTestContext("spc_1", "usr_1"),
				id:   "inbox_1",
				mockFn: func(ctx context.Context, spaceID finance.SpaceID, id string) (*finance.InboxItem, error) {
					return &finance.InboxItem{ID: id, Status: finance.InboxItemResolved}, nil
				},
				expectedID:    "inbox_1",
				expectedError: false,
			},
			{
				name:          "Unauthenticated",
				ctx:           context.Background(),
				id:            "inbox_1",
				expectedError: true,
			},
			{
				name: "Domain error",
				ctx:  newTestContext("spc_1", "usr_1"),
				id:   "inbox_1",
				mockFn: func(ctx context.Context, spaceID finance.SpaceID, id string) (*finance.InboxItem, error) {
					return nil, errors.New("approve failed")
				},
				expectedError: true,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				fsMock := &FinanceServiceMock{ApproveInboxItemFunc: tc.mockFn}
				coord := NewCoordinator(Dependencies{FinanceService: fsMock})
				res, err := coord.ApproveInboxItem(tc.ctx, tc.id)
				if tc.expectedError {
					if err == nil {
						t.Fatal("expected error, got nil")
					}
					return
				}
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if res == nil || res.ID != tc.expectedID {
					t.Errorf("expected ID %v, got %+v", tc.expectedID, res)
				}
			})
		}
	})
}

func TestCoordinator_ProcessSuggestions(t *testing.T) {
	accID := "acc_1"
	bgtID := "bgt_1"
	dupID := "tx_dup_1"

	tests := []struct {
		name          string
		req           *agentapp.SuggestionRequest
		classifierFn  func(ctx context.Context, spaceID string, doc string) (string, error)
		parserFn      func(ctx context.Context, spaceID string, doc string, ingCtx IngestionContext) (*ParsedTransaction, error)
		expectCard    bool
		expectBudget  bool
		expectAccount bool
		expectDup     bool
		expectedError bool
	}{
		{
			name: "All suggestion fields populated",
			req: &agentapp.SuggestionRequest{
				TextContent: "Receipt from Starbucks",
				Documents: []agentapp.DocumentFile{
					{Filename: "starbucks.png", ContentType: "image/png", Content: []byte("img")},
				},
			},
			classifierFn: func(ctx context.Context, spaceID string, doc string) (string, error) {
				return "RECEIPT", nil
			},
			parserFn: func(ctx context.Context, spaceID string, doc string, ingCtx IngestionContext) (*ParsedTransaction, error) {
				return &ParsedTransaction{
					Counterparty:         "Starbucks",
					Amount:               550,
					Currency:             "USD",
					Date:                 "2026-09-15",
					CardLastFour:         "1234",
					SuggestedBudget:      "Coffee",
					SourceAccountID:      accID,
					SuggestedTransferLeg: "",
				}, nil
			},
			expectCard:    true,
			expectBudget:  true,
			expectAccount: true,
			expectDup:     false,
			expectedError: false,
		},
		{
			name: "Classifier error returns error",
			req:  &agentapp.SuggestionRequest{TextContent: "Garbage data"},
			classifierFn: func(ctx context.Context, spaceID string, doc string) (string, error) {
				return "", errors.New("classify failed")
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
					ResolveAccountFunc: func(ctx context.Context, spaceID finance.SpaceID, opts finance.ResolveAccountOpts) (*finance.Account, error) {
						return &finance.Account{ID: "acc_1"}, nil
					},
					GetBudgetFunc: func(ctx context.Context, spaceID finance.SpaceID, id finance.BudgetID) (*finance.Budget, error) {
						return &finance.Budget{ID: id, SpaceID: spaceID}, nil
					},
				},
				Classifier: &DocumentClassifierMock{ClassifyFunc: tc.classifierFn},
				Parser:     &IngestionParserMock{ParseFunc: tc.parserFn},
				Deduplicator: &IngestionDeduplicatorMock{
					DeduplicateFunc: func(ctx context.Context, spaceID string, tx *ParsedTransaction, recent []*finance.Transaction) (*DeduplicationResult, error) {
						return &DeduplicationResult{IsDuplicate: false}, nil
					},
				},
			}
			coord := NewCoordinator(deps)
			res, err := coord.ProcessSuggestions(context.Background(), "spc_1", tc.req)
			if tc.expectedError {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if res["classification"] != "RECEIPT" || res["vendor"] != "Starbucks" {
				t.Errorf("unexpected suggestion result: %+v", res)
			}
			if tc.expectCard && res["cardLastFour"] != "1234" {
				t.Errorf("expected cardLastFour 1234, got %v", res["cardLastFour"])
			}
			if tc.expectBudget && res["suggestedBudget"] != "Coffee" {
				t.Errorf("expected suggestedBudget Coffee, got %v", res["suggestedBudget"])
			}
		})
	}

	// Verify unauthenticated GetTransactionSuggestions
	t.Run("GetTransactionSuggestions unauthenticated", func(t *testing.T) {
		coord := NewCoordinator(Dependencies{})
		_, err := coord.GetTransactionSuggestions(context.Background(), &IngestionRequest{})
		if err == nil {
			t.Fatal("expected unauthenticated error")
		}
	})

	_ = bgtID
	_ = dupID
}

func TestLoggingCoordinator_Delegation(t *testing.T) {
	ctx := context.Background()
	logger := log.New()

	var configureCalled, getSettingsCalled, listCurrenciesCalled bool
	var createAccountCalled, updateAccountCalled, deleteAccountCalled, adjustAccountCalled bool
	var createBorrowingCalled, updateBorrowingCalled, deleteBorrowingCalled, adjustBorrowingCalled bool
	var logBorrowingTxCalled, updateBorrowingTxCalled, deleteBorrowingTxCalled bool
	var createBudgetCalled, updateBudgetCalled, getBudgetCalled, deleteBudgetCalled bool
	var getInsightsCalled bool
	var createInstCalled, updateInstCalled, deleteInstCalled, resolveInstCalled bool
	var createRateCalled, getRateCalled, updateRateCalled, listRatesCalled, deleteRateCalled bool
	var createRecTxCalled, updateRecTxCalled, deleteRecTxCalled bool
	var confirmSchedCalled, matchSchedCalled, skipSchedCalled, getSchedCalled, genSchedCalled bool
	var createExpCalled, createIncCalled, updateExpCalled, updateIncCalled, deleteTxCalled, listTxEventsCalled bool
	var createTrfCalled, getTrfCalled, deleteTrfCalled, listTrfsCalled bool
	var importStmtCalled, deleteStmtCalled, updateStmtCalled, updateStmtLineCalled, completeStmtCalled, invertStmtCalled bool
	var ingestStmtCalled, analyzeStmtCalled bool
	var ingestEmailCalled, discardInboxCalled, updateInboxCalled, approveInboxCalled bool
	var getTxSugCalled, processSugCalled, processSignalCalled, getSignalSugCalled bool

	coordMock := &CoordinatorMock{
		ConfigureFinanceFunc: func(ctx context.Context, req *ConfigureFinanceRequest) (*finance.FinanceSettings, error) {
			configureCalled = true
			return &finance.FinanceSettings{}, nil
		},
		GetFinanceSettingsFunc: func(ctx context.Context) (*finance.FinanceSettings, error) {
			getSettingsCalled = true
			return &finance.FinanceSettings{}, nil
		},
		ListCurrenciesFunc: func(ctx context.Context) ([]finance.CurrencyInfo, error) {
			listCurrenciesCalled = true
			return []finance.CurrencyInfo{}, nil
		},
		CreateAccountFunc: func(ctx context.Context, req *CreateAccountRequest) (*finance.Account, error) {
			createAccountCalled = true
			return &finance.Account{ID: "acc_1"}, nil
		},
		UpdateAccountFunc: func(ctx context.Context, req *UpdateAccountRequest) (*finance.Account, error) {
			updateAccountCalled = true
			return &finance.Account{ID: "acc_1"}, nil
		},
		DeleteAccountFunc: func(ctx context.Context, id finance.AccountID, opts finance.DeleteOptions) error {
			deleteAccountCalled = true
			return nil
		},
		AdjustAccountBalanceFunc: func(ctx context.Context, id finance.AccountID, targetBalance int64, adjustmentDate string, note string) (*finance.Account, error) {
			adjustAccountCalled = true
			return &finance.Account{ID: id}, nil
		},
		CreateBorrowingFunc: func(ctx context.Context, req *CreateBorrowingRequest) (*finance.Borrowing, error) {
			createBorrowingCalled = true
			return &finance.Borrowing{ID: "bor_1"}, nil
		},
		UpdateBorrowingFunc: func(ctx context.Context, req *UpdateBorrowingRequest) (*finance.Borrowing, error) {
			updateBorrowingCalled = true
			return &finance.Borrowing{ID: "bor_1"}, nil
		},
		DeleteBorrowingFunc: func(ctx context.Context, id finance.BorrowingID) error {
			deleteBorrowingCalled = true
			return nil
		},
		AdjustBorrowingBalanceFunc: func(ctx context.Context, req *AdjustBorrowingBalanceRequest) (*finance.Borrowing, error) {
			adjustBorrowingCalled = true
			return &finance.Borrowing{ID: "bor_1"}, nil
		},
		LogBorrowingTransactionFunc: func(ctx context.Context, req *LogBorrowingTransactionRequest) (*finance.Transaction, error) {
			logBorrowingTxCalled = true
			return &finance.Transaction{ID: "tx_1"}, nil
		},
		UpdateBorrowingTransactionFunc: func(ctx context.Context, req *UpdateBorrowingTransactionRequest) (*finance.Transaction, error) {
			updateBorrowingTxCalled = true
			return &finance.Transaction{ID: "tx_1"}, nil
		},
		DeleteBorrowingTransactionFunc: func(ctx context.Context, req *DeleteBorrowingTransactionRequest) error {
			deleteBorrowingTxCalled = true
			return nil
		},
		CreateBudgetFunc: func(ctx context.Context, req *CreateBudgetRequest) (*finance.Budget, error) {
			createBudgetCalled = true
			return &finance.Budget{ID: "bgt_1"}, nil
		},
		UpdateBudgetFunc: func(ctx context.Context, req *UpdateBudgetRequest) (*finance.Budget, error) {
			updateBudgetCalled = true
			return &finance.Budget{ID: "bgt_1"}, nil
		},
		GetBudgetFunc: func(ctx context.Context, id finance.BudgetID) (*finance.Budget, error) {
			getBudgetCalled = true
			return &finance.Budget{ID: id}, nil
		},
		DeleteBudgetFunc: func(ctx context.Context, req *DeleteBudgetRequest) error {
			deleteBudgetCalled = true
			return nil
		},
		GetInsightsFunc: func(ctx context.Context, req *GetInsightsRequest) (*finance.Insights, error) {
			getInsightsCalled = true
			return &finance.Insights{}, nil
		},
		CreateInstitutionFunc: func(ctx context.Context, inst *finance.Institution) (*finance.Institution, error) {
			createInstCalled = true
			return &finance.Institution{ID: "inst_1"}, nil
		},
		UpdateInstitutionFunc: func(ctx context.Context, inst *finance.Institution, mask []string) (*finance.Institution, error) {
			updateInstCalled = true
			return &finance.Institution{ID: "inst_1"}, nil
		},
		DeleteInstitutionFunc: func(ctx context.Context, id finance.InstitutionID, opts finance.DeleteOptions) error {
			deleteInstCalled = true
			return nil
		},
		ResolveInstitutionFunc: func(ctx context.Context, name string) (*finance.ResolveInstitutionResult, error) {
			resolveInstCalled = true
			return &finance.ResolveInstitutionResult{}, nil
		},
		CreateExchangeRateFunc: func(ctx context.Context, req *CreateExchangeRateRequest) (*finance.ExchangeRate, error) {
			createRateCalled = true
			return &finance.ExchangeRate{ID: "rate_1"}, nil
		},
		GetExchangeRateFunc: func(ctx context.Context, req *GetExchangeRateRequest) (*finance.ExchangeRate, error) {
			getRateCalled = true
			return &finance.ExchangeRate{ID: "rate_1"}, nil
		},
		UpdateExchangeRateFunc: func(ctx context.Context, req *UpdateExchangeRateRequest) (*finance.ExchangeRate, error) {
			updateRateCalled = true
			return &finance.ExchangeRate{ID: "rate_1"}, nil
		},
		ListExchangeRatesFunc: func(ctx context.Context, req *ListExchangeRatesRequest) ([]*finance.ExchangeRate, string, error) {
			listRatesCalled = true
			return []*finance.ExchangeRate{}, "", nil
		},
		DeleteExchangeRateFunc: func(ctx context.Context, req *DeleteExchangeRateRequest) error {
			deleteRateCalled = true
			return nil
		},
		CreateRecurringTransactionFunc: func(ctx context.Context, req *CreateRecurringTransactionRequest) (*finance.RecurringTransaction, error) {
			createRecTxCalled = true
			return &finance.RecurringTransaction{ID: "rec_1"}, nil
		},
		UpdateRecurringTransactionFunc: func(ctx context.Context, req *UpdateRecurringTransactionRequest) (*finance.RecurringTransaction, error) {
			updateRecTxCalled = true
			return &finance.RecurringTransaction{ID: "rec_1"}, nil
		},
		DeleteRecurringTransactionFunc: func(ctx context.Context, id finance.RecurringTransactionID, opts finance.DeleteOptions) error {
			deleteRecTxCalled = true
			return nil
		},
		ConfirmScheduledTransactionFunc: func(ctx context.Context, req *ConfirmScheduledTransactionRequest) (*finance.Transaction, error) {
			confirmSchedCalled = true
			return &finance.Transaction{ID: "tx_1"}, nil
		},
		MatchScheduledTransactionFunc: func(ctx context.Context, req *MatchScheduledTransactionRequest) (*finance.Transaction, error) {
			matchSchedCalled = true
			return &finance.Transaction{ID: "tx_1"}, nil
		},
		SkipScheduledTransactionFunc: func(ctx context.Context, id finance.ScheduledTransactionID) (*finance.ScheduledTransaction, error) {
			skipSchedCalled = true
			return &finance.ScheduledTransaction{ID: id}, nil
		},
		GetScheduledTransactionFunc: func(ctx context.Context, id finance.ScheduledTransactionID) (*finance.ScheduledTransaction, error) {
			getSchedCalled = true
			return &finance.ScheduledTransaction{ID: id}, nil
		},
		GenerateScheduledTransactionsFunc: func(ctx context.Context) error {
			genSchedCalled = true
			return nil
		},
		CreateExpenseFunc: func(ctx context.Context, req *CreateExpenseRequest) (*finance.Transaction, error) {
			createExpCalled = true
			return &finance.Transaction{ID: "tx_1"}, nil
		},
		CreateIncomeFunc: func(ctx context.Context, req *CreateIncomeRequest) (*finance.Transaction, error) {
			createIncCalled = true
			return &finance.Transaction{ID: "tx_1"}, nil
		},
		UpdateExpenseFunc: func(ctx context.Context, req *UpdateExpenseRequest) (*finance.Transaction, error) {
			updateExpCalled = true
			return &finance.Transaction{ID: "tx_1"}, nil
		},
		UpdateIncomeFunc: func(ctx context.Context, req *UpdateIncomeRequest) (*finance.Transaction, error) {
			updateIncCalled = true
			return &finance.Transaction{ID: "tx_1"}, nil
		},
		DeleteTransactionFunc: func(ctx context.Context, id finance.TransactionID) error {
			deleteTxCalled = true
			return nil
		},
		ListTransactionEventsFunc: func(ctx context.Context, req *ListTransactionEventsRequest) ([]*finance.TransactionEvent, error) {
			listTxEventsCalled = true
			return []*finance.TransactionEvent{}, nil
		},
		CreateTransferFunc: func(ctx context.Context, req *CreateTransferRequest) (*finance.Transfer, error) {
			createTrfCalled = true
			return &finance.Transfer{ID: "trf_1"}, nil
		},
		GetTransferFunc: func(ctx context.Context, id finance.TransferID) (*finance.Transfer, error) {
			getTrfCalled = true
			return &finance.Transfer{ID: id}, nil
		},
		DeleteTransferFunc: func(ctx context.Context, id finance.TransferID) error {
			deleteTrfCalled = true
			return nil
		},
		ListTransfersFunc: func(ctx context.Context, req *ListTransfersRequest) ([]*finance.Transfer, string, error) {
			listTrfsCalled = true
			return []*finance.Transfer{}, "", nil
		},
		ImportStatementFunc: func(ctx context.Context, accountID finance.AccountID, stmt *finance.Statement) (*finance.Statement, error) {
			importStmtCalled = true
			return &finance.Statement{ID: "stmt_1"}, nil
		},
		DeleteStatementFunc: func(ctx context.Context, id finance.StatementID, opts finance.DeleteOptions) error {
			deleteStmtCalled = true
			return nil
		},
		UpdateStatementFunc: func(ctx context.Context, stmt *finance.Statement, mask []string) (*finance.Statement, error) {
			updateStmtCalled = true
			return &finance.Statement{ID: "stmt_1"}, nil
		},
		UpdateStatementLineFunc: func(ctx context.Context, line *finance.StatementLine, mask []string) (*finance.StatementLine, error) {
			updateStmtLineCalled = true
			return &finance.StatementLine{ID: "line_1"}, nil
		},
		CompleteStatementFunc: func(ctx context.Context, id finance.StatementID) (*finance.Statement, error) {
			completeStmtCalled = true
			return &finance.Statement{ID: id}, nil
		},
		InvertStatementSignsFunc: func(ctx context.Context, id finance.StatementID) (*finance.Statement, []*finance.StatementLine, error) {
			invertStmtCalled = true
			return &finance.Statement{ID: id}, []*finance.StatementLine{}, nil
		},
		IngestStatementDocumentFunc: func(ctx context.Context, req *StatementDocumentRequest) (*IngestStatementResult, error) {
			ingestStmtCalled = true
			return &IngestStatementResult{}, nil
		},
		AnalyzeStatementDocumentFunc: func(ctx context.Context, req *StatementDocumentRequest) (*StatementIngestionState, error) {
			analyzeStmtCalled = true
			return &StatementIngestionState{}, nil
		},
		IngestEmailFunc: func(ctx context.Context, spaceID string, integrationID string, sender string, subject string, body string) (*finance.InboxItem, error) {
			ingestEmailCalled = true
			return &finance.InboxItem{ID: "inbox_1"}, nil
		},
		DiscardInboxItemFunc: func(ctx context.Context, id string) error {
			discardInboxCalled = true
			return nil
		},
		UpdateInboxItemFunc: func(ctx context.Context, item *finance.InboxItem) (*finance.InboxItem, error) {
			updateInboxCalled = true
			return &finance.InboxItem{ID: "inbox_1"}, nil
		},
		ApproveInboxItemFunc: func(ctx context.Context, id string) (*finance.InboxItem, error) {
			approveInboxCalled = true
			return &finance.InboxItem{ID: "inbox_1"}, nil
		},
		GetTransactionSuggestionsFunc: func(ctx context.Context, req *IngestionRequest) (*SignalSuggestion, error) {
			getTxSugCalled = true
			return &SignalSuggestion{}, nil
		},
		ProcessSuggestionsFunc: func(ctx context.Context, spaceID string, req *agentapp.SuggestionRequest) (map[string]any, error) {
			processSugCalled = true
			return map[string]any{}, nil
		},
		ProcessSignalPipelineFunc: func(ctx context.Context, spaceID string, req *IngestionRequest) (*IngestionState, error) {
			processSignalCalled = true
			return &IngestionState{}, nil
		},
		GetSignalSuggestionsFunc: func(ctx context.Context, spaceID string, req *IngestionRequest) (*SignalSuggestion, error) {
			getSignalSugCalled = true
			return &SignalSuggestion{}, nil
		},
	}

	logged := NewLoggingCoordinator(coordMock, logger)

	// Execute every logged method once to verify transparent delegation and logging
	_, _ = logged.ConfigureFinance(ctx, &ConfigureFinanceRequest{})
	_, _ = logged.GetFinanceSettings(ctx)
	_, _ = logged.ListCurrencies(ctx)
	_, _ = logged.CreateAccount(ctx, &CreateAccountRequest{})
	_, _ = logged.UpdateAccount(ctx, &UpdateAccountRequest{})
	_ = logged.DeleteAccount(ctx, "acc_1", finance.DeleteOptions{})
	_, _ = logged.AdjustAccountBalance(ctx, "acc_1", 100, "2026-09-17", "note")
	_, _ = logged.CreateBorrowing(ctx, &CreateBorrowingRequest{})
	_, _ = logged.UpdateBorrowing(ctx, &UpdateBorrowingRequest{})
	_ = logged.DeleteBorrowing(ctx, "bor_1")
	_, _ = logged.AdjustBorrowingBalance(ctx, &AdjustBorrowingBalanceRequest{})
	_, _ = logged.LogBorrowingTransaction(ctx, &LogBorrowingTransactionRequest{})
	_, _ = logged.UpdateBorrowingTransaction(ctx, &UpdateBorrowingTransactionRequest{})
	_ = logged.DeleteBorrowingTransaction(ctx, &DeleteBorrowingTransactionRequest{})
	_, _ = logged.CreateBudget(ctx, &CreateBudgetRequest{})
	_, _ = logged.UpdateBudget(ctx, &UpdateBudgetRequest{})
	_, _ = logged.GetBudget(ctx, "bgt_1")
	_ = logged.DeleteBudget(ctx, &DeleteBudgetRequest{})
	_, _ = logged.GetInsights(ctx, &GetInsightsRequest{})
	_, _ = logged.CreateInstitution(ctx, &finance.Institution{})
	_, _ = logged.UpdateInstitution(ctx, &finance.Institution{}, nil)
	_ = logged.DeleteInstitution(ctx, "inst_1", finance.DeleteOptions{})
	_, _ = logged.ResolveInstitution(ctx, "Chase")
	_, _ = logged.CreateExchangeRate(ctx, &CreateExchangeRateRequest{})
	_, _ = logged.GetExchangeRate(ctx, &GetExchangeRateRequest{})
	_, _ = logged.UpdateExchangeRate(ctx, &UpdateExchangeRateRequest{})
	_, _, _ = logged.ListExchangeRates(ctx, &ListExchangeRatesRequest{})
	_ = logged.DeleteExchangeRate(ctx, &DeleteExchangeRateRequest{})
	_, _ = logged.CreateRecurringTransaction(ctx, &CreateRecurringTransactionRequest{})
	_, _ = logged.UpdateRecurringTransaction(ctx, &UpdateRecurringTransactionRequest{})
	_ = logged.DeleteRecurringTransaction(ctx, "rec_1", finance.DeleteOptions{})
	_, _ = logged.ConfirmScheduledTransaction(ctx, &ConfirmScheduledTransactionRequest{})
	_, _ = logged.MatchScheduledTransaction(ctx, &MatchScheduledTransactionRequest{})
	_, _ = logged.SkipScheduledTransaction(ctx, "sched_1")
	_, _ = logged.GetScheduledTransaction(ctx, "sched_1")
	_ = logged.GenerateScheduledTransactions(ctx)
	_, _ = logged.CreateExpense(ctx, &CreateExpenseRequest{})
	_, _ = logged.CreateIncome(ctx, &CreateIncomeRequest{})
	_, _ = logged.UpdateExpense(ctx, &UpdateExpenseRequest{})
	_, _ = logged.UpdateIncome(ctx, &UpdateIncomeRequest{})
	_ = logged.DeleteTransaction(ctx, "tx_1")
	_, _ = logged.ListTransactionEvents(ctx, &ListTransactionEventsRequest{})
	_, _ = logged.CreateTransfer(ctx, &CreateTransferRequest{})
	_, _ = logged.GetTransfer(ctx, "trf_1")
	_ = logged.DeleteTransfer(ctx, "trf_1")
	_, _, _ = logged.ListTransfers(ctx, &ListTransfersRequest{})
	_, _ = logged.ImportStatement(ctx, "acc_1", &finance.Statement{})
	_ = logged.DeleteStatement(ctx, "stmt_1", finance.DeleteOptions{})
	_, _ = logged.UpdateStatement(ctx, &finance.Statement{}, nil)
	_, _ = logged.UpdateStatementLine(ctx, &finance.StatementLine{}, nil)
	_, _ = logged.CompleteStatement(ctx, "stmt_1")
	_, _, _ = logged.InvertStatementSigns(ctx, "stmt_1")
	_, _ = logged.IngestStatementDocument(ctx, &StatementDocumentRequest{})
	_, _ = logged.AnalyzeStatementDocument(ctx, &StatementDocumentRequest{})
	_, _ = logged.IngestEmail(ctx, "spc_1", "int_1", "sender", "subject", "body")
	_ = logged.DiscardInboxItem(ctx, "inbox_1")
	_, _ = logged.UpdateInboxItem(ctx, &finance.InboxItem{})
	_, _ = logged.ApproveInboxItem(ctx, "inbox_1")
	_, _ = logged.GetTransactionSuggestions(ctx, &IngestionRequest{})
	_, _ = logged.ProcessSuggestions(ctx, "spc_1", &agentapp.SuggestionRequest{})
	_, _ = logged.ProcessSignalPipeline(ctx, "spc_1", &IngestionRequest{})
	_, _ = logged.GetSignalSuggestions(ctx, "spc_1", &IngestionRequest{})

	if !configureCalled || !getSettingsCalled || !listCurrenciesCalled ||
		!createAccountCalled || !updateAccountCalled || !deleteAccountCalled || !adjustAccountCalled ||
		!createBorrowingCalled || !updateBorrowingCalled || !deleteBorrowingCalled || !adjustBorrowingCalled ||
		!logBorrowingTxCalled || !updateBorrowingTxCalled || !deleteBorrowingTxCalled ||
		!createBudgetCalled || !updateBudgetCalled || !getBudgetCalled || !deleteBudgetCalled ||
		!getInsightsCalled || !createInstCalled || !updateInstCalled || !deleteInstCalled || !resolveInstCalled ||
		!createRateCalled || !getRateCalled || !updateRateCalled || !listRatesCalled || !deleteRateCalled ||
		!createRecTxCalled || !updateRecTxCalled || !deleteRecTxCalled ||
		!confirmSchedCalled || !matchSchedCalled || !skipSchedCalled || !getSchedCalled || !genSchedCalled ||
		!createExpCalled || !createIncCalled || !updateExpCalled || !updateIncCalled || !deleteTxCalled || !listTxEventsCalled ||
		!createTrfCalled || !getTrfCalled || !deleteTrfCalled || !listTrfsCalled ||
		!importStmtCalled || !deleteStmtCalled || !updateStmtCalled || !updateStmtLineCalled || !completeStmtCalled || !invertStmtCalled ||
		!ingestStmtCalled || !analyzeStmtCalled ||
		!ingestEmailCalled || !discardInboxCalled || !updateInboxCalled || !approveInboxCalled ||
		!getTxSugCalled || !processSugCalled || !processSignalCalled || !getSignalSugCalled {
		t.Error("expected all methods to be delegated by LoggingCoordinator")
	}
}

func TestLoggingCoordinator_Errors(t *testing.T) {
	ctx := context.Background()
	logger := log.New()
	expectedErr := errors.New("underlying error")

	coordMock := &CoordinatorMock{
		ConfigureFinanceFunc: func(ctx context.Context, req *ConfigureFinanceRequest) (*finance.FinanceSettings, error) {
			return nil, expectedErr
		},
		GetFinanceSettingsFunc: func(ctx context.Context) (*finance.FinanceSettings, error) {
			return nil, expectedErr
		},
		ListCurrenciesFunc: func(ctx context.Context) ([]finance.CurrencyInfo, error) {
			return nil, expectedErr
		},
		CreateAccountFunc: func(ctx context.Context, req *CreateAccountRequest) (*finance.Account, error) {
			return nil, expectedErr
		},
		UpdateAccountFunc: func(ctx context.Context, req *UpdateAccountRequest) (*finance.Account, error) {
			return nil, expectedErr
		},
		DeleteAccountFunc: func(ctx context.Context, id finance.AccountID, opts finance.DeleteOptions) error {
			return expectedErr
		},
		AdjustAccountBalanceFunc: func(ctx context.Context, id finance.AccountID, targetBalance int64, adjustmentDate string, note string) (*finance.Account, error) {
			return nil, expectedErr
		},
		CreateBorrowingFunc: func(ctx context.Context, req *CreateBorrowingRequest) (*finance.Borrowing, error) {
			return nil, expectedErr
		},
		UpdateBorrowingFunc: func(ctx context.Context, req *UpdateBorrowingRequest) (*finance.Borrowing, error) {
			return nil, expectedErr
		},
		DeleteBorrowingFunc: func(ctx context.Context, id finance.BorrowingID) error {
			return expectedErr
		},
		AdjustBorrowingBalanceFunc: func(ctx context.Context, req *AdjustBorrowingBalanceRequest) (*finance.Borrowing, error) {
			return nil, expectedErr
		},
		LogBorrowingTransactionFunc: func(ctx context.Context, req *LogBorrowingTransactionRequest) (*finance.Transaction, error) {
			return nil, expectedErr
		},
		UpdateBorrowingTransactionFunc: func(ctx context.Context, req *UpdateBorrowingTransactionRequest) (*finance.Transaction, error) {
			return nil, expectedErr
		},
		DeleteBorrowingTransactionFunc: func(ctx context.Context, req *DeleteBorrowingTransactionRequest) error {
			return expectedErr
		},
		CreateBudgetFunc: func(ctx context.Context, req *CreateBudgetRequest) (*finance.Budget, error) {
			return nil, expectedErr
		},
		UpdateBudgetFunc: func(ctx context.Context, req *UpdateBudgetRequest) (*finance.Budget, error) {
			return nil, expectedErr
		},
		GetBudgetFunc: func(ctx context.Context, id finance.BudgetID) (*finance.Budget, error) {
			return nil, expectedErr
		},
		DeleteBudgetFunc: func(ctx context.Context, req *DeleteBudgetRequest) error {
			return expectedErr
		},
		GetInsightsFunc: func(ctx context.Context, req *GetInsightsRequest) (*finance.Insights, error) {
			return nil, expectedErr
		},
		CreateInstitutionFunc: func(ctx context.Context, inst *finance.Institution) (*finance.Institution, error) {
			return nil, expectedErr
		},
		UpdateInstitutionFunc: func(ctx context.Context, inst *finance.Institution, mask []string) (*finance.Institution, error) {
			return nil, expectedErr
		},
		DeleteInstitutionFunc: func(ctx context.Context, id finance.InstitutionID, opts finance.DeleteOptions) error {
			return expectedErr
		},
		ResolveInstitutionFunc: func(ctx context.Context, name string) (*finance.ResolveInstitutionResult, error) {
			return nil, expectedErr
		},
		CreateExchangeRateFunc: func(ctx context.Context, req *CreateExchangeRateRequest) (*finance.ExchangeRate, error) {
			return nil, expectedErr
		},
		GetExchangeRateFunc: func(ctx context.Context, req *GetExchangeRateRequest) (*finance.ExchangeRate, error) {
			return nil, expectedErr
		},
		UpdateExchangeRateFunc: func(ctx context.Context, req *UpdateExchangeRateRequest) (*finance.ExchangeRate, error) {
			return nil, expectedErr
		},
		ListExchangeRatesFunc: func(ctx context.Context, req *ListExchangeRatesRequest) ([]*finance.ExchangeRate, string, error) {
			return nil, "", expectedErr
		},
		DeleteExchangeRateFunc: func(ctx context.Context, req *DeleteExchangeRateRequest) error {
			return expectedErr
		},
		CreateRecurringTransactionFunc: func(ctx context.Context, req *CreateRecurringTransactionRequest) (*finance.RecurringTransaction, error) {
			return nil, expectedErr
		},
		UpdateRecurringTransactionFunc: func(ctx context.Context, req *UpdateRecurringTransactionRequest) (*finance.RecurringTransaction, error) {
			return nil, expectedErr
		},
		DeleteRecurringTransactionFunc: func(ctx context.Context, id finance.RecurringTransactionID, opts finance.DeleteOptions) error {
			return expectedErr
		},
		ConfirmScheduledTransactionFunc: func(ctx context.Context, req *ConfirmScheduledTransactionRequest) (*finance.Transaction, error) {
			return nil, expectedErr
		},
		MatchScheduledTransactionFunc: func(ctx context.Context, req *MatchScheduledTransactionRequest) (*finance.Transaction, error) {
			return nil, expectedErr
		},
		SkipScheduledTransactionFunc: func(ctx context.Context, id finance.ScheduledTransactionID) (*finance.ScheduledTransaction, error) {
			return nil, expectedErr
		},
		GetScheduledTransactionFunc: func(ctx context.Context, id finance.ScheduledTransactionID) (*finance.ScheduledTransaction, error) {
			return nil, expectedErr
		},
		GenerateScheduledTransactionsFunc: func(ctx context.Context) error {
			return expectedErr
		},
		CreateExpenseFunc: func(ctx context.Context, req *CreateExpenseRequest) (*finance.Transaction, error) {
			return nil, expectedErr
		},
		CreateIncomeFunc: func(ctx context.Context, req *CreateIncomeRequest) (*finance.Transaction, error) {
			return nil, expectedErr
		},
		UpdateExpenseFunc: func(ctx context.Context, req *UpdateExpenseRequest) (*finance.Transaction, error) {
			return nil, expectedErr
		},
		UpdateIncomeFunc: func(ctx context.Context, req *UpdateIncomeRequest) (*finance.Transaction, error) {
			return nil, expectedErr
		},
		DeleteTransactionFunc: func(ctx context.Context, id finance.TransactionID) error {
			return expectedErr
		},
		ListTransactionEventsFunc: func(ctx context.Context, req *ListTransactionEventsRequest) ([]*finance.TransactionEvent, error) {
			return nil, expectedErr
		},
		CreateTransferFunc: func(ctx context.Context, req *CreateTransferRequest) (*finance.Transfer, error) {
			return nil, expectedErr
		},
		GetTransferFunc: func(ctx context.Context, id finance.TransferID) (*finance.Transfer, error) {
			return nil, expectedErr
		},
		DeleteTransferFunc: func(ctx context.Context, id finance.TransferID) error {
			return expectedErr
		},
		ListTransfersFunc: func(ctx context.Context, req *ListTransfersRequest) ([]*finance.Transfer, string, error) {
			return nil, "", expectedErr
		},
		ImportStatementFunc: func(ctx context.Context, accountID finance.AccountID, stmt *finance.Statement) (*finance.Statement, error) {
			return nil, expectedErr
		},
		DeleteStatementFunc: func(ctx context.Context, id finance.StatementID, opts finance.DeleteOptions) error {
			return expectedErr
		},
		UpdateStatementFunc: func(ctx context.Context, stmt *finance.Statement, mask []string) (*finance.Statement, error) {
			return nil, expectedErr
		},
		UpdateStatementLineFunc: func(ctx context.Context, line *finance.StatementLine, mask []string) (*finance.StatementLine, error) {
			return nil, expectedErr
		},
		CompleteStatementFunc: func(ctx context.Context, id finance.StatementID) (*finance.Statement, error) {
			return nil, expectedErr
		},
		InvertStatementSignsFunc: func(ctx context.Context, id finance.StatementID) (*finance.Statement, []*finance.StatementLine, error) {
			return nil, nil, expectedErr
		},
		IngestStatementDocumentFunc: func(ctx context.Context, req *StatementDocumentRequest) (*IngestStatementResult, error) {
			return nil, expectedErr
		},
		AnalyzeStatementDocumentFunc: func(ctx context.Context, req *StatementDocumentRequest) (*StatementIngestionState, error) {
			return nil, expectedErr
		},
		IngestEmailFunc: func(ctx context.Context, spaceID string, integrationID string, sender string, subject string, body string) (*finance.InboxItem, error) {
			return nil, expectedErr
		},
		DiscardInboxItemFunc: func(ctx context.Context, id string) error {
			return expectedErr
		},
		UpdateInboxItemFunc: func(ctx context.Context, item *finance.InboxItem) (*finance.InboxItem, error) {
			return nil, expectedErr
		},
		ApproveInboxItemFunc: func(ctx context.Context, id string) (*finance.InboxItem, error) {
			return nil, expectedErr
		},
		GetTransactionSuggestionsFunc: func(ctx context.Context, req *IngestionRequest) (*SignalSuggestion, error) {
			return nil, expectedErr
		},
		ProcessSuggestionsFunc: func(ctx context.Context, spaceID string, req *agentapp.SuggestionRequest) (map[string]any, error) {
			return nil, expectedErr
		},
		ProcessSignalPipelineFunc: func(ctx context.Context, spaceID string, req *IngestionRequest) (*IngestionState, error) {
			return nil, expectedErr
		},
		GetSignalSuggestionsFunc: func(ctx context.Context, spaceID string, req *IngestionRequest) (*SignalSuggestion, error) {
			return nil, expectedErr
		},
	}

	logged := NewLoggingCoordinator(coordMock, logger)

	if _, err := logged.ConfigureFinance(ctx, &ConfigureFinanceRequest{}); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := logged.GetFinanceSettings(ctx); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := logged.ListCurrencies(ctx); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := logged.CreateAccount(ctx, &CreateAccountRequest{}); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := logged.UpdateAccount(ctx, &UpdateAccountRequest{}); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if err := logged.DeleteAccount(ctx, "acc_1", finance.DeleteOptions{}); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := logged.AdjustAccountBalance(ctx, "acc_1", 100, "2026-09-17", "note"); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := logged.CreateBorrowing(ctx, &CreateBorrowingRequest{}); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := logged.UpdateBorrowing(ctx, &UpdateBorrowingRequest{}); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if err := logged.DeleteBorrowing(ctx, "bor_1"); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := logged.AdjustBorrowingBalance(ctx, &AdjustBorrowingBalanceRequest{}); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := logged.LogBorrowingTransaction(ctx, &LogBorrowingTransactionRequest{}); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := logged.UpdateBorrowingTransaction(ctx, &UpdateBorrowingTransactionRequest{}); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if err := logged.DeleteBorrowingTransaction(ctx, &DeleteBorrowingTransactionRequest{}); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := logged.CreateBudget(ctx, &CreateBudgetRequest{}); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := logged.UpdateBudget(ctx, &UpdateBudgetRequest{}); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := logged.GetBudget(ctx, "bgt_1"); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if err := logged.DeleteBudget(ctx, &DeleteBudgetRequest{}); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := logged.GetInsights(ctx, &GetInsightsRequest{}); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := logged.CreateInstitution(ctx, &finance.Institution{}); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := logged.UpdateInstitution(ctx, &finance.Institution{}, nil); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if err := logged.DeleteInstitution(ctx, "inst_1", finance.DeleteOptions{}); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := logged.ResolveInstitution(ctx, "Chase"); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := logged.CreateExchangeRate(ctx, &CreateExchangeRateRequest{}); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := logged.GetExchangeRate(ctx, &GetExchangeRateRequest{}); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := logged.UpdateExchangeRate(ctx, &UpdateExchangeRateRequest{}); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, _, err := logged.ListExchangeRates(ctx, &ListExchangeRatesRequest{}); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if err := logged.DeleteExchangeRate(ctx, &DeleteExchangeRateRequest{}); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := logged.CreateRecurringTransaction(ctx, &CreateRecurringTransactionRequest{}); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := logged.UpdateRecurringTransaction(ctx, &UpdateRecurringTransactionRequest{}); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if err := logged.DeleteRecurringTransaction(ctx, "rec_1", finance.DeleteOptions{}); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := logged.ConfirmScheduledTransaction(ctx, &ConfirmScheduledTransactionRequest{}); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := logged.MatchScheduledTransaction(ctx, &MatchScheduledTransactionRequest{}); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := logged.SkipScheduledTransaction(ctx, "sched_1"); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := logged.GetScheduledTransaction(ctx, "sched_1"); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if err := logged.GenerateScheduledTransactions(ctx); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := logged.CreateExpense(ctx, &CreateExpenseRequest{}); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := logged.CreateIncome(ctx, &CreateIncomeRequest{}); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := logged.UpdateExpense(ctx, &UpdateExpenseRequest{}); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := logged.UpdateIncome(ctx, &UpdateIncomeRequest{}); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if err := logged.DeleteTransaction(ctx, "tx_1"); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := logged.ListTransactionEvents(ctx, &ListTransactionEventsRequest{}); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := logged.CreateTransfer(ctx, &CreateTransferRequest{}); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := logged.GetTransfer(ctx, "trf_1"); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if err := logged.DeleteTransfer(ctx, "trf_1"); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, _, err := logged.ListTransfers(ctx, &ListTransfersRequest{}); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := logged.ImportStatement(ctx, "acc_1", &finance.Statement{}); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if err := logged.DeleteStatement(ctx, "stmt_1", finance.DeleteOptions{}); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := logged.UpdateStatement(ctx, &finance.Statement{}, nil); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := logged.UpdateStatementLine(ctx, &finance.StatementLine{}, nil); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := logged.CompleteStatement(ctx, "stmt_1"); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, _, err := logged.InvertStatementSigns(ctx, "stmt_1"); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := logged.IngestStatementDocument(ctx, &StatementDocumentRequest{}); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := logged.AnalyzeStatementDocument(ctx, &StatementDocumentRequest{}); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := logged.IngestEmail(ctx, "spc_1", "int_1", "sender", "subject", "body"); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if err := logged.DiscardInboxItem(ctx, "inbox_1"); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := logged.UpdateInboxItem(ctx, &finance.InboxItem{}); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := logged.ApproveInboxItem(ctx, "inbox_1"); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := logged.GetTransactionSuggestions(ctx, &IngestionRequest{}); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := logged.ProcessSuggestions(ctx, "spc_1", &agentapp.SuggestionRequest{}); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := logged.ProcessSignalPipeline(ctx, "spc_1", &IngestionRequest{}); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := logged.GetSignalSuggestions(ctx, "spc_1", &IngestionRequest{}); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
}
