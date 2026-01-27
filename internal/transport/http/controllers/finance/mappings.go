package financehttp

import (
	"github.com/masterkeysrd/saturn/api"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
)

func FinanceInsightsToAPI(insights *finance.Insights) *api.FinanceInsights {
	if insights == nil {
		return nil
	}

	summary := spendingSummaryToAPI(insights.Spending.Summary)
	byBudget := budgetSummariesToAPI(insights.Spending.ByBudget)
	trends := trendPeriodsToAPI(insights.Spending.Trends)

	return &api.FinanceInsights{
		Spending: api.SpendingInsights{
			Summary:  *summary,
			ByBudget: byBudget,
			Trends:   trends,
		},
	}
}

func spendingSummaryToAPI(summary *finance.SpendingSummary) *api.SpendingSummary {
	if summary == nil {
		return nil
	}

	return &api.SpendingSummary{
		Budgeted:  api.APIMoney(summary.Budgeted),
		Spent:     api.APIMoney(summary.Spent),
		Remaining: api.APIMoney(summary.Remaining()),
		Usage:     summary.Usage(),
		Count:     int32(summary.Count),
	}
}

func budgetSummariesToAPI(summaries []*finance.SpendingBudgetSummary) []api.SpendingBudgetSummary {
	if summaries == nil {
		return nil
	}

	result := make([]api.SpendingBudgetSummary, len(summaries))
	for i, s := range summaries {
		result[i] = api.SpendingBudgetSummary{
			BudgetId:       string(s.BudgetID),
			BudgetName:     s.BudgetName,
			BudgetColor:    s.BudgetColor.String(),
			BudgetIconName: s.BudgetIconName.String(),
			Budgeted:       api.APIMoney(s.Budgeted),
			Spent:          api.APIMoney(s.Spent),
			Remaining:      api.APIMoney(s.Remaining()),
			Usage:          s.Usage(),
			Count:          int32(s.Count),
		}
	}

	return result
}

func trendPeriodsToAPI(trends []*finance.SpendingTrendPeriod) []api.SpendingTrendPeriod {
	if trends == nil {
		return nil
	}

	result := make([]api.SpendingTrendPeriod, len(trends))
	for i, t := range trends {
		result[i] = api.SpendingTrendPeriod{
			Period:      t.Period,
			PeriodStart: t.PeriodStart,
			PeriodEnd:   t.PeriodEnd,
			Budgeted:    api.APIMoney(t.Budgeted),
			Spent:       api.APIMoney(t.Spent),
			Remaining:   api.APIMoney(t.Remaining()),
			Usage:       t.Usage(),
			Count:       int32(t.Count),
			Budgets:     budgetSummariesToAPI(t.Budgets),
		}
	}

	return result
}
