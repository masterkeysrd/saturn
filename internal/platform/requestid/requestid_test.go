package requestid_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/masterkeysrd/saturn/internal/platform/log"
	"github.com/masterkeysrd/saturn/internal/platform/requestid"
)

func TestGenerate(t *testing.T) {
	id1 := requestid.Generate()
	id2 := requestid.Generate()

	if !strings.HasPrefix(id1, requestid.DefaultPrefix) {
		t.Errorf("expected id1 to have prefix %q, got %q", requestid.DefaultPrefix, id1)
	}
	if !strings.HasPrefix(id2, requestid.DefaultPrefix) {
		t.Errorf("expected id2 to have prefix %q, got %q", requestid.DefaultPrefix, id2)
	}
	if id1 == id2 {
		t.Errorf("expected generated IDs to be unique, got duplicate %q", id1)
	}
}

func TestWith_And_From(t *testing.T) {
	ctx := context.Background()

	if got := requestid.From(ctx); got != "" {
		t.Errorf("expected empty string from empty context, got %q", got)
	}
	if got := requestid.From(nil); got != "" {
		t.Errorf("expected empty string from nil context, got %q", got)
	}

	ctx = requestid.With(ctx, "req_custom_123")
	if got := requestid.From(ctx); got != "req_custom_123" {
		t.Errorf("expected req_custom_123, got %q", got)
	}
}

func TestFromOrNew(t *testing.T) {
	t.Run("existing ID in context", func(t *testing.T) {
		ctx := requestid.With(context.Background(), "req_existing")
		newCtx, id := requestid.FromOrNew(ctx)

		if id != "req_existing" {
			t.Errorf("expected req_existing, got %q", id)
		}
		if got := requestid.From(newCtx); got != "req_existing" {
			t.Errorf("expected req_existing in context, got %q", got)
		}
	})

	t.Run("new ID generated when empty", func(t *testing.T) {
		ctx := context.Background()
		newCtx, id := requestid.FromOrNew(ctx)

		if !strings.HasPrefix(id, requestid.DefaultPrefix) {
			t.Errorf("expected prefix %q, got %q", requestid.DefaultPrefix, id)
		}
		if got := requestid.From(newCtx); got != id {
			t.Errorf("expected matching ID in context, got %q, want %q", got, id)
		}
	})
}

func TestSetGenerator(t *testing.T) {
	defer requestid.ResetGenerator()

	requestid.SetGenerator(func() string {
		return "req_deterministic_test"
	})

	id := requestid.Generate()
	if id != "req_deterministic_test" {
		t.Errorf("expected deterministic ID, got %q", id)
	}

	requestid.ResetGenerator()
	id2 := requestid.Generate()
	if id2 == "req_deterministic_test" {
		t.Errorf("expected reset generator to generate fresh random ID, got %q", id2)
	}
}

func TestField(t *testing.T) {
	ctx := context.Background()
	fieldEmpty := requestid.Field(ctx)
	if fieldEmpty.Key != "" {
		t.Errorf("expected empty field from context without request id")
	}

	ctx = requestid.With(ctx, "req_field_test")
	field := requestid.Field(ctx)
	if field.Key != requestid.LogKey || field.Value.String() != "req_field_test" {
		t.Errorf("expected key=%s val=req_field_test, got key=%s val=%v", requestid.LogKey, field.Key, field.Value)
	}
}

func TestEnricher(t *testing.T) {
	buf := &bytes.Buffer{}
	logger := log.New(
		log.WithLevel(log.LevelInfo),
		log.WithJSON(),
		log.WithOutput(buf),
		log.WithSource(false),
		log.WithMiddleware(requestid.Enricher()),
	)

	ctx := requestid.With(context.Background(), "req_enricher_999")
	logger.Info(ctx, "hello request")

	var payload map[string]any
	if err := json.Unmarshal(buf.Bytes(), &payload); err != nil {
		t.Fatalf("failed to unmarshal log JSON: %v", err)
	}

	if payload[requestid.LogKey] != "req_enricher_999" {
		t.Errorf("expected %s to be req_enricher_999, got %v", requestid.LogKey, payload[requestid.LogKey])
	}
}

func TestMiddleware(t *testing.T) {
	t.Run("generates new request ID when header is missing", func(t *testing.T) {
		var capturedReqID string
		handler := requestid.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			capturedReqID = requestid.From(r.Context())
			w.WriteHeader(http.StatusOK)
		}))

		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		rec := httptest.NewRecorder()

		handler.ServeHTTP(rec, req)

		if capturedReqID == "" || !strings.HasPrefix(capturedReqID, requestid.DefaultPrefix) {
			t.Errorf("expected generated request ID with prefix, got %q", capturedReqID)
		}
		if resHeader := rec.Header().Get(requestid.Header); resHeader != capturedReqID {
			t.Errorf("expected response header %s=%q, got %q", requestid.Header, capturedReqID, resHeader)
		}
	})

	t.Run("propagates existing request ID when header is present", func(t *testing.T) {
		const existingID = "req_incoming_custom_id"
		var capturedReqID string

		handler := requestid.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			capturedReqID = requestid.From(r.Context())
			w.WriteHeader(http.StatusOK)
		}))

		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		req.Header.Set(requestid.Header, existingID)
		rec := httptest.NewRecorder()

		handler.ServeHTTP(rec, req)

		if capturedReqID != existingID {
			t.Errorf("expected captured ID %q, got %q", existingID, capturedReqID)
		}
		if resHeader := rec.Header().Get(requestid.Header); resHeader != existingID {
			t.Errorf("expected response header %s=%q, got %q", requestid.Header, existingID, resHeader)
		}
	})
}
