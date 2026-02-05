package finance

import (
	"context"
	"time"

	"github.com/masterkeysrd/saturn/internal/foundation/space"
	"github.com/masterkeysrd/saturn/internal/pkg/money"
	"github.com/masterkeysrd/saturn/internal/pkg/round"
)

type InsightsStore interface {
	GetSpendingTrends(context.Context, SpendingTrendPointCriteria) ([]*SpendingTrendSerie, error)
}

type GetInsightsInput struct {
	StartDate time.Time
	EndState  time.Time
}

func (in *GetInsightsInput) Validate() error {
	return nil
}

type Insights struct {
	Spending *SpendingInsights
}

type SpendingTrendPointCriteria struct {
	SpaceID   space.ID
	StartDate time.Time
	EndState  time.Time
}

// SpendingInsights aggregates spending data across budgets and time periods.
type SpendingInsights struct {
	Summary   *SpendingMetrics
	Breakdown []*SpendingBreakdown
	Trends    []*SpendingTrendPoint

	breakdownMap map[BudgetID]*SpendingBreakdown
	trendMap     map[string]*SpendingTrendPoint
}

func (si *SpendingInsights) Aggregate(series []*SpendingTrendSerie) {
	if si.Summary == nil {
		si.Summary = &SpendingMetrics{}
	}

	for _, s := range series {
		si.Summary.Agregate(s)

		if si.breakdownMap == nil {
			si.breakdownMap = make(map[BudgetID]*SpendingBreakdown)
		}

		breakdown, exists := si.breakdownMap[s.BudgetID]
		if !exists {
			breakdown = &SpendingBreakdown{
				BudgetID: s.BudgetID,
			}
			si.breakdownMap[s.BudgetID] = breakdown
			si.Breakdown = append(si.Breakdown, breakdown)
		}
		breakdown.Agregate(s)

		if si.trendMap == nil {
			si.trendMap = make(map[string]*SpendingTrendPoint)
		}

		trendPoint, exists := si.trendMap[s.Period]
		if !exists {
			trendPoint = &SpendingTrendPoint{
				Period: s.Period,
			}
			si.trendMap[s.Period] = trendPoint
			si.Trends = append(si.Trends, trendPoint)
		}
		trendPoint.Agregate(s)
	}
}

type SpendingBreakdown struct {
	BudgetID   BudgetID
	BudgetName string
	Metrics    *SpendingMetrics
}

func (sb *SpendingBreakdown) Agregate(point *SpendingTrendSerie) {
	if sb == nil || point == nil {
		return
	}

	if point.BudgetID != sb.BudgetID {
		return
	}

	if sb.Metrics == nil {
		sb.Metrics = &SpendingMetrics{}
	}

	sb.Metrics.Agregate(point)
}

type SpendingTrendPoint struct {
	Period  string
	Totals  *SpendingMetrics
	Budgets []*SpendingBreakdown

	budgetMap map[BudgetID]*SpendingBreakdown
}

func (stp *SpendingTrendPoint) Agregate(point *SpendingTrendSerie) {
	if stp == nil || point == nil {
		return
	}

	if stp.Totals == nil {
		stp.Totals = &SpendingMetrics{}
	}
	stp.Totals.Agregate(point)

	if stp.budgetMap == nil {
		stp.budgetMap = make(map[BudgetID]*SpendingBreakdown)
	}

	breakdown, exists := stp.budgetMap[point.BudgetID]
	if !exists {
		breakdown = &SpendingBreakdown{
			BudgetID: point.BudgetID,
		}
		stp.budgetMap[point.BudgetID] = breakdown
		stp.Budgets = append(stp.Budgets, breakdown)
	}
	breakdown.Agregate(point)
}

type SpendingMetrics struct {
	Budgeted money.Money
	Spent    money.Money
	TrxCount int64
}

func (sm *SpendingMetrics) Remaining() money.Money {
	if sm == nil {
		return money.Money{}
	}

	return money.Money{
		Cents:    sm.Budgeted.Cents.Sub(sm.Spent.Cents),
		Currency: sm.Budgeted.Currency,
	}
}

func (sm *SpendingMetrics) Overspent() money.Money {
	if sm == nil {
		return money.Money{}
	}

	overspentCents := sm.Spent.Cents.Sub(sm.Budgeted.Cents)
	if overspentCents.IsNegative() {
		return money.Money{
			Cents:    0,
			Currency: sm.Budgeted.Currency,
		}
	}

	return money.Money{
		Cents:    overspentCents,
		Currency: sm.Budgeted.Currency,
	}
}

func (sm *SpendingMetrics) Usage() float64 {
	if sm == nil {
		return 0
	}

	if sm.Spent.Cents.IsZero() || sm.Budgeted.Cents.IsZero() {
		return 0
	}
	usage := (sm.Spent.Cents.Float64() / sm.Budgeted.Cents.Float64()) * 100
	return round.Round(usage, 2)
}

func (sm *SpendingMetrics) Agregate(point *SpendingTrendSerie) {
	if sm == nil || point == nil {
		return
	}

	sm.Budgeted = money.Money{
		Cents:    sm.Budgeted.Cents.Add(point.BudgetedCents),
		Currency: sm.Budgeted.Currency,
	}
	sm.Spent = money.Money{
		Currency: sm.Spent.Currency,
		Cents:    sm.Spent.Cents.Add(point.SpentCents),
	}
	sm.TrxCount += point.TrxCount
}

type SpendingTrendSerie struct {
	BudgetID      BudgetID
	Period        string
	Currency      money.CurrencyCode
	BudgetedCents money.Cents
	SpentCents    money.Cents
	TrxCount      int64
}
