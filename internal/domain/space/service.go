package space

import (
	"context"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
	"github.com/masterkeysrd/saturn/internal/platform/settings"
)

// Dependencies holds all storage interfaces and clients required by the Service.
type Dependencies struct {
	SpaceStore  SpaceStore
	MemberStore MemberStore
	Settings    SettingsClient
}

// Service handles space business logic.
type Service struct {
	deps Dependencies
}

// NewService creates a new Service.
func NewService(deps Dependencies) *Service {
	return &Service{deps: deps}
}

// Guard defines a validation rule executed against the authenticated caller's membership.
type Guard func(m *Member) error

// requireOwner ensures the caller is the space owner.
func requireOwner(m *Member) error {
	if m == nil || !m.IsOwner() {
		return errors.E(errors.Permission, OwnerOnly, "only the owner can perform this operation")
	}
	return nil
}

// requireManageMembers ensures the caller is an admin or owner.
func requireManageMembers(m *Member) error {
	if m == nil || !m.CanManageMembers() {
		return errors.E(errors.Permission, InsufficientRole, "insufficient role to manage members")
	}
	return nil
}

// requireManageSettings ensures the caller is an admin or owner.
func requireManageSettings(m *Member) error {
	if m == nil || !m.CanManageSettings() {
		return errors.E(errors.Permission, InsufficientRole, "only space admins and owners can update space settings")
	}
	return nil
}

// authorize checks caller membership and evaluates any provided guards.
// If no guards are provided, simple active membership is required.
func (s *Service) authorize(ctx context.Context, session Session, guards ...Guard) (*Member, error) {
	member, err := s.deps.MemberStore.GetByID(ctx, session.SpaceID, session.UserID)
	if err != nil && !errors.Is(err, errors.NotExist) {
		return nil, errors.E(err)
	}

	if len(guards) == 0 {
		if member == nil {
			return nil, errors.E(errors.Permission, InsufficientRole, "access denied to this space")
		}
		return member, nil
	}

	for _, guard := range guards {
		if err := guard(member); err != nil {
			return nil, err
		}
	}

	return member, nil
}

// CreateSpace creates a new workspace with the caller as owner.
func (s *Service) CreateSpace(ctx context.Context, space *Space) (*Space, error) {
	const op errors.Op = "domain/space.CreateSpace"

	// Validate and sanitize space name using model validation
	if err := space.Validate(); err != nil {
		return nil, errors.E(op, errors.Invalid, err)
	}

	// Check if a space with this name already exists for this owner
	page, err := s.deps.SpaceStore.ListByUserOwned(ctx, space.OwnerID, &ListSpacesFilter{})
	if err == nil && page != nil {
		for _, sp := range page.Items {
			if sp.Name == space.Name {
				return nil, errors.E(op, errors.Exist, NameExists, "space name already exists")
			}
		}
	}

	// Generate space ID
	spaceID, err := NewSpaceID()
	if err != nil {
		return nil, errors.E(op, err)
	}

	space.ID = spaceID
	space.Version = 1
	space.CreateTime = time.Now()
	space.UpdateTime = time.Now()

	if err := s.deps.SpaceStore.Create(ctx, space); err != nil {
		return nil, errors.E(op, err)
	}

	// Create owner membership
	member := &Member{
		SpaceID:    spaceID,
		UserID:     space.OwnerID,
		Role:       RoleOwner,
		CreateTime: time.Now(),
		UpdateTime: time.Now(),
	}
	if err := s.deps.MemberStore.Create(ctx, member); err != nil {
		return nil, errors.E(op, err)
	}

	return space, nil
}

// GetSpace retrieves a workspace by ID. Requestor must be a member.
func (s *Service) GetSpace(ctx context.Context, session Session) (*Space, error) {
	const op errors.Op = "domain/space.GetSpace"

	if _, err := s.authorize(ctx, session); err != nil {
		return nil, errors.E(op, err)
	}

	space, err := s.deps.SpaceStore.GetByID(ctx, session.SpaceID)
	if err != nil {
		if errors.Is(err, errors.NotExist) {
			return nil, errors.E(op, errors.NotExist, NotFound, "space not found")
		}
		return nil, errors.E(op, err)
	}
	return space, nil
}

