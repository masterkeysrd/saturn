package financehttp

import (
	"github.com/masterkeysrd/saturn/api"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/foundation/appearance"
	"github.com/masterkeysrd/saturn/internal/pkg/money"
	"github.com/masterkeysrd/saturn/internal/pkg/ptr"
	"github.com/oapi-codegen/runtime/types"
)

func BudgetFromAPI(b *api.Budget) *finance.Budget {
	if b == nil {
		return nil
	}
	return &finance.Budget{
		ID:   finance.BudgetID(ptr.Value(b.Id)),
		Name: b.Name,
		Appearance: appearance.Appearance{
			Color: appearance.Color(b.Color),
			Icon:  appearance.Icon(b.IconName),
		},
		Amount: api.MoneyModel(b.Amount),
	}
}

func BudgetsToAPI(budgets []*finance.Budget) []api.Budget {
	resp := make([]api.Budget, 0, len(budgets))
	for _, budget := range budgets {
		if budget == nil {
			continue
		}

		resp = append(resp, *BudgetToAPI(budget))
	}

	return resp
}

func BudgetsItemsToAPI(budgets []*finance.BudgetItem) []api.BudgetItem {
	resp := make([]api.BudgetItem, 0, len(budgets))
	for _, budget := range budgets {
		if budget == nil {
			continue
		}

		resp = append(resp, *BudgetItemToAPI(budget))
	}

	return resp
}

func BudgetItemToAPI(b *finance.BudgetItem) *api.BudgetItem {
	if b == nil {
		return nil
	}
	return &api.BudgetItem{
		Id:               b.ID.String(),
		Name:             b.Name,
		Color:            b.Icon.String(),
		IconName:         b.Icon.String(),
		Amount:           api.APIMoney(b.Amount),
		BaseAmount:       ptr.Of(api.APIMoney(b.BaseAmount)),
		Spent:            api.APIMoney(b.Spent),
		BaseSpent:        ptr.Of(api.APIMoney(b.BaseSpent)),
		Percentage:       ptr.Of(b.Usage()),
		PeriodStartDate:  &types.Date{Time: b.PeriodStartDate},
		PeriodEndDate:    &types.Date{Time: b.PeriodEndDate},
		TransactionCount: ptr.Of(b.TransactionCount),
	}
}

func BudgetToAPI(b *finance.Budget) *api.Budget {
	if b == nil {
		return nil
	}
	return &api.Budget{
		Id:       ptr.Of(b.ID.String()),
		Name:     b.Name,
		Color:    b.Color.String(),
		IconName: b.Icon.String(),
		Amount:   api.APIMoney(b.Amount),
	}
}

func CurrencyFromAPI(c *api.Currency) *finance.Currency {
	if c == nil {
		return nil
	}

	return &finance.Currency{
		Code: finance.CurrencyCode(c.Code),
		Name: c.Name,
		Rate: c.Rate,
	}
}

func CurrenciesToAPI(list []*finance.Currency) []api.Currency {
	resp := make([]api.Currency, 0, len(list))

	for _, c := range list {
		if c == nil {
			continue
		}
		resp = append(resp, *CurrencyToAPI(c))
	}

	return resp
}

func CurrencyToAPI(c *finance.Currency) *api.Currency {
	if c == nil {
		return nil
	}

	return &api.Currency{
		Code: c.Code.String(),
		Name: c.Name,
		Rate: c.Rate,
	}
}

func ExpenseFromAPI(e *api.Expense) *finance.Expense {
	if e == nil {
		return nil
	}

	return &finance.Expense{
		ID:       finance.TransactionID(ptr.Value(e.Id)),
		BudgetID: finance.BudgetID(e.BudgetId),
		Operation: finance.Operation{
			Name:         e.Name,
			Description:  ptr.Value(e.Description),
			Amount:       money.Cents(e.Amount),
			ExchangeRate: e.ExchangeRate,
			Date:         e.Date.Time,
		},
	}
}

func TransactionsToAPI(list []*finance.Transaction) []api.Transaction {
	resp := make([]api.Transaction, 0, len(list))
	for _, t := range list {
		if t == nil {
			continue
		}
		resp = append(resp, *TransactionToAPI(t))
	}
	return resp
}

func TransactionToAPI(t *finance.Transaction) *api.Transaction {
	if t == nil {
		return nil
	}

	return &api.Transaction{
		Id:           ptr.Of(t.ID.String()),
		Type:         api.TransactionType(t.Type),
		BudgetId:     ptr.Of(t.BudgetID.String()),
		Name:         t.Name,
		Description:  ptr.OfNonZero(t.Description),
		Amount:       api.APIMoney(t.Amount),
		BaseAmount:   api.APIMoney(t.BaseAmount),
		ExchangeRate: t.ExchangeRate,
		Date:         types.Date{Time: t.Date},
		CreatedAt:    t.CreatedAt,
		UpdatedAt:    t.UpdatedAt,
	}
}

func TransactionItemsToAPI(list []*finance.TransactionItem) []api.TransactionItem {
	resp := make([]api.TransactionItem, 0, len(list))
	for _, t := range list {
		if t == nil {
			continue
		}
		resp = append(resp, *TransactionItemToAPI(t))
	}
	return resp
}

func TransactionItemToAPI(t *finance.TransactionItem) *api.TransactionItem {
	if t == nil {
		return nil
	}
	ti := api.TransactionItem{
		Id:           t.ID.String(),
		Type:         api.TransactionType(t.Type),
		Name:         t.Name,
		Description:  ptr.OfNonZero(t.Description),
		Amount:       api.APIMoney(t.Amount),
		BaseAmount:   api.APIMoney(t.BaseAmount),
		ExchangeRate: t.ExchangeRate,
		Date:         types.Date{Time: t.Date},
		CreatedAt:    t.CreatedAt,
		UpdatedAt:    t.UpdatedAt,
	}

	if b := t.Budget; b != nil {
		ti.Budget = &api.TransactionBudget{
			Id:       b.ID.String(),
			Name:     b.Name,
			Color:    b.Color.String(),
			IconName: b.Icon.String(),
		}
	}

	return &ti
}

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
