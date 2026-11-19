package finance

import (
	"context"
	"testing"
	"time"

	"google.golang.org/protobuf/types/known/timestamppb"

	financev1 "github.com/masterkeysrd/saturn/apis/saturn/finance/v1"
	financeaggregator "github.com/masterkeysrd/saturn/internal/aggregator/finance"
	financeapp "github.com/masterkeysrd/saturn/internal/application/finance"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
)

func TestProtoIntervalConversion(t *testing.T) {
	tests := []struct {
		name          string
		domainInter   finance.RecurrenceInterval
		expectedProto financev1.Budget_RecurrenceInterval
	}{
		{
			name:          "Weekly",
			domainInter:   finance.IntervalWeekly,
			expectedProto: financev1.Budget_WEEKLY,
		},
		{
			name:          "Monthly",
			domainInter:   finance.IntervalMonthly,
			expectedProto: financev1.Budget_MONTHLY,
		},
		{
			name:          "Yearly",
			domainInter:   finance.IntervalYearly,
			expectedProto: financev1.Budget_YEARLY,
		},
		{
			name:          "OneTime",
			domainInter:   finance.IntervalOneTime,
			expectedProto: financev1.Budget_ONE_TIME,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			protoVal := toProtoInterval(tt.domainInter)
			if protoVal != tt.expectedProto {
				t.Errorf("toProtoInterval(%s) = %v, want %v", tt.domainInter, protoVal, tt.expectedProto)
			}

			domainVal := toDomainInterval(tt.expectedProto)
			if domainVal != tt.domainInter {
				t.Errorf("toDomainInterval(%v) = %s, want %s", tt.expectedProto, domainVal, tt.domainInter)
			}
		})
	}
}

func TestToProtoSettings(t *testing.T) {
	t.Run("nil entry returns nil", func(t *testing.T) {
		if toProtoSettings(nil) != nil {
			t.Error("expected nil for nil entry")
		}
	})

	t.Run("valid settings entry maps fields correctly", func(t *testing.T) {
		entry := finance.SettingsKey.For("spc_test").Entry(finance.Settings{
			BaseCurrency:         "USD",
			FiscalYearStartMonth: 10,
		})

		proto := toProtoSettings(entry)
		if proto == nil {
			t.Fatal("expected non-nil proto settings")
		}
		if proto.SpaceId != "spc_test" {
			t.Errorf("SpaceId = %s, want spc_test", proto.SpaceId)
		}
		if proto.BaseCurrency != "USD" {
			t.Errorf("BaseCurrency = %s, want USD", proto.BaseCurrency)
		}
		if proto.FiscalYearStartMonth != 10 {
			t.Errorf("FiscalYearStartMonth = %d, want 10", proto.FiscalYearStartMonth)
		}
	})

	t.Run("defaults to month 1 when FiscalYearStartMonth is 0", func(t *testing.T) {
		entry := finance.SettingsKey.For("spc_test").Entry(finance.Settings{
			BaseCurrency:         "EUR",
			FiscalYearStartMonth: 0,
		})

		proto := toProtoSettings(entry)
		if proto.FiscalYearStartMonth != 1 {
			t.Errorf("FiscalYearStartMonth = %d, want 1 (default)", proto.FiscalYearStartMonth)
		}
	})
}

type stubCoordinator struct {
	financeapp.Coordinator
	resolveContextFn func(ctx context.Context) (finance.Context, error)
	stageInboxItemFn func(ctx context.Context, req *finance.StageInboxItem) (*finance.InboxItem, error)
}

func (s *stubCoordinator) ResolveContext(ctx context.Context) (finance.Context, error) {
	if s.resolveContextFn != nil {
		return s.resolveContextFn(ctx)
	}
	return finance.NewContext("spc_test", "usr_test", time.UTC, "USD"), nil
}

func (s *stubCoordinator) StageInboxItem(ctx context.Context, req *finance.StageInboxItem) (*finance.InboxItem, error) {
	if s.stageInboxItemFn != nil {
		return s.stageInboxItemFn(ctx, req)
	}
	return &finance.InboxItem{}, nil
}

type stubAggregatorFinanceService struct {
	financeaggregator.FinanceService
	listTransactionsFn func(ctx context.Context, rCtx finance.Context, filter *finance.TransactionFilter) (*paging.Page[*finance.Transaction], error)
}

func (s *stubAggregatorFinanceService) ListTransactions(ctx context.Context, rCtx finance.Context, filter *finance.TransactionFilter) (*paging.Page[*finance.Transaction], error) {
	if s.listTransactionsFn != nil {
		return s.listTransactionsFn(ctx, rCtx, filter)
	}
	return &paging.Page[*finance.Transaction]{}, nil
}

