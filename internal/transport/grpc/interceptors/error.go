package interceptors

import (
	"context"
	"fmt"
	"log/slog"

	"google.golang.org/genproto/googleapis/rpc/errdetails"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/protoadapt"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

// KindToGRPCCode converts a platform Kind to a standard gRPC status code.
func KindToGRPCCode(kind errors.Kind) codes.Code {
	switch kind {
	case errors.Invalid:
		return codes.InvalidArgument
	case errors.Permission:
		return codes.PermissionDenied
	case errors.Unauthenticated:
		return codes.Unauthenticated
	case errors.NotExist:
		return codes.NotFound
	case errors.Exist:
		return codes.AlreadyExists
	case errors.Conflict:
		return codes.Aborted
	case errors.Precondition:
		return codes.FailedPrecondition
	case errors.ResourceExhausted:
		return codes.ResourceExhausted
	case errors.Internal:
		return codes.Internal
	case errors.Unavailable:
		return codes.Unavailable
	case errors.Other:
		return codes.Unknown
	default:
		return codes.Unknown
	}
}

// ToStatus converts any Go error into a *status.Status object enriched with
// Google standard error details (ErrorInfo, BadRequest, etc.) where available.
func ToStatus(err error) *status.Status {
	if err == nil {
		return nil
	}

	// Check if err wraps or is a platform Error
	hasPlatErr := false
	for cur := err; cur != nil; {
		if _, ok := cur.(*errors.Error); ok {
			hasPlatErr = true
			break
		}
		if u, ok := cur.(interface{ Unwrap() error }); ok {
			cur = u.Unwrap()
		} else {
			break
		}
	}

	if !hasPlatErr {
		// If already a gRPC status error, return its status
		if s, ok := status.FromError(err); ok {
			return s
		}
		// Otherwise default unknown status
		return status.New(codes.Unknown, err.Error())
	}

	kind := errors.KindOf(err)
	code := KindToGRPCCode(kind)
	msg := errors.UserMessage(err)
	if msg == "" {
		msg = "an error occurred"
	}

	st := status.New(code, msg)

	var protoDetails []protoadapt.MessageV1

	// 1. ErrorInfo (stable machine-readable code and domain metadata)
	errorCode := errors.CodeOf(err)
	meta := errors.MetaOf(err)
	if errorCode != "" || len(meta) > 0 {
		metadata := make(map[string]string)
		for k, v := range meta {
			metadata[k] = fmt.Sprint(v)
		}
		protoDetails = append(protoDetails, protoadapt.MessageV1Of(&errdetails.ErrorInfo{
			Reason:   string(errorCode),
			Domain:   "saturn",
			Metadata: metadata,
		}))
	}

	// 2. BadRequest (field violations)
	details := errors.DetailsOf(err)
	var fieldViolations []*errdetails.BadRequest_FieldViolation
	for _, d := range details {
		switch v := d.(type) {
		case errors.FieldViolation:
			fieldViolations = append(fieldViolations, &errdetails.BadRequest_FieldViolation{
				Field:       v.Field,
				Description: v.Description,
			})
		case errors.FieldViolations:
			for _, fv := range v {
				fieldViolations = append(fieldViolations, &errdetails.BadRequest_FieldViolation{
					Field:       fv.Field,
					Description: fv.Description,
				})
			}
		case protoadapt.MessageV1:
			protoDetails = append(protoDetails, v)
		case proto.Message:
			protoDetails = append(protoDetails, protoadapt.MessageV1Of(v))
		}
	}
	if len(fieldViolations) > 0 {
		protoDetails = append(protoDetails, protoadapt.MessageV1Of(&errdetails.BadRequest{
			FieldViolations: fieldViolations,
		}))
	}

	if len(protoDetails) > 0 {
		stWithDetails, errWithDetails := st.WithDetails(protoDetails...)
		if errWithDetails == nil {
			st = stWithDetails
		}
	}

	return st
}

// ToGRPC translates any error into a gRPC status error.
func ToGRPC(err error) error {
	st := ToStatus(err)
	if st == nil {
		return nil
	}
	return st.Err()
}

// ErrorUnaryInterceptor returns a gRPC UnaryServerInterceptor that intercepts
// errors returned by handlers, logs operational traces for internal errors, and
// converts errors into structured gRPC statuses.
func ErrorUnaryInterceptor() grpc.UnaryServerInterceptor {
	return func(ctx context.Context, req any, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (any, error) {
		resp, err := handler(ctx, req)
		if err != nil {
			kind := errors.KindOf(err)
			if kind == errors.Internal || kind == errors.Other {
				slog.Error("internal error in gRPC unary call",
					"method", info.FullMethod,
					"op_trace", err.Error(),
				)
			}
			return resp, ToGRPC(err)
		}
		return resp, nil
	}
}

// ErrorStreamInterceptor returns a gRPC StreamServerInterceptor that intercepts
// stream errors, logs internal operational traces, and converts errors to structured gRPC statuses.
func ErrorStreamInterceptor() grpc.StreamServerInterceptor {
	return func(srv any, ss grpc.ServerStream, info *grpc.StreamServerInfo, handler grpc.StreamHandler) error {
		err := handler(srv, ss)
		if err != nil {
			kind := errors.KindOf(err)
			if kind == errors.Internal || kind == errors.Other {
				slog.Error("internal error in gRPC stream call",
					"method", info.FullMethod,
					"op_trace", err.Error(),
				)
			}
			return ToGRPC(err)
		}
		return nil
	}
}
