package financegrpc

import (
	"context"
	"log/slog"

	financepb "github.com/masterkeysrd/saturn/gen/proto/go/saturn/finance/v1"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/transport/grpc/encoding"
)

type InsightsApplication interface {
	GetInsights(context.Context, finance.GetInsightsInput) (*finance.Insights, error)
}

type InsightsServer struct {
	financepb.UnimplementedInsightsServer

	app InsightsApplication
}

func NewInsightsServer(app InsightsApplication) *InsightsServer {
	return &InsightsServer{
		app: app,
	}
}

func (s *InsightsServer) GetInsights(ctx context.Context, req *financepb.GetInsightsRequest) (*financepb.GetInsightsResponse, error) {
	slog.DebugContext(ctx, "Received GetInsights request", slog.Any("request", req))
	input := finance.GetInsightsInput{
		StartDate: encoding.Date(req.GetStartDate()),
		EndState:  encoding.Date(req.GetEndDate()),
	}

	insights, err := s.app.GetInsights(ctx, input)
	if err != nil {
		return nil, err
	}

	return GetInsightsResponsePb(insights), nil
}
