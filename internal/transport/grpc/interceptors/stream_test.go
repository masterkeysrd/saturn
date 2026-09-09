package interceptors_test

import (
	"context"
	"testing"

	"github.com/masterkeysrd/saturn/internal/transport/grpc/interceptors"
	"google.golang.org/grpc"
)

type dummyStream struct {
	grpc.ServerStream
	ctx context.Context
}

func (d *dummyStream) Context() context.Context {
	return d.ctx
}

func TestWrapServerStream(t *testing.T) {
	type testKey struct{}
	origCtx := context.WithValue(context.Background(), testKey{}, "original")
	stream := &dummyStream{ctx: origCtx}

	newCtx := context.WithValue(context.Background(), testKey{}, "wrapped")
	wrapped := interceptors.WrapServerStream(newCtx, stream)

	if wrapped == nil {
		t.Fatal("expected non-nil wrapped stream")
	}

	val, ok := wrapped.Context().Value(testKey{}).(string)
	if !ok || val != "wrapped" {
		t.Errorf("expected context value 'wrapped', got %v", val)
	}
}
