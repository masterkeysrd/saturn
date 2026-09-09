package middleware

import (
	"bytes"
	"log/slog"
	"net/http"
	"time"
)

// responseWriter captures the response status code, bytes written, and error body snippet.
type responseWriter struct {
	http.ResponseWriter
	statusCode   int
	bytesWritten int64
	wroteHeader  bool
	bodyBuf      bytes.Buffer
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
	if rw.statusCode >= http.StatusBadRequest && rw.bodyBuf.Len() < 1024 {
		remaining := 1024 - rw.bodyBuf.Len()
		if len(b) <= remaining {
			rw.bodyBuf.Write(b)
		} else {
			rw.bodyBuf.Write(b[:remaining])
		}
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
// Client errors (400 <= status < 500) are logged at Warn level with error response details.
func LoggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rw := newResponseWriter(w)
		start := time.Now()

		defer func() {
			duration := time.Since(start)

			if rw.statusCode >= http.StatusInternalServerError {
				attrs := []any{
					"method", r.Method,
					"path", r.URL.Path,
					"status", rw.statusCode,
					"bytes", rw.bytesWritten,
					"duration", duration,
					"remote", r.RemoteAddr,
				}
				if rw.bodyBuf.Len() > 0 {
					attrs = append(attrs, "error", rw.bodyBuf.String())
				}
				slog.Error("HTTP server error", attrs...)
			} else if rw.statusCode >= http.StatusBadRequest {
				attrs := []any{
					"method", r.Method,
					"path", r.URL.Path,
					"status", rw.statusCode,
					"bytes", rw.bytesWritten,
					"duration", duration,
					"remote", r.RemoteAddr,
				}
				if rw.bodyBuf.Len() > 0 {
					attrs = append(attrs, "error", rw.bodyBuf.String())
				}
				slog.Warn("HTTP client error", attrs...)
			}
		}()

		next.ServeHTTP(rw, r)
	})
}
