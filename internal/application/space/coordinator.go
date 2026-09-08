package space

import (
	"context"

	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

// Error codes for coordinator operations.
const (
	UserNotActive errors.Code = "USER_NOT_ACTIVE"
)

// Dependencies defines the inputs for creating a new Coordinator.
type Dependencies struct {
	SpaceService    SpaceService
	IdentityService IdentityService
}

// Coordinator orchestrates space and membership operations.
type Coordinator struct {
	spaceService    SpaceService
	identityService IdentityService
}

// NewCoordinator creates a new Coordinator.
func NewCoordinator(deps Dependencies) *Coordinator {
	return &Coordinator{
		spaceService:    deps.SpaceService,
		identityService: deps.IdentityService,
	}
}

// CreateSpaceRequest represents the input for creating a space.
type CreateSpaceRequest struct {
	OwnerID     string
	Name        string
	Description string
}

// UpdateSpaceRequest represents the input for updating a space.
type UpdateSpaceRequest struct {
	SpaceID     string
	UserID      string
	Name        string
	Description string
}

// DeleteSpaceRequest represents the input for deleting a space.
type DeleteSpaceRequest struct {
	SpaceID string
	UserID  string
}

// AddSpaceMemberRequest represents the input for adding a member.
type AddSpaceMemberRequest struct {
	SpaceID      string
	UserID       string
	TargetUserID string
	Role         string
}

// RemoveSpaceMemberRequest represents the input for removing a member.
type RemoveSpaceMemberRequest struct {
	SpaceID      string
	UserID       string
	TargetUserID string
}

// UpdateSpaceMemberRoleRequest represents the input for updating a member's role.
type UpdateSpaceMemberRoleRequest struct {
	SpaceID      string
	UserID       string
	TargetUserID string
	Role         string
}

// ListSpaceMembersRequest represents the input for listing workspace members.
type ListSpaceMembersRequest struct {
	SpaceID string
	UserID  string
	Filter  *space.ListMembersFilter
}

// CreateSpace orchestrates space creation.
func (c *Coordinator) CreateSpace(ctx context.Context, req *CreateSpaceRequest) (*space.Space, error) {
	const op errors.Op = "application/space.CreateSpace"
	sp := &space.Space{
		OwnerID:     space.SpaceID(req.OwnerID),
		Name:        req.Name,
		Description: req.Description,
	}
	res, err := c.spaceService.CreateSpace(ctx, sp)
	if err != nil {
		return nil, errors.E(op, err)
	}
	return res, nil
}

// GetSpace orchestrates workspace retrieval.
func (c *Coordinator) GetSpace(ctx context.Context, spaceID space.SpaceID, userID space.SpaceID) (*space.Space, error) {
	const op errors.Op = "application/space.GetSpace"
	session := space.Session{
		SpaceID: spaceID,
		UserID:  userID,
	}
	res, err := c.spaceService.GetSpace(ctx, session)
	if err != nil {
		return nil, errors.E(op, err)
	}
	return res, nil
}

// UpdateSpace orchestrates workspace metadata updates.
func (c *Coordinator) UpdateSpace(ctx context.Context, req *UpdateSpaceRequest) (*space.Space, error) {
	const op errors.Op = "application/space.UpdateSpace"
	session := space.Session{
		SpaceID: space.SpaceID(req.SpaceID),
		UserID:  space.SpaceID(req.UserID),
	}
	sp := &space.Space{
		Name:        req.Name,
		Description: req.Description,
	}
	res, err := c.spaceService.UpdateSpace(ctx, session, sp)
	if err != nil {
		return nil, errors.E(op, err)
	}
	return res, nil
}

// DeleteSpace orchestrates workspace deletion.
func (c *Coordinator) DeleteSpace(ctx context.Context, req *DeleteSpaceRequest) error {
	const op errors.Op = "application/space.DeleteSpace"
	session := space.Session{
		SpaceID: space.SpaceID(req.SpaceID),
		UserID:  space.SpaceID(req.UserID),
	}
	if err := c.spaceService.DeleteSpace(ctx, session); err != nil {
		return errors.E(op, err)
	}
	return nil
}

// ListSpaces orchestrates workspace listing.
func (c *Coordinator) ListSpaces(ctx context.Context, userID space.SpaceID, filter *space.ListSpacesFilter) ([]*space.Space, string, error) {
	const op errors.Op = "application/space.ListSpaces"
	spaces, nextToken, err := c.spaceService.ListSpaces(ctx, userID, filter)
	if err != nil {
		return nil, "", errors.E(op, err)
	}
	return spaces, nextToken, nil
}

// AddSpaceMember orchestrates adding a member to a workspace.
func (c *Coordinator) AddSpaceMember(ctx context.Context, req *AddSpaceMemberRequest) (*space.Member, error) {
	const op errors.Op = "application/space.AddSpaceMember"

	// Verify target user exists and is active in Identity system
	user, err := c.identityService.GetUserByID(ctx, identity.UserID(req.TargetUserID))
	if err != nil {
		return nil, errors.E(op, err)
	}
	if user.Status != identity.UserStatusActive {
		return nil, errors.E(op, errors.Precondition, UserNotActive, "cannot add an inactive user to a space")
	}

	session := space.Session{
		SpaceID: space.SpaceID(req.SpaceID),
		UserID:  space.SpaceID(req.UserID),
	}
	m := &space.Member{
		UserID: space.SpaceID(req.TargetUserID),
		Role:   space.SpaceRole(req.Role),
	}
	res, err := c.spaceService.AddSpaceMember(ctx, session, m)
	if err != nil {
		return nil, errors.E(op, err)
	}
	return res, nil
}

// RemoveSpaceMember orchestrates removing a member from a workspace.
func (c *Coordinator) RemoveSpaceMember(ctx context.Context, req *RemoveSpaceMemberRequest) error {
	const op errors.Op = "application/space.RemoveSpaceMember"
	session := space.Session{
		SpaceID: space.SpaceID(req.SpaceID),
		UserID:  space.SpaceID(req.UserID),
	}
	if err := c.spaceService.RemoveSpaceMember(ctx, session, space.SpaceID(req.TargetUserID)); err != nil {
		return errors.E(op, err)
	}
	return nil
}

// UpdateSpaceMemberRole orchestrates updating a member's role in a workspace.
func (c *Coordinator) UpdateSpaceMemberRole(ctx context.Context, req *UpdateSpaceMemberRoleRequest) (*space.Member, error) {
	const op errors.Op = "application/space.UpdateSpaceMemberRole"
	session := space.Session{
		SpaceID: space.SpaceID(req.SpaceID),
		UserID:  space.SpaceID(req.UserID),
	}
	m := &space.Member{
		UserID: space.SpaceID(req.TargetUserID),
		Role:   space.SpaceRole(req.Role),
	}
	res, err := c.spaceService.UpdateSpaceMemberRole(ctx, session, m)
	if err != nil {
		return nil, errors.E(op, err)
	}
	return res, nil
}

// MemberProfile represents the user details enriched in the workspace membership.
type MemberProfile struct {
	Name      string
	Username  string
	AvatarURL string
}

// SpaceMember wraps the domain member with profile details.
type SpaceMember struct {
	*space.Member
	Profile *MemberProfile
}

// ListSpaceMembers orchestrates listing workspace members.
func (c *Coordinator) ListSpaceMembers(ctx context.Context, req *ListSpaceMembersRequest) ([]*SpaceMember, string, error) {
	const op errors.Op = "application/space.ListSpaceMembers"
	session := space.Session{
		SpaceID: space.SpaceID(req.SpaceID),
		UserID:  space.SpaceID(req.UserID),
	}
	members, nextToken, err := c.spaceService.ListSpaceMembers(ctx, session, req.Filter)
	if err != nil {
		return nil, "", errors.E(op, err)
	}

	spaceMembers := make([]*SpaceMember, 0, len(members))
	for _, m := range members {
		// Look up user profile from Identity system
		user, err := c.identityService.GetUserByID(ctx, identity.UserID(m.UserID))
		if err != nil {
			// Fallback: just return the membership if profile lookup fails
			spaceMembers = append(spaceMembers, &SpaceMember{
				Member: m,
			})
			continue
		}
		spaceMembers = append(spaceMembers, &SpaceMember{
			Member: m,
			Profile: &MemberProfile{
				Name:      user.Name,
				Username:  user.Username,
				AvatarURL: user.AvatarURL,
			},
		})
	}

	return spaceMembers, nextToken, nil
}

// SpaceService defines the interface for space domain operations.
type SpaceService interface {
	CreateSpace(ctx context.Context, space *space.Space) (*space.Space, error)
	GetSpace(ctx context.Context, session space.Session) (*space.Space, error)
	UpdateSpace(ctx context.Context, session space.Session, space *space.Space) (*space.Space, error)
	DeleteSpace(ctx context.Context, session space.Session) error
	ListSpaces(ctx context.Context, userID space.SpaceID, filter *space.ListSpacesFilter) ([]*space.Space, string, error)
	AddSpaceMember(ctx context.Context, session space.Session, member *space.Member) (*space.Member, error)
	RemoveSpaceMember(ctx context.Context, session space.Session, targetUserID space.SpaceID) error
	UpdateSpaceMemberRole(ctx context.Context, session space.Session, member *space.Member) (*space.Member, error)
	ListSpaceMembers(ctx context.Context, session space.Session, filter *space.ListMembersFilter) ([]*space.Member, string, error)
}

// IdentityService defines the interface for required identity operations.
type IdentityService interface {
	GetUserByID(ctx context.Context, id identity.UserID) (*identity.User, error)
}
