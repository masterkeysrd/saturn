package auth

import (
	"context"
)

type spaceContextKey int

const (
	keySpaceID spaceContextKey = iota
	keySpaceRole
)

// SpaceContext holds the active workspace scope for an RPC.
type SpaceContext struct {
	SpaceID string
	Role    string
}

// WithSpaceID attaches a Space ID to the context.
func WithSpaceID(ctx context.Context, spaceID string) context.Context {
	sc := getSpaceContext(ctx)
	sc.SpaceID = spaceID
	return context.WithValue(ctx, keySpaceID, sc)
}

// SpaceIDFromContext retrieves the Space ID from the context.
func SpaceIDFromContext(ctx context.Context) (string, bool) {
	sc, ok := ctx.Value(keySpaceID).(SpaceContext)
	return sc.SpaceID, ok && sc.SpaceID != ""
}

// WithSpaceRole attaches a Space Role to the context.
func WithSpaceRole(ctx context.Context, role string) context.Context {
	sc := getSpaceContext(ctx)
	sc.Role = role
	return context.WithValue(ctx, keySpaceID, sc)
}

// SpaceRoleFromContext retrieves the Space Role from the context.
func SpaceRoleFromContext(ctx context.Context) (string, bool) {
	sc, ok := ctx.Value(keySpaceID).(SpaceContext)
	return sc.Role, ok && sc.Role != ""
}

// WithSpaceScope attaches both Space ID and Role to the context.
func WithSpaceScope(ctx context.Context, spaceID, role string) context.Context {
	sc := SpaceContext{SpaceID: spaceID, Role: role}
	return context.WithValue(ctx, keySpaceID, sc)
}

// SpaceContextFromContext retrieves the full SpaceContext.
func SpaceContextFromContext(ctx context.Context) (SpaceContext, bool) {
	sc, ok := ctx.Value(keySpaceID).(SpaceContext)
	return sc, ok
}

func getSpaceContext(ctx context.Context) SpaceContext {
	if sc, ok := ctx.Value(keySpaceID).(SpaceContext); ok {
		return sc
	}
	return SpaceContext{}
}
