package middleware

import (
	"fmt"
	"net/http"
	"runtime/debug"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/log"
)

// RecoveryMiddleware catches and recovers from runtime panics in downstream HTTP handlers,
// logs the stack trace, and writes a standard sanitized 500 Internal Server Error response.
func RecoveryMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				fields := []log.Field{
					log.String("method", r.Method),
					log.String("path", r.URL.Path),
					log.String("panic", fmt.Sprint(rec)),
					log.String("stack", string(debug.Stack())),
					log.String("remote", r.RemoteAddr),
				}
				log.Error(r.Context(), "panic recovered in HTTP handler", fields...)
				WriteHTTP(w, errors.E(errors.Internal, "panic recovered"))
			}
		}()
		next.ServeHTTP(w, r)
	})
}
