package log

import (
	"io"
	"os"
)

// Format specifies the output encoding format for log records.
type Format string

const (
	// FormatJSON formats log records as JSON lines.
	FormatJSON Format = "json"
	// FormatText formats log records as human-readable key-value text.
	FormatText Format = "text"
)

// Config holds configuration parameters for initializing a Logger.
type Config struct {
	Level       Level
	Format      Format
	Output      io.Writer
	Middlewares []Middleware
	AddSource   bool
}

// Option configures a Config struct.
type Option func(*Config)

// DefaultConfig returns the recommended production defaults.
func DefaultConfig() Config {
	return Config{
		Level:     LevelInfo,
		Format:    FormatJSON,
		Output:    os.Stderr,
		AddSource: true,
	}
}

// WithLevel sets the minimum logging severity level.
func WithLevel(level Level) Option {
	return func(c *Config) {
		c.Level = level
	}
}

// WithFormat sets the output format (FormatJSON or FormatText).
func WithFormat(f Format) Option {
	return func(c *Config) {
		c.Format = f
	}
}

// WithJSON sets the output format to JSON.
func WithJSON() Option {
	return WithFormat(FormatJSON)
}

// WithText sets the output format to human-readable text.
func WithText() Option {
	return WithFormat(FormatText)
}

// WithOutput sets the output writer destination.
func WithOutput(w io.Writer) Option {
	return func(c *Config) {
		c.Output = w
	}
}

// WithMiddleware appends one or more Middlewares to the logger pipeline.
func WithMiddleware(mws ...Middleware) Option {
	return func(c *Config) {
		c.Middlewares = append(c.Middlewares, mws...)
	}
}

// WithSource configures whether caller source file and line number should be included.
func WithSource(enabled bool) Option {
	return func(c *Config) {
		c.AddSource = enabled
	}
}
