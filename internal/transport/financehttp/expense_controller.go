package financehttp

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/masterkeysrd/saturn/api"
	"github.com/masterkeysrd/saturn/internal/pkg/httphandler"
)

type ExpenseController struct {
	app FinanceService
}

func NewExpenseController(app FinanceService) *ExpenseController {
	return &ExpenseController{
		app: app,
	}
}

func (c *ExpenseController) RegisterRoutes(mux *http.ServeMux) {
	mux.Handle("POST /expenses", httphandler.Handle(c.CreateExpense,
		httphandler.WithCreated[*api.CreateExpenseRequest, *api.Transaction](),
		httphandler.WithInputTransformer[*api.CreateExpenseRequest, *api.Transaction](transformCreateExpenseInput),
	))
}

func (c *ExpenseController) CreateExpense(ctx context.Context, req *api.CreateExpenseRequest) (*api.Transaction, error) {
	exp := ExpenseFromAPI(req.Expense)

	trx, err := c.app.CreateExpense(ctx, exp)
	if err != nil {
		return nil, fmt.Errorf("cannot create expense transaction: %w", err)
	}

	resp := TransactionToAPI(trx)
	return resp, nil
}

func transformCreateExpenseInput(ctx context.Context, req *http.Request) (*api.CreateExpenseRequest, error) {
	var body api.Expense
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		return nil, fmt.Errorf("cannot decode json into body: %w", err)
	}

	return &api.CreateExpenseRequest{
		Expense: &body,
	}, nil
}
