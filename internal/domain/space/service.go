package space

import (
	"context"
	"errors"
	"time"
)

// Sentinel errors for space operations.
var (
	ErrSpaceNotFound       = errors.New("space not found")
	ErrSpaceNameExists     = errors.New("space name already exists")
	ErrSpaceOwnerOnly      = errors.New("only the owner can perform this action")
	ErrInsufficientRole    = errors.New("insufficient role to perform this action")
	ErrMemberNotFound      = errors.New("member not found")
	ErrMemberAlreadyExists = errors.New("member already exists")
	ErrInvalidRole         = errors.New("invalid role")
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
	// Validate and sanitize space name using model validation
	if err := space.Validate(); err != nil {
		return nil, ErrSpaceNameExists
	}

	// Check if a space with this name already exists for this owner
	spaces, _, err := s.deps.SpaceStore.ListByUserOwned(ctx, space.OwnerID, &ListSpacesFilter{})
	if err == nil {
		for _, sp := range spaces {
			if sp.Name == space.Name {
				return nil, ErrSpaceNameExists
			}
		}
	}

	// Generate space ID
	spaceID, err := NewSpaceID()
	if err != nil {
		return nil, err
	}

	space.ID = spaceID
	space.Version = 1
	space.CreateTime = time.Now()
	space.UpdateTime = time.Now()

	if err := s.deps.SpaceStore.Create(ctx, space); err != nil {
		return nil, err
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
		// Rollback: delete the space
		_ = s.deps.SpaceStore.Delete(ctx, spaceID)
		return nil, err
	}

	return space, nil
}

// GetSpace retrieves a workspace by ID. Requestor must be a member.
func (s *Service) GetSpace(ctx context.Context, session Session) (*Space, error) {
	// Verify membership
	if _, err := s.deps.MemberStore.GetByID(ctx, session.SpaceID, session.UserID); err != nil {
		return nil, ErrInsufficientRole
	}

	space, err := s.deps.SpaceStore.GetByID(ctx, session.SpaceID)
	if err != nil {
		return nil, ErrSpaceNotFound
	}
	return space, nil
}

// UpdateSpace updates a workspace.
func (s *Service) UpdateSpace(ctx context.Context, session Session, updated *Space) (*Space, error) {
	space, err := s.deps.SpaceStore.GetByID(ctx, session.SpaceID)
	if err != nil {
		return nil, ErrSpaceNotFound
	}

	// Check if requestor is the owner
	member, err := s.deps.MemberStore.GetByID(ctx, session.SpaceID, session.UserID)
	if err != nil {
		return nil, ErrSpaceOwnerOnly
	}
	if !member.CanDeleteSpace() {
		return nil, ErrSpaceOwnerOnly
	}

	// Validate and sanitize updated space properties using model validation
	if err := updated.Validate(); err != nil {
		return nil, ErrSpaceNameExists
	}

	space.Name = updated.Name
	space.Description = updated.Description

	if err := s.deps.SpaceStore.Update(ctx, space); err != nil {
		return nil, err
	}

	return space, nil
}

// DeleteSpace deletes a workspace. Only the owner can delete.
func (s *Service) DeleteSpace(ctx context.Context, session Session) error {
	member, err := s.deps.MemberStore.GetByID(ctx, session.SpaceID, session.UserID)
	if err != nil {
		return ErrSpaceOwnerOnly
	}
	if !member.CanDeleteSpace() {
		return ErrSpaceOwnerOnly
	}

	return s.deps.SpaceStore.Delete(ctx, session.SpaceID)
}

// ListSpaces lists all spaces the user has access to (owned or joined).
func (s *Service) ListSpaces(ctx context.Context, userID SpaceID, filter *ListSpacesFilter) ([]*Space, string, error) {
	ownedSpaces, ownedToken, err := s.deps.SpaceStore.ListByUserOwned(ctx, userID, filter)
	if err != nil {
		return nil, "", err
	}

	memberships, err := s.deps.MemberStore.ListByUser(ctx, userID)
	if err != nil {
		return nil, "", err
	}

	// Create a map of owned space IDs for O(1) deduplication
	ownedSpaceIDs := make(map[SpaceID]bool)
	for _, sp := range ownedSpaces {
		ownedSpaceIDs[sp.ID] = true
	}

	// Get joined spaces (excluding owned ones)
	joinedSpaceIDs := make(map[SpaceID]bool)
	for _, m := range memberships {
		joinedSpaceIDs[m.SpaceID] = true
	}

	var joinedSpaces []*Space
	for spaceID := range joinedSpaceIDs {
		if !ownedSpaceIDs[spaceID] {
			sp, err := s.deps.SpaceStore.GetByID(ctx, spaceID)
			if err != nil {
				continue
			}
			joinedSpaces = append(joinedSpaces, sp)
		}
	}

	// Merge owned and joined spaces
	allSpaces := append(ownedSpaces, joinedSpaces...)

	return allSpaces, ownedToken, nil
}

