package requestid

import (
	"context"
	"net/http"
	"sync/atomic"

	"github.com/masterkeysrd/saturn/internal/platform/id"
	"github.com/masterkeysrd/saturn/internal/platform/log"
)

// Standard headers and context keys.
const (
	// Header is the standard HTTP header for propagating the request ID.
	Header = "X-Request-ID"

	// MetadataKey is the standard gRPC metadata key for propagating the request ID.
	MetadataKey = "x-request-id"

	// LogKey is the structured logging attribute key for the request ID.
	LogKey = "request_id"

	// DefaultPrefix is the default prefix prepended to newly generated request IDs.
	DefaultPrefix = "req_"
)

type contextKey struct{}

var (
	requestIDCtxKey = contextKey{}
	generatorFn     atomic.Pointer[func() string]
)

func init() {
	defaultGen := func() string {
		newID, err := id.Generate(DefaultPrefix)
		if err != nil {
			return DefaultPrefix + "fallback"
		}
		return newID
	}
	generatorFn.Store(&defaultGen)
}

// Generate creates a new unique request ID using the configured generator.
func Generate() string {
	fn := generatorFn.Load()
	if fn != nil && *fn != nil {
		return (*fn)()
	}
	newID, _ := id.Generate(DefaultPrefix)
	return newID
}

// SetGenerator overrides the request ID generation function (useful for testing).
func SetGenerator(fn func() string) {
	if fn == nil {
		ResetGenerator()
		return
	}
	generatorFn.Store(&fn)
}

// ResetGenerator restores the default KSUID-based request ID generator.
func ResetGenerator() {
	defaultGen := func() string {
		newID, err := id.Generate(DefaultPrefix)
		if err != nil {
			return DefaultPrefix + "fallback"
		}
		return newID
	}
	generatorFn.Store(&defaultGen)
}

// With injects the given request ID into the context.
func With(ctx context.Context, reqID string) context.Context {
	return context.WithValue(ctx, requestIDCtxKey, reqID)
}

// From extracts the request ID from the context. Returns an empty string if not found.
func From(ctx context.Context) string {
	if ctx == nil {
		return ""
	}
	if val, ok := ctx.Value(requestIDCtxKey).(string); ok {
		return val
	}
	return ""
}

// FromOrNew extracts the request ID from the context if present; otherwise, it generates
// a new request ID, injects it into a derived context, and returns both.
func FromOrNew(ctx context.Context) (context.Context, string) {
	if reqID := From(ctx); reqID != "" {
		return ctx, reqID
	}
	newID := Generate()
	return With(ctx, newID), newID
}

// Field returns a structured log Field containing the request ID from the context,
// or a zero-value Field if none is present.
func Field(ctx context.Context) log.Field {
	if reqID := From(ctx); reqID != "" {
		return log.String(LogKey, reqID)
	}
	return log.Field{}
}

// Enricher returns a logging middleware that automatically appends the request ID
// to all log entries if present in context.Context.
func Enricher() log.Middleware {
	return log.ContextEnricher(func(ctx context.Context) []log.Field {
		if reqID := From(ctx); reqID != "" {
			return []log.Field{log.String(LogKey, reqID)}
		}
		return nil
	})
}

// Middleware returns an HTTP middleware that extracts the X-Request-ID header from incoming requests,
// or generates a new one if absent. It injects the request ID into the request context and writes it
// back to the response headers.
func Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reqID := r.Header.Get(Header)
		if reqID == "" {
			reqID = Generate()
		}

		ctx := With(r.Context(), reqID)
		w.Header().Set(Header, reqID)

		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
