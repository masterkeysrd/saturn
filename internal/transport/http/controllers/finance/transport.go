package financehttp

import (
	"context"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
)

type FinanceService interface {
	GetInsights(context.Context, *finance.GetInsightsInput) (*finance.Insights, error)
}
