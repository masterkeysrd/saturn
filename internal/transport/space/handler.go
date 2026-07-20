package space

import (
	"context"
	"errors"

	spacev1 "github.com/masterkeysrd/saturn/apis/saturn/space/v1"
	spaceapp "github.com/masterkeysrd/saturn/internal/application/space"
	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// Handler implements the spacev1.SpacesServer interface.
type Handler struct {
	spacev1.UnimplementedSpacesServer
	Coordinator *spaceapp.Coordinator
}

// NewHandler creates a new Handler.
func NewHandler(coordinator *spaceapp.Coordinator) *Handler {
	return &Handler{Coordinator: coordinator}
}

// toProtoSpace converts a domain Space to a proto Space.
func toProtoSpace(sp *space.Space) *spacev1.Space {
	return &spacev1.Space{
		Id:          string(sp.ID),
		Name:        sp.Name,
		Description: sp.Description,
		OwnerId:     string(sp.OwnerID),
		Version:     sp.Version,
		CreateTime:  timestamppb.New(sp.CreateTime),
		UpdateTime:  timestamppb.New(sp.UpdateTime),
	}
}

// toProtoSpaceMember converts a domain Member to a proto SpaceMember.
func toProtoSpaceMember(m *space.Member) *spacev1.SpaceMember {
	return &spacev1.SpaceMember{
		SpaceId:    string(m.SpaceID),
		UserId:     string(m.UserID),
		Role:       string(m.Role),
		CreateTime: timestamppb.New(m.CreateTime),
		UpdateTime: timestamppb.New(m.UpdateTime),
	}
}

// toProtoSpaceMemberWithProfile converts a SpaceMember to a proto SpaceMember including the nested Profile message.
func toProtoSpaceMemberWithProfile(m *spaceapp.SpaceMember) *spacev1.SpaceMember {
	var profile *spacev1.SpaceMember_Profile
	if m.Profile != nil {
		profile = &spacev1.SpaceMember_Profile{
			Name:      m.Profile.Name,
			Username:  m.Profile.Username,
			AvatarUrl: m.Profile.AvatarURL,
		}
	}
	return &spacev1.SpaceMember{
		SpaceId:    string(m.SpaceID),
		UserId:     string(m.UserID),
		Role:       string(m.Role),
		CreateTime: timestamppb.New(m.CreateTime),
		UpdateTime: timestamppb.New(m.UpdateTime),
		Profile:    profile,
	}
}

// getPrincipal extracts the authenticated principal from context.
func (h *Handler) getPrincipal(ctx context.Context) (auth.Principal, error) {
	principal, ok := auth.PrincipalFromContext(ctx)
	if !ok {
		return auth.Principal{}, status.Error(codes.Unauthenticated, "missing principal")
	}
	return principal, nil
}

// getSpaceUserID extracts the space-scoped user ID from context.
func (h *Handler) getSpaceUserID(ctx context.Context) (string, error) {
	principal, err := h.getPrincipal(ctx)
	if err != nil {
		return "", err
	}
	return principal.Subject, nil
}

// CreateSpace creates a new workspace.
func (h *Handler) CreateSpace(ctx context.Context, req *spacev1.CreateSpaceRequest) (*spacev1.Space, error) {
	userID, err := h.getSpaceUserID(ctx)
	if err != nil {
		return nil, err
	}

	sp, err := h.Coordinator.CreateSpace(ctx, &spaceapp.CreateSpaceRequest{
		OwnerID:     userID,
		Name:        req.GetName(),
		Description: req.GetDescription(),
	})
	if err != nil {
		if errors.Is(err, space.ErrSpaceNameExists) {
			return nil, status.Error(codes.AlreadyExists, "space name already exists")
		}
		return nil, status.Error(codes.Internal, err.Error())
	}

	return toProtoSpace(sp), nil
}

// GetSpace retrieves a workspace by ID.
func (h *Handler) GetSpace(ctx context.Context, req *spacev1.GetSpaceRequest) (*spacev1.Space, error) {
	userID, err := h.getSpaceUserID(ctx)
	if err != nil {
		return nil, err
	}

	spaceID := space.SpaceID(req.GetSpaceId())

	sp, err := h.Coordinator.GetSpace(ctx, spaceID, space.SpaceID(userID))
	if err != nil {
		if errors.Is(err, space.ErrInsufficientRole) {
			return nil, status.Error(codes.PermissionDenied, "access denied to this space")
		}
		return nil, status.Error(codes.NotFound, "space not found")
	}

	return toProtoSpace(sp), nil
}

// UpdateSpace updates a workspace.
func (h *Handler) UpdateSpace(ctx context.Context, req *spacev1.UpdateSpaceRequest) (*spacev1.Space, error) {
	userID, err := h.getSpaceUserID(ctx)
	if err != nil {
		return nil, err
	}

	spaceID := space.SpaceID(req.GetSpaceId())

	sp, err := h.Coordinator.UpdateSpace(ctx, &spaceapp.UpdateSpaceRequest{
		SpaceID:     string(spaceID),
		UserID:      userID,
		Name:        req.GetName(),
		Description: req.GetDescription(),
	})
	if err != nil {
		if errors.Is(err, space.ErrSpaceOwnerOnly) {
			return nil, status.Error(codes.PermissionDenied, "only the owner can update this space")
		}
		return nil, status.Error(codes.NotFound, "space not found")
	}

	return toProtoSpace(sp), nil
}

// DeleteSpace deletes a workspace.
func (h *Handler) DeleteSpace(ctx context.Context, req *spacev1.DeleteSpaceRequest) (*spacev1.DeleteSpaceResponse, error) {
	userID, err := h.getSpaceUserID(ctx)
	if err != nil {
		return nil, err
	}

	spaceID := space.SpaceID(req.GetSpaceId())

	if err := h.Coordinator.DeleteSpace(ctx, &spaceapp.DeleteSpaceRequest{
		SpaceID: string(spaceID),
		UserID:  userID,
	}); err != nil {
		if errors.Is(err, space.ErrSpaceOwnerOnly) {
			return nil, status.Error(codes.PermissionDenied, "only the owner can delete this space")
		}
		return nil, status.Error(codes.NotFound, "space not found")
	}

	return &spacev1.DeleteSpaceResponse{}, nil
}

// ListSpaces lists all spaces the authenticated user has access to.
func (h *Handler) ListSpaces(ctx context.Context, req *spacev1.ListSpacesRequest) (*spacev1.ListSpacesResponse, error) {
	userID, err := h.getSpaceUserID(ctx)
	if err != nil {
		return nil, err
	}

	filter := &space.ListSpacesFilter{
		PageSize:      req.GetPageSize(),
		NextPageToken: req.GetNextPageToken(),
	}

	spaces, nextToken, err := h.Coordinator.ListSpaces(ctx, space.SpaceID(userID), filter)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}

	protoSpaces := make([]*spacev1.Space, 0, len(spaces))
	for _, sp := range spaces {
		protoSpaces = append(protoSpaces, toProtoSpace(sp))
	}

	return &spacev1.ListSpacesResponse{
		Spaces:        protoSpaces,
		NextPageToken: nextToken,
	}, nil
}

