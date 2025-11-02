package budget

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/masterkeysrd/saturn/api"
)

type Controller struct {
	service Service
}

func NewController(service Service) *Controller {
	return &Controller{
		service: service,
	}
}

func (c *Controller) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("POST /budgets", func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()

		var body api.Budget
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		resp, err := c.CreateBudget(ctx, &api.CreateBudgetRequest{
			Budget: &body,
		})
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Add("Content-Type", "application/json")
		if resp.Id != nil {
			w.Header().Add("Location", "api/v1/budgets/"+*resp.Id)
		}
		w.WriteHeader(http.StatusCreated)
		enc := json.NewEncoder(w)
		enc.SetEscapeHTML(true)
		if err := enc.Encode(resp); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	})

	mux.HandleFunc("GET /budgets", func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()

		resp, err := c.ListBudgets(ctx, &api.ListBudgetsResponse{})
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Add("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		enc := json.NewEncoder(w)
		enc.SetEscapeHTML(true)
		if err := enc.Encode(resp); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	})
}

func (c *Controller) CreateBudget(ctx context.Context, req *api.CreateBudgetRequest) (*api.Budget, error) {
	budget := BudgetFromAPI(req.Budget)

	if err := c.service.Create(ctx, budget); err != nil {
		return nil, fmt.Errorf("cannot create budget: %w", err)
	}

	resp := BudgetToAPI(budget)
	return resp, nil
}

func (c *Controller) ListBudgets(ctx context.Context, _ *api.ListBudgetsResponse) (*api.ListBudgetsResponse, error) {
	budgets, err := c.service.List(ctx)
	if err != nil {
		return nil, fmt.Errorf("cannot list budgets: %w", err)
	}

	resp := BudgetsToAPI(budgets)
	return &api.ListBudgetsResponse{
		Budgets: &resp,
	}, nil
}
