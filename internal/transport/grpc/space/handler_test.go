package space_test

import (
	"context"
	"testing"
	"time"

	spacev1 "github.com/masterkeysrd/saturn/apis/saturn/space/v1"
	spaceaggregator "github.com/masterkeysrd/saturn/internal/aggregator/space"
	spaceapp "github.com/masterkeysrd/saturn/internal/application/space"
	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
	"github.com/masterkeysrd/saturn/internal/platform/settings"
	"github.com/masterkeysrd/saturn/internal/transport/grpc/interceptors"
	spacegrpc "github.com/masterkeysrd/saturn/internal/transport/grpc/space"
	"google.golang.org/genproto/googleapis/rpc/errdetails"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/fieldmaskpb"
)

type mockSpaceService struct {
	createSpaceFunc           func(ctx context.Context, sp *space.Space) (*space.Space, error)
	getSpaceFunc              func(ctx context.Context, session space.Session) (*space.Space, error)
	updateSpaceFunc           func(ctx context.Context, session space.Session, sp *space.Space, mask []string) (*space.Space, error)
	deleteSpaceFunc           func(ctx context.Context, session space.Session) error
	listSpacesFunc            func(ctx context.Context, userID space.UserID, filter *space.ListSpacesFilter) (*paging.Page[*space.Space], error)
	addSpaceMemberFunc        func(ctx context.Context, session space.Session, member *space.Member) (*space.Member, error)
	removeSpaceMemberFunc     func(ctx context.Context, session space.Session, targetUserID space.UserID) error
	updateSpaceMemberRoleFunc func(ctx context.Context, session space.Session, member *space.Member) (*space.Member, error)
	updateSpaceMemberFunc     func(ctx context.Context, session space.Session, member *space.Member, mask []string) (*space.Member, error)
	listSpaceMembersFunc      func(ctx context.Context, session space.Session, filter *space.ListMembersFilter) (*paging.Page[*space.Member], error)
	getSettingsFunc                 func(ctx context.Context, session space.Session) (*settings.Entry[space.Settings], error)
	updateSettingsFunc              func(ctx context.Context, session space.Session, incoming *space.Settings, mask []string, expectedVersion *int64) (*settings.Entry[space.Settings], error)
	getDashboardPreferencesFunc     func(ctx context.Context, session space.Session) (*settings.Entry[space.DashboardPreferences], error)
	updateDashboardPreferencesFunc  func(ctx context.Context, session space.Session, incoming *space.DashboardPreferences, mask []string, expectedVersion *int64) (*settings.Entry[space.DashboardPreferences], error)
	listSpaceAPIKeyGrantsFunc       func(ctx context.Context, session space.Session) ([]*space.APIKeyGrant, error)
	revokeSpaceAPIKeyFunc     func(ctx context.Context, session space.Session, apiKeyID string) error
}

func (m *mockSpaceService) CreateSpace(ctx context.Context, sp *space.Space) (*space.Space, error) {
	if m.createSpaceFunc != nil {
		return m.createSpaceFunc(ctx, sp)
	}
	return sp, nil
}

func (m *mockSpaceService) GetSpace(ctx context.Context, session space.Session) (*space.Space, error) {
	if m.getSpaceFunc != nil {
		return m.getSpaceFunc(ctx, session)
	}
	return &space.Space{ID: session.SpaceID, OwnerID: session.UserID, Name: "Space 1", CreateTime: time.Now(), UpdateTime: time.Now()}, nil
}

func (m *mockSpaceService) UpdateSpace(ctx context.Context, session space.Session, sp *space.Space, mask []string) (*space.Space, error) {
	if m.updateSpaceFunc != nil {
		return m.updateSpaceFunc(ctx, session, sp, mask)
	}
	if err := sp.Validate(); err != nil {
		return nil, errors.E("domain/space.UpdateSpace", err)
	}
	return sp, nil
}

func (m *mockSpaceService) DeleteSpace(ctx context.Context, session space.Session) error {
	if m.deleteSpaceFunc != nil {
		return m.deleteSpaceFunc(ctx, session)
	}
	return nil
}

func (m *mockSpaceService) ListSpaces(ctx context.Context, userID space.UserID, filter *space.ListSpacesFilter) (*paging.Page[*space.Space], error) {
	if m.listSpacesFunc != nil {
		return m.listSpacesFunc(ctx, userID, filter)
	}
	return &paging.Page[*space.Space]{}, nil
}

func (m *mockSpaceService) AddSpaceMember(ctx context.Context, session space.Session, member *space.Member) (*space.Member, error) {
	if m.addSpaceMemberFunc != nil {
		return m.addSpaceMemberFunc(ctx, session, member)
	}
	if err := member.Validate(); err != nil {
		return nil, errors.E("domain/space.AddSpaceMember", err)
	}
	return member, nil
}

func (m *mockSpaceService) RemoveSpaceMember(ctx context.Context, session space.Session, targetUserID space.UserID) error {
	if m.removeSpaceMemberFunc != nil {
		return m.removeSpaceMemberFunc(ctx, session, targetUserID)
	}
	return nil
}

