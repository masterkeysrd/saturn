package finance_test

import (
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/pkg/money"
)

func TestSpendingInsights_Aggregate(t *testing.T) {
	tests := []struct {
		name   string
		series []*finance.SpendingSeries
		want   func(*testing.T, *finance.SpendingInsights)
	}{
		{
			name: "aggregates single budget single period",
			series: []*finance.SpendingSeries{
				{
					BudgetID:    "bdg_1",
					BudgetName:  "Groceries",
					Period:      "2025-11",
					PeriodStart: time.Date(2025, 11, 1, 0, 0, 0, 0, time.UTC),
					PeriodEnd:   time.Date(2025, 11, 30, 23, 59, 59, 0, time.UTC),
					Budgeted:    money.Money{Cents: 50000, Currency: "USD"},
					Spent:       money.Money{Cents: 32500, Currency: "USD"},
					Count:       12,
				},
			},
			want: func(t *testing.T, si *finance.SpendingInsights) {
				if len(si.ByBudget) != 1 {
					t.Errorf("expected 1 budget, got %d", len(si.ByBudget))
				}
				if len(si.Trends) != 1 {
					t.Errorf("expected 1 trend, got %d", len(si.Trends))
				}
				if si.Summary.Count != 12 {
					t.Errorf("expected count 12, got %d", si.Summary.Count)
				}
			},
		},
		{
			name: "aggregates multiple budgets same period",
			series: []*finance.SpendingSeries{
				{
					BudgetID: "bdg_1",
					Period:   "2025-11",
					Budgeted: money.Money{Cents: 50000, Currency: "USD"},
					Spent:    money.Money{Cents: 30000, Currency: "USD"},
					Count:    10,
				},
				{
					BudgetID: "bdg_2",
					Period:   "2025-11",
					Budgeted: money.Money{Cents: 40000, Currency: "USD"},
					Spent:    money.Money{Cents: 20000, Currency: "USD"},
					Count:    5,
				},
			},
			want: func(t *testing.T, si *finance.SpendingInsights) {
				if len(si.ByBudget) != 2 {
					t.Errorf("expected 2 budgets, got %d", len(si.ByBudget))
				}
				if si.Summary.Spent.Cents != 50000 {
					t.Errorf("expected total spent 50000, got %d", si.Summary.Spent.Cents)
				}
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			si := finance.NewSpendingInsights()
			si.Process(tt.series)
			tt.want(t, si)
		})
	}
}
