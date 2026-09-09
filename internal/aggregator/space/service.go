package spaceaggregator

import (
	"context"

	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
)

// SpaceService defines the domain service methods required by the aggregator.
type SpaceService interface {
	GetSpace(ctx context.Context, session space.Session) (*space.Space, error)
	ListSpaces(ctx context.Context, userID space.SpaceID, filter *space.ListSpacesFilter) (*paging.Page[*space.Space], error)
	ListSpaceMembers(ctx context.Context, session space.Session, filter *space.ListMembersFilter) (*paging.Page[*space.Member], error)
}

// IdentityService defines the IAM operations required by the aggregator.
type IdentityService interface {
	GetUserByID(ctx context.Context, id identity.UserID) (*identity.User, error)
}

// Service coordinates data fetching across multiple domains for aggregated space queries.
type Service struct {
	spaceService    SpaceService
	identityService IdentityService
}

// NewService instantiates a new Space Aggregator Service.
func NewService(spaceService SpaceService, identityService IdentityService) *Service {
	return &Service{
		spaceService:    spaceService,
		identityService: identityService,
	}
}

// GetSpace retrieves a single space by its ID.
func (s *Service) GetSpace(ctx context.Context, spaceID space.SpaceID, userID space.SpaceID) (*space.Space, error) {
	const op errors.Op = "aggregator/space.GetSpace"
	session := space.Session{
		SpaceID: spaceID,
		UserID:  userID,
	}
	sp, err := s.spaceService.GetSpace(ctx, session)
	if err != nil {
		return nil, errors.E(op, err)
	}
	return sp, nil
}

// ListSpaces retrieves spaces accessible to the user with keyset pagination.
func (s *Service) ListSpaces(ctx context.Context, userID space.SpaceID, filter *space.ListSpacesFilter) (*paging.Page[*space.Space], error) {
	const op errors.Op = "aggregator/space.ListSpaces"
	page, err := s.spaceService.ListSpaces(ctx, userID, filter)
	if err != nil {
		return nil, errors.E(op, err)
	}
	return page, nil
}

// ListSpaceMembers retrieves workspace members and enriches each member with their user profile.
func (s *Service) ListSpaceMembers(ctx context.Context, spaceID space.SpaceID, userID space.SpaceID, filter *space.ListMembersFilter) (*paging.Page[*SpaceMember], error) {
	const op errors.Op = "aggregator/space.ListSpaceMembers"
	session := space.Session{
		SpaceID: spaceID,
		UserID:  userID,
	}
	page, err := s.spaceService.ListSpaceMembers(ctx, session, filter)
	if err != nil {
		return nil, errors.E(op, err)
	}

	spaceMembers := make([]*SpaceMember, 0, len(page.Items))
	for _, m := range page.Items {
		sm := &SpaceMember{
			Member: m,
		}
		if s.identityService != nil {
			user, err := s.identityService.GetUserByID(ctx, identity.UserID(m.UserID))
			if err == nil && user != nil {
				sm.Profile = &MemberProfile{
					Name:      user.Name,
					Username:  user.Username,
					AvatarURL: user.AvatarURL,
				}
			}
		}
		spaceMembers = append(spaceMembers, sm)
	}

	return &paging.Page[*SpaceMember]{
		Items:         spaceMembers,
		NextPageToken: page.NextPageToken,
		HasMore:       page.HasMore,
	}, nil
}
