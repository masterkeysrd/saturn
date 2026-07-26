package webhook

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/masterkeysrd/saturn/internal/platform/integration"
)

type contextKey string

const spaceIDContextKey contextKey = "space_id"

// GetSpaceID retrieves the Space ID from the context if present.
func GetSpaceID(ctx context.Context) string {
	if val := ctx.Value(spaceIDContextKey); val != nil {
		if idStr, ok := val.(string); ok {
			return idStr
		}
	}
	return ""
}

// Dispatcher handles the unified HTTP routing for both application-level and space-level webhooks.
type Dispatcher struct {
	registry *integration.Registry
}

// NewDispatcher instantiates a new HTTP Webhook Dispatcher.
func NewDispatcher(registry *integration.Registry) *Dispatcher {
	return &Dispatcher{
		registry: registry,
	}
}

func (d *Dispatcher) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// URL format expected:
	// /api/v1/webhooks/{source}
	// /api/v1/webhooks/{source}/{space_id}
	path := strings.TrimPrefix(r.URL.Path, "/api/v1/webhooks/")
	parts := strings.Split(path, "/")

	if len(parts) == 0 || parts[0] == "" {
		http.Error(w, "missing webhook source", http.StatusBadRequest)
		return
	}
	source := parts[0]

	// Read the raw HTTP request body
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "failed to read body", http.StatusInternalServerError)
		return
	}
	defer func() { _ = r.Body.Close() }()

	headers := map[string][]string(r.Header)

	// Route based on whether it is an Application Webhook or a Space Webhook
	if len(parts) == 1 {
		d.handleApplicationWebhook(w, r.Context(), source, headers, body)
	} else if len(parts) == 2 {
		spaceID := parts[1]
		d.handleUserWebhook(w, r.Context(), source, spaceID, headers, body)
	} else {
		http.Error(w, "invalid webhook path", http.StatusNotFound)
	}
}

func (d *Dispatcher) handleApplicationWebhook(w http.ResponseWriter, ctx context.Context, source string, headers map[string][]string, body []byte) {
	provider, exists := d.registry.GetProvider(source)
	if !exists {
		http.Error(w, "unknown webhook provider", http.StatusNotFound)
		return
	}

	// 1. Verify Request authenticity
	if err := provider.Verify(ctx, headers, body); err != nil {
		http.Error(w, fmt.Sprintf("unauthorized: %v", err), http.StatusUnauthorized)
		return
	}

	// 2. Process payload
	if err := provider.Process(ctx, "", headers, body); err != nil {
		http.Error(w, fmt.Sprintf("processing error: %v", err), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (d *Dispatcher) handleUserWebhook(w http.ResponseWriter, ctx context.Context, source, spaceID string, headers map[string][]string, body []byte) {
	provider, exists := d.registry.GetProvider(source)
	if !exists {
		http.Error(w, "unknown webhook provider", http.StatusNotFound)
		return
	}

	ctx = context.WithValue(ctx, spaceIDContextKey, spaceID)

	// 1. Verify Request authenticity
	if err := provider.Verify(ctx, headers, body); err != nil {
		http.Error(w, fmt.Sprintf("unauthorized: %v", err), http.StatusUnauthorized)
		return
	}

	// 2. Process payload
	if err := provider.Process(ctx, spaceID, headers, body); err != nil {
		http.Error(w, fmt.Sprintf("processing error: %v", err), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}
