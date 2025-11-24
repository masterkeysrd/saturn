package financehttp

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/masterkeysrd/saturn/api"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/foundation/fieldmask"
	"github.com/masterkeysrd/saturn/internal/pkg/httphandler"
	"github.com/masterkeysrd/saturn/internal/pkg/ptr"
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

	mux.Handle("PATCH /expenses/{id}", httphandler.Handle(c.UpdateExpense,
		httphandler.WithInputTransformer[*api.UpdateExpenseRequest, *api.Transaction](transformUpdateExpenseInput),
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

func (c *ExpenseController) UpdateExpense(ctx context.Context, req *api.UpdateExpenseRequest) (*api.Transaction, error) {
	input := &finance.UpdateExpenseInput{
		ID:      finance.TransactionID(req.ID),
		Expense: ExpenseFromAPI(req.Expense),
	}

	if req.UpdateMask != nil && *req.UpdateMask != "" {
		input.UpdateMask = fieldmask.FromString(string(*req.UpdateMask), ",")
	}

	trx, err := c.app.UpdateExpense(ctx, input)
	if err != nil {
		return nil, fmt.Errorf("failed to update expense %s: %w", req.ID, err)
	}

	return TransactionToAPI(trx), nil
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

func transformUpdateExpenseInput(ctx context.Context, r *http.Request) (*api.UpdateExpenseRequest, error) {
	id := r.PathValue("id")
	if id == "" {
		return nil, fmt.Errorf("expense id is required")
	}

	var expense api.Expense
	if err := json.NewDecoder(r.Body).Decode(&expense); err != nil {
		return nil, fmt.Errorf("invalid request body: %w", err)
	}

	req := api.UpdateExpenseRequest{
		ID:      id,
		Expense: &expense,
	}

	if maskStr := r.URL.Query().Get("update_mask"); maskStr != "" {
		req.UpdateMask = ptr.Of(api.UpdateMaskParam(maskStr))
	}

	return &req, nil
}
