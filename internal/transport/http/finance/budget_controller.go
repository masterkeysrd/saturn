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

type BudgetController struct {
	app FinanceService
}

func NewBudgetController(app FinanceService) *BudgetController {
	return &BudgetController{
		app: app,
	}
}

func (c *BudgetController) RegisterRoutes(mux *http.ServeMux) {
	mux.Handle("POST /budgets", httphandler.Handle(c.CreateBudget,
		httphandler.WithCreated[*api.CreateBudgetRequest, *api.Budget](),
		httphandler.WithInputTransformer[*api.CreateBudgetRequest, *api.Budget](transformCreateBudgetInput),
	))
	mux.Handle("GET /budgets", httphandler.Handle(c.ListBudgets,
		httphandler.WithInputTransformer[*api.ListBudgetsRequest, *api.ListBudgetsResponse](transformListBudgetsInput),
	))
	mux.Handle("GET /budgets/{id}", httphandler.Handle(c.GetBudget,
		httphandler.WithInputTransformer[*api.GetBudgetRequest, *api.Budget](transformGetBudgetInput),
	))
	mux.Handle("PATCH /budgets/{id}", httphandler.Handle(c.UpdateBudget,
		httphandler.WithInputTransformer[*api.UpdateBudgetRequest, *api.Budget](transformUpdateBudgetInput),
	))
	mux.Handle("DELETE /budgets/{id}", httphandler.Handle(c.DeleteBudget,
		httphandler.WithInputTransformer[*api.DeleteBudgetRequest, *httphandler.Empty](transformDeleteBudgetInput),
	))
}

func (c *BudgetController) CreateBudget(ctx context.Context, req *api.CreateBudgetRequest) (*api.Budget, error) {
	budget := BudgetFromAPI(req.Budget)

	if err := c.app.CreateBudget(ctx, budget); err != nil {
		return nil, fmt.Errorf("cannot create budget: %w", err)
	}

	resp := BudgetToAPI(budget)
	return resp, nil
}

func (c *BudgetController) ListBudgets(ctx context.Context, _ *api.ListBudgetsRequest) (*api.ListBudgetsResponse, error) {
	budgets, err := c.app.ListBudgets(ctx)
	if err != nil {
		return nil, fmt.Errorf("cannot list budgets: %w", err)
	}

	resp := BudgetsToAPI(budgets)
	return &api.ListBudgetsResponse{
		Budgets: &resp,
	}, nil
}

func (c *BudgetController) GetBudget(ctx context.Context, req *api.GetBudgetRequest) (*api.Budget, error) {
	budget, err := c.app.GetBudget(ctx, finance.BudgetID(req.ID))
	if err != nil {
		return nil, fmt.Errorf("cannot get budget: %w", err)
	}

	return BudgetToAPI(budget), nil
}

func (c *BudgetController) UpdateBudget(ctx context.Context, req *api.UpdateBudgetRequest) (*api.Budget, error) {
	input := &finance.UpdateBudgetInput{
		ID:     finance.BudgetID(req.ID),
		Budget: BudgetFromAPI(req.Budget),
	}

	if req.UpdateMask != nil && *req.UpdateMask != "" {
		input.UpdateMask = fieldmask.FromString(string(*req.UpdateMask), ",")
	}

	budget, err := c.app.UpdateBudget(ctx, input)
	if err != nil {
		return nil, fmt.Errorf("failed to update budget %s: %w", req.ID, err)
	}

	return BudgetToAPI(budget), nil
}

func (c *BudgetController) DeleteBudget(ctx context.Context, req *api.DeleteBudgetRequest) (*httphandler.Empty, error) {
	if err := c.app.DeleteBudget(ctx, finance.BudgetID(req.ID)); err != nil {
		return nil, fmt.Errorf("failed to delete budget %s: %w", req.ID, err)
	}

	return &httphandler.Empty{}, nil
}

func transformListBudgetsInput(ctx context.Context, req *http.Request) (*api.ListBudgetsRequest, error) {
	return &api.ListBudgetsRequest{}, nil
}

func transformGetBudgetInput(ctx context.Context, req *http.Request) (*api.GetBudgetRequest, error) {
	id := req.PathValue("id")
	if id == "" {
		return nil, fmt.Errorf("budget id is required")
	}

	return &api.GetBudgetRequest{
		ID: id,
	}, nil
}

func transformCreateBudgetInput(ctx context.Context, req *http.Request) (*api.CreateBudgetRequest, error) {
	var body api.Budget
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		return nil, fmt.Errorf("cannot decode json into body")
	}

	return &api.CreateBudgetRequest{
		Budget: &body,
	}, nil
}

func transformUpdateBudgetInput(ctx context.Context, r *http.Request) (*api.UpdateBudgetRequest, error) {
	id := r.PathValue("id")
	if id == "" {
		return nil, fmt.Errorf("expense id is required")
	}

	var budget api.Budget
	if err := json.NewDecoder(r.Body).Decode(&budget); err != nil {
		return nil, fmt.Errorf("invalid request body: %w", err)
	}

	req := api.UpdateBudgetRequest{
		ID:     id,
		Budget: &budget,
	}

	if maskStr := r.URL.Query().Get("update_mask"); maskStr != "" {
		req.UpdateMask = ptr.Of(api.UpdateMaskParam(maskStr))
	}

	return &req, nil
}

func transformDeleteBudgetInput(ctx context.Context, req *http.Request) (*api.DeleteBudgetRequest, error) {
	id := req.PathValue("id")
	if id == "" {
		return nil, fmt.Errorf("budget id is required")
	}

	return &api.DeleteBudgetRequest{
		ID: id,
	}, nil
}
