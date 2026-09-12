package space

import (
	"context"

	spacev1 "github.com/masterkeysrd/saturn/apis/saturn/space/v1"
	spaceaggregator "github.com/masterkeysrd/saturn/internal/aggregator/space"
	spaceapp "github.com/masterkeysrd/saturn/internal/application/space"
	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"google.golang.org/protobuf/types/known/emptypb"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// Handler implements the spacev1.SpacesServer interface.
type Handler struct {
	spacev1.UnimplementedSpacesServer
	Coordinator spaceapp.Coordinator
	Aggregator  *spaceaggregator.Service
}

// NewHandler creates a new Handler.
func NewHandler(coordinator spaceapp.Coordinator, aggregator *spaceaggregator.Service) *Handler {
	return &Handler{
		Coordinator: coordinator,
		Aggregator:  aggregator,
	}
}

// toProtoSpace converts a domain Space to a proto Space.
func toProtoSpace(sp *space.Space) *spacev1.Space {
	if sp == nil {
		return nil
	}
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

// toDomainSpace converts a proto Space to a domain Space.
func toDomainSpace(pb *spacev1.Space) *space.Space {
	if pb == nil {
		return nil
	}
	return &space.Space{
		ID:          space.SpaceID(pb.GetId()),
		Name:        pb.GetName(),
		Description: pb.GetDescription(),
		OwnerID:     space.SpaceID(pb.GetOwnerId()),
		Version:     pb.GetVersion(),
	}
}

// toDomainSpaceMember converts a proto SpaceMember to a domain Member.
func toDomainSpaceMember(pb *spacev1.SpaceMember) *space.Member {
	if pb == nil {
		return nil
	}
	return &space.Member{
		SpaceID: space.SpaceID(pb.GetSpaceId()),
		UserID:  space.SpaceID(pb.GetUserId()),
		Role:    toDomainSpaceRole(pb.GetRole()),
	}
}

// toProtoSpaceRole maps domain SpaceRole to proto SpaceMember_Role.
func toProtoSpaceRole(role space.SpaceRole) spacev1.SpaceMember_Role {
	switch role {
	case space.RoleOwner:
		return spacev1.SpaceMember_OWNER
	case space.RoleAdmin:
		return spacev1.SpaceMember_ADMIN
	case space.RoleMember:
		return spacev1.SpaceMember_MEMBER
	case space.RoleViewer:
		return spacev1.SpaceMember_VIEWER
	default:
		return spacev1.SpaceMember_ROLE_UNSPECIFIED
	}
}

// toDomainSpaceRole maps proto SpaceMember_Role to domain SpaceRole.
func toDomainSpaceRole(role spacev1.SpaceMember_Role) space.SpaceRole {
	switch role {
	case spacev1.SpaceMember_OWNER:
		return space.RoleOwner
	case spacev1.SpaceMember_ADMIN:
		return space.RoleAdmin
	case spacev1.SpaceMember_MEMBER:
		return space.RoleMember
	case spacev1.SpaceMember_VIEWER:
		return space.RoleViewer
	default:
		return ""
	}
}

// toProtoSpaceMember converts a domain Member to a proto SpaceMember.
func toProtoSpaceMember(m *space.Member) *spacev1.SpaceMember {
	if m == nil {
		return nil
	}
	return &spacev1.SpaceMember{
		SpaceId:    string(m.SpaceID),
		UserId:     string(m.UserID),
		Role:       toProtoSpaceRole(m.Role),
		CreateTime: timestamppb.New(m.CreateTime),
		UpdateTime: timestamppb.New(m.UpdateTime),
	}
}

// toProtoAggregatedSpaceMember converts a spaceaggregator.SpaceMember to a proto SpaceMember.
func toProtoAggregatedSpaceMember(m *spaceaggregator.SpaceMember) *spacev1.SpaceMember {
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
		Role:       toProtoSpaceRole(m.Role),
		CreateTime: timestamppb.New(m.CreateTime),
		UpdateTime: timestamppb.New(m.UpdateTime),
		Profile:    profile,
	}
}

// getPrincipal extracts the authenticated principal from context.
func (h *Handler) getPrincipal(ctx context.Context) (auth.Principal, error) {
	const op errors.Op = "transport/grpc/space.getPrincipal"
	principal, ok := auth.PrincipalFromContext(ctx)
	if !ok {
		return auth.Principal{}, errors.E(op, errors.Unauthenticated, "missing principal")
	}
	return principal, nil
}

// getSpaceUserID extracts the space-scoped user ID from context.
func (h *Handler) getSpaceUserID(ctx context.Context) (string, error) {
	const op errors.Op = "transport/grpc/space.getSpaceUserID"
	principal, err := h.getPrincipal(ctx)
	if err != nil {
		return "", errors.E(op, err)
	}
	return principal.Subject, nil
}

// CreateSpace creates a new workspace.
func (h *Handler) CreateSpace(ctx context.Context, req *spacev1.CreateSpaceRequest) (*spacev1.Space, error) {
	const op errors.Op = "transport/grpc/space.CreateSpace"
	userID, err := h.getSpaceUserID(ctx)
	if err != nil {
		return nil, errors.E(op, err)
	}

	sp, err := h.Coordinator.CreateSpace(ctx, &spaceapp.CreateSpaceRequest{
		OwnerID:     userID,
		Name:        req.GetName(),
		Description: req.GetDescription(),
	})
	if err != nil {
		return nil, errors.E(op, err)
	}

	return toProtoSpace(sp), nil
}

// GetSpace retrieves a workspace by ID.
func (h *Handler) GetSpace(ctx context.Context, req *spacev1.GetSpaceRequest) (*spacev1.Space, error) {
	const op errors.Op = "transport/grpc/space.GetSpace"
	userID, err := h.getSpaceUserID(ctx)
	if err != nil {
		return nil, errors.E(op, err)
	}

	spaceID := space.SpaceID(req.GetSpaceId())

	sp, err := h.Aggregator.GetSpace(ctx, spaceID, space.SpaceID(userID))
	if err != nil {
		return nil, errors.E(op, err)
	}

	return toProtoSpace(sp), nil
}

// UpdateSpace updates a workspace.
func (h *Handler) UpdateSpace(ctx context.Context, req *spacev1.UpdateSpaceRequest) (*spacev1.Space, error) {
	const op errors.Op = "transport/grpc/space.UpdateSpace"
	userID, err := h.getSpaceUserID(ctx)
	if err != nil {
		return nil, errors.E(op, err)
	}

	spInput := toDomainSpace(req.GetSpace())
	if spInput != nil {
		if req.GetSpaceId() != "" {
			spInput.ID = space.SpaceID(req.GetSpaceId())
		}
		if req.Version != nil {
			spInput.Version = req.GetVersion()
		}
	}

	appReq := &spaceapp.UpdateSpaceRequest{
		SpaceID:    req.GetSpaceId(),
		UserID:     userID,
		Space:      spInput,
		UpdateMask: req.GetUpdateMask().GetPaths(),
	}

	sp, err := h.Coordinator.UpdateSpace(ctx, appReq)
	if err != nil {
		return nil, errors.E(op, err)
	}

	return toProtoSpace(sp), nil
}

// DeleteSpace deletes a workspace.
func (h *Handler) DeleteSpace(ctx context.Context, req *spacev1.DeleteSpaceRequest) (*emptypb.Empty, error) {
	const op errors.Op = "transport/grpc/space.DeleteSpace"
	userID, err := h.getSpaceUserID(ctx)
	if err != nil {
		return nil, errors.E(op, err)
	}

	spaceID := space.SpaceID(req.GetSpaceId())

	if err := h.Coordinator.DeleteSpace(ctx, &spaceapp.DeleteSpaceRequest{
		SpaceID: string(spaceID),
		UserID:  userID,
	}); err != nil {
		return nil, errors.E(op, err)
	}

	return &emptypb.Empty{}, nil
}

// ListSpaces lists all spaces the authenticated user has access to.
func (h *Handler) ListSpaces(ctx context.Context, req *spacev1.ListSpacesRequest) (*spacev1.ListSpacesResponse, error) {
	const op errors.Op = "transport/grpc/space.ListSpaces"
	userID, err := h.getSpaceUserID(ctx)
	if err != nil {
		return nil, errors.E(op, err)
	}

	filter := &space.ListSpacesFilter{
		PageSize:      req.GetPageSize(),
		NextPageToken: req.GetPageToken(),
	}

	page, err := h.Aggregator.ListSpaces(ctx, space.SpaceID(userID), filter)
	if err != nil {
		return nil, errors.E(op, err)
	}

	protoSpaces := make([]*spacev1.Space, 0, len(page.Items))
	for _, sp := range page.Items {
		protoSpaces = append(protoSpaces, toProtoSpace(sp))
	}

	return &spacev1.ListSpacesResponse{
		Spaces:        protoSpaces,
		NextPageToken: page.NextPageToken,
	}, nil
}

// CreateSpaceMember adds a member to a workspace.
func (h *Handler) CreateSpaceMember(ctx context.Context, req *spacev1.CreateSpaceMemberRequest) (*spacev1.SpaceMember, error) {
	const op errors.Op = "transport/grpc/space.CreateSpaceMember"
	userID, err := h.getSpaceUserID(ctx)
	if err != nil {
		return nil, errors.E(op, err)
	}

	mInput := toDomainSpaceMember(req.GetMember())
	if mInput != nil && req.GetSpaceId() != "" {
		mInput.SpaceID = space.SpaceID(req.GetSpaceId())
	}

	m, err := h.Coordinator.AddSpaceMember(ctx, &spaceapp.AddSpaceMemberRequest{
		SpaceID: req.GetSpaceId(),
		UserID:  userID,
		Member:  mInput,
	})
	if err != nil {
		return nil, errors.E(op, err)
	}

	return toProtoSpaceMember(m), nil
}

// DeleteSpaceMember removes a member from a workspace.
func (h *Handler) DeleteSpaceMember(ctx context.Context, req *spacev1.DeleteSpaceMemberRequest) (*emptypb.Empty, error) {
	const op errors.Op = "transport/grpc/space.DeleteSpaceMember"
	userID, err := h.getSpaceUserID(ctx)
	if err != nil {
		return nil, errors.E(op, err)
	}

	spaceID := space.SpaceID(req.GetSpaceId())
	memberID := space.SpaceID(req.GetUserId())

	if err := h.Coordinator.RemoveSpaceMember(ctx, &spaceapp.RemoveSpaceMemberRequest{
		SpaceID:      string(spaceID),
		UserID:       userID,
		TargetUserID: string(memberID),
	}); err != nil {
		return nil, errors.E(op, err)
	}

	return &emptypb.Empty{}, nil
}

// UpdateSpaceMember updates an existing member within a workspace.
func (h *Handler) UpdateSpaceMember(ctx context.Context, req *spacev1.UpdateSpaceMemberRequest) (*spacev1.SpaceMember, error) {
	const op errors.Op = "transport/grpc/space.UpdateSpaceMember"
	userID, err := h.getSpaceUserID(ctx)
	if err != nil {
		return nil, errors.E(op, err)
	}

	mInput := toDomainSpaceMember(req.GetMember())
	if mInput != nil && req.GetSpaceId() != "" {
		mInput.SpaceID = space.SpaceID(req.GetSpaceId())
	}

	var mask []string
	for _, p := range req.GetUpdateMask().GetPaths() {
		if p == "user_id" || p == "member.user_id" || p == "space_id" {
			continue
		}
		mask = append(mask, p)
	}

	m, err := h.Coordinator.UpdateSpaceMember(ctx, &spaceapp.UpdateSpaceMemberRequest{
		SpaceID:    req.GetSpaceId(),
		UserID:     userID,
		Member:     mInput,
		UpdateMask: mask,
	})
	if err != nil {
		return nil, errors.E(op, err)
	}

	return toProtoSpaceMember(m), nil
}

// ListSpaceMembers lists all members of a workspace.
func (h *Handler) ListSpaceMembers(ctx context.Context, req *spacev1.ListSpaceMembersRequest) (*spacev1.ListSpaceMembersResponse, error) {
	const op errors.Op = "transport/grpc/space.ListSpaceMembers"
	userID, err := h.getSpaceUserID(ctx)
	if err != nil {
		return nil, errors.E(op, err)
	}

	spaceID := space.SpaceID(req.GetSpaceId())

	filter := &space.ListMembersFilter{
		PageSize:      req.GetPageSize(),
		NextPageToken: req.GetPageToken(),
	}

	page, err := h.Aggregator.ListSpaceMembers(ctx, spaceID, space.SpaceID(userID), filter)
	if err != nil {
		return nil, errors.E(op, err)
	}

	protoMembers := make([]*spacev1.SpaceMember, 0, len(page.Items))
	for _, m := range page.Items {
		protoMembers = append(protoMembers, toProtoAggregatedSpaceMember(m))
	}

	return &spacev1.ListSpaceMembersResponse{
		Members:       protoMembers,
		NextPageToken: page.NextPageToken,
	}, nil
}
