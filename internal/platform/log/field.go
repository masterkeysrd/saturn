package log

import (
	"log/slog"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

// Field represents a strongly-typed key-value logging attribute.
// It wraps slog.Attr so primitive values (ints, strings, bools, durations)
// are stored inline without escaping to the heap.
type Field = slog.Attr

// String constructs a string Field.
func String(key, val string) Field {
	return slog.String(key, val)
}

// Int constructs an int Field.
func Int(key string, val int) Field {
	return slog.Int(key, val)
}

// Int64 constructs an int64 Field.
func Int64(key string, val int64) Field {
	return slog.Int64(key, val)
}

// Uint64 constructs a uint64 Field.
func Uint64(key string, val uint64) Field {
	return slog.Uint64(key, val)
}

// Float64 constructs a float64 Field.
func Float64(key string, val float64) Field {
	return slog.Float64(key, val)
}

// Bool constructs a bool Field.
func Bool(key string, val bool) Field {
	return slog.Bool(key, val)
}

// Duration constructs a time.Duration Field.
func Duration(key string, val time.Duration) Field {
	return slog.Duration(key, val)
}

// Time constructs a time.Time Field.
func Time(key string, val time.Time) Field {
	return slog.Time(key, val)
}

// Any constructs a Field with an arbitrary value.
// Prefer using the strongly-typed constructors where possible to avoid boxing.
func Any(key string, val any) Field {
	return slog.Any(key, val)
}

// Group constructs a composite Field grouping multiple nested Fields.
func Group(key string, fields ...Field) Field {
	return slog.GroupAttrs(key, fields...)
}

// Err constructs a structured error Field.
// If err wraps a Saturn platform Error, it automatically unpacks the operational trace,
// error code, kind, and user-facing message into a structured group attribute.
func Err(err error) Field {
	if err == nil {
		return Field{}
	}

	code := errors.CodeOf(err)
	kind := errors.KindOf(err)

	// If it has platform error codes or kinds, construct a structured group
	if code != "" || kind != errors.Other {
		fields := make([]Field, 0, 4)
		fields = append(fields, String("message", errors.UserMessage(err)))
		if code != "" {
			fields = append(fields, String("code", string(code)))
		}
		if kind != errors.Other {
			fields = append(fields, String("kind", kind.String()))
		}
		fields = append(fields, String("op_trace", err.Error()))

		return Group("error", fields...)
	}

	return String("error", err.Error())
}
