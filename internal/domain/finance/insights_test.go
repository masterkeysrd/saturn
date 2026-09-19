package finance_test

import (
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
)

func TestParseGranularity(t *testing.T) {
	tests := []struct {
		input   string
		want    finance.Granularity
		wantErr bool
	}{
		{"daily", finance.GranularityDaily, false},
		{"day", finance.GranularityDaily, false},
		{"d", finance.GranularityDaily, false},
		{"DAILY", finance.GranularityDaily, false},
		{"weekly", finance.GranularityWeekly, false},
		{"week", finance.GranularityWeekly, false},
		{"w", finance.GranularityWeekly, false},
		{"monthly", finance.GranularityMonthly, false},
		{"month", finance.GranularityMonthly, false},
		{"m", finance.GranularityMonthly, false},
		{"", finance.GranularityMonthly, false},
		{"yearly", finance.GranularityYearly, false},
		{"year", finance.GranularityYearly, false},
		{"y", finance.GranularityYearly, false},
		{"invalid", "", true},
		{"hourly", "", true},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got, err := finance.ParseGranularity(tt.input)
			if (err != nil) != tt.wantErr {
				t.Errorf("ParseGranularity(%q) error = %v, wantErr %v", tt.input, err, tt.wantErr)
			}
			if got != tt.want {
				t.Errorf("ParseGranularity(%q) = %v, want %v", tt.input, got, tt.want)
			}
		})
	}
}

