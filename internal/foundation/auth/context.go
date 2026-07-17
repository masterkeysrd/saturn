package auth

import (
	"context"
)

type contextKey int

const (
	keyPrincipal contextKey = iota
	keyCurrentUser
)

// Principal contains stable authentication and authorization data derived from validated JWT claims.
type Principal struct {
	Subject     string
	AccessLevel string
	TokenID     string
	AuthVersion int64
}

// CurrentUser contains current profile and account data for RPCs that explicitly require it.
type CurrentUser struct {
	ID          string
	Email       string
	Username    string
	AccessLevel string
	Status      string
	AuthVersion int64
}

// WithPrincipal attaches a Principal to the context.
func WithPrincipal(ctx context.Context, principal Principal) context.Context {
	return context.WithValue(ctx, keyPrincipal, principal)
}

// PrincipalFromContext retrieves the Principal from the context.
func PrincipalFromContext(ctx context.Context) (Principal, bool) {
	p, ok := ctx.Value(keyPrincipal).(Principal)
	return p, ok
}

// WithCurrentUser attaches a CurrentUser to the context.
func WithCurrentUser(ctx context.Context, user CurrentUser) context.Context {
	return context.WithValue(ctx, keyCurrentUser, user)
}

// CurrentUserFromContext retrieves the CurrentUser from the context.
func CurrentUserFromContext(ctx context.Context) (CurrentUser, bool) {
	c, ok := ctx.Value(keyCurrentUser).(CurrentUser)
	return c, ok
}
