package middleware

import (
	"context"
	"net/http"
	"net/textproto"
	"strings"

	"github.com/masterkeysrd/saturn/internal/foundation/auth"
)

var AuthorizationHeader = textproto.CanonicalMIMEHeaderKey("Authorization")

type AuthMiddlewareConfig struct {
	// Paths to exempt from authentication.
	ExemptPaths []string

	// Function to validate the token.
	TokenParser func(context.Context, auth.Token) (*auth.UserPassport, error)
}

type AuthMiddleware struct {
	config AuthMiddlewareConfig
}

func NewAuthMiddleware(config AuthMiddlewareConfig) *AuthMiddleware {
	return &AuthMiddleware{
		config: config,
	}
}

func (am *AuthMiddleware) Handler(next http.Handler) http.Handler {
	exemptPaths := make(map[string]struct{})
	for _, path := range am.config.ExemptPaths {
		exemptPaths[path] = struct{}{}
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, skip := exemptPaths[r.URL.Path]; skip {
			next.ServeHTTP(w, r)
			return
		}

		authorization := r.Header[AuthorizationHeader]
		if len(authorization) == 0 {
			http.Error(w, "Missing Authorization header", http.StatusUnauthorized)
			return
		}

		parts := strings.SplitN(authorization[0], " ", 2)
		if len(parts) != 2 {
			http.Error(w, "Invalid Authorization header format", http.StatusUnauthorized)
		}

		prefix, token := parts[0], parts[1]
		if strings.ToLower(prefix) != "bearer" {
			http.Error(w, "Unsupported authorization scheme", http.StatusUnauthorized)
			return
		}

		ctx := r.Context()
		passport, err := am.config.TokenParser(ctx, auth.Token(token))
		if err != nil {
			http.Error(w, "Invalid or expired token", http.StatusUnauthorized)
			return
		}

		ctx = auth.InjectUserPassport(ctx, passport)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