// AddSpaceMember adds a member to a workspace.
func (h *Handler) AddSpaceMember(ctx context.Context, req *spacev1.AddSpaceMemberRequest) (*spacev1.SpaceMember, error) {
	userID, err := h.getSpaceUserID(ctx)
	if err != nil {
		return nil, err
	}

	spaceID := space.SpaceID(req.GetSpaceId())
	memberID := space.SpaceID(req.GetUserId())
	role := space.SpaceRole(req.GetRole())

	m, err := h.Coordinator.AddSpaceMember(ctx, &spaceapp.AddSpaceMemberRequest{
		SpaceID:      string(spaceID),
		UserID:       userID,
		TargetUserID: string(memberID),
		Role:         string(role),
	})
	if err != nil {
		if errors.Is(err, spaceapp.ErrUserNotActive) {
			return nil, status.Error(codes.FailedPrecondition, "cannot add an inactive user to a space")
		}
		if errors.Is(err, space.ErrInsufficientRole) {
			return nil, status.Error(codes.PermissionDenied, "insufficient role to add members")
		}
		if errors.Is(err, space.ErrMemberAlreadyExists) {
			return nil, status.Error(codes.AlreadyExists, "member already exists")
		}
		return nil, status.Error(codes.Internal, err.Error())
	}

	return toProtoSpaceMember(m), nil
}

