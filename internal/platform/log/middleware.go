package log

import (
	"context"
	"strings"
)

// Middleware intercepts a log entry before it is written to the backend handler.
// It can inspect, mutate, or append strongly-typed Fields without heap allocations
// when working within the pre-allocated slice buffer.
type Middleware interface {
	Process(ctx context.Context, level Level, msg string, fields []Field) []Field
}

// MiddlewareFunc is an adapter to allow the use of ordinary functions as Middleware.
type MiddlewareFunc func(ctx context.Context, level Level, msg string, fields []Field) []Field

// Process calls f(ctx, level, msg, fields).
func (f MiddlewareFunc) Process(ctx context.Context, level Level, msg string, fields []Field) []Field {
	return f(ctx, level, msg, fields)
}

// ContextEnricher creates a middleware that extracts fields from context using
// provided extractor functions.
func ContextEnricher(extractors ...func(ctx context.Context) []Field) Middleware {
	return MiddlewareFunc(func(ctx context.Context, level Level, msg string, fields []Field) []Field {
		for _, extractor := range extractors {
			if extracted := extractor(ctx); len(extracted) > 0 {
				fields = append(fields, extracted...)
			}
		}
		return fields
	})
}

// DefaultRedactedKeys contains commonly targeted sensitive field keys.
var DefaultRedactedKeys = []string{
	"password",
	"secret",
	"token",
	"authorization",
	"api_key",
	"apikey",
	"credential",
	"private_key",
}

// Redaction returns a middleware that masks values of sensitive keys.
// If keys are not provided, DefaultRedactedKeys are used.
func Redaction(keys ...string) Middleware {
	if len(keys) == 0 {
		keys = DefaultRedactedKeys
	}
	lookup := make(map[string]struct{}, len(keys))
	for _, k := range keys {
		lookup[strings.ToLower(k)] = struct{}{}
	}

	return MiddlewareFunc(func(ctx context.Context, level Level, msg string, fields []Field) []Field {
		for i := range fields {
			if _, match := lookup[strings.ToLower(fields[i].Key)]; match {
				fields[i] = String(fields[i].Key, "[REDACTED]")
			}
		}
		return fields
	})
}