// UpdateSpace updates a workspace.
func (s *Service) UpdateSpace(ctx context.Context, session Session, updated *Space, mask []string) (*Space, error) {
	const op errors.Op = "domain/space.UpdateSpace"

	space, err := s.deps.SpaceStore.GetByID(ctx, session.SpaceID)
	if err != nil {
		if errors.Is(err, errors.NotExist) {
			return nil, errors.E(op, errors.NotExist, NotFound, "space not found")
		}
		return nil, errors.E(op, err)
	}

	if _, err := s.authorize(ctx, session, requireOwner); err != nil {
		return nil, errors.E(op, err)
	}

	if updated.Version > 0 && updated.Version != space.Version {
		return nil, errors.E(op, errors.Conflict, VersionMismatch, "space was modified concurrently")
	}

	if err := space.ApplyPatch(updated, mask); err != nil {
		return nil, errors.E(op, errors.Invalid, err)
	}

	if err := s.deps.SpaceStore.Update(ctx, space); err != nil {
		return nil, errors.E(op, err)
	}

	return space, nil
}

// DeleteSpace deletes a workspace. Only the owner can delete.
func (s *Service) DeleteSpace(ctx context.Context, session Session) error {
	const op errors.Op = "domain/space.DeleteSpace"

	if _, err := s.authorize(ctx, session, requireOwner); err != nil {
		return errors.E(op, err)
	}

	if err := s.deps.SpaceStore.Delete(ctx, session.SpaceID); err != nil {
		return errors.E(op, err)
	}
	return nil
}

// ListSpaces lists all spaces the user has access to (owned or joined).
func (s *Service) ListSpaces(ctx context.Context, userID SpaceID, filter *ListSpacesFilter) (*paging.Page[*Space], error) {
	const op errors.Op = "domain/space.ListSpaces"

	page, err := s.deps.SpaceStore.ListByUser(ctx, userID, filter)
	if err != nil {
		return nil, errors.E(op, err)
	}

	return page, nil
}

// AddSpaceMember adds a member to a workspace.
func (s *Service) AddSpaceMember(ctx context.Context, session Session, member *Member) (*Member, error) {
	const op errors.Op = "domain/space.AddSpaceMember"

	// Validate member invariants using model validation
	if err := member.Validate(); err != nil {
		return nil, errors.E(op, err)
	}

	// Prevent adding another owner
	if member.Role == RoleOwner {
		return nil, errors.E(op, errors.Permission, OwnerOnly, "cannot assign owner role")
	}

	if _, err := s.authorize(ctx, session, requireManageMembers); err != nil {
		return nil, errors.E(op, err)
	}

	// Check space exists
	_, err := s.deps.SpaceStore.GetByID(ctx, session.SpaceID)
	if err != nil {
		if errors.Is(err, errors.NotExist) {
			return nil, errors.E(op, errors.NotExist, NotFound, "space not found")
		}
		return nil, errors.E(op, err)
	}

	// Check member already exists
	exists, err := s.deps.MemberStore.Exists(ctx, session.SpaceID, member.UserID)
	if err != nil {
		return nil, errors.E(op, err)
	}
	if exists {
		return nil, errors.E(op, errors.Exist, MemberAlreadyExists, "member already exists")
	}

	member.SpaceID = session.SpaceID
	member.CreateTime = time.Now()
	member.UpdateTime = time.Now()

	if err := s.deps.MemberStore.Create(ctx, member); err != nil {
		return nil, errors.E(op, err)
	}

	return member, nil
}

// RemoveSpaceMember removes a member from a workspace.
func (s *Service) RemoveSpaceMember(ctx context.Context, session Session, userID SpaceID) error {
	const op errors.Op = "domain/space.RemoveSpaceMember"

	if _, err := s.authorize(ctx, session, requireManageMembers); err != nil {
		return errors.E(op, err)
	}

	// Fetch target member
	targetMember, err := s.deps.MemberStore.GetByID(ctx, session.SpaceID, userID)
	if err != nil {
		if errors.Is(err, errors.NotExist) {
			return errors.E(op, errors.NotExist, MemberNotFound, "member not found")
		}
		return errors.E(op, err)
	}

	// Prevent removing space owner
	if targetMember.IsOwner() {
		return errors.E(op, errors.Permission, OwnerOnly, "cannot remove space owner")
	}

	if err := s.deps.MemberStore.Delete(ctx, session.SpaceID, userID); err != nil {
		return errors.E(op, err)
	}
	return nil
}

