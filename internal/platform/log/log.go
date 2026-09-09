package log

import (
	"context"
	"log/slog"
	"os"
	"runtime"
	"sync/atomic"
	"time"
)

// Logger defines the strongly-typed logging interface for Saturn.
// All log methods require a context and accept strongly-typed Fields.
type Logger interface {
	Debug(ctx context.Context, msg string, fields ...Field)
	Info(ctx context.Context, msg string, fields ...Field)
	Warn(ctx context.Context, msg string, fields ...Field)
	Error(ctx context.Context, msg string, fields ...Field)
	With(fields ...Field) Logger
	WithGroup(name string) Logger
	Level() Level
}

// logger is the default concrete implementation of Logger.
type logger struct {
	backend     slog.Handler
	level       Level
	middlewares []Middleware
}

var _ Logger = (*logger)(nil)

// New initializes a Logger with functional options.
func New(opts ...Option) Logger {
	cfg := DefaultConfig()
	for _, opt := range opts {
		opt(&cfg)
	}
	return NewWithConfig(cfg)
}

// NewWithConfig initializes a Logger with a Config struct.
func NewWithConfig(cfg Config) Logger {
	if cfg.Output == nil {
		cfg.Output = os.Stderr
	}
	if cfg.Format == "" {
		cfg.Format = FormatJSON
	}

	opts := &slog.HandlerOptions{
		Level:     cfg.Level,
		AddSource: cfg.AddSource,
	}

	var backend slog.Handler
	if cfg.Format == FormatText {
		backend = slog.NewTextHandler(cfg.Output, opts)
	} else {
		backend = slog.NewJSONHandler(cfg.Output, opts)
	}

	return &logger{
		backend:     backend,
		level:       cfg.Level,
		middlewares: cfg.Middlewares,
	}
}

// Level returns the current minimum logging level.
func (l *logger) Level() Level {
	return l.level
}

// log executes the zero-allocation middleware pipeline and passes the record to the backend.
func (l *logger) log(ctx context.Context, level Level, msg string, skip int, fields ...Field) {
	if !l.backend.Enabled(ctx, level) {
		return
	}

	// Pre-allocated stack buffer for up to 16 Fields without heap allocation.
	var stackBuf [16]Field
	attrs := stackBuf[:0]
	attrs = append(attrs, fields...)

	// Execute registered middlewares in order.
	for _, mw := range l.middlewares {
		attrs = mw.Process(ctx, level, msg, attrs)
	}

	var pcs [1]uintptr
	runtime.Callers(skip, pcs[:])

	r := slog.NewRecord(time.Now(), level, msg, pcs[0])
	r.AddAttrs(attrs...)

	_ = l.backend.Handle(ctx, r)
}

// Debug logs a message at LevelDebug.
func (l *logger) Debug(ctx context.Context, msg string, fields ...Field) {
	l.log(ctx, LevelDebug, msg, 3, fields...)
}

// Info logs a message at LevelInfo.
func (l *logger) Info(ctx context.Context, msg string, fields ...Field) {
	l.log(ctx, LevelInfo, msg, 3, fields...)
}

// Warn logs a message at LevelWarn.
func (l *logger) Warn(ctx context.Context, msg string, fields ...Field) {
	l.log(ctx, LevelWarn, msg, 3, fields...)
}

// Error logs a message at LevelError.
func (l *logger) Error(ctx context.Context, msg string, fields ...Field) {
	l.log(ctx, LevelError, msg, 3, fields...)
}

// With returns a new Logger enriched with persistent Fields.
func (l *logger) With(fields ...Field) Logger {
	return &logger{
		backend:     l.backend.WithAttrs(fields),
		level:       l.level,
		middlewares: l.middlewares,
	}
}

// WithGroup returns a new Logger that qualifies all subsequent fields inside a named group.
func (l *logger) WithGroup(name string) Logger {
	return &logger{
		backend:     l.backend.WithGroup(name),
		level:       l.level,
		middlewares: l.middlewares,
	}
}

// Global default logger instance.
var defaultLogger atomic.Value

func init() {
	defaultLogger.Store(New(WithLevel(LevelInfo), WithJSON()))
}

// SetDefault replaces the global package-level logger.
func SetDefault(l Logger) {
	defaultLogger.Store(l)
}

// Default returns the global package-level logger.
func Default() Logger {
	return defaultLogger.Load().(Logger)
}

// Debug logs at LevelDebug on the default logger.
func Debug(ctx context.Context, msg string, fields ...Field) {
	if impl, ok := Default().(*logger); ok {
		impl.log(ctx, LevelDebug, msg, 3, fields...)
	} else {
		Default().Debug(ctx, msg, fields...)
	}
}

// Info logs at LevelInfo on the default logger.
func Info(ctx context.Context, msg string, fields ...Field) {
	if impl, ok := Default().(*logger); ok {
		impl.log(ctx, LevelInfo, msg, 3, fields...)
	} else {
		Default().Info(ctx, msg, fields...)
	}
}

// Warn logs at LevelWarn on the default logger.
func Warn(ctx context.Context, msg string, fields ...Field) {
	if impl, ok := Default().(*logger); ok {
		impl.log(ctx, LevelWarn, msg, 3, fields...)
	} else {
		Default().Warn(ctx, msg, fields...)
	}
}

// Error logs at LevelError on the default logger.
func Error(ctx context.Context, msg string, fields ...Field) {
	if impl, ok := Default().(*logger); ok {
		impl.log(ctx, LevelError, msg, 3, fields...)
	} else {
		Default().Error(ctx, msg, fields...)
	}
}

// With returns a new Logger with the given fields attached.
func With(fields ...Field) Logger {
	return Default().With(fields...)
}

// WithGroup returns a new Logger that starts a group with the given name.
func WithGroup(name string) Logger {
	return Default().WithGroup(name)
}
