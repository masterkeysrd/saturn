package access

import (
	"context"

	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/foundation/space"
)

type principalCtxKey struct{}

// UserID represents the unique identifier for a user in the system.
//
// This is an alias for [auth.UserID] to maintain to avoid importing the auth package
// throughout the access package.
type UserID = auth.UserID

type Principal struct {
	actorID UserID
	spaceID space.ID

	// SystemRole is the global role assigned to the principal,
	// outside of any specific space context.
	//
	// Eg: admin, superuser, etc.
	systemRole auth.Role

	// SpaceRole is the role assigned to the principal within the specific space.
	//
	// Eg: owner, admin, member, etc.
	spaceRole space.Role
}

func NewPrincipal(actorID auth.UserID, systemRole auth.Role) Principal {
	return Principal{
		actorID:    actorID,
		systemRole: systemRole,
	}
}

func (p Principal) WithSpace(spaceID space.ID, spaceRole space.Role) Principal {
	return Principal{
		actorID:    p.actorID,
		spaceID:    spaceID,
		systemRole: p.systemRole,
		spaceRole:  spaceRole,
	}
}

func (p Principal) ActorID() auth.UserID {
	return p.actorID
}

func (p Principal) SpaceID() space.ID {
	return p.spaceID
}

func (p Principal) SystemRole() auth.Role {
	return p.systemRole
}

func (p Principal) SpaceRole() space.Role {
	return p.spaceRole
}

// IsSystemAdmin checks if the principal has system-wide admin privileges.
func (p Principal) IsSystemAdmin() bool {
	return p.systemRole == auth.RoleAdmin
}

// IsSpaceOwner checks if the principal is the owner of the space.
func (p Principal) IsSpaceOwner() bool {
	return p.spaceRole == space.RoleOwner
}

func (p Principal) IsSpaceAdmin() bool {
	return p.spaceRole == space.RoleAdmin || p.spaceRole == space.RoleOwner
}

func (p Principal) IsSpaceMember() bool {
	return p.spaceRole == space.RoleMember || p.IsSpaceAdmin()
}

func (p *Principal) CanManageSpace() bool {
	if p == nil {
		return false
	}
	return p.IsSpaceAdmin() || p.IsSystemAdmin()
}

func InjectPrincipal(ctx context.Context, principal Principal) context.Context {
	if ctx == nil {
		ctx = context.Background()
	}

	return context.WithValue(ctx, principalCtxKey{}, principal)
}

func GetPrincipal(ctx context.Context) (Principal, bool) {
	principal, ok := ctx.Value(principalCtxKey{}).(Principal)
	if !ok {
		return Principal{}, false
	}
	return principal, true
}
