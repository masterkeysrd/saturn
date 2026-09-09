package interceptors

import (
	"context"
	"fmt"
	"runtime/debug"

	"github.com/masterkeysrd/saturn/internal/platform/log"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// PanicUnaryInterceptor intercepts gRPC unary requests to catch and log panics, returning an Internal status code.
func PanicUnaryInterceptor() grpc.UnaryServerInterceptor {
	return func(ctx context.Context, req any, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (resp any, err error) {
		defer func() {
			if r := recover(); r != nil {
				err = handlePanic(ctx, info.FullMethod, r, "unary")
			}
		}()
		return handler(ctx, req)
	}
}

// PanicStreamInterceptor intercepts gRPC stream requests to catch and log panics, returning an Internal status code.
func PanicStreamInterceptor() grpc.StreamServerInterceptor {
	return func(srv any, ss grpc.ServerStream, info *grpc.StreamServerInfo, handler grpc.StreamHandler) (err error) {
		ctx := context.Background()
		if ss != nil && ss.Context() != nil {
			ctx = ss.Context()
		}
		method := ""
		if info != nil {
			method = info.FullMethod
		}
		defer func() {
			if r := recover(); r != nil {
				err = handlePanic(ctx, method, r, "stream")
			}
		}()
		return handler(srv, ss)
	}
}

func handlePanic(ctx context.Context, method string, r any, rpcType string) error {
	fields := []log.Field{
		log.String("method", method),
		log.String("panic", fmt.Sprint(r)),
		log.String("stack", string(debug.Stack())),
	}
	log.Error(ctx, "panic recovered during gRPC "+rpcType+" execution", fields...)
	return status.Errorf(codes.Internal, "panic recovered: %v", r)
}
