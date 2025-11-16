package financehttp

import (
	"net/http"

	"github.com/masterkeysrd/saturn/internal/pkg/deps"
	"github.com/masterkeysrd/saturn/internal/pkg/httprouter"
)

type Controllers struct {
	deps.In

	Budget      *BudgetController
	Currencies  *CurrencyController
	Expense     *ExpenseController
	Transaction *TransactionController
	Insights    *InsightsController
}

type Router struct {
	registers []httprouter.RoutesRegister
}

func NewRouter(c Controllers) *Router {
	registers := []httprouter.RoutesRegister{
		c.Budget,
		c.Currencies,
		c.Expense,
		c.Transaction,
		c.Insights,
	}

	return &Router{
		registers: registers,
	}
}

func (r *Router) RegisterRoutes(mux *http.ServeMux) {
	handler := http.NewServeMux()

	for _, register := range r.registers {
		register.RegisterRoutes(handler)
	}

	mux.Handle("/finance/", http.StripPrefix("/finance", handler))
}
