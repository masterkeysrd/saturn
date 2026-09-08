package middleware

import (
	"encoding/json"
	"fmt"
	"net/http"

	"google.golang.org/grpc/codes"

	platformerrors "github.com/masterkeysrd/saturn/internal/platform/errors"
)

// KindToHTTPStatus converts a platform Kind to an HTTP status code.
func KindToHTTPStatus(kind platformerrors.Kind) int {
	switch kind {
	case platformerrors.Invalid:
		return http.StatusBadRequest // 400
	case platformerrors.Permission:
		return http.StatusForbidden // 403
	case platformerrors.Unauthenticated:
		return http.StatusUnauthorized // 401
	case platformerrors.NotExist:
		return http.StatusNotFound // 404
	case platformerrors.Exist, platformerrors.Conflict:
		return http.StatusConflict // 409
	case platformerrors.Precondition:
		return http.StatusPreconditionFailed // 412
	case platformerrors.ResourceExhausted:
		return http.StatusTooManyRequests // 429
	case platformerrors.Internal, platformerrors.Other:
		return http.StatusInternalServerError // 500
	case platformerrors.Unavailable:
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

	kind := platformerrors.KindOf(err)
	statusCode := KindToHTTPStatus(kind)
	message := platformerrors.UserMessage(err)
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
	code := platformerrors.CodeOf(err)
	meta := platformerrors.MetaOf(err)
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

	details := platformerrors.DetailsOf(err)
	var violations []map[string]string
	for _, d := range details {
		switch v := d.(type) {
		case platformerrors.FieldViolation:
			violations = append(violations, map[string]string{
				"field":       v.Field,
				"description": v.Description,
			})
		case platformerrors.FieldViolations:
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
