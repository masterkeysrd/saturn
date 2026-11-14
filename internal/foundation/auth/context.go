package auth

import (
	"context"
	"slices"
)

type contextKey int

const (
	keyPrincipal contextKey = iota
	keyCurrentUser
)

// Principal contains stable authentication and authorization data derived from validated JWT claims or an API key.
type Principal struct {
	Subject         string
	AccessLevel     string
	TokenID         string
	AuthVersion     int64
	SessionID       string
	APIKeyID        string
	Scopes          []string
	GrantedSpaceIDs []string
}

// IsAPIKey returns true if the request was authenticated via a fine-grained API key.
func (p Principal) IsAPIKey() bool {
	return p.APIKeyID != ""
}

// HasScope returns true if the principal is not an API key or possesses at least one of the required scopes.
func (p Principal) HasScope(required ...string) bool {
	if !p.IsAPIKey() {
		return true
	}
	for _, r := range required {
		if slices.Contains(p.Scopes, r) {
			return true
		}
	}
	return false
}

// HasSpaceGrant returns true if the principal is not an API key or has an active grant for the given spaceID.
func (p Principal) HasSpaceGrant(spaceID string) bool {
	if !p.IsAPIKey() {
		return true
	}
	return slices.Contains(p.GrantedSpaceIDs, spaceID)
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
