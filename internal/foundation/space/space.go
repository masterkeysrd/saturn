// Package space provides semantics and functionality to work with
// spaces across layers and domains.
package space

import "context"

// ID represents a unique identifier for a space.
type ID string

func (sid ID) String() string {
	return string(sid)
}

// Role defines the level of access a user has within a space.
type Role string

const (
	RoleOwner  Role = "owner"  // Highest level of access.
	RoleAdmin  Role = "admin"  // Elevated access level (can manage users and settings).
	RoleMember Role = "member" // Standard access level (can view and contribute).
)

func (r Role) IsValid() bool {
	switch r {
	case RoleOwner, RoleAdmin, RoleMember:
		return true
	default:
		return false
	}
}

type spaceCtxKey struct{}

// InjectSpace injects the given SpaceID into the context.
func InjectSpace(ctx context.Context, spaceID ID) context.Context {
	if ctx == nil {
		ctx = context.Background()
	}

	return context.WithValue(ctx, spaceCtxKey{}, spaceID)
}

// GetCurrentSpace retrieves the SpaceID from the context.
func GetCurrentSpace(ctx context.Context) (ID, bool) {
	spaceID, ok := ctx.Value(spaceCtxKey{}).(ID)
	if !ok {
		return "", false
	}
	return spaceID, true
}