// AddSpaceMember adds a member to a workspace.
func (s *Service) AddSpaceMember(ctx context.Context, session Session, member *Member) (*Member, error) {
	// Validate role using model validation
	if !member.Role.IsValid() {
		return nil, ErrInvalidRole
	}

	// Check requestor has permission
	reqMember, err := s.deps.MemberStore.GetByID(ctx, session.SpaceID, session.UserID)
	if err != nil {
		return nil, ErrInsufficientRole
	}
	if !reqMember.CanManageMembers() {
		return nil, ErrInsufficientRole
	}

	// Check space exists
	_, err = s.deps.SpaceStore.GetByID(ctx, session.SpaceID)
	if err != nil {
		return nil, ErrSpaceNotFound
	}

	// Check member already exists
	exists, err := s.deps.MemberStore.Exists(ctx, session.SpaceID, member.UserID)
	if err != nil {
		return nil, err
	}
	if exists {
		return nil, ErrMemberAlreadyExists
	}

	member.SpaceID = session.SpaceID
	member.CreateTime = time.Now()
	member.UpdateTime = time.Now()

	if err := s.deps.MemberStore.Create(ctx, member); err != nil {
		return nil, err
	}

	return member, nil
}

// RemoveSpaceMember removes a member from a workspace.
func (s *Service) RemoveSpaceMember(ctx context.Context, session Session, userID SpaceID) error {
	// Check requestor has permission
	member, err := s.deps.MemberStore.GetByID(ctx, session.SpaceID, session.UserID)
	if err != nil {
		return ErrInsufficientRole
	}
	if !member.CanManageMembers() {
		return ErrInsufficientRole
	}

	// Prevent owner from removing themselves
	if userID == session.UserID {
		return ErrSpaceOwnerOnly
	}

	return s.deps.MemberStore.Delete(ctx, session.SpaceID, userID)
}

// UpdateSpaceMemberRole updates a member's role.
func (s *Service) UpdateSpaceMemberRole(ctx context.Context, session Session, updated *Member) (*Member, error) {
	if !updated.Role.IsValid() {
		return nil, ErrInvalidRole
	}

	// Check requestor has permission
	reqMember, err := s.deps.MemberStore.GetByID(ctx, session.SpaceID, session.UserID)
	if err != nil {
		return nil, ErrInsufficientRole
	}
	if !reqMember.CanManageMembers() {
		return nil, ErrInsufficientRole
	}

	// Prevent changing own role
	if updated.UserID == session.UserID {
		return nil, ErrSpaceOwnerOnly
	}

	// Check membership exists
	existing, err := s.deps.MemberStore.GetByID(ctx, session.SpaceID, updated.UserID)
	if err != nil {
		return nil, ErrMemberNotFound
	}

	existing.Role = updated.Role
	existing.UpdateTime = time.Now()
	if err := s.deps.MemberStore.Update(ctx, existing); err != nil {
		return nil, err
	}

	return existing, nil
}

// ListSpaceMembers lists all members of a workspace. Requestor must be a member.
func (s *Service) ListSpaceMembers(ctx context.Context, session Session, filter *ListMembersFilter) ([]*Member, string, error) {
	// Verify membership
	if _, err := s.deps.MemberStore.GetByID(ctx, session.SpaceID, session.UserID); err != nil {
		return nil, "", ErrInsufficientRole
	}

	return s.deps.MemberStore.ListBySpace(ctx, session.SpaceID, filter)
}

// GetMember retrieves a member by space ID and user ID.
func (s *Service) GetMember(ctx context.Context, spaceID SpaceID, userID SpaceID) (*Member, error) {
	member, err := s.deps.MemberStore.GetByID(ctx, spaceID, userID)
	if err != nil {
		return nil, ErrMemberNotFound
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
