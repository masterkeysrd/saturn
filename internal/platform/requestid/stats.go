package requestid

import (
	"context"

	"google.golang.org/grpc"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/stats"
)

// StatsHandler implements stats.Handler to extract or generate request IDs
// at the gRPC wire boundary during TagRPC before any interceptors run.
type StatsHandler struct {
	next stats.Handler
}

// NewStatsHandler creates a new StatsHandler.
// An optional next stats.Handler can be supplied to chain with telemetry/metrics handlers (e.g. OpenTelemetry).
func NewStatsHandler(next ...stats.Handler) *StatsHandler {
	var n stats.Handler
	if len(next) > 0 {
		n = next[0]
	}
	return &StatsHandler{next: n}
}

// Compile-time assertion that StatsHandler implements stats.Handler.
var _ stats.Handler = (*StatsHandler)(nil)

// TagRPC extracts incoming x-request-id metadata or generates a new request ID,
// attaches it to the context, and sets the outgoing response header metadata.
func (h *StatsHandler) TagRPC(ctx context.Context, info *stats.RPCTagInfo) context.Context {
	var reqID string
	if md, ok := metadata.FromIncomingContext(ctx); ok {
		if vals := md.Get(MetadataKey); len(vals) > 0 && vals[0] != "" {
			reqID = vals[0]
		}
	}

	if reqID == "" {
		reqID = Generate()
	}

	ctx = With(ctx, reqID)
	_ = grpc.SetHeader(ctx, metadata.Pairs(MetadataKey, reqID))

	if h.next != nil {
		return h.next.TagRPC(ctx, info)
	}
	return ctx
}

// HandleRPC processes RPC stats, delegating to next if configured.
func (h *StatsHandler) HandleRPC(ctx context.Context, s stats.RPCStats) {
	if h.next != nil {
		h.next.HandleRPC(ctx, s)
	}
}

// TagConn attaches conn information to the context, delegating to next if configured.
func (h *StatsHandler) TagConn(ctx context.Context, info *stats.ConnTagInfo) context.Context {
	if h.next != nil {
		return h.next.TagConn(ctx, info)
	}
	return ctx
}

// HandleConn processes conn stats, delegating to next if configured.
func (h *StatsHandler) HandleConn(ctx context.Context, s stats.ConnStats) {
	if h.next != nil {
		h.next.HandleConn(ctx, s)
	}
}
