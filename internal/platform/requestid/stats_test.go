package requestid_test

import (
	"context"
	"strings"
	"testing"

	"github.com/masterkeysrd/saturn/internal/platform/requestid"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/stats"
)

type mockStatsHandler struct {
	tagRPCCalled     bool
	handleRPCCalled  bool
	tagConnCalled    bool
	handleConnCalled bool
	lastCtx          context.Context
}

func (m *mockStatsHandler) TagRPC(ctx context.Context, info *stats.RPCTagInfo) context.Context {
	m.tagRPCCalled = true
	m.lastCtx = ctx
	return ctx
}

func (m *mockStatsHandler) HandleRPC(ctx context.Context, s stats.RPCStats) {
	m.handleRPCCalled = true
}

func (m *mockStatsHandler) TagConn(ctx context.Context, info *stats.ConnTagInfo) context.Context {
	m.tagConnCalled = true
	return ctx
}

func (m *mockStatsHandler) HandleConn(ctx context.Context, s stats.ConnStats) {
	m.handleConnCalled = true
}

func TestStatsHandler(t *testing.T) {
	t.Run("generates request ID when metadata is empty", func(t *testing.T) {
		handler := requestid.NewStatsHandler()
		ctx := context.Background()

		taggedCtx := handler.TagRPC(ctx, &stats.RPCTagInfo{FullMethodName: "/test.Service/Method"})
		reqID := requestid.From(taggedCtx)

		if reqID == "" {
			t.Fatal("expected non-empty request ID")
		}
		if !strings.HasPrefix(reqID, requestid.DefaultPrefix) {
			t.Errorf("expected prefix %s, got %s", requestid.DefaultPrefix, reqID)
		}
	})

	t.Run("extracts incoming request ID from metadata", func(t *testing.T) {
		const incomingID = "req_client_metadata_123"
		handler := requestid.NewStatsHandler()

		md := metadata.Pairs(requestid.MetadataKey, incomingID)
		ctx := metadata.NewIncomingContext(context.Background(), md)

		taggedCtx := handler.TagRPC(ctx, &stats.RPCTagInfo{FullMethodName: "/test.Service/Method"})
		reqID := requestid.From(taggedCtx)

		if reqID != incomingID {
			t.Errorf("expected %s, got %s", incomingID, reqID)
		}
	})

	t.Run("chains with downstream stats.Handler", func(t *testing.T) {
		mock := &mockStatsHandler{}
		handler := requestid.NewStatsHandler(mock)

		ctx := context.Background()
		taggedCtx := handler.TagRPC(ctx, &stats.RPCTagInfo{})

		if !mock.tagRPCCalled {
			t.Errorf("expected downstream TagRPC to be called")
		}
		if requestid.From(mock.lastCtx) == "" {
			t.Errorf("expected downstream to receive context with request ID")
		}

		handler.HandleRPC(taggedCtx, nil)
		if !mock.handleRPCCalled {
			t.Errorf("expected downstream HandleRPC to be called")
		}

		handler.TagConn(ctx, &stats.ConnTagInfo{})
		if !mock.tagConnCalled {
			t.Errorf("expected downstream TagConn to be called")
		}

		handler.HandleConn(ctx, nil)
		if !mock.handleConnCalled {
			t.Errorf("expected downstream HandleConn to be called")
		}
	})
}
