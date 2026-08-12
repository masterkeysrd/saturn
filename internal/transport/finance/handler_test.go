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
