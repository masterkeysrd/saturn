package interceptors_test

import (
	"context"
	"errors"
	"testing"

	"google.golang.org/genproto/googleapis/rpc/errdetails"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	platformerrors "github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/transport/grpc/interceptors"
)

func TestKindToGRPCCode(t *testing.T) {
	tests := []struct {
		kind platformerrors.Kind
		want codes.Code
	}{
		{platformerrors.Invalid, codes.InvalidArgument},
		{platformerrors.Permission, codes.PermissionDenied},
		{platformerrors.Unauthenticated, codes.Unauthenticated},
		{platformerrors.NotExist, codes.NotFound},
		{platformerrors.Exist, codes.AlreadyExists},
		{platformerrors.Conflict, codes.Aborted},
		{platformerrors.Precondition, codes.FailedPrecondition},
		{platformerrors.ResourceExhausted, codes.ResourceExhausted},
		{platformerrors.Internal, codes.Internal},
		{platformerrors.Unavailable, codes.Unavailable},
		{platformerrors.Other, codes.Unknown},
		{platformerrors.Kind(99), codes.Unknown},
	}

	for _, tt := range tests {
		if got := interceptors.KindToGRPCCode(tt.kind); got != tt.want {
			t.Errorf("KindToGRPCCode(%v) = %v; want %v", tt.kind, got, tt.want)
		}
	}
}

func TestToStatus_And_ToGRPC(t *testing.T) {
	t.Run("nil error", func(t *testing.T) {
		if st := interceptors.ToStatus(nil); st != nil {
			t.Errorf("expected nil status, got %v", st)
		}
		if err := interceptors.ToGRPC(nil); err != nil {
			t.Errorf("expected nil error, got %v", err)
		}
	})

	t.Run("existing gRPC status error preserved", func(t *testing.T) {
		original := status.Error(codes.Unauthenticated, "token expired")
		st := interceptors.ToStatus(original)
		if st.Code() != codes.Unauthenticated || st.Message() != "token expired" {
			t.Errorf("unexpected status: %v", st)
		}
		err := interceptors.ToGRPC(original)
		if s, ok := status.FromError(err); !ok || s.Code() != codes.Unauthenticated {
			t.Errorf("unexpected grpc error: %v", err)
		}
	})

	t.Run("plain standard error defaults to Unknown", func(t *testing.T) {
		plain := errors.New("raw standard error")
		st := interceptors.ToStatus(plain)
		if st.Code() != codes.Unknown || st.Message() != "raw standard error" {
			t.Errorf("expected Unknown code, got: %v", st)
		}
	})

	t.Run("platform error with details and metadata", func(t *testing.T) {
		err := platformerrors.E(
			platformerrors.Op("finance.InvertStatementSigns"),
			platformerrors.Precondition,
			platformerrors.Code("STATEMENT_COMPLETED"),
			platformerrors.Meta{"statement_id": "stmt_123", "account_id": "acc_456"},
			platformerrors.FieldViolation{Field: "status", Description: "cannot modify completed"},
			"cannot invert completed statement",
		)

		st := interceptors.ToStatus(err)
		if st.Code() != codes.FailedPrecondition {
			t.Errorf("expected FailedPrecondition, got %v", st.Code())
		}
		if st.Message() != "cannot invert completed statement" {
			t.Errorf("expected clean user message, got %q", st.Message())
		}

		details := st.Details()
		if len(details) != 2 {
			t.Fatalf("expected 2 proto details, got %d", len(details))
		}

		var errorInfo *errdetails.ErrorInfo
		var badRequest *errdetails.BadRequest

		for _, d := range details {
			switch v := d.(type) {
			case *errdetails.ErrorInfo:
				errorInfo = v
			case *errdetails.BadRequest:
				badRequest = v
			}
		}

		if errorInfo == nil {
			t.Fatal("expected ErrorInfo detail")
		}
		if errorInfo.Reason != "STATEMENT_COMPLETED" || errorInfo.Domain != "saturn" {
			t.Errorf("unexpected ErrorInfo: %+v", errorInfo)
		}
		if errorInfo.Metadata["statement_id"] != "stmt_123" || errorInfo.Metadata["account_id"] != "acc_456" {
			t.Errorf("unexpected metadata: %+v", errorInfo.Metadata)
		}

		if badRequest == nil {
			t.Fatal("expected BadRequest detail")
		}
		if len(badRequest.FieldViolations) != 1 || badRequest.FieldViolations[0].Field != "status" {
			t.Errorf("unexpected FieldViolations: %+v", badRequest.FieldViolations)
		}
	})

	t.Run("platform error with FieldViolations slice", func(t *testing.T) {
		violations := platformerrors.FieldViolations{
			{Field: "amount", Description: "positive required"},
			{Field: "currency", Description: "3 letters required"},
		}
		err := platformerrors.E(platformerrors.Invalid, violations, "validation failed")

		st := interceptors.ToStatus(err)
		if st.Code() != codes.InvalidArgument {
			t.Errorf("expected InvalidArgument, got %v", st.Code())
		}

		details := st.Details()
		if len(details) != 1 {
			t.Fatalf("expected 1 detail, got %d", len(details))
		}
		badRequest, ok := details[0].(*errdetails.BadRequest)
		if !ok || len(badRequest.FieldViolations) != 2 {
			t.Fatalf("unexpected bad request detail: %v", details[0])
		}
	})

	t.Run("internal error redacts message", func(t *testing.T) {
		dbErr := errors.New("pq: password authentication failed for user 'saturn'")
		err := platformerrors.E(platformerrors.Op("store.Save"), platformerrors.Internal, dbErr)

		st := interceptors.ToStatus(err)
		if st.Code() != codes.Internal {
			t.Errorf("expected Internal, got %v", st.Code())
		}
		if st.Message() != "An unexpected internal error occurred. Please try again later." {
			t.Errorf("expected redacted message, got %q", st.Message())
		}
	})
}

