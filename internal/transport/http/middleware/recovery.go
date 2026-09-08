package middleware

import (
	"log/slog"
	"net/http"
	"runtime/debug"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

// RecoveryMiddleware catches and recovers from runtime panics in downstream HTTP handlers,
// logs the stack trace, and writes a standard sanitized 500 Internal Server Error response.
func RecoveryMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				slog.Error("panic recovered in HTTP handler",
					"method", r.Method,
					"path", r.URL.Path,
					"panic", rec,
					"stack", string(debug.Stack()),
					"remote", r.RemoteAddr,
				)
				WriteHTTP(w, errors.E(errors.Internal, "panic recovered"))
			}
		}()
		next.ServeHTTP(w, r)
	})
}
