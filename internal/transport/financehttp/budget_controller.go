package financehttp

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/masterkeysrd/saturn/api"
	"github.com/masterkeysrd/saturn/internal/pkg/httphandler"
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

func transformListBudgetsInput(ctx context.Context, req *http.Request) (*api.ListBudgetsRequest, error) {
	return &api.ListBudgetsRequest{}, nil
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