func (m *mockSpaceService) UpdateSpaceMember(ctx context.Context, session space.Session, member *space.Member, mask []string) (*space.Member, error) {
	if m.updateSpaceMemberFunc != nil {
		return m.updateSpaceMemberFunc(ctx, session, member, mask)
	}
	if err := member.Validate(); err != nil {
		return nil, errors.E("domain/space.UpdateSpaceMember", err)
	}
	for _, p := range mask {
		if p != "role" {
			return nil, errors.E("domain/space.UpdateSpaceMember", errors.Invalid, "unsupported or unpatchable field: "+p)
		}
	}
	if m.updateSpaceMemberRoleFunc != nil {
		return m.updateSpaceMemberRoleFunc(ctx, session, member)
	}
	return member, nil
}

func (m *mockSpaceService) UpdateSpaceMemberRole(ctx context.Context, session space.Session, member *space.Member) (*space.Member, error) {
	if m.updateSpaceMemberRoleFunc != nil {
		return m.updateSpaceMemberRoleFunc(ctx, session, member)
	}
	return member, nil
}

func (m *mockSpaceService) ListSpaceMembers(ctx context.Context, session space.Session, filter *space.ListMembersFilter) (*paging.Page[*space.Member], error) {
	if m.listSpaceMembersFunc != nil {
		return m.listSpaceMembersFunc(ctx, session, filter)
	}
	return &paging.Page[*space.Member]{}, nil
}

func (m *mockSpaceService) GetSettings(ctx context.Context, session space.Session) (*settings.Entry[space.Settings], error) {
	if m.getSettingsFunc != nil {
		return m.getSettingsFunc(ctx, session)
	}
	return &settings.Entry[space.Settings]{
		Target:  space.SettingsKey.For(string(session.SpaceID)),
		Value:   space.Settings{Timezone: "UTC"},
		Version: 1,
	}, nil
}

func (m *mockSpaceService) UpdateSettings(ctx context.Context, session space.Session, incoming *space.Settings, mask []string, expectedVersion *int64) (*settings.Entry[space.Settings], error) {
	if m.updateSettingsFunc != nil {
		return m.updateSettingsFunc(ctx, session, incoming, mask, expectedVersion)
	}
	return &settings.Entry[space.Settings]{
		Target:  space.SettingsKey.For(string(session.SpaceID)),
		Value:   *incoming,
		Version: 2,
	}, nil
}

func (m *mockSpaceService) GetDashboardPreferences(ctx context.Context, session space.Session) (*settings.Entry[space.DashboardPreferences], error) {
	if m.getDashboardPreferencesFunc != nil {
		return m.getDashboardPreferencesFunc(ctx, session)
	}
	return &settings.Entry[space.DashboardPreferences]{
		Target:  space.DashboardPreferencesKey.For(settings.UserSpaceScopeID(string(session.UserID), string(session.SpaceID))),
		Value:   space.DefaultDashboardPreferences(),
		Version: 0,
	}, nil
}

func (m *mockSpaceService) UpdateDashboardPreferences(ctx context.Context, session space.Session, incoming *space.DashboardPreferences, mask []string, expectedVersion *int64) (*settings.Entry[space.DashboardPreferences], error) {
	if m.updateDashboardPreferencesFunc != nil {
		return m.updateDashboardPreferencesFunc(ctx, session, incoming, mask, expectedVersion)
	}
	return &settings.Entry[space.DashboardPreferences]{
		Target:  space.DashboardPreferencesKey.For(settings.UserSpaceScopeID(string(session.UserID), string(session.SpaceID))),
		Value:   *incoming,
		Version: 1,
	}, nil
}

func (m *mockSpaceService) ListSpaceAPIKeyGrants(ctx context.Context, session space.Session) ([]*space.APIKeyGrant, error) {
	if m.listSpaceAPIKeyGrantsFunc != nil {
		return m.listSpaceAPIKeyGrantsFunc(ctx, session)
	}
	return nil, nil
}

func (m *mockSpaceService) RevokeSpaceAPIKeyGrant(ctx context.Context, session space.Session, apiKeyID string) error {
	if m.revokeSpaceAPIKeyFunc != nil {
		return m.revokeSpaceAPIKeyFunc(ctx, session, apiKeyID)
	}
	return nil
}

type mockIdentityService struct {
	getUserByIDFunc      func(ctx context.Context, id identity.UserID) (*identity.User, error)
	getUsersByIDsFunc    func(ctx context.Context, ids []identity.UserID) ([]*identity.User, error)
	listAPIKeysByIDsFunc func(ctx context.Context, ids []identity.APIKeyID) ([]*identity.APIKey, error)
}

func (m *mockIdentityService) ListAPIKeysByIDs(ctx context.Context, ids []identity.APIKeyID) ([]*identity.APIKey, error) {
	if m.listAPIKeysByIDsFunc != nil {
		return m.listAPIKeysByIDsFunc(ctx, ids)
	}
	return nil, nil
}

func (m *mockIdentityService) GetUserByID(ctx context.Context, id identity.UserID) (*identity.User, error) {
	if m.getUserByIDFunc != nil {
		return m.getUserByIDFunc(ctx, id)
	}
	return &identity.User{
		ID:       id,
		Username: "alice",
		Name:     "Alice",
		Status:   identity.UserStatusActive,
	}, nil
}

func (m *mockIdentityService) GetUsersByIDs(ctx context.Context, ids []identity.UserID) ([]*identity.User, error) {
	if m.getUsersByIDsFunc != nil {
		return m.getUsersByIDsFunc(ctx, ids)
	}
	users := make([]*identity.User, 0, len(ids))
	for _, id := range ids {
		u, err := m.GetUserByID(ctx, id)
		if err == nil && u != nil {
			users = append(users, u)
		}
	}
	return users, nil
}

