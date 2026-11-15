package spaceaggregator

import (
	"context"

	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/log"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
	"golang.org/x/sync/errgroup"
)

//go:generate go run github.com/masterkeysrd/saturn/tools/mockgen .

// SpaceService defines the domain service methods required by the aggregator.
// @Mock
type SpaceService interface {
	GetSpace(ctx context.Context, session space.Session) (*space.Space, error)
	ListSpaces(ctx context.Context, userID space.UserID, filter *space.ListSpacesFilter) (*paging.Page[*space.Space], error)
	ListSpaceMembers(ctx context.Context, session space.Session, filter *space.ListMembersFilter) (*paging.Page[*space.Member], error)
	ListSpaceAPIKeyGrants(ctx context.Context, session space.Session) ([]*space.APIKeyGrant, error)
}

// IdentityService defines the IAM operations required by the aggregator.
// @Mock
type IdentityService interface {
	GetUserByID(ctx context.Context, id identity.UserID) (*identity.User, error)
	GetUsersByIDs(ctx context.Context, ids []identity.UserID) ([]*identity.User, error)
	ListAPIKeysByIDs(ctx context.Context, ids []identity.APIKeyID) ([]*identity.APIKey, error)
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
func (s *Service) GetSpace(ctx context.Context, spaceID space.SpaceID, userID space.UserID) (*space.Space, error) {
	const op errors.Op = "aggregator/space.GetSpace"
	if principal, ok := auth.PrincipalFromContext(ctx); ok && principal.IsAPIKey() && !principal.HasSpaceGrant(string(spaceID)) {
		return nil, errors.E(op, errors.Permission, "API key does not have access to this space")
	}
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
// When authenticated via an API key, results are filtered strictly to spaces granted to the key.
func (s *Service) ListSpaces(ctx context.Context, userID space.UserID, filter *space.ListSpacesFilter) (*paging.Page[*space.Space], error) {
	const op errors.Op = "aggregator/space.ListSpaces"

	principal, hasPrincipal := auth.PrincipalFromContext(ctx)
	if !hasPrincipal || !principal.IsAPIKey() {
		page, err := s.spaceService.ListSpaces(ctx, userID, filter)
		if err != nil {
			return nil, errors.E(op, err)
		}
		return page, nil
	}

	var allGranted []*space.Space
	token := ""
	for {
		page, err := s.spaceService.ListSpaces(ctx, userID, &space.ListSpacesFilter{
			PageSize:      100,
			NextPageToken: token,
		})
		if err != nil {
			return nil, errors.E(op, err)
		}
		for _, sp := range page.Items {
			if principal.HasSpaceGrant(string(sp.ID)) {
				allGranted = append(allGranted, sp)
			}
		}
		if !page.HasMore || page.NextPageToken == "" {
			break
		}
		token = page.NextPageToken
	}

	return &paging.Page[*space.Space]{
		Items: allGranted,
	}, nil
}

// ListSpaceMembers retrieves workspace members and enriches each member with their user profile.
func (s *Service) ListSpaceMembers(ctx context.Context, spaceID space.SpaceID, userID space.UserID, filter *space.ListMembersFilter) (*paging.Page[*SpaceMember], error) {
	const op errors.Op = "aggregator/space.ListSpaceMembers"
	if principal, ok := auth.PrincipalFromContext(ctx); ok && principal.IsAPIKey() && !principal.HasSpaceGrant(string(spaceID)) {
		return nil, errors.E(op, errors.Permission, "API key does not have access to this space")
	}
	session := space.Session{
		SpaceID: spaceID,
		UserID:  userID,
	}
	page, err := s.spaceService.ListSpaceMembers(ctx, session, filter)
	if err != nil {
		return nil, errors.E(op, err)
	}

	userMap := make(map[identity.UserID]*identity.User, len(page.Items))
	if s.identityService != nil && len(page.Items) > 0 {
		seen := make(map[identity.UserID]struct{}, len(page.Items))
		userIDs := make([]identity.UserID, 0, len(page.Items))
		for _, m := range page.Items {
			uid := identity.UserID(m.UserID)
			if _, ok := seen[uid]; !ok {
				seen[uid] = struct{}{}
				userIDs = append(userIDs, uid)
			}
		}

		users, err := s.identityService.GetUsersByIDs(ctx, userIDs)
		if err != nil {
			log.Warn(ctx, "failed to batch hydrate space member profiles", log.Err(err))
		} else {
			for _, u := range users {
				if u != nil {
					userMap[u.ID] = u
				}
			}
		}
	}

	spaceMembers := make([]*SpaceMember, 0, len(page.Items))
	for _, m := range page.Items {
		sm := &SpaceMember{
			Member: m,
		}
		if user, ok := userMap[identity.UserID(m.UserID)]; ok && user != nil {
			sm.Profile = &MemberProfile{
				Name:      user.Name,
				Username:  user.Username,
				AvatarURL: user.AvatarURL,
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

// ListSpaceAPIKeyGrants retrieves all active API key grants for a workspace and hydrates
// each grant with API key metadata and owner profile in parallel without exposing sibling spaces.
func (s *Service) ListSpaceAPIKeyGrants(ctx context.Context, spaceID space.SpaceID, userID space.UserID) ([]*APIKeyGrant, error) {
	const op errors.Op = "aggregator/space.ListSpaceAPIKeyGrants"

	session := space.Session{
		SpaceID: spaceID,
		UserID:  userID,
	}
	grants, err := s.spaceService.ListSpaceAPIKeyGrants(ctx, session)
	if err != nil {
		return nil, errors.E(op, err)
	}
	if len(grants) == 0 {
		return []*APIKeyGrant{}, nil
	}

	keyIDSet := make(map[identity.APIKeyID]struct{}, len(grants))
	keyIDs := make([]identity.APIKeyID, 0, len(grants))
	userIDSet := make(map[identity.UserID]struct{}, len(grants))
	userIDs := make([]identity.UserID, 0, len(grants))

	for _, g := range grants {
		kid := identity.APIKeyID(g.APIKeyID)
		if _, ok := keyIDSet[kid]; !ok {
			keyIDSet[kid] = struct{}{}
			keyIDs = append(keyIDs, kid)
		}
		uid := identity.UserID(g.UserID)
		if _, ok := userIDSet[uid]; !ok {
			userIDSet[uid] = struct{}{}
			userIDs = append(userIDs, uid)
		}
	}

	keyMap := make(map[identity.APIKeyID]*identity.APIKey, len(keyIDs))
	userMap := make(map[identity.UserID]*identity.User, len(userIDs))

	if s.identityService != nil {
		eg, egCtx := errgroup.WithContext(ctx)

		eg.Go(func() error {
			keys, err := s.identityService.ListAPIKeysByIDs(egCtx, keyIDs)
			if err != nil {
				return err
			}
			for _, k := range keys {
				keyMap[k.ID] = k
			}
			return nil
		})

		eg.Go(func() error {
			users, err := s.identityService.GetUsersByIDs(egCtx, userIDs)
			if err != nil {
				log.Warn(egCtx, "failed to batch hydrate API key grant user profiles", log.Err(err))
				return nil
			}
			for _, u := range users {
				if u != nil {
					userMap[u.ID] = u
				}
			}
			return nil
		})

		if err := eg.Wait(); err != nil {
			return nil, errors.E(op, err)
		}
	}

	out := make([]*APIKeyGrant, 0, len(grants))
	for _, g := range grants {
		hydrated := &APIKeyGrant{
			APIKeyID:        g.APIKeyID,
			SpaceID:         g.SpaceID,
			UserID:          g.UserID,
			GrantCreateTime: g.CreateTime,
		}
		if k, ok := keyMap[identity.APIKeyID(g.APIKeyID)]; ok && k != nil {
			hydrated.KeyName = k.Name
			hydrated.KeyPrefix = k.KeyPrefix
			hydrated.Scopes = k.Scopes
			hydrated.ExpiresAt = k.ExpiresAt
			hydrated.LastUsedAt = k.LastUsedAt
		}
		if u, ok := userMap[identity.UserID(g.UserID)]; ok && u != nil {
			hydrated.UserName = u.Name
			hydrated.UserEmail = u.Email
		}
		out = append(out, hydrated)
	}

	return out, nil
}
