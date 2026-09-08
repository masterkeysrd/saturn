package middleware_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/masterkeysrd/saturn/internal/transport/http/middleware"
)

func TestRecoveryMiddleware(t *testing.T) {
	t.Run("normal execution passes through", func(t *testing.T) {
		handler := middleware.RecoveryMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte("ok"))
		}))

		req := httptest.NewRequest(http.MethodGet, "/normal", nil)
		rec := httptest.NewRecorder()

		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Errorf("expected 200 OK, got %d", rec.Code)
		}
		if rec.Body.String() != "ok" {
			t.Errorf("unexpected body: %q", rec.Body.String())
		}
	})

	t.Run("panic recovered and returns 500 JSON error", func(t *testing.T) {
		handler := middleware.RecoveryMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			panic("something went critically wrong!")
		}))

		req := httptest.NewRequest(http.MethodPost, "/panic", nil)
		rec := httptest.NewRecorder()

		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusInternalServerError {
			t.Errorf("expected 500 Internal Server Error, got %d", rec.Code)
		}

		var decoded middleware.HTTPErrorResponse
		if err := json.Unmarshal(rec.Body.Bytes(), &decoded); err != nil {
			t.Fatalf("failed to decode error json: %v", err)
		}
		if decoded.Error.Code != http.StatusInternalServerError {
			t.Errorf("expected error code 500, got %d", decoded.Error.Code)
		}
		if decoded.Error.Message != "An unexpected internal error occurred. Please try again later." {
			t.Errorf("expected sanitized internal message, got %q", decoded.Error.Message)
		}
	})
}
