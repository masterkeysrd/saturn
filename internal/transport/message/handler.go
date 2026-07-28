package message

import (
	"context"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/emptypb"
	"google.golang.org/protobuf/types/known/timestamppb"

	messagev1 "github.com/masterkeysrd/saturn/apis/saturn/platform/message/v1"
	"github.com/masterkeysrd/saturn/internal/platform/eventbus"
)

// Handler implements the messagev1.MessageAdminServer interface.
type Handler struct {
	messagev1.UnimplementedMessageAdminServer
	Engine *eventbus.Engine
}

// NewHandler instantiates a new MessageAdmin gRPC handler.
func NewHandler(engine *eventbus.Engine) *Handler {
	return &Handler{Engine: engine}
}

// GetQueueMetrics returns aggregate and per-topic status counters for message deliveries.
func (h *Handler) GetQueueMetrics(ctx context.Context, req *messagev1.GetQueueMetricsRequest) (*messagev1.GetQueueMetricsResponse, error) {
	metrics, err := h.Engine.GetMetrics(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "get queue metrics: %v", err)
	}

	protoTopics := make([]*messagev1.TopicMetrics, len(metrics.Topics))
	for i, tm := range metrics.Topics {
		protoTopics[i] = &messagev1.TopicMetrics{
			Topic:      tm.Topic,
			Pending:    tm.Pending,
			Processing: tm.Processing,
			Completed:  tm.Completed,
			Failed:     tm.Failed,
			Total:      tm.Total,
		}
	}

	return &messagev1.GetQueueMetricsResponse{
		TotalPending:    metrics.TotalPending,
		TotalProcessing: metrics.TotalProcessing,
		TotalCompleted:  metrics.TotalCompleted,
		TotalFailed:     metrics.TotalFailed,
		TotalDeliveries: metrics.TotalDeliveries,
		Topics:          protoTopics,
	}, nil
}

// ListDeliveries retrieves a paginated list of message delivery records filtered by topic or status.
func (h *Handler) ListDeliveries(ctx context.Context, req *messagev1.ListDeliveriesRequest) (*messagev1.ListDeliveriesResponse, error) {
	filter := eventbus.ListDeliveriesFilter{
		Topic:        req.Topic,
		Status:       req.Status,
		SubscriberID: req.SubscriberId,
		PageSize:     int(req.PageSize),
		PageToken:    req.PageToken,
	}

	page, err := h.Engine.ListDeliveries(ctx, filter)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "list deliveries: %v", err)
	}

	protoDeliveries := make([]*messagev1.DeliveryInfo, len(page.Items))
	for i, d := range page.Items {
		protoDeliveries[i] = &messagev1.DeliveryInfo{
			Id:           d.ID,
			MessageId:    d.MessageID,
			SubscriberId: d.SubscriberID,
			Topic:        d.Topic,
			Status:       d.Status,
			Attempts:     int32(d.Attempts),
			MaxAttempts:  int32(d.MaxAttempts),
			LastError:    d.LastError,
			ScheduleTime: timestamppb.New(d.ScheduleTime),
			CreateTime:   timestamppb.New(d.CreateTime),
			UpdateTime:   timestamppb.New(d.UpdateTime),
		}
	}

	return &messagev1.ListDeliveriesResponse{
		Deliveries:    protoDeliveries,
		NextPageToken: page.NextPageToken,
	}, nil
}

// RetryDelivery resets a failed or stuck delivery record so it can be re-processed immediately.
func (h *Handler) RetryDelivery(ctx context.Context, req *messagev1.RetryDeliveryRequest) (*emptypb.Empty, error) {
	if req.Id == "" {
		return nil, status.Error(codes.InvalidArgument, "id is required")
	}

	if err := h.Engine.RetryDelivery(ctx, req.Id); err != nil {
		return nil, status.Errorf(codes.Internal, "retry delivery: %v", err)
	}

	return &emptypb.Empty{}, nil
}
