package middleware

import (
	"log/slog"
	"net/http"
	"time"
)

// responseWriter captures the response status code and bytes written.
type responseWriter struct {
	http.ResponseWriter
	statusCode   int
	bytesWritten int64
	wroteHeader  bool
}

func newResponseWriter(w http.ResponseWriter) *responseWriter {
	return &responseWriter{
		ResponseWriter: w,
		statusCode:     http.StatusOK,
	}
}

func (rw *responseWriter) WriteHeader(code int) {
	if !rw.wroteHeader {
		rw.statusCode = code
		rw.wroteHeader = true
		rw.ResponseWriter.WriteHeader(code)
	}
}

func (rw *responseWriter) Write(b []byte) (int, error) {
	if !rw.wroteHeader {
		rw.WriteHeader(http.StatusOK)
	}
	n, err := rw.ResponseWriter.Write(b)
	rw.bytesWritten += int64(n)
	return n, err
}

func (rw *responseWriter) Flush() {
	if f, ok := rw.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

// Unwrap supports standard http.ResponseController unwrapping.
func (rw *responseWriter) Unwrap() http.ResponseWriter {
	return rw.ResponseWriter
}

// LoggingMiddleware logs incoming HTTP requests with their status, latency, and bytes written.
// Server errors (status >= 500) are logged at Error level.
// Client errors (400 <= status < 500) are logged at Warn level.
func LoggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rw := newResponseWriter(w)
		start := time.Now()

		defer func() {
			duration := time.Since(start)

			if rw.statusCode >= http.StatusInternalServerError {
				slog.Error("HTTP server error",
					"method", r.Method,
					"path", r.URL.Path,
					"status", rw.statusCode,
					"bytes", rw.bytesWritten,
					"duration", duration,
					"remote", r.RemoteAddr,
				)
			} else if rw.statusCode >= http.StatusBadRequest {
				slog.Warn("HTTP client error",
					"method", r.Method,
					"path", r.URL.Path,
					"status", rw.statusCode,
					"bytes", rw.bytesWritten,
					"duration", duration,
					"remote", r.RemoteAddr,
				)
			}
		}()

		next.ServeHTTP(rw, r)
	})
}
