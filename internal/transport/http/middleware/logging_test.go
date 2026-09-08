package middleware_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/masterkeysrd/saturn/internal/transport/http/middleware"
)

func TestLoggingMiddleware(t *testing.T) {
	t.Run("normal 200 OK response", func(t *testing.T) {
		handler := middleware.LoggingMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte("hello world"))
		}))

		req := httptest.NewRequest(http.MethodGet, "/test/path", nil)
		rec := httptest.NewRecorder()

		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Errorf("expected 200 OK, got %d", rec.Code)
		}
		if rec.Body.String() != "hello world" {
			t.Errorf("unexpected body: %q", rec.Body.String())
		}
	})

	t.Run("client 400 error logged", func(t *testing.T) {
		handler := middleware.LoggingMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			http.Error(w, "bad input", http.StatusBadRequest)
		}))

		req := httptest.NewRequest(http.MethodPost, "/test/bad", nil)
		rec := httptest.NewRecorder()

		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Errorf("expected 400 Bad Request, got %d", rec.Code)
		}
	})

	t.Run("server 500 error logged", func(t *testing.T) {
		handler := middleware.LoggingMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			http.Error(w, "server failed", http.StatusInternalServerError)
		}))

		req := httptest.NewRequest(http.MethodGet, "/test/error", nil)
		rec := httptest.NewRecorder()

		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusInternalServerError {
			t.Errorf("expected 500, got %d", rec.Code)
		}
	})

	t.Run("flusher and unwrapper support", func(t *testing.T) {
		handler := middleware.LoggingMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if f, ok := w.(http.Flusher); ok {
				f.Flush()
			}
			if u, ok := w.(interface{ Unwrap() http.ResponseWriter }); ok {
				if u.Unwrap() == nil {
					t.Error("expected non-nil unwrapped writer")
				}
			}
		}))

		req := httptest.NewRequest(http.MethodGet, "/test/flush", nil)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
	})

	t.Run("chained with RecoveryMiddleware captures recovered 500", func(t *testing.T) {
		chained := middleware.LoggingMiddleware(middleware.RecoveryMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			panic("panic inside chain")
		})))

		req := httptest.NewRequest(http.MethodPost, "/chained-panic", nil)
		rec := httptest.NewRecorder()
		chained.ServeHTTP(rec, req)

		if rec.Code != http.StatusInternalServerError {
			t.Errorf("expected 500 after recovery in chain, got %d", rec.Code)
		}
	})
}
