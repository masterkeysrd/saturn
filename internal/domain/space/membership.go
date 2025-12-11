package space

import (
	"context"
	"errors"
	"time"

	"github.com/masterkeysrd/saturn/internal/foundation/audit"
	"github.com/masterkeysrd/saturn/internal/foundation/space"
)

type Role = space.Role

const (
	RoleOwner  Role = space.RoleOwner
	RoleAdmin  Role = space.RoleAdmin
	RoleMember Role = space.RoleMember
)

type MembershipStore interface {
	// Get retrieves a membership by its ID.
	Get(context.Context, MembershipID) (*Membership, error)

	// Store saves a new membership to the store.
	Store(context.Context, *Membership) error

	// Delete removes a membership from the store by its ID.
	Delete(context.Context, MembershipID) error

	// ListBy retrieves memberships based on the given criteria.
	ListBy(context.Context, ListMembershipsCriteria) ([]*Membership, error)
}

type ListMembershipsCriteria interface {
	isListMembershipsCriteria()
}

type MembershipID struct {
	SpaceID SpaceID
	UserID  UserID
}

func (mid MembershipID) String() string {
	return string(mid.SpaceID) + ":" + string(mid.UserID)
}

// Membership represents the association of a user with a space,
type Membership struct {
	ID       MembershipID
	Role     Role
	JoinedAt time.Time

	audit.Metadata
}

func (m *Membership) Initialize(actor UserID) error {
	if m == nil {
		return nil
	}

	now := time.Now().UTC()
	m.JoinedAt = now
	m.Metadata = audit.NewMetadata(actor)
	return nil
}

func (m *Membership) Validate() error {
	if m == nil {
		return nil
	}

	if m.ID.SpaceID == "" {
		return errors.New("invalid membership ID: missing SpaceID")
	}

	if m.ID.UserID == "" {
		return errors.New("invalid membership ID: missing UserID")
	}

	if !m.Role.IsValid() {
		return errors.New("invalid membership role")
	}

	return nil
}

func (m *Membership) IsOwner() bool {
	if m == nil {
		return false
	}
	return m.Role == RoleOwner
}

func (m *Membership) CanManageSpace() bool {
	if m == nil {
		return false
	}
	return m.Role == RoleOwner || m.Role == RoleAdmin
}

func (m *Membership) CanManageUsers() bool {
	if m == nil {
		return false
	}
	return m.Role == RoleOwner || m.Role == RoleAdmin
}