func extractErrorInfo(st *status.Status) *errdetails.ErrorInfo {
	for _, detail := range st.Details() {
		if ei, ok := detail.(*errdetails.ErrorInfo); ok {
			return ei
		}
	}
	return nil
}

func TestHandler_CreateSpace(t *testing.T) {
	mockSpace := &mockSpaceService{}
	mockID := &mockIdentityService{}
	coordinator := spaceapp.NewCoordinator(spaceapp.Dependencies{
		SpaceService:    mockSpace,
		IdentityService: mockID,
	})
	aggregator := spaceaggregator.NewService(mockSpace, mockID)
	handler := spacegrpc.NewHandler(coordinator, aggregator)
	interceptor := interceptors.ErrorUnaryInterceptor()

	invokeCreate := func(ctx context.Context, req *spacev1.CreateSpaceRequest) (*spacev1.Space, error) {
		info := &grpc.UnaryServerInfo{FullMethod: "/saturn.space.v1.Spaces/CreateSpace"}
		resp, err := interceptor(ctx, req, info, func(c context.Context, r any) (any, error) {
			return handler.CreateSpace(c, r.(*spacev1.CreateSpaceRequest))
		})
		if err != nil {
			return nil, err
		}
		return resp.(*spacev1.Space), nil
	}

	t.Run("missing principal returns Unauthenticated", func(t *testing.T) {
		_, err := invokeCreate(context.Background(), &spacev1.CreateSpaceRequest{Name: "New Space"})
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		st, ok := status.FromError(err)
		if !ok || st.Code() != codes.Unauthenticated {
			t.Errorf("expected Unauthenticated, got %v", st.Code())
		}
	})

	t.Run("duplicate space name translates to AlreadyExists with ErrorInfo", func(t *testing.T) {
		mockSpace.createSpaceFunc = func(ctx context.Context, sp *space.Space) (*space.Space, error) {
			return nil, errors.E("domain/space.CreateSpace", errors.Exist, space.NameExists, "space name already exists")
		}

		ctx := auth.WithPrincipal(context.Background(), auth.Principal{Subject: "usr_owner"})
		_, err := invokeCreate(ctx, &spacev1.CreateSpaceRequest{Name: "Existing Space"})
		if err == nil {
			t.Fatal("expected error, got nil")
		}

		st, ok := status.FromError(err)
		if !ok {
			t.Fatalf("expected grpc status error, got %v", err)
		}
		if st.Code() != codes.AlreadyExists {
			t.Errorf("expected AlreadyExists, got %v", st.Code())
		}

		ei := extractErrorInfo(st)
		if ei == nil {
			t.Fatal("expected ErrorInfo in status details")
		}
		if ei.Reason != string(space.NameExists) {
			t.Errorf("expected Reason %q, got %q", space.NameExists, ei.Reason)
		}
		if ei.Domain != "saturn" {
			t.Errorf("expected Domain 'saturn', got %q", ei.Domain)
		}
	})

	t.Run("success returns proto Space", func(t *testing.T) {
		mockSpace.createSpaceFunc = func(ctx context.Context, sp *space.Space) (*space.Space, error) {
			sp.ID = "sp_created"
			sp.CreateTime = time.Now()
			sp.UpdateTime = time.Now()
			return sp, nil
		}

		ctx := auth.WithPrincipal(context.Background(), auth.Principal{Subject: "usr_owner"})
		res, err := invokeCreate(ctx, &spacev1.CreateSpaceRequest{Name: "Engineering"})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if res.Id != "sp_created" || res.Name != "Engineering" {
			t.Errorf("unexpected response: %+v", res)
		}
	})
}

func TestHandler_GetSpace(t *testing.T) {
	mockSpace := &mockSpaceService{}
	mockID := &mockIdentityService{}
	coordinator := spaceapp.NewCoordinator(spaceapp.Dependencies{
		SpaceService:    mockSpace,
		IdentityService: mockID,
	})
	aggregator := spaceaggregator.NewService(mockSpace, mockID)
	handler := spacegrpc.NewHandler(coordinator, aggregator)
	interceptor := interceptors.ErrorUnaryInterceptor()

	invokeGet := func(ctx context.Context, req *spacev1.GetSpaceRequest) (*spacev1.Space, error) {
		info := &grpc.UnaryServerInfo{FullMethod: "/saturn.space.v1.Spaces/GetSpace"}
		resp, err := interceptor(ctx, req, info, func(c context.Context, r any) (any, error) {
			return handler.GetSpace(c, r.(*spacev1.GetSpaceRequest))
		})
		if err != nil {
			return nil, err
		}
		return resp.(*spacev1.Space), nil
	}

	ctx := auth.WithPrincipal(context.Background(), auth.Principal{Subject: "usr_123"})

	t.Run("insufficient role translates to PermissionDenied", func(t *testing.T) {
		mockSpace.getSpaceFunc = func(ctx context.Context, session space.Session) (*space.Space, error) {
			return nil, errors.E("domain/space.GetSpace", errors.Permission, space.InsufficientRole, "access denied to this space")
		}

		_, err := invokeGet(ctx, &spacev1.GetSpaceRequest{SpaceId: "sp_123"})
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		st, ok := status.FromError(err)
		if !ok || st.Code() != codes.PermissionDenied {
			t.Errorf("expected PermissionDenied, got %v", st.Code())
		}
		ei := extractErrorInfo(st)
		if ei == nil || ei.Reason != string(space.InsufficientRole) {
			t.Errorf("expected Reason %q, got %v", space.InsufficientRole, ei)
		}
	})

	t.Run("not found translates to NotFound", func(t *testing.T) {
		mockSpace.getSpaceFunc = func(ctx context.Context, session space.Session) (*space.Space, error) {
			return nil, errors.E("domain/space.GetSpace", errors.NotExist, space.NotFound, "space not found")
		}

		_, err := invokeGet(ctx, &spacev1.GetSpaceRequest{SpaceId: "sp_nonexistent"})
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		st, ok := status.FromError(err)
		if !ok || st.Code() != codes.NotFound {
			t.Errorf("expected NotFound, got %v", st.Code())
		}
		ei := extractErrorInfo(st)
		if ei == nil || ei.Reason != string(space.NotFound) {
			t.Errorf("expected Reason %q, got %v", space.NotFound, ei)
		}
	})
}

