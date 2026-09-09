package space

import (
	"context"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
)

// Dependencies holds all storage interfaces required by the Service.
type Dependencies struct {
	SpaceStore  SpaceStore
	MemberStore MemberStore
}

// Service handles space business logic.
type Service struct {
	deps Dependencies
}

// NewService creates a new Service.
func NewService(deps Dependencies) *Service {
	return &Service{deps: deps}
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

	// Verify membership
	if _, err := s.deps.MemberStore.GetByID(ctx, session.SpaceID, session.UserID); err != nil {
		if errors.Is(err, errors.NotExist) {
			return nil, errors.E(op, errors.Permission, InsufficientRole, "access denied to this space")
		}
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

	// Check if requestor is the owner
	member, err := s.deps.MemberStore.GetByID(ctx, session.SpaceID, session.UserID)
	if err != nil {
		if errors.Is(err, errors.NotExist) {
			return nil, errors.E(op, errors.Permission, OwnerOnly, "only the owner can update this space")
		}
		return nil, errors.E(op, err)
	}
	if !member.CanDeleteSpace() {
		return nil, errors.E(op, errors.Permission, OwnerOnly, "only the owner can update this space")
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

	member, err := s.deps.MemberStore.GetByID(ctx, session.SpaceID, session.UserID)
	if err != nil {
		if errors.Is(err, errors.NotExist) {
			return errors.E(op, errors.Permission, OwnerOnly, "only the owner can delete this space")
		}
		return errors.E(op, err)
	}
	if !member.CanDeleteSpace() {
		return errors.E(op, errors.Permission, OwnerOnly, "only the owner can delete this space")
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

	// Validate role using model validation
	if !member.Role.IsValid() {
		return nil, errors.E(op, errors.Invalid, InvalidRole, "invalid role")
	}

	// Check requestor has permission
	reqMember, err := s.deps.MemberStore.GetByID(ctx, session.SpaceID, session.UserID)
	if err != nil {
		if errors.Is(err, errors.NotExist) {
			return nil, errors.E(op, errors.Permission, InsufficientRole, "insufficient role to add members")
		}
		return nil, errors.E(op, err)
	}
	if !reqMember.CanManageMembers() {
		return nil, errors.E(op, errors.Permission, InsufficientRole, "insufficient role to add members")
	}

	// Check space exists
	_, err = s.deps.SpaceStore.GetByID(ctx, session.SpaceID)
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

	// Check requestor has permission
	member, err := s.deps.MemberStore.GetByID(ctx, session.SpaceID, session.UserID)
	if err != nil {
		if errors.Is(err, errors.NotExist) {
			return errors.E(op, errors.Permission, InsufficientRole, "insufficient role to remove members")
		}
		return errors.E(op, err)
	}
	if !member.CanManageMembers() {
		return errors.E(op, errors.Permission, InsufficientRole, "insufficient role to remove members")
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

// UpdateSpaceMemberRole updates a member's role.
func (s *Service) UpdateSpaceMemberRole(ctx context.Context, session Session, updated *Member) (*Member, error) {
	const op errors.Op = "domain/space.UpdateSpaceMemberRole"

	if !updated.Role.IsValid() {
		return nil, errors.E(op, errors.Invalid, InvalidRole, "invalid role")
	}

	// Check requestor has permission
	reqMember, err := s.deps.MemberStore.GetByID(ctx, session.SpaceID, session.UserID)
	if err != nil {
		if errors.Is(err, errors.NotExist) {
			return nil, errors.E(op, errors.Permission, InsufficientRole, "insufficient role to update member roles")
		}
		return nil, errors.E(op, err)
	}
	if !reqMember.CanManageMembers() {
		return nil, errors.E(op, errors.Permission, InsufficientRole, "insufficient role to update member roles")
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

	// Prevent promoting someone else to owner via role update
	if updated.Role == RoleOwner {
		return nil, errors.E(op, errors.Permission, OwnerOnly, "cannot assign owner role")
	}

	existing.Role = updated.Role
	existing.UpdateTime = time.Now()
	if err := s.deps.MemberStore.Update(ctx, existing); err != nil {
		return nil, errors.E(op, err)
	}

	return existing, nil
}

// ListSpaceMembers lists all members of a workspace. Requestor must be a member.
func (s *Service) ListSpaceMembers(ctx context.Context, session Session, filter *ListMembersFilter) (*paging.Page[*Member], error) {
	const op errors.Op = "domain/space.ListSpaceMembers"

	// Verify membership
	if _, err := s.deps.MemberStore.GetByID(ctx, session.SpaceID, session.UserID); err != nil {
		if errors.Is(err, errors.NotExist) {
			return nil, errors.E(op, errors.Permission, InsufficientRole, "access denied to this space")
		}
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
