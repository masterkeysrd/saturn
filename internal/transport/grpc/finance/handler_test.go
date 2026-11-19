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
}

func (s *stubCoordinator) ResolveContext(ctx context.Context) (finance.Context, error) {
	if s.resolveContextFn != nil {
		return s.resolveContextFn(ctx)
	}
	return finance.NewContext("spc_test", "usr_test", time.UTC, "USD"), nil
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
