package space

import (
	"context"
	"fmt"
	"testing"

	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

func TestCoordinator_CreateSpace(t *testing.T) {
	ctx := context.Background()

	tests := []struct {
		name          string
		req           *CreateSpaceRequest
		mockCreate    func(ctx context.Context, sp *space.Space) (*space.Space, error)
		expectedID    string
		expectedError bool
		expectedCode  errors.Code
	}{
		{
			name: "Success - space created",
			req: &CreateSpaceRequest{
				OwnerID:     "usr_owner",
				Name:        "Workspace 1",
				Description: "My first workspace",
			},
			mockCreate: func(ctx context.Context, sp *space.Space) (*space.Space, error) {
				if sp.OwnerID != "usr_owner" || sp.Name != "Workspace 1" || sp.Description != "My first workspace" {
					t.Errorf("unexpected space arguments: %+v", sp)
				}
				sp.ID = "sp_123"
				return sp, nil
			},
			expectedID:    "sp_123",
			expectedError: false,
		},
		{
			name: "Failure - space name already exists",
			req: &CreateSpaceRequest{
				OwnerID: "usr_owner",
				Name:    "Duplicate Workspace",
			},
			mockCreate: func(ctx context.Context, sp *space.Space) (*space.Space, error) {
				return nil, errors.E(errors.Exist, space.NameExists, "space name already exists")
			},
			expectedError: true,
			expectedCode:  space.NameExists,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			mockSpace := &SpaceServiceMock{
				CreateSpaceFunc: tc.mockCreate,
			}
			coord := NewCoordinator(Dependencies{
				SpaceService: mockSpace,
			})

			res, err := coord.CreateSpace(ctx, tc.req)
			if tc.expectedError {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				if tc.expectedCode != "" && errors.CodeOf(err) != tc.expectedCode {
					t.Errorf("expected code %v, got %v", tc.expectedCode, errors.CodeOf(err))
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if res.ID != space.SpaceID(tc.expectedID) {
				t.Errorf("expected ID %s, got %s", tc.expectedID, res.ID)
			}
		})
	}
}

func TestCoordinator_UpdateSpace(t *testing.T) {
	ctx := context.Background()

	tests := []struct {
		name          string
		req           *UpdateSpaceRequest
		mockUpdate    func(ctx context.Context, session space.Session, sp *space.Space, mask []string) (*space.Space, error)
		expectedName  string
		expectedError bool
		expectedCode  errors.Code
	}{
		{
			name: "Success - workspace updated with mask",
			req: &UpdateSpaceRequest{
				SpaceID:    "sp_123",
				UserID:     "usr_caller",
				Space:      &space.Space{Name: "Renamed Space"},
				UpdateMask: []string{"name"},
			},
			mockUpdate: func(ctx context.Context, session space.Session, sp *space.Space, mask []string) (*space.Space, error) {
				if session.SpaceID != "sp_123" || session.UserID != "usr_caller" {
					t.Errorf("unexpected session: %+v", session)
				}
				if len(mask) != 1 || mask[0] != "name" {
					t.Errorf("unexpected mask: %v", mask)
				}
				sp.ID = session.SpaceID
				return sp, nil
			},
			expectedName:  "Renamed Space",
			expectedError: false,
		},
		{
			name: "Failure - space not found",
			req: &UpdateSpaceRequest{
				SpaceID: "sp_missing",
				UserID:  "usr_caller",
				Space:   &space.Space{Name: "New Name"},
			},
			mockUpdate: func(ctx context.Context, session space.Session, sp *space.Space, mask []string) (*space.Space, error) {
				return nil, errors.E(errors.NotExist, space.NotFound, "space not found")
			},
			expectedError: true,
			expectedCode:  space.NotFound,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			mockSpace := &SpaceServiceMock{
				UpdateSpaceFunc: tc.mockUpdate,
			}
			coord := NewCoordinator(Dependencies{
				SpaceService: mockSpace,
			})

			res, err := coord.UpdateSpace(ctx, tc.req)
			if tc.expectedError {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				if tc.expectedCode != "" && errors.CodeOf(err) != tc.expectedCode {
					t.Errorf("expected code %v, got %v", tc.expectedCode, errors.CodeOf(err))
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if res.Name != tc.expectedName {
				t.Errorf("expected name %s, got %s", tc.expectedName, res.Name)
			}
		})
	}
}

func TestCoordinator_DeleteSpace(t *testing.T) {
	ctx := context.Background()

	tests := []struct {
		name          string
		req           *DeleteSpaceRequest
		mockDelete    func(ctx context.Context, session space.Session) error
		expectedError bool
		expectedCode  errors.Code
		expectedKind  errors.Kind
	}{
		{
			name: "Success - workspace deleted",
			req: &DeleteSpaceRequest{
				SpaceID: "sp_123",
				UserID:  "usr_owner",
			},
			mockDelete: func(ctx context.Context, session space.Session) error {
				if session.SpaceID != "sp_123" || session.UserID != "usr_owner" {
					t.Errorf("unexpected session: %+v", session)
				}
				return nil
			},
			expectedError: false,
		},
		{
			name: "Failure - owner only permission denied",
			req: &DeleteSpaceRequest{
				SpaceID: "sp_123",
				UserID:  "usr_member",
			},
			mockDelete: func(ctx context.Context, session space.Session) error {
				return errors.E(errors.Permission, space.OwnerOnly, "only owner can delete space")
			},
			expectedError: true,
			expectedKind:  errors.Permission,
			expectedCode:  space.OwnerOnly,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			mockSpace := &SpaceServiceMock{
				DeleteSpaceFunc: tc.mockDelete,
			}
			coord := NewCoordinator(Dependencies{
				SpaceService: mockSpace,
			})

			err := coord.DeleteSpace(ctx, tc.req)
			if tc.expectedError {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				if tc.expectedKind != errors.Other && errors.KindOf(err) != tc.expectedKind {
					t.Errorf("expected kind %v, got %v", tc.expectedKind, errors.KindOf(err))
				}
				if tc.expectedCode != "" && errors.CodeOf(err) != tc.expectedCode {
					t.Errorf("expected code %v, got %v", tc.expectedCode, errors.CodeOf(err))
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
		})
	}
}

func TestCoordinator_AddSpaceMember(t *testing.T) {
	ctx := context.Background()

	tests := []struct {
		name          string
		req           *AddSpaceMemberRequest
		userStatus    identity.UserStatus
		lookupErr     error
		mockAddMember func(ctx context.Context, session space.Session, member *space.Member) (*space.Member, error)
		expectedError bool
		expectedKind  errors.Kind
		expectedCode  errors.Code
	}{
		{
			name: "Failure - nil member returns Invalid",
			req: &AddSpaceMemberRequest{
				SpaceID: "sp_123",
				UserID:  "usr_owner",
				Member:  nil,
			},
			expectedError: true,
			expectedKind:  errors.Invalid,
		},
		{
			name: "Failure - empty user_id returns Invalid",
			req: &AddSpaceMemberRequest{
				SpaceID: "sp_123",
				UserID:  "usr_owner",
				Member:  &space.Member{UserID: "", Role: space.RoleMember},
			},
			expectedError: true,
			expectedKind:  errors.Invalid,
		},
		{
			name: "Failure - invalid role returns Invalid",
			req: &AddSpaceMemberRequest{
				SpaceID: "sp_123",
				UserID:  "usr_owner",
				Member:  &space.Member{UserID: "usr_target", Role: "invalid"},
			},
			expectedError: true,
			expectedKind:  errors.Invalid,
			expectedCode:  space.InvalidRole,
		},
		{
			name: "Failure - identity lookup error",
			req: &AddSpaceMemberRequest{
				SpaceID: "sp_123",
				UserID:  "usr_owner",
				Member:  &space.Member{UserID: "usr_target", Role: space.RoleMember},
			},
			lookupErr:     fmt.Errorf("network timeout"),
			expectedError: true,
		},
		{
			name: "Failure - user not active returns Precondition with UserNotActive code",
			req: &AddSpaceMemberRequest{
				SpaceID: "sp_123",
				UserID:  "usr_owner",
				Member:  &space.Member{UserID: "usr_target", Role: space.RoleMember},
			},
			userStatus:    identity.UserStatusSuspended,
			expectedError: true,
			expectedKind:  errors.Precondition,
			expectedCode:  UserNotActive,
		},
		{
			name: "Failure - space service add member error",
			req: &AddSpaceMemberRequest{
				SpaceID: "sp_123",
				UserID:  "usr_owner",
				Member:  &space.Member{UserID: "usr_target", Role: space.RoleMember},
			},
			userStatus: identity.UserStatusActive,
			mockAddMember: func(ctx context.Context, session space.Session, member *space.Member) (*space.Member, error) {
				return nil, errors.E(errors.Exist, space.MemberAlreadyExists, "member already exists")
			},
			expectedError: true,
			expectedCode:  space.MemberAlreadyExists,
		},
		{
			name: "Success - active user added to space",
			req: &AddSpaceMemberRequest{
				SpaceID: "sp_123",
				UserID:  "usr_owner",
				Member:  &space.Member{UserID: "usr_target", Role: space.RoleMember},
			},
			userStatus: identity.UserStatusActive,
			mockAddMember: func(ctx context.Context, session space.Session, member *space.Member) (*space.Member, error) {
				if session.SpaceID != "sp_123" || session.UserID != "usr_owner" {
					t.Errorf("unexpected session: %+v", session)
				}
				return member, nil
			},
			expectedError: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			mockSpace := &SpaceServiceMock{
				AddSpaceMemberFunc: tc.mockAddMember,
			}
			mockID := &IdentityServiceMock{
				GetUserByIDFunc: func(ctx context.Context, id identity.UserID) (*identity.User, error) {
					if tc.lookupErr != nil {
						return nil, tc.lookupErr
					}
					return &identity.User{
						ID:     id,
						Status: tc.userStatus,
					}, nil
				},
			}
			coord := NewCoordinator(Dependencies{
				SpaceService:    mockSpace,
				IdentityService: mockID,
			})

			mem, err := coord.AddSpaceMember(ctx, tc.req)
			if tc.expectedError {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				if tc.expectedKind != errors.Other && errors.KindOf(err) != tc.expectedKind {
					t.Errorf("expected kind %v, got %v", tc.expectedKind, errors.KindOf(err))
				}
				if tc.expectedCode != "" && errors.CodeOf(err) != tc.expectedCode {
					t.Errorf("expected code %v, got %v", tc.expectedCode, errors.CodeOf(err))
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if mem == nil || mem.UserID != tc.req.Member.UserID {
				t.Errorf("unexpected member returned: %+v", mem)
			}
		})
	}
}

func TestCoordinator_RemoveSpaceMember(t *testing.T) {
	ctx := context.Background()

	tests := []struct {
		name          string
		req           *RemoveSpaceMemberRequest
		mockRemove    func(ctx context.Context, session space.Session, targetUserID space.SpaceID) error
		expectedError bool
		expectedKind  errors.Kind
		expectedCode  errors.Code
	}{
		{
			name: "Failure - owner cannot be removed",
			req: &RemoveSpaceMemberRequest{
				SpaceID:      "sp_123",
				UserID:       "usr_caller",
				TargetUserID: "usr_owner",
			},
			mockRemove: func(ctx context.Context, session space.Session, targetUserID space.SpaceID) error {
				return errors.E(errors.Permission, space.OwnerOnly, "cannot remove space owner")
			},
			expectedError: true,
			expectedKind:  errors.Permission,
			expectedCode:  space.OwnerOnly,
		},
		{
			name: "Failure - member not found",
			req: &RemoveSpaceMemberRequest{
				SpaceID:      "sp_123",
				UserID:       "usr_caller",
				TargetUserID: "usr_target",
			},
			mockRemove: func(ctx context.Context, session space.Session, targetUserID space.SpaceID) error {
				return errors.E(errors.NotExist, space.MemberNotFound, "member not found")
			},
			expectedError: true,
			expectedKind:  errors.NotExist,
			expectedCode:  space.MemberNotFound,
		},
		{
			name: "Success - member removed",
			req: &RemoveSpaceMemberRequest{
				SpaceID:      "sp_123",
				UserID:       "usr_caller",
				TargetUserID: "usr_target",
			},
			mockRemove: func(ctx context.Context, session space.Session, targetUserID space.SpaceID) error {
				if session.SpaceID != "sp_123" || session.UserID != "usr_caller" {
					t.Errorf("unexpected session: %+v", session)
				}
				if targetUserID != "usr_target" {
					t.Errorf("unexpected targetUserID: %s", targetUserID)
				}
				return nil
			},
			expectedError: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			mockSpace := &SpaceServiceMock{
				RemoveSpaceMemberFunc: tc.mockRemove,
			}
			coord := NewCoordinator(Dependencies{
				SpaceService: mockSpace,
			})

			err := coord.RemoveSpaceMember(ctx, tc.req)
			if tc.expectedError {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				if tc.expectedKind != errors.Other && errors.KindOf(err) != tc.expectedKind {
					t.Errorf("expected kind %v, got %v", tc.expectedKind, errors.KindOf(err))
				}
				if tc.expectedCode != "" && errors.CodeOf(err) != tc.expectedCode {
					t.Errorf("expected code %v, got %v", tc.expectedCode, errors.CodeOf(err))
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
		})
	}
}

func TestCoordinator_UpdateSpaceMember(t *testing.T) {
	ctx := context.Background()

	tests := []struct {
		name          string
		req           *UpdateSpaceMemberRequest
		mockUpdate    func(ctx context.Context, session space.Session, member *space.Member, mask []string) (*space.Member, error)
		expectedError bool
		expectedKind  errors.Kind
		expectedCode  errors.Code
	}{
		{
			name: "Failure - member not found",
			req: &UpdateSpaceMemberRequest{
				SpaceID:    "sp_123",
				UserID:     "usr_caller",
				Member:     &space.Member{UserID: "usr_target", Role: space.RoleAdmin},
				UpdateMask: []string{"role"},
			},
			mockUpdate: func(ctx context.Context, session space.Session, member *space.Member, mask []string) (*space.Member, error) {
				return nil, errors.E(errors.NotExist, space.MemberNotFound, "member not found")
			},
			expectedError: true,
			expectedKind:  errors.NotExist,
			expectedCode:  space.MemberNotFound,
		},
		{
			name: "Failure - owner demotion denied",
			req: &UpdateSpaceMemberRequest{
				SpaceID:    "sp_123",
				UserID:     "usr_caller",
				Member:     &space.Member{UserID: "usr_owner", Role: space.RoleMember},
				UpdateMask: []string{"role"},
			},
			mockUpdate: func(ctx context.Context, session space.Session, member *space.Member, mask []string) (*space.Member, error) {
				return nil, errors.E(errors.Permission, space.OwnerOnly, "cannot change space owner role")
			},
			expectedError: true,
			expectedKind:  errors.Permission,
			expectedCode:  space.OwnerOnly,
		},
		{
			name: "Failure - invalid role",
			req: &UpdateSpaceMemberRequest{
				SpaceID:    "sp_123",
				UserID:     "usr_caller",
				Member:     &space.Member{UserID: "usr_target", Role: "unknown"},
				UpdateMask: []string{"role"},
			},
			mockUpdate: func(ctx context.Context, session space.Session, member *space.Member, mask []string) (*space.Member, error) {
				return nil, errors.E(errors.Invalid, space.InvalidRole, "invalid role")
			},
			expectedError: true,
			expectedKind:  errors.Invalid,
			expectedCode:  space.InvalidRole,
		},
		{
			name: "Success - update member with mask",
			req: &UpdateSpaceMemberRequest{
				SpaceID:    "sp_123",
				UserID:     "usr_caller",
				Member:     &space.Member{UserID: "usr_target", Role: space.RoleAdmin},
				UpdateMask: []string{"role"},
			},
			mockUpdate: func(ctx context.Context, session space.Session, member *space.Member, mask []string) (*space.Member, error) {
				if session.SpaceID != "sp_123" || session.UserID != "usr_caller" {
					t.Errorf("unexpected session: %+v", session)
				}
				if len(mask) != 1 || mask[0] != "role" {
					t.Errorf("unexpected mask: %v", mask)
				}
				return member, nil
			},
			expectedError: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			mockSpace := &SpaceServiceMock{
				UpdateSpaceMemberFunc: tc.mockUpdate,
			}
			coord := NewCoordinator(Dependencies{
				SpaceService: mockSpace,
			})

			res, err := coord.UpdateSpaceMember(ctx, tc.req)
			if tc.expectedError {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				if tc.expectedKind != errors.Other && errors.KindOf(err) != tc.expectedKind {
					t.Errorf("expected kind %v, got %v", tc.expectedKind, errors.KindOf(err))
				}
				if tc.expectedCode != "" && errors.CodeOf(err) != tc.expectedCode {
					t.Errorf("expected code %v, got %v", tc.expectedCode, errors.CodeOf(err))
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if res == nil || res.UserID != tc.req.Member.UserID || res.Role != tc.req.Member.Role {
				t.Errorf("unexpected member returned: %+v", res)
			}
		})
	}
}