// UpdateSpaceMember updates a member in a workspace using partial patch update.
func (s *Service) UpdateSpaceMember(ctx context.Context, session Session, updated *Member, mask []string) (*Member, error) {
	const op errors.Op = "domain/space.UpdateSpaceMember"

	// Validate incoming update model invariants
	if err := updated.Validate(); err != nil {
		return nil, errors.E(op, err)
	}

	if _, err := s.authorize(ctx, session, requireManageMembers); err != nil {
		return nil, errors.E(op, err)
	}

	// Check membership exists
	existing, err := s.deps.MemberStore.GetByID(ctx, session.SpaceID, updated.UserID)
	if err != nil {
		if errors.Is(err, errors.NotExist) {
			return nil, errors.E(op, errors.NotExist, MemberNotFound, "member not found")
		}
		return nil, errors.E(op, err)
	}

	// Prevent changing role of space owner
	if existing.IsOwner() {
		return nil, errors.E(op, errors.Permission, OwnerOnly, "cannot change space owner role")
	}

	// Apply partial update via MemberPatchSchema
	if err := existing.ApplyPatch(updated, mask); err != nil {
		return nil, errors.E(op, errors.Invalid, err)
	}

	// Prevent promoting someone else to owner via role update
	if existing.Role == RoleOwner {
		return nil, errors.E(op, errors.Permission, OwnerOnly, "cannot assign owner role")
	}

	if err := s.deps.MemberStore.Update(ctx, existing); err != nil {
		return nil, errors.E(op, err)
	}

	return existing, nil
}

// UpdateSpaceMemberRole updates a member's role.
func (s *Service) UpdateSpaceMemberRole(ctx context.Context, session Session, updated *Member) (*Member, error) {
	const op errors.Op = "domain/space.UpdateSpaceMemberRole"
	res, err := s.UpdateSpaceMember(ctx, session, updated, []string{"role"})
	if err != nil {
		return nil, errors.E(op, err)
	}
	return res, nil
}

// ListSpaceMembers lists all members of a workspace. Requestor must be a member.
func (s *Service) ListSpaceMembers(ctx context.Context, session Session, filter *ListMembersFilter) (*paging.Page[*Member], error) {
	const op errors.Op = "domain/space.ListSpaceMembers"

	if _, err := s.authorize(ctx, session); err != nil {
		return nil, errors.E(op, err)
	}

	page, err := s.deps.MemberStore.ListBySpace(ctx, session.SpaceID, filter)
	if err != nil {
		return nil, errors.E(op, err)
	}
	return page, nil
}

// GetMember retrieves a member by space ID and user ID.
func (s *Service) GetMember(ctx context.Context, spaceID SpaceID, userID SpaceID) (*Member, error) {
	const op errors.Op = "domain/space.GetMember"

	member, err := s.deps.MemberStore.GetByID(ctx, spaceID, userID)
	if err != nil {
		if errors.Is(err, errors.NotExist) {
			return nil, errors.E(op, errors.NotExist, MemberNotFound, "member not found")
		}
		return nil, errors.E(op, err)
	}
	return member, nil
}

// GetUserSpaceMembership checks if the user is a member of the space and returns the membership.
func (s *Service) GetUserSpaceMembership(ctx context.Context, spaceID SpaceID, userID SpaceID) (*Member, error) {
	return s.deps.MemberStore.GetByID(ctx, spaceID, userID)
}

// IsSpaceMember checks if the user is a member of the space.
func (s *Service) IsSpaceMember(ctx context.Context, spaceID SpaceID, userID SpaceID) (bool, error) {
	_, err := s.deps.MemberStore.GetByID(ctx, spaceID, userID)
	if err != nil {
		return false, nil
	}
	return true, nil
}

// GetSettings retrieves the workspace settings. Requestor must be a member of the space.
func (s *Service) GetSettings(ctx context.Context, session Session) (*settings.Entry[Settings], error) {
	const op errors.Op = "domain/space.GetSettings"

	if _, err := s.authorize(ctx, session); err != nil {
		return nil, errors.E(op, err)
	}

	entry, err := s.deps.Settings.GetOrDefault(ctx, string(session.SpaceID), DefaultSettings())
	if err != nil {
		return nil, errors.E(op, err)
	}

	if entry.Value.Timezone == "" {
		entry.Value.Timezone = "UTC"
	}

	return entry, nil
}

// UpdateSettings updates the workspace settings. Requestor must be an owner or admin.
func (s *Service) UpdateSettings(ctx context.Context, session Session, incoming *Settings, mask []string, expectedVersion *int64) (*settings.Entry[Settings], error) {
	const op errors.Op = "domain/space.UpdateSettings"

	if _, err := s.authorize(ctx, session, requireManageSettings); err != nil {
		return nil, errors.E(op, err)
	}

	entry, err := s.deps.Settings.GetOrDefault(ctx, string(session.SpaceID), DefaultSettings())
	if err != nil {
		return nil, errors.E(op, err)
	}

	if expectedVersion != nil && *expectedVersion > 0 && *expectedVersion != entry.Version {
		return nil, errors.E(op, errors.Conflict, VersionMismatch, "space settings were modified concurrently")
	}

	if err := entry.Value.ApplyPatch(incoming, mask); err != nil {
		return nil, errors.E(op, errors.Invalid, err)
	}

	if err := s.deps.Settings.Save(ctx, entry); err != nil {
		return nil, errors.E(op, err)
	}

	return entry, nil
}
