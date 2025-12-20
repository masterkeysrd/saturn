package financehttp

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/masterkeysrd/saturn/api"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/pkg/httphandler"
	"github.com/masterkeysrd/saturn/internal/pkg/ptr"
	"github.com/masterkeysrd/saturn/internal/transport/http/encoding"
	"github.com/masterkeysrd/saturn/internal/transport/http/response"
)

type BudgetController struct {
	service       FinanceService
	searchService FinanceSearchService
}

func NewBudgetController(app FinanceService, search FinanceSearchService) *BudgetController {
	return &BudgetController{
		service:       app,
		searchService: search,
	}
}

func (c *BudgetController) RegisterRoutes(mux *http.ServeMux) {
	mux.Handle("GET /budgets", httphandler.Handle(c.ListBudgets,
		httphandler.WithInputTransformer[*api.ListBudgetsRequest, *api.ListBudgetsResponse](transformListBudgetsInput),
	))
	mux.Handle("POST /budgets", httphandler.Handle(c.CreateBudget,
		httphandler.WithCreated[*api.CreateBudgetRequest, *api.Budget](),
		httphandler.WithInputTransformer[*api.CreateBudgetRequest, *api.Budget](transformCreateBudgetInput),
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
	return nil, fmt.Errorf("not implemented")
}

func (c *BudgetController) ListBudgets(ctx context.Context, req *api.ListBudgetsRequest) (*api.ListBudgetsResponse, error) {
	page, err := c.searchService.SearchBudgets(ctx, &finance.BudgetSearchInput{
		Term:       req.Search,
		Pagination: req.Paginate.ToPagination(),
	})
	if err != nil {
		return nil, fmt.Errorf("cannot list budgets: %w", err)
	}

	resp := BudgetsItemsToAPI(page.Items())
	return &api.ListBudgetsResponse{
		Budgets: &resp,
		Meta:    response.NewMeta(page),
	}, nil
}

func (c *BudgetController) GetBudget(ctx context.Context, req *api.GetBudgetRequest) (*api.Budget, error) {
	budget, err := c.service.GetBudget(ctx, finance.BudgetID(req.ID))
	if err != nil {
		return nil, fmt.Errorf("cannot get budget: %w", err)
	}

	return BudgetToAPI(budget), nil
}

func (c *BudgetController) UpdateBudget(ctx context.Context, req *api.UpdateBudgetRequest) (*api.Budget, error) {
	return nil, fmt.Errorf("not implemented")
}

func (c *BudgetController) DeleteBudget(ctx context.Context, req *api.DeleteBudgetRequest) (*httphandler.Empty, error) {
	if err := c.service.DeleteBudget(ctx, finance.BudgetID(req.ID)); err != nil {
		return nil, fmt.Errorf("failed to delete budget %s: %w", req.ID, err)
	}

	return &httphandler.Empty{}, nil
}

func transformListBudgetsInput(ctx context.Context, req *http.Request) (*api.ListBudgetsRequest, error) {
	var p api.PaginationRequest
	if err := encoding.DecodePagination(req, &p); err != nil {
		return nil, fmt.Errorf("invalid pagination params: %w", err)
	}

	return &api.ListBudgetsRequest{
		Search:   encoding.GetStringQuery(req, "search", ""),
		Paginate: p,
	}, nil
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