func TestHandlerListTransactionsDateFilter(t *testing.T) {
	start := time.Date(2026, 4, 1, 0, 0, 0, 0, time.UTC)
	end := time.Date(2026, 4, 30, 23, 59, 59, 999000000, time.UTC)

	tests := []struct {
		name          string
		req           *financev1.ListTransactionsRequest
		wantErrKind   errors.Kind
		wantAggCalled bool
		wantStartDate *time.Time
		wantEndDate   *time.Time
	}{
		{
			name:          "nil start_date and end_date leaves filter bounds nil",
			req:           &financev1.ListTransactionsRequest{},
			wantAggCalled: true,
			wantStartDate: nil,
			wantEndDate:   nil,
		},
		{
			name: "valid start_date and end_date propagate exact timestamps",
			req: &financev1.ListTransactionsRequest{
				StartDate: timestamppb.New(start),
				EndDate:   timestamppb.New(end),
			},
			wantAggCalled: true,
			wantStartDate: &start,
			wantEndDate:   &end,
		},
		{
			name: "start_date only propagates start boundary",
			req: &financev1.ListTransactionsRequest{
				StartDate: timestamppb.New(start),
			},
			wantAggCalled: true,
			wantStartDate: &start,
			wantEndDate:   nil,
		},
		{
			name: "end_date only propagates end boundary",
			req: &financev1.ListTransactionsRequest{
				EndDate: timestamppb.New(end),
			},
			wantAggCalled: true,
			wantStartDate: nil,
			wantEndDate:   &end,
		},
		{
			name: "equal start_date and end_date is valid",
			req: &financev1.ListTransactionsRequest{
				StartDate: timestamppb.New(start),
				EndDate:   timestamppb.New(start),
			},
			wantAggCalled: true,
			wantStartDate: &start,
			wantEndDate:   &start,
		},
		{
			name: "start_date after end_date returns invalid error without calling aggregator",
			req: &financev1.ListTransactionsRequest{
				StartDate: timestamppb.New(end),
				EndDate:   timestamppb.New(start),
			},
			wantErrKind:   errors.Invalid,
			wantAggCalled: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var aggCalled bool
			var capturedFilter finance.TransactionFilter

			coord := &stubCoordinator{}
			aggSvc := financeaggregator.NewService(&stubAggregatorFinanceService{
				listTransactionsFn: func(_ context.Context, _ finance.Context, filter *finance.TransactionFilter) (*paging.Page[*finance.Transaction], error) {
					aggCalled = true
					if filter != nil {
						capturedFilter = *filter
					}
					return &paging.Page[*finance.Transaction]{Items: []*finance.Transaction{}}, nil
				},
			})

			handler := NewHandler(coord, aggSvc)
			_, err := handler.ListTransactions(t.Context(), tt.req)

			if tt.wantErrKind != 0 {
				if !errors.Is(err, tt.wantErrKind) {
					t.Fatalf("ListTransactions() error = %v, want kind %v", err, tt.wantErrKind)
				}
			} else if err != nil {
				t.Fatalf("ListTransactions() unexpected error: %v", err)
			}

			if aggCalled != tt.wantAggCalled {
				t.Fatalf("Aggregator called = %v, want %v", aggCalled, tt.wantAggCalled)
			}

			if !tt.wantAggCalled {
				return
			}

			if tt.wantStartDate == nil {
				if capturedFilter.StartDate != nil {
					t.Errorf("StartDate = %v, want nil", capturedFilter.StartDate)
				}
			} else if capturedFilter.StartDate == nil || !capturedFilter.StartDate.Equal(*tt.wantStartDate) {
				t.Errorf("StartDate = %v, want %v", capturedFilter.StartDate, *tt.wantStartDate)
			}

			if tt.wantEndDate == nil {
				if capturedFilter.EndDate != nil {
					t.Errorf("EndDate = %v, want nil", capturedFilter.EndDate)
				}
			} else if capturedFilter.EndDate == nil || !capturedFilter.EndDate.Equal(*tt.wantEndDate) {
				t.Errorf("EndDate = %v, want %v", capturedFilter.EndDate, *tt.wantEndDate)
			}
		})
	}
}

