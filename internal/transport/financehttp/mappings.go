package financehttp

import (
	"github.com/masterkeysrd/saturn/api"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/pkg/ptr"
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
