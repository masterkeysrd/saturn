package space_test

import (
	"context"
	"testing"
	"time"

	spacev1 "github.com/masterkeysrd/saturn/apis/saturn/space/v1"
	spaceapp "github.com/masterkeysrd/saturn/internal/application/space"
	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/transport/grpc/interceptors"
	spacegrpc "github.com/masterkeysrd/saturn/internal/transport/grpc/space"
	"google.golang.org/genproto/googleapis/rpc/errdetails"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type mockSpaceService struct {
	createSpaceFunc           func(ctx context.Context, sp *space.Space) (*space.Space, error)
	getSpaceFunc              func(ctx context.Context, session space.Session) (*space.Space, error)
	updateSpaceFunc           func(ctx context.Context, session space.Session, sp *space.Space) (*space.Space, error)
	deleteSpaceFunc           func(ctx context.Context, session space.Session) error
	listSpacesFunc            func(ctx context.Context, userID space.SpaceID, filter *space.ListSpacesFilter) ([]*space.Space, string, error)
	addSpaceMemberFunc        func(ctx context.Context, session space.Session, member *space.Member) (*space.Member, error)
	removeSpaceMemberFunc     func(ctx context.Context, session space.Session, targetUserID space.SpaceID) error
	updateSpaceMemberRoleFunc func(ctx context.Context, session space.Session, member *space.Member) (*space.Member, error)
	listSpaceMembersFunc      func(ctx context.Context, session space.Session, filter *space.ListMembersFilter) ([]*space.Member, string, error)
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

func (m *mockSpaceService) UpdateSpace(ctx context.Context, session space.Session, sp *space.Space) (*space.Space, error) {
	if m.updateSpaceFunc != nil {
		return m.updateSpaceFunc(ctx, session, sp)
	}
	return sp, nil
}

func (m *mockSpaceService) DeleteSpace(ctx context.Context, session space.Session) error {
	if m.deleteSpaceFunc != nil {
		return m.deleteSpaceFunc(ctx, session)
	}
	return nil
}

func (m *mockSpaceService) ListSpaces(ctx context.Context, userID space.SpaceID, filter *space.ListSpacesFilter) ([]*space.Space, string, error) {
	if m.listSpacesFunc != nil {
		return m.listSpacesFunc(ctx, userID, filter)
	}
	return []*space.Space{}, "", nil
}

func (m *mockSpaceService) AddSpaceMember(ctx context.Context, session space.Session, member *space.Member) (*space.Member, error) {
	if m.addSpaceMemberFunc != nil {
		return m.addSpaceMemberFunc(ctx, session, member)
	}
	return member, nil
}

func (m *mockSpaceService) RemoveSpaceMember(ctx context.Context, session space.Session, targetUserID space.SpaceID) error {
	if m.removeSpaceMemberFunc != nil {
		return m.removeSpaceMemberFunc(ctx, session, targetUserID)
	}
	return nil
}

func (m *mockSpaceService) UpdateSpaceMemberRole(ctx context.Context, session space.Session, member *space.Member) (*space.Member, error) {
	if m.updateSpaceMemberRoleFunc != nil {
		return m.updateSpaceMemberRoleFunc(ctx, session, member)
	}
	return member, nil
}

func (m *mockSpaceService) ListSpaceMembers(ctx context.Context, session space.Session, filter *space.ListMembersFilter) ([]*space.Member, string, error) {
	if m.listSpaceMembersFunc != nil {
		return m.listSpaceMembersFunc(ctx, session, filter)
	}
	return []*space.Member{}, "", nil
}

type mockIdentityService struct {
	getUserByIDFunc func(ctx context.Context, id identity.UserID) (*identity.User, error)
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
	handler := spacegrpc.NewHandler(coordinator)
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
	handler := spacegrpc.NewHandler(coordinator)
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

func TestHandler_AddSpaceMember(t *testing.T) {
	mockSpace := &mockSpaceService{}
	mockID := &mockIdentityService{}
	coordinator := spaceapp.NewCoordinator(spaceapp.Dependencies{
		SpaceService:    mockSpace,
		IdentityService: mockID,
	})
	handler := spacegrpc.NewHandler(coordinator)
	interceptor := interceptors.ErrorUnaryInterceptor()

	invokeAdd := func(ctx context.Context, req *spacev1.AddSpaceMemberRequest) (*spacev1.SpaceMember, error) {
		info := &grpc.UnaryServerInfo{FullMethod: "/saturn.space.v1.Spaces/AddSpaceMember"}
		resp, err := interceptor(ctx, req, info, func(c context.Context, r any) (any, error) {
			return handler.AddSpaceMember(c, r.(*spacev1.AddSpaceMemberRequest))
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

		_, err := invokeAdd(ctx, &spacev1.AddSpaceMemberRequest{
			SpaceId: "sp_1",
			UserId:  "usr_inactive",
			Role:    string(space.RoleMember),
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

		_, err := invokeAdd(ctx, &spacev1.AddSpaceMemberRequest{
			SpaceId: "sp_1",
			UserId:  "usr_existing",
			Role:    string(space.RoleMember),
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
