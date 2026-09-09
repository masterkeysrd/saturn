package middleware

import (
	"bytes"
	"net/http"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/log"
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
// Successful requests (status < 400) are logged at Info level.
func LoggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rw := newResponseWriter(w)
		start := time.Now()
		ctx := r.Context()

		defer func() {
			duration := time.Since(start)

			fields := []log.Field{
				log.String("method", r.Method),
				log.String("path", r.URL.Path),
				log.Int("status", rw.statusCode),
				log.Int64("bytes", rw.bytesWritten),
				log.Duration("duration", duration),
				log.String("remote", r.RemoteAddr),
			}

			if rw.statusCode >= http.StatusInternalServerError {
				if rw.bodyBuf.Len() > 0 {
					fields = append(fields, log.String("error", rw.bodyBuf.String()))
				}
				log.Error(ctx, "HTTP server error", fields...)
			} else if rw.statusCode >= http.StatusBadRequest {
				if rw.bodyBuf.Len() > 0 {
					fields = append(fields, log.String("error", rw.bodyBuf.String()))
				}
				log.Warn(ctx, "HTTP client error", fields...)
			} else {
				log.Info(ctx, "HTTP request completed", fields...)
			}
		}()

		next.ServeHTTP(rw, r)
	})
}
