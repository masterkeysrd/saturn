package iam

import (
	"context"
	"errors"
	"testing"

	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
)

func TestCoordinator_AdminCreateUser(t *testing.T) {
	tests := []struct {
		name                 string
		req                  *AdminCreateUserRequest
		mockHash             func(raw string) (string, error)
		mockCreateUser       func(ctx context.Context, user *identity.User) error
		mockCreateCredential func(ctx context.Context, credential *identity.Credential) error
		expectedError        bool
		expectedStatus       identity.UserStatus
	}{
		{
			name: "Success creating admin user (immediately active)",
			req: &AdminCreateUserRequest{
				Email:       "admin@example.com",
				Username:    "admin",
				Name:        "Administrator",
				Password:    "AdminPass123!",
				AccessLevel: identity.AccessLevelAdmin,
			},
			mockHash: func(raw string) (string, error) {
				return "argon2_hash", nil
			},
			mockCreateUser: func(ctx context.Context, user *identity.User) error {
				if user.Status != identity.UserStatusActive {
					t.Errorf("expected admin user to be active, got %v", user.Status)
				}
				return nil
			},
			mockCreateCredential: func(ctx context.Context, credential *identity.Credential) error {
				if credential.SecretData != "argon2_hash" {
					t.Errorf("unexpected secret data: %s", credential.SecretData)
				}
				return nil
			},
			expectedError:  false,
			expectedStatus: identity.UserStatusActive,
		},
		{
			name: "Success creating regular user (pending approval)",
			req: &AdminCreateUserRequest{
				Email:       "member@example.com",
				Username:    "member",
				Name:        "Team Member",
				Password:    "MemberPass123!",
				AccessLevel: identity.AccessLevelUser,
			},
			mockHash: func(raw string) (string, error) {
				return "hash_123", nil
			},
			mockCreateUser: func(ctx context.Context, user *identity.User) error {
				if user.Status != identity.UserStatusPendingApproval {
					t.Errorf("expected regular user to be pending approval, got %v", user.Status)
				}
				return nil
			},
			mockCreateCredential: func(ctx context.Context, credential *identity.Credential) error {
				return nil
			},
			expectedError:  false,
			expectedStatus: identity.UserStatusPendingApproval,
		},
		{
			name: "Password hasher failure",
			req: &AdminCreateUserRequest{
				Password: "Pass",
			},
			mockHash: func(raw string) (string, error) {
				return "", errors.New("hasher failure")
			},
			expectedError: true,
		},
		{
			name: "CreateUser domain failure",
			req: &AdminCreateUserRequest{
				Email:    "dup@example.com",
				Password: "Pass",
			},
			mockHash: func(raw string) (string, error) {
				return "hash", nil
			},
			mockCreateUser: func(ctx context.Context, user *identity.User) error {
				return errors.New("email already exists")
			},
			expectedError: true,
		},
		{
			name: "CreateCredential failure",
			req: &AdminCreateUserRequest{
				Email:    "test@example.com",
				Password: "Pass",
			},
			mockHash: func(raw string) (string, error) {
				return "hash", nil
			},
			mockCreateUser: func(ctx context.Context, user *identity.User) error {
				return nil
			},
			mockCreateCredential: func(ctx context.Context, credential *identity.Credential) error {
				return errors.New("credential insert error")
			},
			expectedError: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			coord := NewCoordinator(Dependencies{
				PasswordHasher: &PasswordHasherMock{HashFunc: tc.mockHash},
				IdentityService: &IdentityServiceMock{
					CreateUserFunc:       tc.mockCreateUser,
					CreateCredentialFunc: tc.mockCreateCredential,
				},
			})

			res, err := coord.AdminCreateUser(context.Background(), tc.req)
			if tc.expectedError {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if res.Status != tc.expectedStatus {
				t.Errorf("expected status %v, got %v", tc.expectedStatus, res.Status)
			}
		})
	}
}

func TestCoordinator_ApproveUser(t *testing.T) {
	tests := []struct {
		name            string
		req             *ApproveUserRequest
		hasSpaceService bool
		mockApprove     func(ctx context.Context, userID identity.UserID) (*identity.User, error)
		mockCreateSpace func(ctx context.Context, sp *space.Space) (*space.Space, error)
		expectedError   bool
	}{
		{
			name:            "Success with default space creation",
			req:             &ApproveUserRequest{UserID: "usr_1"},
			hasSpaceService: true,
			mockApprove: func(ctx context.Context, userID identity.UserID) (*identity.User, error) {
				return &identity.User{
					ID:       userID,
					Username: "alice",
					Status:   identity.UserStatusActive,
				}, nil
			},
			mockCreateSpace: func(ctx context.Context, sp *space.Space) (*space.Space, error) {
				if sp.Name != "alice's Workspace" {
					t.Errorf("unexpected space name: %s", sp.Name)
				}
				return sp, nil
			},
			expectedError: false,
		},
		{
			name:            "Success without space service wired",
			req:             &ApproveUserRequest{UserID: "usr_1"},
			hasSpaceService: false,
			mockApprove: func(ctx context.Context, userID identity.UserID) (*identity.User, error) {
				return &identity.User{ID: userID, Status: identity.UserStatusActive}, nil
			},
			expectedError: false,
		},
		{
			name:            "ApproveUser domain failure",
			req:             &ApproveUserRequest{UserID: "usr_notfound"},
			hasSpaceService: true,
			mockApprove: func(ctx context.Context, userID identity.UserID) (*identity.User, error) {
				return nil, errors.New("user not found")
			},
			expectedError: true,
		},
		{
			name:            "CreateSpace failure returns error",
			req:             &ApproveUserRequest{UserID: "usr_1"},
			hasSpaceService: true,
			mockApprove: func(ctx context.Context, userID identity.UserID) (*identity.User, error) {
				return &identity.User{ID: userID, Username: "bob"}, nil
			},
			mockCreateSpace: func(ctx context.Context, sp *space.Space) (*space.Space, error) {
				return nil, errors.New("space db failure")
			},
			expectedError: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			deps := Dependencies{
				IdentityService: &IdentityServiceMock{ApproveUserFunc: tc.mockApprove},
			}
			if tc.hasSpaceService {
				deps.SpaceService = &SpaceServiceMock{CreateSpaceFunc: tc.mockCreateSpace}
			}

			coord := NewCoordinator(deps)
			res, err := coord.ApproveUser(context.Background(), tc.req)
			if tc.expectedError {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if res == nil || res.User == nil {
				t.Fatal("expected non-nil approved user")
			}
		})
	}
}

