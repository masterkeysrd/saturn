package auth

import (
	"context"
	"log/slog"
	"runtime/debug"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// PanicUnaryInterceptor intercepts gRPC unary requests to catch and log panics, returning an Internal status code.
func PanicUnaryInterceptor() grpc.UnaryServerInterceptor {
	return func(ctx context.Context, req any, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (resp any, err error) {
		defer func() {
			if r := recover(); r != nil {
				slog.Error("panic recovered during gRPC unary execution",
					"method", info.FullMethod,
					"panic", r,
					"stack", string(debug.Stack()),
				)
				err = status.Errorf(codes.Internal, "panic recovered: %v", r)
			}
		}()
		return handler(ctx, req)
	}
}

// PanicStreamInterceptor intercepts gRPC stream requests to catch and log panics, returning an Internal status code.
func PanicStreamInterceptor() grpc.StreamServerInterceptor {
	return func(srv any, ss grpc.ServerStream, info *grpc.StreamServerInfo, handler grpc.StreamHandler) (err error) {
		defer func() {
			if r := recover(); r != nil {
				slog.Error("panic recovered during gRPC stream execution",
					"method", info.FullMethod,
					"panic", r,
					"stack", string(debug.Stack()),
				)
				err = status.Errorf(codes.Internal, "panic recovered: %v", r)
			}
		}()
		return handler(srv, ss)
	}
}