func TestHandler_CreateSpaceMember(t *testing.T) {
	mockSpace := &mockSpaceService{}
	mockID := &mockIdentityService{}
	coordinator := spaceapp.NewCoordinator(spaceapp.Dependencies{
		SpaceService:    mockSpace,
		IdentityService: mockID,
	})
	aggregator := spaceaggregator.NewService(mockSpace, mockID)
	handler := spacegrpc.NewHandler(coordinator, aggregator)
	interceptor := interceptors.ErrorUnaryInterceptor()

	invokeCreate := func(ctx context.Context, req *spacev1.CreateSpaceMemberRequest) (*spacev1.SpaceMember, error) {
		info := &grpc.UnaryServerInfo{FullMethod: "/saturn.space.v1.Spaces/CreateSpaceMember"}
		resp, err := interceptor(ctx, req, info, func(c context.Context, r any) (any, error) {
			return handler.CreateSpaceMember(c, r.(*spacev1.CreateSpaceMemberRequest))
		})
		if err != nil {
			return nil, err
		}
		return resp.(*spacev1.SpaceMember), nil
	}

	ctx := auth.WithPrincipal(context.Background(), auth.Principal{Subject: "usr_owner"})

	t.Run("inactive user translates to FailedPrecondition with USER_NOT_ACTIVE", func(t *testing.T) {
		mockID.getUserByIDFunc = func(ctx context.Context, id identity.UserID) (*identity.User, error) {
			return &identity.User{ID: id, Status: identity.UserStatusSuspended}, nil
		}

		_, err := invokeCreate(ctx, &spacev1.CreateSpaceMemberRequest{
			SpaceId: "sp_1",
			Member: &spacev1.SpaceMember{
				UserId: "usr_inactive",
				Role:   spacev1.SpaceMember_MEMBER,
			},
		})
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		st, ok := status.FromError(err)
		if !ok || st.Code() != codes.FailedPrecondition {
			t.Errorf("expected FailedPrecondition, got %v", st.Code())
		}
		ei := extractErrorInfo(st)
		if ei == nil || ei.Reason != string(spaceapp.UserNotActive) {
			t.Errorf("expected Reason %q, got %v", spaceapp.UserNotActive, ei)
		}
	})

	t.Run("member already exists translates to AlreadyExists", func(t *testing.T) {
		mockID.getUserByIDFunc = func(ctx context.Context, id identity.UserID) (*identity.User, error) {
			return &identity.User{ID: id, Status: identity.UserStatusActive}, nil
		}
		mockSpace.addSpaceMemberFunc = func(ctx context.Context, session space.Session, member *space.Member) (*space.Member, error) {
			return nil, errors.E("domain/space.AddSpaceMember", errors.Exist, space.MemberAlreadyExists, "member already exists")
		}

		_, err := invokeCreate(ctx, &spacev1.CreateSpaceMemberRequest{
			SpaceId: "sp_1",
			Member: &spacev1.SpaceMember{
				UserId: "usr_existing",
				Role:   spacev1.SpaceMember_MEMBER,
			},
		})
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		st, ok := status.FromError(err)
		if !ok || st.Code() != codes.AlreadyExists {
			t.Errorf("expected AlreadyExists, got %v", st.Code())
		}
		ei := extractErrorInfo(st)
		if ei == nil || ei.Reason != string(space.MemberAlreadyExists) {
			t.Errorf("expected Reason %q, got %v", space.MemberAlreadyExists, ei)
		}
	})
}