func TestCoordinator_RejectUser(t *testing.T) {
	tests := []struct {
		name          string
		req           *RejectUserRequest
		mockReject    func(ctx context.Context, userID identity.UserID) (*identity.User, error)
		expectedError bool
	}{
		{
			name: "Success",
			req:  &RejectUserRequest{UserID: "usr_1"},
			mockReject: func(ctx context.Context, userID identity.UserID) (*identity.User, error) {
				return &identity.User{ID: userID, Status: identity.UserStatusInactive}, nil
			},
			expectedError: false,
		},
		{
			name: "Domain error",
			req:  &RejectUserRequest{UserID: "usr_1"},
			mockReject: func(ctx context.Context, userID identity.UserID) (*identity.User, error) {
				return nil, errors.New("cannot reject active user")
			},
			expectedError: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			coord := NewCoordinator(Dependencies{
				IdentityService: &IdentityServiceMock{RejectUserFunc: tc.mockReject},
			})
			res, err := coord.RejectUser(context.Background(), tc.req)
			if tc.expectedError {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if res == nil || res.User.Status != identity.UserStatusInactive {
				t.Errorf("expected user status inactive, got %+v", res)
			}
		})
	}
}

func TestCoordinator_ListUsers(t *testing.T) {
	tests := []struct {
		name          string
		filter        *ListUsersFilter
		mockList      func(ctx context.Context, filter *identity.ListUsersFilter) (*paging.Page[*identity.User], error)
		expectedCount int
		expectedError bool
	}{
		{
			name: "Success",
			filter: &ListUsersFilter{
				PageSize:      10,
				StatusFilter:  identity.UserStatusActive,
				SearchQuery:   "john",
				NextPageToken: "",
			},
			mockList: func(ctx context.Context, filter *identity.ListUsersFilter) (*paging.Page[*identity.User], error) {
				if filter.PageSize != 10 || filter.SearchQuery != "john" {
					t.Errorf("unexpected filter: %+v", filter)
				}
				return &paging.Page[*identity.User]{
					Items: []*identity.User{
						{ID: "usr_1", Name: "John Doe"},
					},
				}, nil
			},
			expectedCount: 1,
			expectedError: false,
		},
		{
			name:   "Domain error",
			filter: &ListUsersFilter{},
			mockList: func(ctx context.Context, filter *identity.ListUsersFilter) (*paging.Page[*identity.User], error) {
				return nil, errors.New("query failure")
			},
			expectedError: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			coord := NewCoordinator(Dependencies{
				IdentityService: &IdentityServiceMock{ListUsersFunc: tc.mockList},
			})
			page, err := coord.ListUsers(context.Background(), tc.filter)
			if tc.expectedError {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if len(page.Items) != tc.expectedCount {
				t.Errorf("expected %d items, got %d", tc.expectedCount, len(page.Items))
			}
		})
	}
}

func TestCoordinator_UpdateUserRole(t *testing.T) {
	tests := []struct {
		name          string
		req           *UpdateUserRoleRequest
		mockUpdate    func(ctx context.Context, userID identity.UserID, accessLevel identity.AccessLevel) (*identity.User, error)
		expectedRole  identity.AccessLevel
		expectedError bool
	}{
		{
			name: "Success promoting to admin",
			req:  &UpdateUserRoleRequest{UserID: "usr_1", AccessLevel: identity.AccessLevelAdmin},
			mockUpdate: func(ctx context.Context, userID identity.UserID, accessLevel identity.AccessLevel) (*identity.User, error) {
				return &identity.User{ID: userID, AccessLevel: accessLevel}, nil
			},
			expectedRole:  identity.AccessLevelAdmin,
			expectedError: false,
		},
		{
			name: "Domain error",
			req:  &UpdateUserRoleRequest{UserID: "usr_1", AccessLevel: identity.AccessLevelUser},
			mockUpdate: func(ctx context.Context, userID identity.UserID, accessLevel identity.AccessLevel) (*identity.User, error) {
				return nil, errors.New("cannot demote root user")
			},
			expectedError: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			coord := NewCoordinator(Dependencies{
				IdentityService: &IdentityServiceMock{UpdateUserRoleFunc: tc.mockUpdate},
			})
			res, err := coord.UpdateUserRole(context.Background(), tc.req)
			if tc.expectedError {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if res.User.AccessLevel != tc.expectedRole {
				t.Errorf("expected role %v, got %v", tc.expectedRole, res.User.AccessLevel)
			}
		})
	}
}