func TestHandlerCreateInboxItem(t *testing.T) {
	nyLoc, err := time.LoadLocation("America/New_York")
	if err != nil {
		t.Fatalf("failed to load America/New_York location: %v", err)
	}
	// 2026-05-15T02:00:00Z is 2026-05-14 22:00 in America/New_York
	txTimeUTC := time.Date(2026, 5, 15, 2, 0, 0, 0, time.UTC)

	tests := []struct {
		name           string
		req            *financev1.CreateInboxItemRequest
		loc            *time.Location
		resolveErr     error
		stageErr       error
		wantErrKind    errors.Kind
		wantCoordCall  bool
		wantDocType    finance.InboxItemDocType
		wantVendor     string
		wantAmount     int64
		wantCurrency   string
		wantDate       string
		wantAccountID  string
		wantBudgetID   string
		wantIdempKey   string
		wantRawPayload string
		wantSourceMeta string
	}{
		{
			name:          "nil inbox_item returns invalid error",
			req:           &financev1.CreateInboxItemRequest{},
			wantErrKind:   errors.Invalid,
			wantCoordCall: false,
		},
		{
			name: "empty vendor_name returns invalid error",
			req: &financev1.CreateInboxItemRequest{
				InboxItem: &financev1.InboxItem{
					VendorName: "   ",
					Amount:     1500,
					Currency:   "USD",
				},
			},
			wantErrKind:   errors.Invalid,
			wantCoordCall: false,
		},
		{
			name: "non-positive amount returns invalid error",
			req: &financev1.CreateInboxItemRequest{
				InboxItem: &financev1.InboxItem{
					VendorName: "Acme Corp",
					Amount:     0,
					Currency:   "USD",
				},
			},
			wantErrKind:   errors.Invalid,
			wantCoordCall: false,
		},
		{
			name: "invalid currency returns invalid error",
			req: &financev1.CreateInboxItemRequest{
				InboxItem: &financev1.InboxItem{
					VendorName: "Acme Corp",
					Amount:     4250,
					Currency:   "INVALID",
				},
			},
			wantErrKind:   errors.Invalid,
			wantCoordCall: false,
		},
		{
			name: "resolve context failure propagates error",
			req: &financev1.CreateInboxItemRequest{
				InboxItem: &financev1.InboxItem{
					VendorName: "Acme Corp",
					Amount:     4250,
					Currency:   "USD",
				},
			},
			resolveErr:    errors.E(errors.Permission, "unauthorized"),
			wantErrKind:   errors.Permission,
			wantCoordCall: false,
		},
		{
			name: "stage error propagates error",
			req: &financev1.CreateInboxItemRequest{
				InboxItem: &financev1.InboxItem{
					VendorName: "Acme Corp",
					Amount:     4250,
					Currency:   "USD",
					DocType:    financev1.InboxItem_RECEIPT,
				},
			},
			stageErr:      errors.E(errors.Internal, "db unavailable"),
			wantErrKind:   errors.Internal,
			wantCoordCall: true,
			wantDocType:   finance.InboxItemDocReceipt,
			wantVendor:    "Acme Corp",
			wantAmount:    4250,
			wantCurrency:  "USD",
		},
		{
			name: "valid receipt maps all fields and formats date in workspace timezone",
			req: &financev1.CreateInboxItemRequest{
				InboxItem: &financev1.InboxItem{
					DocType:         financev1.InboxItem_RECEIPT,
					VendorName:      "  Stripe Billing  ",
					Amount:          4250,
					Currency:        "usd",
					TransactionDate: timestamppb.New(txTimeUTC),
					AccountId:       "acc_123",
					BudgetId:        "bud_456",
					Metadata: map[string]string{
						"source":          "mail",
						"mail_thread_id":  "thr_1",
						"mail_message_id": "msg_1",
					},
				},
				IdempotencyKey: new("mail_message:msg_1"),
				RawPayload:     new("Receipt from Stripe for $42.50"),
			},
			loc:            nyLoc,
			wantCoordCall:  true,
			wantDocType:    finance.InboxItemDocReceipt,
			wantVendor:     "Stripe Billing",
			wantAmount:     4250,
			wantCurrency:   "USD",
			wantDate:       "2026-05-14",
			wantAccountID:  "acc_123",
			wantBudgetID:   "bud_456",
			wantIdempKey:   "mail_message:msg_1",
			wantRawPayload: "Receipt from Stripe for $42.50",
			wantSourceMeta: "mail",
		},
		{
			name: "valid invoice defaults transaction_date to today in workspace timezone",
			req: &financev1.CreateInboxItemRequest{
				InboxItem: &financev1.InboxItem{
					DocType:    financev1.InboxItem_INVOICE,
					VendorName: "AWS",
					Amount:     12000,
					Currency:   "EUR",
				},
			},
			loc:           nyLoc,
			wantCoordCall: true,
			wantDocType:   finance.InboxItemDocInvoice,
			wantVendor:    "AWS",
			wantAmount:    12000,
			wantCurrency:  "EUR",
			wantDate:      time.Now().In(nyLoc).Format("2006-01-02"),
		},
		{
			name: "bank notification maps doc type",
			req: &financev1.CreateInboxItemRequest{
				InboxItem: &financev1.InboxItem{
					DocType:    financev1.InboxItem_BANK_NOTIFICATION,
					VendorName: "Chase Alert",
					Amount:     999,
					Currency:   "USD",
				},
			},
			wantCoordCall: true,
			wantDocType:   finance.InboxItemDocBankNotification,
			wantVendor:    "Chase Alert",
			wantAmount:    999,
			wantCurrency:  "USD",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var called bool
			var captured *finance.StageInboxItem

			loc := tt.loc
			if loc == nil {
				loc = time.UTC
			}

			coord := &stubCoordinator{
				resolveContextFn: func(_ context.Context) (finance.Context, error) {
					if tt.resolveErr != nil {
						return nil, tt.resolveErr
					}
					return finance.NewContext("spc_test", "usr_test", loc, "USD"), nil
				},
				stageInboxItemFn: func(_ context.Context, req *finance.StageInboxItem) (*finance.InboxItem, error) {
					called = true
					captured = req
					if tt.stageErr != nil {
						return nil, tt.stageErr
					}
					return &finance.InboxItem{
						ID:              "ibx_created",
						Status:          finance.InboxItemPending,
						DocType:         req.DocType,
						Amount:          req.Amount,
						Currency:        req.Currency,
						VendorName:      req.Vendor,
						TransactionDate: txTimeUTC,
						AccountID:       req.AccountID,
						BudgetID:        new(req.SuggestedBudget),
						RawPayload:      req.RawPayload,
						Metadata:        req.Metadata,
						CreateTime:      time.Now().UTC(),
					}, nil
				},
			}

			handler := NewHandler(coord, financeaggregator.NewService(&stubAggregatorFinanceService{}))
			resp, err := handler.CreateInboxItem(t.Context(), tt.req)

			if tt.wantErrKind != 0 {
				if !errors.Is(err, tt.wantErrKind) {
					t.Fatalf("CreateInboxItem() error = %v, want kind %v", err, tt.wantErrKind)
				}
			} else if err != nil {
				t.Fatalf("CreateInboxItem() unexpected error: %v", err)
			}

			if called != tt.wantCoordCall {
				t.Fatalf("StageInboxItem called = %v, want %v", called, tt.wantCoordCall)
			}

			if !tt.wantCoordCall || tt.wantErrKind != 0 {
				return
			}

			if resp == nil || resp.GetId() != "ibx_created" {
				t.Fatalf("resp = %v, want Id ibx_created", resp)
			}
			if captured.DocType != tt.wantDocType {
				t.Errorf("DocType = %v, want %v", captured.DocType, tt.wantDocType)
			}
			if captured.Vendor != tt.wantVendor {
				t.Errorf("Vendor = %q, want %q", captured.Vendor, tt.wantVendor)
			}
			if captured.Amount != tt.wantAmount {
				t.Errorf("Amount = %d, want %d", captured.Amount, tt.wantAmount)
			}
			if captured.Currency != tt.wantCurrency {
				t.Errorf("Currency = %q, want %q", captured.Currency, tt.wantCurrency)
			}
			if tt.wantDate != "" && captured.Date != tt.wantDate {
				t.Errorf("Date = %q, want %q", captured.Date, tt.wantDate)
			}
			if tt.wantAccountID != "" {
				if captured.AccountID == nil || *captured.AccountID != tt.wantAccountID {
					t.Errorf("AccountID = %v, want %q", captured.AccountID, tt.wantAccountID)
				}
			}
			if tt.wantBudgetID != "" && captured.SuggestedBudget != tt.wantBudgetID {
				t.Errorf("SuggestedBudget = %q, want %q", captured.SuggestedBudget, tt.wantBudgetID)
			}
			if tt.wantIdempKey != "" {
				if captured.IdempotencyKey == nil || *captured.IdempotencyKey != tt.wantIdempKey {
					t.Errorf("IdempotencyKey = %v, want %q", captured.IdempotencyKey, tt.wantIdempKey)
				}
			}
			if tt.wantRawPayload != "" && captured.RawPayload != tt.wantRawPayload {
				t.Errorf("RawPayload = %q, want %q", captured.RawPayload, tt.wantRawPayload)
			}
			if tt.wantSourceMeta != "" && captured.Metadata["source"] != tt.wantSourceMeta {
				t.Errorf("Metadata[source] = %v, want %q", captured.Metadata["source"], tt.wantSourceMeta)
			}
		})
	}
}
