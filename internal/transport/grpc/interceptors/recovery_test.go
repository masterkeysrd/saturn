package interceptors_test

import (
	"context"
	"testing"

	"github.com/masterkeysrd/saturn/internal/transport/grpc/interceptors"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func TestPanicUnaryInterceptor(t *testing.T) {
	interceptor := interceptors.PanicUnaryInterceptor()
	ctx := context.Background()
	info := &grpc.UnaryServerInfo{FullMethod: "/test.Service/PanicMethod"}

	t.Run("success without panic", func(t *testing.T) {
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

	t.Run("recovers from panic and returns internal error", func(t *testing.T) {
		resp, err := interceptor(ctx, "in", info, func(ctx context.Context, req any) (any, error) {
			panic("something went terribly wrong")
		})
		if resp != nil {
			t.Errorf("expected nil response on panic, got %v", resp)
		}
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		s, ok := status.FromError(err)
		if !ok {
			t.Fatalf("expected gRPC status error, got %v", err)
		}
		if s.Code() != codes.Internal {
			t.Errorf("expected status code Internal, got %v", s.Code())
		}
	})
}

func TestPanicStreamInterceptor(t *testing.T) {
	interceptor := interceptors.PanicStreamInterceptor()
	info := &grpc.StreamServerInfo{FullMethod: "/test.Service/PanicStream"}
	stream := &dummyStream{ctx: context.Background()}

	t.Run("success without panic", func(t *testing.T) {
		err := interceptor(nil, stream, info, func(srv any, ss grpc.ServerStream) error {
			return nil
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("recovers from panic and returns internal error", func(t *testing.T) {
		err := interceptor(nil, stream, info, func(srv any, ss grpc.ServerStream) error {
			panic("stream panic exploded")
		})
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		s, ok := status.FromError(err)
		if !ok {
			t.Fatalf("expected gRPC status error, got %v", err)
		}
		if s.Code() != codes.Internal {
			t.Errorf("expected status code Internal, got %v", s.Code())
		}
	})

	t.Run("handles nil stream and info safely", func(t *testing.T) {
		err := interceptor(nil, nil, nil, func(srv any, ss grpc.ServerStream) error {
			panic("nil stream panic")
		})
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		s, ok := status.FromError(err)
		if !ok || s.Code() != codes.Internal {
			t.Errorf("expected Internal code, got %v", err)
		}
	})
}
