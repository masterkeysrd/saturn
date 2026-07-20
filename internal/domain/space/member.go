package space

import "time"

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