func TestGranularity_FormatLabel(t *testing.T) {
	tm := time.Date(2026, 7, 27, 10, 0, 0, 0, time.UTC)

	tests := []struct {
		name string
		g    finance.Granularity
		want string
	}{
		{"daily", finance.GranularityDaily, "27 Jul"},
		{"weekly", finance.GranularityWeekly, "Wk 31"},
		{"monthly", finance.GranularityMonthly, "Jul 26"},
		{"yearly", finance.GranularityYearly, "2026"},
		{"fallback", finance.Granularity("unknown"), "Jul 26"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := tt.g.FormatLabel(tm)
			if got != tt.want {
				t.Errorf("FormatLabel() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestGetSpentInsightsRequest_ResolveRange(t *testing.T) {
	validSpace := finance.SpaceID("spc_2dE1V8ZqWz4eS2N9yX3bL1mK7pO")
	now := time.Now().UTC()

	tests := []struct {
		name       string
		req        finance.GetSpentInsightsRequest
		wantErr    bool
		wantGran   finance.Granularity
		checkDates bool
	}{
		{
			name: "invalid space ID",
			req: finance.GetSpentInsightsRequest{
				SpaceID: "invalid_space",
			},
			wantErr: true,
		},
		{
			name: "invalid granularity",
			req: finance.GetSpentInsightsRequest{
				SpaceID:     validSpace,
				Granularity: "invalid_gran",
			},
			wantErr: true,
		},
		{
			name: "default range daily",
			req: finance.GetSpentInsightsRequest{
				SpaceID:     validSpace,
				Granularity: "daily",
			},
			wantErr:    false,
			wantGran:   finance.GranularityDaily,
			checkDates: true,
		},
		{
			name: "default range weekly",
			req: finance.GetSpentInsightsRequest{
				SpaceID:     validSpace,
				Granularity: "weekly",
			},
			wantErr:    false,
			wantGran:   finance.GranularityWeekly,
			checkDates: true,
		},
		{
			name: "default range monthly",
			req: finance.GetSpentInsightsRequest{
				SpaceID:     validSpace,
				Granularity: "monthly",
			},
			wantErr:    false,
			wantGran:   finance.GranularityMonthly,
			checkDates: true,
		},
		{
			name: "default range yearly",
			req: finance.GetSpentInsightsRequest{
				SpaceID:     validSpace,
				Granularity: "yearly",
			},
			wantErr:    false,
			wantGran:   finance.GranularityYearly,
			checkDates: true,
		},
		{
			name: "explicit dates",
			req: finance.GetSpentInsightsRequest{
				SpaceID:     validSpace,
				Granularity: "monthly",
				StartDate:   now.AddDate(0, -2, 0),
				EndDate:     now,
			},
			wantErr:    false,
			wantGran:   finance.GranularityMonthly,
			checkDates: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			g, start, end, err := tt.req.ResolveRange()
			if (err != nil) != tt.wantErr {
				t.Fatalf("ResolveRange() error = %v, wantErr %v", err, tt.wantErr)
			}
			if tt.wantErr {
				return
			}
			if g != tt.wantGran {
				t.Errorf("ResolveRange() granularity = %v, want %v", g, tt.wantGran)
			}
			if start.IsZero() || end.IsZero() {
				t.Error("expected non-zero start and end times")
			}
			if start.After(end) {
				t.Errorf("start %v is after end %v", start, end)
			}
		})
	}
}

func TestBuildSpentInsights(t *testing.T) {
	start := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	end := time.Date(2026, 1, 31, 0, 0, 0, 0, time.UTC)
	interval1 := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	interval2 := time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC)

	trendRows := []*finance.SpentTrend{
		{
			IntervalStart:  interval1,
			BudgetID:       "bgt_1",
			BudgetName:     "Groceries",
			BudgetColor:    "green",
			BudgetCurrency: "USD",
			TxnCount:       2,
			SpentInBase:    5000,
			SpentInLocal:   5000,
		},
		{
			IntervalStart:  interval1,
			BudgetID:       "",
			BudgetName:     "",
			BudgetColor:    "",
			BudgetCurrency: "",
			TxnCount:       1,
			SpentInBase:    2000,
			SpentInLocal:   2000,
		},
		{
			IntervalStart:  interval2,
			BudgetID:       "bgt_1",
			BudgetName:     "Groceries",
			BudgetColor:    "green",
			BudgetCurrency: "USD",
			TxnCount:       1,
			SpentInBase:    3000,
			SpentInLocal:   3000,
		},
	}

	distRows := []*finance.BudgetDistribution{
		{
			BudgetID:             "bgt_1",
			BudgetName:           "Groceries",
			BudgetColor:          "green",
			BudgetIcon:           "cart",
			BudgetLimit:          20000,
			BudgetCurrency:       "USD",
			SpentInBase:          8000,
			SpentInLocalMatching: 8000,
			ExchangeRateToBase:   1.0,
		},
		{
			BudgetID:             "bgt_2",
			BudgetName:           "ZeroLimit",
			BudgetColor:          "blue",
			BudgetIcon:           "circle",
			BudgetLimit:          0,
			BudgetCurrency:       "USD",
			SpentInBase:          0,
			SpentInLocalMatching: 0,
			ExchangeRateToBase:   1.0,
		},
	}

	topRows := []*finance.TopExpense{
		{
			TransactionID:   "txn_1",
			Description:     "Whole Foods",
			Amount:          5000,
			Currency:        "USD",
			AmountInBase:    5000,
			BudgetName:      "Groceries",
			TransactionDate: interval1,
			EffectiveDate:   interval1,
		},
	}

	insights := finance.BuildSpentInsights(
		finance.GranularityDaily,
		start,
		end,
		"USD",
		trendRows,
		distRows,
		topRows,
	)

	if insights == nil {
		t.Fatal("expected non-nil SpentInsights")
	}

	// 8000 (dist) + 2000 (unbudgeted) = 10000
	if insights.TotalSpent != 10000 {
		t.Errorf("TotalSpent = %d, want 10000", insights.TotalSpent)
	}
	if insights.TotalLimit != 20000 {
		t.Errorf("TotalLimit = %d, want 20000", insights.TotalLimit)
	}
	if insights.RemainingBudget != 10000 {
		t.Errorf("RemainingBudget = %d, want 10000", insights.RemainingBudget)
	}
	if insights.BurnRate <= 0 {
		t.Errorf("BurnRate = %f, want > 0", insights.BurnRate)
	}
	if len(insights.Trend) != 2 {
		t.Errorf("len(Trend) = %d, want 2", len(insights.Trend))
	}
	// Check distribution length: 2 budgets + 1 unbudgeted = 3
	if len(insights.Distributions) != 3 {
		t.Errorf("len(Distributions) = %d, want 3", len(insights.Distributions))
	}
	if len(insights.TopExpenses) != 1 {
		t.Errorf("len(TopExpenses) = %d, want 1", len(insights.TopExpenses))
	}
}

func TestBuildIncomeInsights(t *testing.T) {
	start := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	end := time.Date(2026, 1, 31, 0, 0, 0, 0, time.UTC)
	interval := time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC)

	trendRows := []*finance.IncomeTrend{
		{
			IntervalStart: interval,
			AccountID:     "acc_1",
			AccountName:   "Checking",
			TxnCount:      2,
			IncomeInBase:  100000,
			IncomeInLocal: 100000,
			Currency:      "USD",
		},
	}

	sourceRows := []*finance.IncomeSourceRow{
		{
			SourceName:   "Salary",
			AmountInBase: 100000,
		},
	}

	topRows := []*finance.TopIncome{
		{
			TransactionID:   "txn_inc_1",
			Description:     "Monthly Salary",
			Amount:          100000,
			Currency:        "USD",
			AmountInBase:    100000,
			TransactionDate: interval,
			EffectiveDate:   interval,
		},
	}

	insights := finance.BuildIncomeInsights(
		finance.GranularityMonthly,
		start,
		end,
		"USD",
		trendRows,
		sourceRows,
		topRows,
	)

	if insights == nil {
		t.Fatal("expected non-nil IncomeInsights")
	}
	if insights.TotalIncome != 100000 {
		t.Errorf("TotalIncome = %d, want 100000", insights.TotalIncome)
	}
	if len(insights.Trend) != 1 {
		t.Errorf("len(Trend) = %d, want 1", len(insights.Trend))
	}
	if len(insights.Distributions) != 1 {
		t.Errorf("len(Distributions) = %d, want 1", len(insights.Distributions))
	}
	if insights.Distributions[0].Percentage != 100.0 {
		t.Errorf("Percentage = %f, want 100.0", insights.Distributions[0].Percentage)
	}
	if len(insights.TopIncomes) != 1 {
		t.Errorf("len(TopIncomes) = %d, want 1", len(insights.TopIncomes))
	}
}
