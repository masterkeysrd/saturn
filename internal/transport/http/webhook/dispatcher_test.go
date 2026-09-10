package webhook

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/integration"
)

type mockProvider struct {
	verifyFn  func(ctx context.Context, headers map[string][]string, body []byte) error
	processFn func(ctx context.Context, headers map[string][]string, body []byte) error
}

func (m *mockProvider) Provider() string                   { return "test_provider" }
func (m *mockProvider) Kind() string                       { return "webhook" }
func (m *mockProvider) Descriptor() integration.Descriptor { return integration.Descriptor{} }
func (m *mockProvider) Verify(ctx context.Context, headers map[string][]string, body []byte) error {
	if m.verifyFn != nil {
		return m.verifyFn(ctx, headers, body)
	}
	return nil
}
func (m *mockProvider) Process(ctx context.Context, headers map[string][]string, body []byte) error {
	if m.processFn != nil {
		return m.processFn(ctx, headers, body)
	}
	return nil
}

func TestDispatcher_ServeHTTP(t *testing.T) {
	t.Run("Non-POST returns MethodNotAllowed", func(t *testing.T) {
		reg := integration.NewRegistry(nil)
		dispatcher := NewDispatcher(reg, nil)

		req := httptest.NewRequest(http.MethodGet, "/api/v1/webhooks/test", nil)
		rec := httptest.NewRecorder()
		dispatcher.ServeHTTP(rec, req)

		if rec.Code != http.StatusMethodNotAllowed {
			t.Errorf("expected 405 MethodNotAllowed, got %d", rec.Code)
		}
	})

	t.Run("Missing source returns BadRequest", func(t *testing.T) {
		reg := integration.NewRegistry(nil)
		dispatcher := NewDispatcher(reg, nil)

		req := httptest.NewRequest(http.MethodPost, "/api/v1/webhooks/", strings.NewReader("{}"))
		rec := httptest.NewRecorder()
		dispatcher.ServeHTTP(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Errorf("expected 400 BadRequest, got %d", rec.Code)
		}
	})

	t.Run("Unknown provider returns NotFound", func(t *testing.T) {
		reg := integration.NewRegistry(nil)
		dispatcher := NewDispatcher(reg, nil)

		req := httptest.NewRequest(http.MethodPost, "/api/v1/webhooks/unknown", strings.NewReader("{}"))
		rec := httptest.NewRecorder()
		dispatcher.ServeHTTP(rec, req)

		if rec.Code != http.StatusNotFound {
			t.Errorf("expected 404 NotFound, got %d", rec.Code)
		}
	})

	t.Run("Verification failure returns Unauthorized", func(t *testing.T) {
		reg := integration.NewRegistry(nil)
		reg.Register(&mockProvider{
			verifyFn: func(ctx context.Context, headers map[string][]string, body []byte) error {
				return errors.E("Verify", errors.Unauthenticated, "bad token")
			},
		})
		dispatcher := NewDispatcher(reg, nil)

		req := httptest.NewRequest(http.MethodPost, "/api/v1/webhooks/test_provider", strings.NewReader("{}"))
		rec := httptest.NewRecorder()
		dispatcher.ServeHTTP(rec, req)

		if rec.Code != http.StatusUnauthorized {
			t.Errorf("expected 401 Unauthorized, got %d", rec.Code)
		}
	})
}