// RemoveSpaceMember removes a member from a workspace.
func (h *Handler) RemoveSpaceMember(ctx context.Context, req *spacev1.RemoveSpaceMemberRequest) (*spacev1.RemoveSpaceMemberResponse, error) {
	userID, err := h.getSpaceUserID(ctx)
	if err != nil {
		return nil, err
	}

	spaceID := space.SpaceID(req.GetSpaceId())
	memberID := space.SpaceID(req.GetUserId())

	if err := h.Coordinator.RemoveSpaceMember(ctx, &spaceapp.RemoveSpaceMemberRequest{
		SpaceID:      string(spaceID),
		UserID:       userID,
		TargetUserID: string(memberID),
	}); err != nil {
		if errors.Is(err, space.ErrInsufficientRole) {
			return nil, status.Error(codes.PermissionDenied, "insufficient role to remove members")
		}
		return nil, status.Error(codes.NotFound, "member not found")
	}

	return &spacev1.RemoveSpaceMemberResponse{}, nil
}

// UpdateSpaceMemberRole updates a member's role.
func (h *Handler) UpdateSpaceMemberRole(ctx context.Context, req *spacev1.UpdateSpaceMemberRoleRequest) (*spacev1.SpaceMember, error) {
	userID, err := h.getSpaceUserID(ctx)
	if err != nil {
		return nil, err
	}

	spaceID := space.SpaceID(req.GetSpaceId())
	memberID := space.SpaceID(req.GetUserId())
	role := space.SpaceRole(req.GetRole())

	m, err := h.Coordinator.UpdateSpaceMemberRole(ctx, &spaceapp.UpdateSpaceMemberRoleRequest{
		SpaceID:      string(spaceID),
		UserID:       userID,
		TargetUserID: string(memberID),
		Role:         string(role),
	})
	if err != nil {
		if errors.Is(err, space.ErrInsufficientRole) {
			return nil, status.Error(codes.PermissionDenied, "insufficient role to update member roles")
		}
		return nil, status.Error(codes.NotFound, "member not found")
	}

	return toProtoSpaceMember(m), nil
}

// ListSpaceMembers lists all members of a workspace.
func (h *Handler) ListSpaceMembers(ctx context.Context, req *spacev1.ListSpaceMembersRequest) (*spacev1.ListSpaceMembersResponse, error) {
	userID, err := h.getSpaceUserID(ctx)
	if err != nil {
		return nil, err
	}

	spaceID := space.SpaceID(req.GetSpaceId())

	filter := &space.ListMembersFilter{
		PageSize:      req.GetPageSize(),
		NextPageToken: req.GetNextPageToken(),
	}

	members, nextToken, err := h.Coordinator.ListSpaceMembers(ctx, &spaceapp.ListSpaceMembersRequest{
		SpaceID: string(spaceID),
		UserID:  userID,
		Filter:  filter,
	})
	if err != nil {
		if errors.Is(err, space.ErrInsufficientRole) {
			return nil, status.Error(codes.PermissionDenied, "access denied to this space")
		}
		return nil, status.Error(codes.Internal, err.Error())
	}

	protoMembers := make([]*spacev1.SpaceMember, 0, len(members))
	for _, m := range members {
		protoMembers = append(protoMembers, toProtoSpaceMemberWithProfile(m))
	}

	return &spacev1.ListSpaceMembersResponse{
		Members:       protoMembers,
		NextPageToken: nextToken,
	}, nil
}
