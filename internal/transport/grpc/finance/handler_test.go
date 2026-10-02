package finance

import (
	"testing"

	financev1 "github.com/masterkeysrd/saturn/apis/saturn/finance/v1"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
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
