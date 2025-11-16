package finance

import (
	"time"

	"github.com/masterkeysrd/saturn/internal/pkg/money"
	"github.com/masterkeysrd/saturn/internal/pkg/round"
)

type GetInsightsInput struct {
	StartDate time.Time
	EndState  time.Time
	Budgets   []BudgetID
}

func (in *GetInsightsInput) Validate() error {
	return nil
}

type Insights struct {
	Spending *SpendingInsights
}

type SpendingSeriesFilter struct {
	StartDate time.Time
	EndState  time.Time
	Budgets   []BudgetID
}

// SpendingInsights aggregates spending data across budgets and time periods.
type SpendingInsights struct {
	Summary  *SpendingSummary
	ByBudget []*SpendingBudgetSummary
	Trends   []*SpendingTrendPeriod

	budgetsIdx map[BudgetID]int
	trendsIdx  map[string]int
}

// NewSpendingInsights creates a new insights aggregator with preallocated capacity.
// Capacity is set to 25 based on typical usage patterns (can be adjusted).
func NewSpendingInsights() *SpendingInsights {
	return &SpendingInsights{
		Summary:  &SpendingSummary{},
		ByBudget: make([]*SpendingBudgetSummary, 0, 25),
		Trends:   make([]*SpendingTrendPeriod, 0, 25),

		budgetsIdx: make(map[BudgetID]int, 25),
		trendsIdx:  make(map[string]int, 25),
	}
}

// Process aggregates multiple spending series in a single pass.
func (si *SpendingInsights) Process(series []*SpendingSeries) {
	for _, serie := range series {
		si.Aggregate(serie)
	}
}

// Aggregate adds a single spending series to all relevant aggregates.
// This method maintains summary totals, budget-level data, and period trends.
func (si *SpendingInsights) Aggregate(series *SpendingSeries) {
	si.Summary.Aggregate(series)

	bgtIdx, ok := si.budgetsIdx[series.BudgetID]
	if !ok {
		si.ByBudget = append(si.ByBudget, &SpendingBudgetSummary{
			BudgetID:   series.BudgetID,
			BudgetName: series.BudgetName,
		})
		bgtIdx = len(si.ByBudget) - 1
		si.budgetsIdx[series.BudgetID] = bgtIdx
	}
	si.ByBudget[bgtIdx].Aggregate(series)

	trendIdx, ok := si.trendsIdx[series.Period]
	if !ok {
		si.Trends = append(si.Trends, &SpendingTrendPeriod{
			Period:      series.Period,
			PeriodStart: series.PeriodStart,
			PeriodEnd:   series.PeriodEnd,
			Budgets:     make([]*SpendingBudgetSummary, 0, 25),

			budgetsIdx: make(map[BudgetID]int, 25),
		})
		trendIdx = len(si.Trends) - 1
		si.trendsIdx[series.Period] = trendIdx

	}
	si.Trends[trendIdx].Aggregate(series)
}

type SpendingSummary struct {
	SpendingAggregate
}

type SpendingTrendPeriod struct {
	SpendingAggregate

	Period      string
	PeriodStart time.Time
	PeriodEnd   time.Time
	Budgets     []*SpendingBudgetSummary
	budgetsIdx  map[BudgetID]int
}

func (stp *SpendingTrendPeriod) Aggregate(series *SpendingSeries) {
	// Drops the serie if does not belongs to the period trend,
	// is kind of impossible to happen but is good to this
	// guard.
	if stp.Period != series.Period {
		return
	}

	stp.SpendingAggregate.Aggregate(series)

	idx, ok := stp.budgetsIdx[series.BudgetID]
	if !ok {
		stp.Budgets = append(stp.Budgets, &SpendingBudgetSummary{
			BudgetID:   series.BudgetID,
			BudgetName: series.BudgetName,
		})
		idx = len(stp.Budgets) - 1
		stp.budgetsIdx[series.BudgetID] = idx
	}

	stp.Budgets[idx].Aggregate(series)
}

type SpendingBudgetSummary struct {
	SpendingAggregate

	BudgetID   BudgetID
	BudgetName string
}

func (sbs *SpendingBudgetSummary) Aggregate(series *SpendingSeries) {
	// Only aggregate data if spends are the same, is impossible to happen
	// but is good have thi guard.
	if sbs.BudgetID == series.BudgetID {
		sbs.SpendingAggregate.Aggregate(series)
	}
}

// SpendingAggregate represents aggregated spending metrics.
// It accumulates data from multiple SpendingSeries rows.
type SpendingAggregate struct {
	Budgeted money.Money
	Spent    money.Money
	Count    int
}

// Aggregate adds a SpendingSeries row to this aggregate.
func (sa *SpendingAggregate) Aggregate(series *SpendingSeries) {
	if sa.Budgeted.Currency == "" {
		sa.Budgeted.Currency = series.Budgeted.Currency
		sa.Spent.Currency = series.Spent.Currency
	}

	sa.Budgeted.Cents += series.Budgeted.Cents
	sa.Spent.Cents += series.Spent.Cents
	sa.Count += series.Count
}

// Remaining calculates the unspent budget amount.
func (sa SpendingAggregate) Remaining() money.Money {
	return money.Money{
		Cents:    sa.Budgeted.Cents - sa.Spent.Cents,
		Currency: sa.Budgeted.Currency,
	}
}

// Usage calculates the spending percentage (0-100).
func (sa SpendingAggregate) Usage() float64 {
	if sa.Budgeted.Cents == 0 {
		return 0
	}
	ussage := (float64(sa.Spent.Cents) / float64(sa.Budgeted.Cents)) * 100
	return round.Round(ussage, 2)
}

// SpendingSeries represents spending data for a single budget within a specific
// time period.
type SpendingSeries struct {
	BudgetID    BudgetID
	BudgetName  string
	Period      string
	PeriodStart time.Time
	PeriodEnd   time.Time
	Budgeted    money.Money
	Spent       money.Money
	Count       int
}
