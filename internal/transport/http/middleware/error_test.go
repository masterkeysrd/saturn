package middleware_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"google.golang.org/grpc/codes"

	platformerrors "github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/transport/http/middleware"
)

func TestKindToHTTPStatus(t *testing.T) {
	tests := []struct {
		kind platformerrors.Kind
		want int
	}{
		{platformerrors.Invalid, http.StatusBadRequest},
		{platformerrors.Permission, http.StatusForbidden},
		{platformerrors.Unauthenticated, http.StatusUnauthorized},
		{platformerrors.NotExist, http.StatusNotFound},
		{platformerrors.Exist, http.StatusConflict},
		{platformerrors.Conflict, http.StatusConflict},
		{platformerrors.Precondition, http.StatusPreconditionFailed},
		{platformerrors.ResourceExhausted, http.StatusTooManyRequests},
		{platformerrors.Internal, http.StatusInternalServerError},
		{platformerrors.Unavailable, http.StatusServiceUnavailable},
		{platformerrors.Other, http.StatusInternalServerError},
		{platformerrors.Kind(99), http.StatusInternalServerError},
	}

	for _, tt := range tests {
		if got := middleware.KindToHTTPStatus(tt.kind); got != tt.want {
			t.Errorf("KindToHTTPStatus(%v) = %v; want %v", tt.kind, got, tt.want)
		}
	}
}

func TestGRPCCodeToHTTPStatus(t *testing.T) {
	tests := []struct {
		code codes.Code
		want int
	}{
		{codes.OK, http.StatusOK},
		{codes.Canceled, 499},
		{codes.Unknown, http.StatusInternalServerError},
		{codes.InvalidArgument, http.StatusBadRequest},
		{codes.DeadlineExceeded, http.StatusGatewayTimeout},
		{codes.NotFound, http.StatusNotFound},
		{codes.AlreadyExists, http.StatusConflict},
		{codes.PermissionDenied, http.StatusForbidden},
		{codes.ResourceExhausted, http.StatusTooManyRequests},
		{codes.FailedPrecondition, http.StatusPreconditionFailed},
		{codes.Aborted, http.StatusConflict},
		{codes.OutOfRange, http.StatusBadRequest},
		{codes.Unimplemented, http.StatusNotImplemented},
		{codes.Internal, http.StatusInternalServerError},
		{codes.Unavailable, http.StatusServiceUnavailable},
		{codes.DataLoss, http.StatusInternalServerError},
		{codes.Unauthenticated, http.StatusUnauthorized},
		{codes.Code(99), http.StatusInternalServerError},
	}

	for _, tt := range tests {
		if got := middleware.GRPCCodeToHTTPStatus(tt.code); got != tt.want {
			t.Errorf("GRPCCodeToHTTPStatus(%v) = %v; want %v", tt.code, got, tt.want)
		}
	}
}

func TestToHTTP_And_WriteHTTP(t *testing.T) {
	t.Run("nil error", func(t *testing.T) {
		status, resp := middleware.ToHTTP(nil)
		if status != http.StatusOK || resp.Error.Code != 0 {
			t.Errorf("expected OK status for nil, got %d, %+v", status, resp)
		}

		rec := httptest.NewRecorder()
		middleware.WriteHTTP(rec, nil)
		if rec.Code != http.StatusOK || rec.Body.Len() > 0 {
			t.Errorf("expected no body written for nil, got code=%d, body=%s", rec.Code, rec.Body.String())
		}
	})

	t.Run("domain error with details and violations", func(t *testing.T) {
		err := platformerrors.E(
			platformerrors.Precondition,
			platformerrors.Code("INSUFFICIENT_FUNDS"),
			platformerrors.Meta{"account_id": "acc_1"},
			platformerrors.FieldViolation{Field: "amount", Description: "exceeds balance"},
			"insufficient funds in account",
		)

		statusCode, resp := middleware.ToHTTP(err)
		if statusCode != http.StatusPreconditionFailed {
			t.Errorf("expected 412, got %d", statusCode)
		}
		if resp.Error.Message != "insufficient funds in account" {
			t.Errorf("unexpected message: %q", resp.Error.Message)
		}
		if len(resp.Error.Details) != 2 {
			t.Fatalf("expected 2 detail objects, got %d", len(resp.Error.Details))
		}

		rec := httptest.NewRecorder()
		middleware.WriteHTTP(rec, err)

		if rec.Code != http.StatusPreconditionFailed {
			t.Errorf("expected HTTP 412, got %d", rec.Code)
		}
		if ct := rec.Header().Get("Content-Type"); ct != "application/json; charset=utf-8" {
			t.Errorf("unexpected Content-Type: %q", ct)
		}

		var decoded middleware.HTTPErrorResponse
		if err := json.Unmarshal(rec.Body.Bytes(), &decoded); err != nil {
			t.Fatalf("failed to decode JSON response: %v", err)
		}
		if decoded.Error.Message != "insufficient funds in account" {
			t.Errorf("unexpected decoded message: %q", decoded.Error.Message)
		}
	})

	t.Run("internal error redacts message", func(t *testing.T) {
		err := platformerrors.E(platformerrors.Internal, "fatal disk failure")
		statusCode, resp := middleware.ToHTTP(err)
		if statusCode != http.StatusInternalServerError {
			t.Errorf("expected 500, got %d", statusCode)
		}
		if resp.Error.Message != "An unexpected internal error occurred. Please try again later." {
			t.Errorf("expected redacted message, got %q", resp.Error.Message)
		}
	})

	t.Run("supports FieldViolations collection", func(t *testing.T) {
		violations := platformerrors.FieldViolations{
			{Field: "username", Description: "required"},
			{Field: "email", Description: "invalid format"},
		}
		err := platformerrors.E(platformerrors.Invalid, violations, "validation failed")
		statusCode, resp := middleware.ToHTTP(err)
		if statusCode != http.StatusBadRequest {
			t.Errorf("expected 400, got %d", statusCode)
		}
		if len(resp.Error.Details) != 1 {
			t.Fatalf("expected 1 detail object, got %d", len(resp.Error.Details))
		}
	})
}
