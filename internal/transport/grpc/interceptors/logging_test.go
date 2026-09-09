package interceptors_test

import (
	"context"
	"fmt"
	"testing"

	"github.com/masterkeysrd/saturn/internal/platform/requestid"
	"github.com/masterkeysrd/saturn/internal/transport/grpc/interceptors"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func TestLoggingUnaryServerInterceptor(t *testing.T) {
	interceptor := interceptors.LoggingUnaryServerInterceptor()

	t.Run("logs success at debug level", func(t *testing.T) {
		ctx := requestid.With(context.Background(), "req_test_123")
		info := &grpc.UnaryServerInfo{FullMethod: "/test.Service/Success"}

		resp, err := interceptor(ctx, "in", info, func(ctx context.Context, req any) (any, error) {
			return "out", nil
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if resp != "out" {
			t.Errorf("expected out, got %v", resp)
		}
	})

	t.Run("logs client error at warn level", func(t *testing.T) {
		ctx := requestid.With(context.Background(), "req_test_456")
		info := &grpc.UnaryServerInfo{FullMethod: "/test.Service/ClientError"}

		_, err := interceptor(ctx, "in", info, func(ctx context.Context, req any) (any, error) {
			return nil, status.Error(codes.NotFound, "not found")
		})
		if err == nil {
			t.Fatal("expected error, got nil")
		}
	})

	t.Run("logs server error at error level", func(t *testing.T) {
		ctx := requestid.With(context.Background(), "req_test_789")
		info := &grpc.UnaryServerInfo{FullMethod: "/test.Service/ServerError"}

		_, err := interceptor(ctx, "in", info, func(ctx context.Context, req any) (any, error) {
			return nil, fmt.Errorf("database crash")
		})
		if err == nil {
			t.Fatal("expected error, got nil")
		}
	})
}

type mockServerStream struct {
	grpc.ServerStream
	ctx context.Context
}

func (m *mockServerStream) Context() context.Context {
	return m.ctx
}

func TestLoggingStreamServerInterceptor(t *testing.T) {
	interceptor := interceptors.LoggingStreamServerInterceptor()
	ctx := requestid.With(context.Background(), "req_stream_123")
	stream := &mockServerStream{ctx: ctx}
	info := &grpc.StreamServerInfo{FullMethod: "/test.Service/StreamMethod"}

	t.Run("logs success at debug level", func(t *testing.T) {
		err := interceptor(nil, stream, info, func(srv any, ss grpc.ServerStream) error {
			return nil
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("logs error at error level", func(t *testing.T) {
		err := interceptor(nil, stream, info, func(srv any, ss grpc.ServerStream) error {
			return status.Error(codes.Internal, "internal stream failure")
		})
		if err == nil {
			t.Fatal("expected error, got nil")
		}
	})
}
