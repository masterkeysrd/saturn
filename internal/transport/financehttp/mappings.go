package financehttp

import (
	"github.com/masterkeysrd/saturn/api"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/pkg/ptr"
	"github.com/oapi-codegen/runtime/types"
)

func BudgetFromAPI(b *api.Budget) *finance.Budget {
	if b == nil {
		return nil
	}
	return &finance.Budget{
		ID:     finance.BudgetID(ptr.Value(b.Id)),
		Name:   b.Name,
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

func BudgetToAPI(b *finance.Budget) *api.Budget {
	if b == nil {
		return nil
	}
	return &api.Budget{
		Id:     ptr.Of(b.ID.String()),
		Name:   b.Name,
		Amount: api.APIMoney(b.Amount),
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
			Amount:       api.MoneyModel(e.Amount),
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