func TestInterceptors(t *testing.T) {
	unaryInterceptor := interceptors.ErrorUnaryInterceptor()
	streamInterceptor := interceptors.ErrorStreamInterceptor()

	t.Run("unary success", func(t *testing.T) {
		handler := func(ctx context.Context, req any) (any, error) {
			return "success", nil
		}
		resp, err := unaryInterceptor(context.Background(), nil, &grpc.UnaryServerInfo{FullMethod: "/test.Service/Method"}, handler)
		if err != nil || resp != "success" {
			t.Errorf("unexpected unary result: resp=%v, err=%v", resp, err)
		}
	})

	t.Run("unary error conversion", func(t *testing.T) {
		handler := func(ctx context.Context, req any) (any, error) {
			return nil, platformerrors.E(platformerrors.NotExist, "item not found")
		}
		_, err := unaryInterceptor(context.Background(), nil, &grpc.UnaryServerInfo{FullMethod: "/test.Service/Method"}, handler)
		s, ok := status.FromError(err)
		if !ok || s.Code() != codes.NotFound || s.Message() != "item not found" {
			t.Errorf("unexpected error from interceptor: %v", err)
		}
	})

	t.Run("stream success", func(t *testing.T) {
		handler := func(srv any, stream grpc.ServerStream) error {
			return nil
		}
		err := streamInterceptor(nil, nil, &grpc.StreamServerInfo{FullMethod: "/test.Service/Stream"}, handler)
		if err != nil {
			t.Errorf("expected nil error, got %v", err)
		}
	})

	t.Run("stream error conversion", func(t *testing.T) {
		handler := func(srv any, stream grpc.ServerStream) error {
			return platformerrors.E(platformerrors.Permission, "forbidden stream")
		}
		err := streamInterceptor(nil, nil, &grpc.StreamServerInfo{FullMethod: "/test.Service/Stream"}, handler)
		s, ok := status.FromError(err)
		if !ok || s.Code() != codes.PermissionDenied || s.Message() != "forbidden stream" {
			t.Errorf("unexpected error from stream interceptor: %v", err)
		}
	})
}
