package financehttp

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/masterkeysrd/saturn/api"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/pkg/httphandler"
	"github.com/masterkeysrd/saturn/internal/pkg/str"
	"github.com/oapi-codegen/runtime/types"
)

type InsightsController struct {
	app FinanceService
}

func NewInsightsController(app FinanceService) *InsightsController {
	return &InsightsController{
		app: app,
	}
}

func (c *InsightsController) RegisterRoutes(mux *http.ServeMux) {
	mux.Handle("GET /insights", httphandler.Handle(c.GetFinanceInsights,
		httphandler.WithInputTransformer[*api.GetFinanceInsightsRequest, *api.FinanceInsights](transformGetSpendingInsightsInput),
	))
}

func (c *InsightsController) GetFinanceInsights(ctx context.Context, req *api.GetFinanceInsightsRequest) (*api.FinanceInsights, error) {
	var budgets []finance.BudgetID
	if req.BudgetIds != nil {
		budgets = str.Split[finance.BudgetID](*req.BudgetIds, ",")
	}

	insights, err := c.app.GetInsights(ctx, &finance.GetInsightsInput{
		StartDate: req.StartDate.Time,
		EndState:  req.EndDate.Time,
		Budgets:   budgets,
	})
	if err != nil {
		return nil, fmt.Errorf("cannot get spending insights: %w", err)
	}

	return FinanceInsightsToAPI(insights), nil
}

func transformGetSpendingInsightsInput(ctx context.Context, req *http.Request) (*api.GetFinanceInsightsRequest, error) {
	query := req.URL.Query()

	startDateStr := query.Get("start_date")
	if startDateStr == "" {
		return nil, fmt.Errorf("start_date is required")
	}

	startDate, err := time.Parse("2006-01-02", startDateStr)
	if err != nil {
		return nil, fmt.Errorf("invalid start_date format: %w", err)
	}

	endDateStr := query.Get("end_date")
	if endDateStr == "" {
		return nil, fmt.Errorf("end_date is required")
	}

	endDate, err := time.Parse("2006-01-02", endDateStr)
	if err != nil {
		return nil, fmt.Errorf("invalid end_date format: %w", err)
	}

	budgetIDsStr := query.Get("budget_ids")

	apiReq := &api.GetFinanceInsightsRequest{
		FinanceGetInsightsParams: api.FinanceGetInsightsParams{
			StartDate: types.Date{Time: startDate},
			EndDate:   types.Date{Time: endDate},
			BudgetIds: &budgetIDsStr,
		},
	}

	return apiReq, nil
}
