package interceptors

import (
	"context"

	"google.golang.org/grpc"
)

// wrappedServerStream wraps a grpc.ServerStream with an updated context.
type wrappedServerStream struct {
	grpc.ServerStream
	ctx context.Context
}

func (s *wrappedServerStream) Context() context.Context {
	return s.ctx
}

// WrapServerStream wraps ss with a new context.
// In accordance with Go conventions, context.Context is the first parameter.
func WrapServerStream(ctx context.Context, ss grpc.ServerStream) grpc.ServerStream {
	return &wrappedServerStream{
		ServerStream: ss,
		ctx:          ctx,
	}
}
