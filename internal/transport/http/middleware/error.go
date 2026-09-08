package middleware

import (
	"encoding/json"
	"fmt"
	"net/http"

	"google.golang.org/grpc/codes"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

// KindToHTTPStatus converts a platform Kind to an HTTP status code.
func KindToHTTPStatus(kind errors.Kind) int {
	switch kind {
	case errors.Invalid:
		return http.StatusBadRequest // 400
	case errors.Permission:
		return http.StatusForbidden // 403
	case errors.Unauthenticated:
		return http.StatusUnauthorized // 401
	case errors.NotExist:
		return http.StatusNotFound // 404
	case errors.Exist, errors.Conflict:
		return http.StatusConflict // 409
	case errors.Precondition:
		return http.StatusPreconditionFailed // 412
	case errors.ResourceExhausted:
		return http.StatusTooManyRequests // 429
	case errors.Internal, errors.Other:
		return http.StatusInternalServerError // 500
	case errors.Unavailable:
		return http.StatusServiceUnavailable // 503
	default:
		return http.StatusInternalServerError // 500
	}
}

// GRPCCodeToHTTPStatus maps a gRPC status code to standard HTTP status code.
func GRPCCodeToHTTPStatus(code codes.Code) int {
	switch code {
	case codes.OK:
		return http.StatusOK
	case codes.Canceled:
		return 499 // Client Closed Request
	case codes.Unknown:
		return http.StatusInternalServerError
	case codes.InvalidArgument:
		return http.StatusBadRequest
	case codes.DeadlineExceeded:
		return http.StatusGatewayTimeout
	case codes.NotFound:
		return http.StatusNotFound
	case codes.AlreadyExists:
		return http.StatusConflict
	case codes.PermissionDenied:
		return http.StatusForbidden
	case codes.ResourceExhausted:
		return http.StatusTooManyRequests
	case codes.FailedPrecondition:
		return http.StatusPreconditionFailed
	case codes.Aborted:
		return http.StatusConflict
	case codes.OutOfRange:
		return http.StatusBadRequest
	case codes.Unimplemented:
		return http.StatusNotImplemented
	case codes.Internal:
		return http.StatusInternalServerError
	case codes.Unavailable:
		return http.StatusServiceUnavailable
	case codes.DataLoss:
		return http.StatusInternalServerError
	case codes.Unauthenticated:
		return http.StatusUnauthorized
	default:
		return http.StatusInternalServerError
	}
}

// HTTPErrorResponse represents the standard Google/gRPC-Gateway JSON error envelope.
type HTTPErrorResponse struct {
	Error HTTPErrorBody `json:"error"`
}

// HTTPErrorBody contains the details of the HTTP error.
type HTTPErrorBody struct {
	Code    int              `json:"code"`
	Message string           `json:"message"`
	Status  string           `json:"status,omitempty"`
	Details []map[string]any `json:"details,omitempty"`
}

// ToHTTP translates any error into an HTTP status code and structured JSON response.
func ToHTTP(err error) (int, HTTPErrorResponse) {
	if err == nil {
		return http.StatusOK, HTTPErrorResponse{}
	}

	kind := errors.KindOf(err)
	statusCode := KindToHTTPStatus(kind)
	message := errors.UserMessage(err)
	if message == "" {
		message = "an error occurred"
	}

	resp := HTTPErrorResponse{
		Error: HTTPErrorBody{
			Code:    statusCode,
			Message: message,
			Status:  kind.String(),
		},
	}

	// Build details matching Google JSON format
	code := errors.CodeOf(err)
	meta := errors.MetaOf(err)
	if code != "" || len(meta) > 0 {
		metadata := make(map[string]string)
		for k, v := range meta {
			metadata[k] = fmt.Sprint(v)
		}
		resp.Error.Details = append(resp.Error.Details, map[string]any{
			"@type":    "type.googleapis.com/google.rpc.ErrorInfo",
			"reason":   string(code),
			"domain":   "saturn",
			"metadata": metadata,
		})
	}

	details := errors.DetailsOf(err)
	var violations []map[string]string
	for _, d := range details {
		switch v := d.(type) {
		case errors.FieldViolation:
			violations = append(violations, map[string]string{
				"field":       v.Field,
				"description": v.Description,
			})
		case errors.FieldViolations:
			for _, fv := range v {
				violations = append(violations, map[string]string{
					"field":       fv.Field,
					"description": fv.Description,
				})
			}
		}
	}

	if len(violations) > 0 {
		resp.Error.Details = append(resp.Error.Details, map[string]any{
			"@type":           "type.googleapis.com/google.rpc.BadRequest",
			"fieldViolations": violations,
		})
	}

	return statusCode, resp
}

// WriteHTTP writes the error as a JSON response to http.ResponseWriter.
func WriteHTTP(w http.ResponseWriter, err error) {
	if err == nil {
		return
	}
	statusCode, resp := ToHTTP(err)
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(statusCode)
	_ = json.NewEncoder(w).Encode(resp)
}
