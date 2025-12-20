package middleware

import (
	"net/http"

	"github.com/masterkeysrd/saturn/internal/foundation/access"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
)

type AccessConfig struct {
	// Paths to exempt from using access control.
	ExemptPaths []string
}

func NewAccessMiddleware(config AccessConfig) *AccessMiddleware {
	exemptPaths := make(map[string]struct{})
	for _, path := range config.ExemptPaths {
		exemptPaths[path] = struct{}{}
	}

	return &AccessMiddleware{
		config:      config,
		exemptPaths: exemptPaths,
	}
}

type AccessMiddleware struct {
	config      AccessConfig
	exemptPaths map[string]struct{}
}

func (am *AccessMiddleware) Handler(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, skip := am.exemptPaths[r.URL.Path]; skip {
			next.ServeHTTP(w, r)
			return
		}

		ctx := r.Context()
		passport, ok := auth.GetCurrentUserPassport(ctx)
		if !ok {
			http.Error(w, "Unauthenticated: user passport not found", http.StatusUnauthorized)
			return
		}

		principal := access.NewPrincipal(passport.UserID(), passport.Role())
		ctx = access.InjectPrincipal(ctx, principal)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
