package space

import (
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/patch"
)

// Member represents a membership in a workspace.
type Member struct {
	SpaceID    SpaceID   `json:"space_id"`
	UserID     SpaceID   `json:"user_id"`
	Role       SpaceRole `json:"role"`
	CreateTime time.Time `json:"create_time"`
	UpdateTime time.Time `json:"update_time"`
}

// IsOwner returns true if the member has the owner role.
func (m *Member) IsOwner() bool {
	return m.Role == RoleOwner
}

// IsAdmin returns true if the member has the admin or owner role.
func (m *Member) IsAdmin() bool {
	return m.Role == RoleAdmin || m.Role == RoleOwner
}

// CanManageMembers returns true if the member can add/remove members.
func (m *Member) CanManageMembers() bool {
	return m.Role == RoleAdmin || m.Role == RoleOwner
}

// CanDeleteSpace returns true if the member can delete the space.
func (m *Member) CanDeleteSpace() bool {
	return m.Role == RoleOwner
}

// MemberPatchSchema defines all patchable fields for a Member entity.
var MemberPatchSchema = patch.NewSchema[Member]().
	Register("role", patch.Field(func(m *Member) *SpaceRole { return &m.Role }))

// ApplyPatch applies partial updates from an incoming member based on the field mask.
func (m *Member) ApplyPatch(incoming *Member, mask []string) error {
	if incoming == nil {
		return errors.E(errors.Invalid, "member payload is required")
	}
	if err := MemberPatchSchema.Apply(m, incoming, mask); err != nil {
		return errors.E(errors.Invalid, err)
	}
	m.UpdateTime = time.Now().UTC()
	return m.Validate()
}

// Validate checks member invariants and required fields.
func (m *Member) Validate() error {
	if m == nil {
		return errors.E(errors.Invalid, "member payload is required")
	}
	if m.UserID == "" {
		return errors.E(errors.Invalid, "member.user_id is required")
	}
	if !m.Role.IsValid() {
		return errors.E(errors.Invalid, InvalidRole, "invalid role")
	}
	return nil
}
