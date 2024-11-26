package log

import (
	"context"
	"log/slog"
	"os"
)

// Logger is a type alias for [slog.Logger].
type Logger = slog.Logger

// Init initializes the default logger.
func Init() {
	slog.SetDefault(New())
}

// New creates a new logger.
func New() *Logger {
	return slog.New(
		slog.NewJSONHandler(os.Stderr, nil),
	)
}

func InfoCtx(ctx context.Context, msg string, attrs ...slog.Attr) {
	slog.InfoContext(ctx, msg, argsToAttrs(attrs)...)
}

func argsToAttrs(args []slog.Attr) []any {
	attrs := make([]any, len(args))
	for i, arg := range args {
		attrs[i] = arg
	}
	return attrs
}

func String(key, value string) slog.Attr {
	return slog.String(key, value)
}

func Any(key string, value any) slog.Attr {
	return slog.Any(key, value)
}
