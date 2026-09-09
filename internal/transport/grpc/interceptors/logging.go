package interceptors

import (
	"context"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/log"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// LoggingUnaryServerInterceptor logs incoming gRPC unary calls.
// Successful calls (codes.OK) are logged at Debug level.
// Client errors (InvalidArgument, NotFound, etc.) are logged at Warn level.
// Server errors (Internal, Unavailable, Unknown) are logged at Error level.
func LoggingUnaryServerInterceptor() grpc.UnaryServerInterceptor {
	return func(ctx context.Context, req any, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (any, error) {
		start := time.Now()
		resp, err := handler(ctx, req)
		logRPC(ctx, info.FullMethod, time.Since(start), err, "call")
		return resp, err
	}
}

// LoggingStreamServerInterceptor logs incoming gRPC streaming calls.
func LoggingStreamServerInterceptor() grpc.StreamServerInterceptor {
	return func(srv any, ss grpc.ServerStream, info *grpc.StreamServerInfo, handler grpc.StreamHandler) error {
		start := time.Now()
		err := handler(srv, ss)
		ctx := context.Background()
		if ss != nil && ss.Context() != nil {
			ctx = ss.Context()
		}
		method := ""
		if info != nil {
			method = info.FullMethod
		}
		logRPC(ctx, method, time.Since(start), err, "stream")
		return err
	}
}

func logRPC(ctx context.Context, method string, duration time.Duration, err error, rpcType string) {
	code := status.Code(err)
	fields := []log.Field{
		log.String("method", method),
		log.String("code", code.String()),
		log.Duration("duration", duration),
	}

	switch {
	case err == nil || code == codes.OK:
		log.Debug(ctx, "gRPC "+rpcType+" completed", fields...)
	case code == codes.Internal || code == codes.Unknown || code == codes.DataLoss:
		if err != nil {
			fields = append(fields, log.Err(err))
		}
		log.Error(ctx, "gRPC "+rpcType+" failed", fields...)
	default:
		if err != nil {
			fields = append(fields, log.Err(err))
		}
		log.Warn(ctx, "gRPC "+rpcType+" client error", fields...)
	}
}