func TestHandler_UpdateSpaceMember(t *testing.T) {
	mockSpace := &mockSpaceService{}
	mockID := &mockIdentityService{}
	coordinator := spaceapp.NewCoordinator(spaceapp.Dependencies{
		SpaceService:    mockSpace,
		IdentityService: mockID,
	})
	aggregator := spaceaggregator.NewService(mockSpace, mockID)
	handler := spacegrpc.NewHandler(coordinator, aggregator)
	interceptor := interceptors.ErrorUnaryInterceptor()

	invokeUpdate := func(ctx context.Context, req *spacev1.UpdateSpaceMemberRequest) (*spacev1.SpaceMember, error) {
		info := &grpc.UnaryServerInfo{FullMethod: "/saturn.space.v1.Spaces/UpdateSpaceMember"}
		resp, err := interceptor(ctx, req, info, func(c context.Context, r any) (any, error) {
			return handler.UpdateSpaceMember(c, r.(*spacev1.UpdateSpaceMemberRequest))
		})
		if err != nil {
			return nil, err
		}
		return resp.(*spacev1.SpaceMember), nil
	}

	ctx := auth.WithPrincipal(context.Background(), auth.Principal{Subject: "usr_owner"})

	t.Run("missing member.user_id returns InvalidArgument", func(t *testing.T) {
		_, err := invokeUpdate(ctx, &spacev1.UpdateSpaceMemberRequest{
			SpaceId: "sp_1",
			Member: &spacev1.SpaceMember{
				Role: spacev1.SpaceMember_ADMIN,
			},
		})
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		st, ok := status.FromError(err)
		if !ok || st.Code() != codes.InvalidArgument {
			t.Errorf("expected InvalidArgument, got %v", st.Code())
		}
	})

	t.Run("unsupported update_mask path returns InvalidArgument", func(t *testing.T) {
		_, err := invokeUpdate(ctx, &spacev1.UpdateSpaceMemberRequest{
			SpaceId: "sp_1",
			Member: &spacev1.SpaceMember{
				UserId: "usr_2",
				Role:   spacev1.SpaceMember_ADMIN,
			},
			UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"invalid_field"}},
		})
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		st, ok := status.FromError(err)
		if !ok || st.Code() != codes.InvalidArgument {
			t.Errorf("expected InvalidArgument, got %v", st.Code())
		}
	})

	t.Run("successful role update returns updated proto SpaceMember", func(t *testing.T) {
		mockSpace.updateSpaceMemberRoleFunc = func(ctx context.Context, session space.Session, member *space.Member) (*space.Member, error) {
			return &space.Member{
				SpaceID: session.SpaceID,
				UserID:  member.UserID,
				Role:    member.Role,
			}, nil
		}

		res, err := invokeUpdate(ctx, &spacev1.UpdateSpaceMemberRequest{
			SpaceId: "sp_1",
			Member: &spacev1.SpaceMember{
				UserId: "usr_2",
				Role:   spacev1.SpaceMember_ADMIN,
			},
			UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"role"}},
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if res.GetRole() != spacev1.SpaceMember_ADMIN {
			t.Errorf("expected ADMIN, got %v", res.GetRole())
		}
	})

	t.Run("empty update_mask defaults to updating all fields", func(t *testing.T) {
		mockSpace.updateSpaceMemberRoleFunc = func(ctx context.Context, session space.Session, member *space.Member) (*space.Member, error) {
			return &space.Member{
				SpaceID: session.SpaceID,
				UserID:  member.UserID,
				Role:    member.Role,
			}, nil
		}

		res, err := invokeUpdate(ctx, &spacev1.UpdateSpaceMemberRequest{
			SpaceId: "sp_1",
			Member: &spacev1.SpaceMember{
				UserId: "usr_2",
				Role:   spacev1.SpaceMember_VIEWER,
			},
			UpdateMask: nil,
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if res.GetRole() != spacev1.SpaceMember_VIEWER {
			t.Errorf("expected VIEWER, got %v", res.GetRole())
		}
	})
}

func TestHandler_UpdateSpace(t *testing.T) {
	mockSpace := &mockSpaceService{}
	mockID := &mockIdentityService{}
	coordinator := spaceapp.NewCoordinator(spaceapp.Dependencies{
		SpaceService:    mockSpace,
		IdentityService: mockID,
	})
	aggregator := spaceaggregator.NewService(mockSpace, mockID)
	handler := spacegrpc.NewHandler(coordinator, aggregator)
	interceptor := interceptors.ErrorUnaryInterceptor()

	invokeUpdate := func(ctx context.Context, req *spacev1.UpdateSpaceRequest) (*spacev1.Space, error) {
		info := &grpc.UnaryServerInfo{FullMethod: "/saturn.space.v1.Spaces/UpdateSpace"}
		resp, err := interceptor(ctx, req, info, func(c context.Context, r any) (any, error) {
			return handler.UpdateSpace(c, r.(*spacev1.UpdateSpaceRequest))
		})
		if err != nil {
			return nil, err
		}
		return resp.(*spacev1.Space), nil
	}

	ctx := auth.WithPrincipal(context.Background(), auth.Principal{Subject: "usr_owner"})

	t.Run("unauthenticated error when principal missing", func(t *testing.T) {
		_, err := invokeUpdate(context.Background(), &spacev1.UpdateSpaceRequest{
			SpaceId: "sp_1",
			Space:   &spacev1.Space{Name: "New Name"},
		})
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		st, ok := status.FromError(err)
		if !ok || st.Code() != codes.Unauthenticated {
			t.Errorf("expected Unauthenticated, got %v", st.Code())
		}
	})

	t.Run("nil space payload returns InvalidArgument", func(t *testing.T) {
		_, err := invokeUpdate(ctx, &spacev1.UpdateSpaceRequest{
			SpaceId: "sp_1",
			Space:   nil,
		})
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		st, ok := status.FromError(err)
		if !ok || st.Code() != codes.InvalidArgument {
			t.Errorf("expected InvalidArgument, got %v", st.Code())
		}
	})

	t.Run("success updates space and passes field mask", func(t *testing.T) {
		var capturedMask []string
		mockSpace.updateSpaceFunc = func(ctx context.Context, session space.Session, sp *space.Space, mask []string) (*space.Space, error) {
			capturedMask = mask
			sp.ID = session.SpaceID
			sp.Name = "Updated Name"
			sp.Version = 2
			sp.UpdateTime = time.Now()
			return sp, nil
		}

		v := int64(1)
		res, err := invokeUpdate(ctx, &spacev1.UpdateSpaceRequest{
			SpaceId: "sp_1",
			Space: &spacev1.Space{
				Name: "Updated Name",
			},
			UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"name"}},
			Version:    &v,
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if res.Id != "sp_1" || res.Name != "Updated Name" || res.Version != 2 {
			t.Errorf("unexpected response: %+v", res)
		}
		if len(capturedMask) != 1 || capturedMask[0] != "name" {
			t.Errorf("expected mask ['name'], got %v", capturedMask)
		}
	})

	t.Run("version mismatch translates to Aborted with ErrorInfo", func(t *testing.T) {
		mockSpace.updateSpaceFunc = func(ctx context.Context, session space.Session, sp *space.Space, mask []string) (*space.Space, error) {
			return nil, errors.E("domain/space.UpdateSpace", errors.Conflict, space.VersionMismatch, "space was modified concurrently")
		}

		v := int64(1)
		_, err := invokeUpdate(ctx, &spacev1.UpdateSpaceRequest{
			SpaceId: "sp_1",
			Space:   &spacev1.Space{Name: "Conflict"},
			Version: &v,
		})
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		st, ok := status.FromError(err)
		if !ok || st.Code() != codes.Aborted {
			t.Errorf("expected Aborted, got %v", st.Code())
		}
		ei := extractErrorInfo(st)
		if ei == nil || ei.Reason != string(space.VersionMismatch) {
			t.Errorf("expected Reason %q, got %v", space.VersionMismatch, ei)
		}
	})
}

func TestHandler_GetSettings(t *testing.T) {
	mockSpace := &mockSpaceService{}
	mockID := &mockIdentityService{}
	coordinator := spaceapp.NewCoordinator(spaceapp.Dependencies{
		SpaceService:    mockSpace,
		IdentityService: mockID,
	})
	aggregator := spaceaggregator.NewService(mockSpace, mockID)
	handler := spacegrpc.NewHandler(coordinator, aggregator)
	interceptor := interceptors.ErrorUnaryInterceptor()

	invokeGet := func(ctx context.Context, req *spacev1.GetSettingsRequest) (*spacev1.Settings, error) {
		info := &grpc.UnaryServerInfo{FullMethod: "/saturn.space.v1.Spaces/GetSettings"}
		resp, err := interceptor(ctx, req, info, func(c context.Context, r any) (any, error) {
			return handler.GetSettings(c, r.(*spacev1.GetSettingsRequest))
		})
		if err != nil {
			return nil, err
		}
		return resp.(*spacev1.Settings), nil
	}

	ctx := auth.WithPrincipal(context.Background(), auth.Principal{Subject: "usr_member"})

	t.Run("success", func(t *testing.T) {
		mockSpace.getSettingsFunc = func(ctx context.Context, session space.Session) (*settings.Entry[space.Settings], error) {
			return &settings.Entry[space.Settings]{
				Target:     space.SettingsKey.For(string(session.SpaceID)),
				Value:      space.Settings{Timezone: "America/Santo_Domingo"},
				Version:    1,
				CreateTime: time.Now(),
				UpdateTime: time.Now(),
			}, nil
		}

		res, err := invokeGet(ctx, &spacev1.GetSettingsRequest{SpaceId: "sp_1"})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if res.GetTimezone() != "America/Santo_Domingo" {
			t.Errorf("expected timezone America/Santo_Domingo, got %s", res.GetTimezone())
		}
		if res.GetVersion() != 1 {
			t.Errorf("expected version 1, got %d", res.GetVersion())
		}
	})

	t.Run("unauthenticated when principal missing", func(t *testing.T) {
		_, err := invokeGet(context.Background(), &spacev1.GetSettingsRequest{SpaceId: "sp_1"})
		if err == nil {
			t.Fatal("expected error, got nil")
		}
	})
}

func TestHandler_UpdateSettings(t *testing.T) {
	mockSpace := &mockSpaceService{}
	mockID := &mockIdentityService{}
	coordinator := spaceapp.NewCoordinator(spaceapp.Dependencies{
		SpaceService:    mockSpace,
		IdentityService: mockID,
	})
	aggregator := spaceaggregator.NewService(mockSpace, mockID)
	handler := spacegrpc.NewHandler(coordinator, aggregator)
	interceptor := interceptors.ErrorUnaryInterceptor()

	invokeUpdate := func(ctx context.Context, req *spacev1.UpdateSettingsRequest) (*spacev1.Settings, error) {
		info := &grpc.UnaryServerInfo{FullMethod: "/saturn.space.v1.Spaces/UpdateSettings"}
		resp, err := interceptor(ctx, req, info, func(c context.Context, r any) (any, error) {
			return handler.UpdateSettings(c, r.(*spacev1.UpdateSettingsRequest))
		})
		if err != nil {
			return nil, err
		}
		return resp.(*spacev1.Settings), nil
	}

	ctx := auth.WithPrincipal(context.Background(), auth.Principal{Subject: "usr_owner"})

	t.Run("success", func(t *testing.T) {
		mockSpace.updateSettingsFunc = func(ctx context.Context, session space.Session, incoming *space.Settings, mask []string, expectedVersion *int64) (*settings.Entry[space.Settings], error) {
			return &settings.Entry[space.Settings]{
				Target:     space.SettingsKey.For(string(session.SpaceID)),
				Value:      *incoming,
				Version:    2,
				CreateTime: time.Now(),
				UpdateTime: time.Now(),
			}, nil
		}

		v := int64(1)
		res, err := invokeUpdate(ctx, &spacev1.UpdateSettingsRequest{
			SpaceId: "sp_1",
			Settings: &spacev1.Settings{
				Timezone: "UTC",
			},
			UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"timezone"}},
			Version:    &v,
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if res.GetTimezone() != "UTC" {
			t.Errorf("expected timezone UTC, got %s", res.GetTimezone())
		}
		if res.GetVersion() != 2 {
			t.Errorf("expected version 2, got %d", res.GetVersion())
		}
	})

	t.Run("unauthenticated when principal missing", func(t *testing.T) {
		_, err := invokeUpdate(context.Background(), &spacev1.UpdateSettingsRequest{
			SpaceId: "sp_1",
			Settings: &spacev1.Settings{
				Timezone: "UTC",
			},
		})
		if err == nil {
			t.Fatal("expected error, got nil")
		}
	})
}

func TestHandler_SpaceAPIKeyGrants(t *testing.T) {
	mockSpace := &mockSpaceService{
		listSpaceAPIKeyGrantsFunc: func(ctx context.Context, session space.Session) ([]*space.APIKeyGrant, error) {
			return []*space.APIKeyGrant{
				{APIKeyID: "apk_1", SpaceID: session.SpaceID, UserID: "usr_1"},
			}, nil
		},
	}
	mockIdent := &mockIdentityService{
		listAPIKeysByIDsFunc: func(ctx context.Context, ids []identity.APIKeyID) ([]*identity.APIKey, error) {
			return []*identity.APIKey{
				{ID: "apk_1", Name: "Bot", KeyPrefix: "sat_12345678", Scopes: []string{"finance:read"}},
			}, nil
		},
	}

	coord := spaceapp.NewCoordinator(spaceapp.Dependencies{SpaceService: mockSpace, IdentityService: mockIdent})
	agg := spaceaggregator.NewService(mockSpace, mockIdent)
	h := spacegrpc.NewHandler(coord, agg)

	ctx := auth.WithPrincipal(context.Background(), auth.Principal{Subject: "usr_admin"})

	listResp, err := h.ListSpaceAPIKeyGrants(ctx, &spacev1.ListSpaceAPIKeyGrantsRequest{SpaceId: "spc_1"})
	if err != nil {
		t.Fatalf("ListSpaceAPIKeyGrants failed: %v", err)
	}
	if len(listResp.GetGrants()) != 1 || listResp.GetGrants()[0].GetKeyName() != "Bot" {
		t.Errorf("unexpected grants response: %+v", listResp)
	}

	if _, err := h.RevokeSpaceAPIKeyGrant(ctx, &spacev1.RevokeSpaceAPIKeyGrantRequest{SpaceId: "spc_1", ApiKeyId: "apk_1"}); err != nil {
		t.Fatalf("RevokeSpaceAPIKeyGrant failed: %v", err)
	}
}

func TestHandler_GetDashboardPreferences(t *testing.T) {
	interceptor := interceptors.ErrorUnaryInterceptor()
	authedCtx := auth.WithPrincipal(context.Background(), auth.Principal{Subject: "usr_member"})

	tests := []struct {
		name     string
		ctx      context.Context
		req      *spacev1.GetDashboardPreferencesRequest
		mockFn   func(ctx context.Context, session space.Session) (*settings.Entry[space.DashboardPreferences], error)
		wantCode codes.Code
		want     []string
	}{
		{
			name: "success",
			ctx:  authedCtx,
			req:  &spacev1.GetDashboardPreferencesRequest{SpaceId: "spc_1"},
			mockFn: func(ctx context.Context, session space.Session) (*settings.Entry[space.DashboardPreferences], error) {
				return &settings.Entry[space.DashboardPreferences]{
					Target:     space.DashboardPreferencesKey.For(settings.UserSpaceScopeID(string(session.UserID), string(session.SpaceID))),
					Value:      space.DashboardPreferences{Widgets: []string{"budget_pace", "net_worth"}},
					Version:    3,
					CreateTime: time.Now(),
					UpdateTime: time.Now(),
				}, nil
			},
			want: []string{"budget_pace", "net_worth"},
		},
		{
			name:     "unauthenticated when principal missing",
			ctx:      context.Background(),
			req:      &spacev1.GetDashboardPreferencesRequest{SpaceId: "spc_1"},
			wantCode: codes.Unauthenticated,
		},
		{
			name: "permission denied propagated",
			ctx:  authedCtx,
			req:  &spacev1.GetDashboardPreferencesRequest{SpaceId: "spc_1"},
			mockFn: func(ctx context.Context, session space.Session) (*settings.Entry[space.DashboardPreferences], error) {
				return nil, errors.E(errors.Permission, space.InsufficientRole, "denied")
			},
			wantCode: codes.PermissionDenied,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			mockSpace := &mockSpaceService{getDashboardPreferencesFunc: tc.mockFn}
			mockID := &mockIdentityService{}
			coordinator := spaceapp.NewCoordinator(spaceapp.Dependencies{SpaceService: mockSpace, IdentityService: mockID})
			aggregator := spaceaggregator.NewService(mockSpace, mockID)
			handler := spacegrpc.NewHandler(coordinator, aggregator)

			info := &grpc.UnaryServerInfo{FullMethod: "/saturn.space.v1.Spaces/GetDashboardPreferences"}
			resp, err := interceptor(tc.ctx, tc.req, info, func(c context.Context, r any) (any, error) {
				return handler.GetDashboardPreferences(c, r.(*spacev1.GetDashboardPreferencesRequest))
			})
			if tc.wantCode != codes.OK {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				if status.Code(err) != tc.wantCode {
					t.Fatalf("expected status code %v, got %v (%v)", tc.wantCode, status.Code(err), err)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			got := resp.(*spacev1.DashboardPreferences)
			if got.GetSpaceId() != "spc_1" || got.GetUserId() != "usr_member" {
				t.Errorf("unexpected space/user ids: space=%q user=%q", got.GetSpaceId(), got.GetUserId())
			}
			if got.GetVersion() != 3 {
				t.Errorf("expected version 3, got %d", got.GetVersion())
			}
			if len(got.GetWidgets()) != len(tc.want) {
				t.Fatalf("expected widgets %v, got %v", tc.want, got.GetWidgets())
			}
		})
	}
}

func TestHandler_UpdateDashboardPreferences(t *testing.T) {
	interceptor := interceptors.ErrorUnaryInterceptor()
	authedCtx := auth.WithPrincipal(context.Background(), auth.Principal{Subject: "usr_viewer"})

	tests := []struct {
		name     string
		ctx      context.Context
		req      *spacev1.UpdateDashboardPreferencesRequest
		mockFn   func(ctx context.Context, session space.Session, incoming *space.DashboardPreferences, mask []string, expectedVersion *int64) (*settings.Entry[space.DashboardPreferences], error)
		wantCode codes.Code
		want     []string
	}{
		{
			name: "success",
			ctx:  authedCtx,
			req: &spacev1.UpdateDashboardPreferencesRequest{
				SpaceId: "spc_1",
				DashboardPreferences: &spacev1.DashboardPreferences{
					Widgets: []string{"budget_pace", "priority_mail"},
				},
				UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"widgets"}},
				Version:    new(int64(1)),
			},
			mockFn: func(ctx context.Context, session space.Session, incoming *space.DashboardPreferences, mask []string, expectedVersion *int64) (*settings.Entry[space.DashboardPreferences], error) {
				return &settings.Entry[space.DashboardPreferences]{
					Target:     space.DashboardPreferencesKey.For(settings.UserSpaceScopeID(string(session.UserID), string(session.SpaceID))),
					Value:      *incoming,
					Version:    2,
					CreateTime: time.Now(),
					UpdateTime: time.Now(),
				}, nil
			},
			want: []string{"budget_pace", "priority_mail"},
		},
		{
			name: "unauthenticated when principal missing",
			ctx:  context.Background(),
			req: &spacev1.UpdateDashboardPreferencesRequest{
				SpaceId:              "spc_1",
				DashboardPreferences: &spacev1.DashboardPreferences{Widgets: []string{"net_worth"}},
			},
			wantCode: codes.Unauthenticated,
		},
		{
			name: "invalid widget error mapped to InvalidArgument",
			ctx:  authedCtx,
			req: &spacev1.UpdateDashboardPreferencesRequest{
				SpaceId:              "spc_1",
				DashboardPreferences: &spacev1.DashboardPreferences{Widgets: []string{"bad_widget"}},
				UpdateMask:           &fieldmaskpb.FieldMask{Paths: []string{"widgets"}},
			},
			mockFn: func(ctx context.Context, session space.Session, incoming *space.DashboardPreferences, mask []string, expectedVersion *int64) (*settings.Entry[space.DashboardPreferences], error) {
				return nil, errors.E(errors.Invalid, "unsupported dashboard widget")
			},
			wantCode: codes.InvalidArgument,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			mockSpace := &mockSpaceService{updateDashboardPreferencesFunc: tc.mockFn}
			mockID := &mockIdentityService{}
			coordinator := spaceapp.NewCoordinator(spaceapp.Dependencies{SpaceService: mockSpace, IdentityService: mockID})
			aggregator := spaceaggregator.NewService(mockSpace, mockID)
			handler := spacegrpc.NewHandler(coordinator, aggregator)

			info := &grpc.UnaryServerInfo{FullMethod: "/saturn.space.v1.Spaces/UpdateDashboardPreferences"}
			resp, err := interceptor(tc.ctx, tc.req, info, func(c context.Context, r any) (any, error) {
				return handler.UpdateDashboardPreferences(c, r.(*spacev1.UpdateDashboardPreferencesRequest))
			})
			if tc.wantCode != codes.OK {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				if status.Code(err) != tc.wantCode {
					t.Fatalf("expected status code %v, got %v (%v)", tc.wantCode, status.Code(err), err)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			got := resp.(*spacev1.DashboardPreferences)
			if got.GetSpaceId() != "spc_1" || got.GetUserId() != "usr_viewer" {
				t.Errorf("unexpected space/user ids: space=%q user=%q", got.GetSpaceId(), got.GetUserId())
			}
			if got.GetVersion() != 2 {
				t.Errorf("expected version 2, got %d", got.GetVersion())
			}
			if len(got.GetWidgets()) != len(tc.want) {
				t.Fatalf("expected widgets %v, got %v", tc.want, got.GetWidgets())
			}
		})
	}
}
