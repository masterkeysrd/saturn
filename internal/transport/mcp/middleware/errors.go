package middleware

import (
	"encoding/json/v2"
	"errors"
	"fmt"
	"net/http"

	platformerrors "github.com/masterkeysrd/saturn/internal/platform/errors"
)

// FormatToolError maps internal platform errors into sanitized error messages safe for MCP tool responses.
func FormatToolError(err error) error {
	if err == nil {
		return nil
	}

	if _, ok := errors.AsType[*platformerrors.Error](err); !ok {
		return errors.New("internal error: operation failed")
	}

	kind := platformerrors.KindOf(err)
	if kind == platformerrors.Internal || kind == platformerrors.Other {
		return errors.New("internal error: please try again later")
	}

	msg := platformerrors.UserMessage(err)
	if msg == "" {
		msg = "request could not be completed"
	}

	code := platformerrors.CodeOf(err)
	if code != "" {
		return fmt.Errorf("%s (%s: %s)", msg, kind, code)
	}
	return fmt.Errorf("%s (%s)", msg, kind)
}

// WriteHTTPError writes a structured JSON error payload with the given HTTP status code.
func WriteHTTPError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.MarshalWrite(w, map[string]string{"error": message})
}
