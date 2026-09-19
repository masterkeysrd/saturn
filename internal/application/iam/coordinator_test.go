package iam

import (
	"context"
	"errors"
	"testing"

	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/platform/log"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
)

func TestCoordinator_DirectDelegation(t *testing.T) {
	t.Run("Authenticate", func(t *testing.T) {
		tests := []struct {
			name          string
			identifier    string
			password      string
			mockAuth      func(ctx context.Context, identifier string, password string) (*identity.User, error)
			expectedID    identity.UserID
			expectedError bool
		}{
			{
				name:       "Success",
				identifier: "john@example.com",
				password:   "Secret123!",
				mockAuth: func(ctx context.Context, identifier string, password string) (*identity.User, error) {
					return &identity.User{ID: "usr_1", Email: identifier}, nil
				},
				expectedID:    "usr_1",
				expectedError: false,
			},
			{
				name:       "Failure",
				identifier: "john@example.com",
				password:   "Wrong!",
				mockAuth: func(ctx context.Context, identifier string, password string) (*identity.User, error) {
					return nil, errors.New("auth failed")
				},
				expectedError: true,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				coord := NewCoordinator(Dependencies{
					IdentityService: &IdentityServiceMock{AuthenticateFunc: tc.mockAuth},
				})
				u, err := coord.Authenticate(context.Background(), tc.identifier, tc.password)
				if tc.expectedError {
					if err == nil {
						t.Fatal("expected error, got nil")
					}
					return
				}
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if u == nil || u.ID != tc.expectedID {
					t.Errorf("expected user ID %v, got %+v", tc.expectedID, u)
				}
			})
		}
	})

	t.Run("GetAuthVersion", func(t *testing.T) {
		tests := []struct {
			name          string
			id            identity.UserID
			mockVersion   func(ctx context.Context, id identity.UserID) (int64, error)
			expectedVer   int64
			expectedError bool
		}{
			{
				name: "Success",
				id:   "usr_1",
				mockVersion: func(ctx context.Context, id identity.UserID) (int64, error) {
					return 5, nil
				},
				expectedVer:   5,
				expectedError: false,
			},
			{
				name: "Failure",
				id:   "usr_1",
				mockVersion: func(ctx context.Context, id identity.UserID) (int64, error) {
					return 0, errors.New("version lookup failed")
				},
				expectedError: true,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				coord := NewCoordinator(Dependencies{
					IdentityService: &IdentityServiceMock{GetAuthVersionFunc: tc.mockVersion},
				})
				v, err := coord.GetAuthVersion(context.Background(), tc.id)
				if tc.expectedError {
					if err == nil {
						t.Fatal("expected error, got nil")
					}
					return
				}
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if v != tc.expectedVer {
					t.Errorf("expected version %d, got %d", tc.expectedVer, v)
				}
			})
		}
	})

	t.Run("GetCurrentUser", func(t *testing.T) {
		tests := []struct {
			name          string
			id            identity.UserID
			mockGet       func(ctx context.Context, id identity.UserID) (*identity.User, error)
			expectedID    identity.UserID
			expectedError bool
		}{
			{
				name: "Success",
				id:   "usr_1",
				mockGet: func(ctx context.Context, id identity.UserID) (*identity.User, error) {
					return &identity.User{ID: id, Username: "alice"}, nil
				},
				expectedID:    "usr_1",
				expectedError: false,
			},
			{
				name: "Failure",
				id:   "usr_1",
				mockGet: func(ctx context.Context, id identity.UserID) (*identity.User, error) {
					return nil, errors.New("user not found")
				},
				expectedError: true,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				coord := NewCoordinator(Dependencies{
					IdentityService: &IdentityServiceMock{GetUserByIDFunc: tc.mockGet},
				})
				u, err := coord.GetCurrentUser(context.Background(), tc.id)
				if tc.expectedError {
					if err == nil {
						t.Fatal("expected error, got nil")
					}
					return
				}
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if u == nil || u.ID != tc.expectedID {
					t.Errorf("expected user ID %v, got %+v", tc.expectedID, u)
				}
			})
		}
	})

	t.Run("ListSecurityEvents", func(t *testing.T) {
		tests := []struct {
			name          string
			filter        identity.SecurityEventFilter
			mockEvents    func(ctx context.Context, filter identity.SecurityEventFilter) (*paging.Page[*identity.SecurityEvent], error)
			expectedCount int
			expectedError bool
		}{
			{
				name: "Success",
				filter: identity.SecurityEventFilter{
					Limit: 10,
				},
				mockEvents: func(ctx context.Context, filter identity.SecurityEventFilter) (*paging.Page[*identity.SecurityEvent], error) {
					return &paging.Page[*identity.SecurityEvent]{
						Items: []*identity.SecurityEvent{
							{ID: "evt_1", EventType: identity.SecurityEventLoginSuccess},
						},
					}, nil
				},
				expectedCount: 1,
				expectedError: false,
			},
			{
				name:   "Failure",
				filter: identity.SecurityEventFilter{},
				mockEvents: func(ctx context.Context, filter identity.SecurityEventFilter) (*paging.Page[*identity.SecurityEvent], error) {
					return nil, errors.New("audit event query failed")
				},
				expectedError: true,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				coord := NewCoordinator(Dependencies{
					IdentityService: &IdentityServiceMock{ListSecurityEventsFunc: tc.mockEvents},
				})
				page, err := coord.ListSecurityEvents(context.Background(), tc.filter)
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
	})
}

func TestLoggingCoordinator_DelegationAndErrors(t *testing.T) {
	ctx := context.Background()
	logger := log.New()
	expectedErr := errors.New("underlying failure")

	var authCalled, authVersionCalled, currentUserCalled, listSecEventsCalled bool
	var loginCalled, logoutCalled, refreshCalled, registerCalled bool
	var adminCreateCalled, approveCalled, rejectCalled, listUsersCalled bool
	var updateRoleCalled, listSessionsCalled, revokeSessionCalled, revokeAllCalled bool

	coordMock := &CoordinatorMock{
		AuthenticateFunc: func(ctx context.Context, identifier string, password string) (*identity.User, error) {
			authCalled = true
			return &identity.User{ID: "usr_1"}, nil
		},
		GetAuthVersionFunc: func(ctx context.Context, id identity.UserID) (int64, error) {
			authVersionCalled = true
			return 1, nil
		},
		GetCurrentUserFunc: func(ctx context.Context, userID identity.UserID) (*identity.User, error) {
			currentUserCalled = true
			return &identity.User{ID: userID}, nil
		},
		ListSecurityEventsFunc: func(ctx context.Context, filter identity.SecurityEventFilter) (*paging.Page[*identity.SecurityEvent], error) {
			listSecEventsCalled = true
			return &paging.Page[*identity.SecurityEvent]{}, nil
		},
		LoginFunc: func(ctx context.Context, req *LoginRequest) (*LoginResponse, error) {
			loginCalled = true
			return &LoginResponse{}, nil
		},
		LogoutFunc: func(ctx context.Context, req *LogoutRequest) (*LogoutResponse, error) {
			logoutCalled = true
			return &LogoutResponse{}, nil
		},
		RefreshSessionFunc: func(ctx context.Context, req *RefreshSessionRequest) (*RefreshSessionResponse, error) {
			refreshCalled = true
			return &RefreshSessionResponse{}, nil
		},
		RegisterFunc: func(ctx context.Context, req *RegisterUserRequest) (*RegisterUserResponse, error) {
			registerCalled = true
			return &RegisterUserResponse{}, nil
		},
		AdminCreateUserFunc: func(ctx context.Context, req *AdminCreateUserRequest) (*AdminCreateUserResponse, error) {
			adminCreateCalled = true
			return &AdminCreateUserResponse{}, nil
		},
		ApproveUserFunc: func(ctx context.Context, req *ApproveUserRequest) (*ApproveUserResponse, error) {
			approveCalled = true
			return &ApproveUserResponse{}, nil
		},
		RejectUserFunc: func(ctx context.Context, req *RejectUserRequest) (*RejectUserResponse, error) {
			rejectCalled = true
			return &RejectUserResponse{}, nil
		},
		ListUsersFunc: func(ctx context.Context, filter *ListUsersFilter) (*paging.Page[*identity.User], error) {
			listUsersCalled = true
			return &paging.Page[*identity.User]{}, nil
		},
		UpdateUserRoleFunc: func(ctx context.Context, req *UpdateUserRoleRequest) (*UpdateUserRoleResponse, error) {
			updateRoleCalled = true
			return &UpdateUserRoleResponse{}, nil
		},
		ListActiveSessionsFunc: func(ctx context.Context, req *ListActiveSessionsRequest) (*ListActiveSessionsResponse, error) {
			listSessionsCalled = true
			return &ListActiveSessionsResponse{}, nil
		},
		RevokeSessionFunc: func(ctx context.Context, req *RevokeSessionRequest) (*RevokeSessionResponse, error) {
			revokeSessionCalled = true
			return &RevokeSessionResponse{}, nil
		},
		RevokeAllSessionsFunc: func(ctx context.Context, req *RevokeAllSessionsRequest) (*RevokeAllSessionsResponse, error) {
			revokeAllCalled = true
			return &RevokeAllSessionsResponse{}, nil
		},
	}

	logged := NewLoggingCoordinator(coordMock, logger)

	// Call every method once
	_, _ = logged.Authenticate(ctx, "id", "pass")
	_, _ = logged.GetAuthVersion(ctx, "usr_1")
	_, _ = logged.GetCurrentUser(ctx, "usr_1")
	_, _ = logged.ListSecurityEvents(ctx, identity.SecurityEventFilter{})
	_, _ = logged.Login(ctx, &LoginRequest{})
	_, _ = logged.Logout(ctx, &LogoutRequest{})
	_, _ = logged.RefreshSession(ctx, &RefreshSessionRequest{})
	_, _ = logged.Register(ctx, &RegisterUserRequest{})
	_, _ = logged.AdminCreateUser(ctx, &AdminCreateUserRequest{})
	_, _ = logged.ApproveUser(ctx, &ApproveUserRequest{})
	_, _ = logged.RejectUser(ctx, &RejectUserRequest{})
	_, _ = logged.ListUsers(ctx, &ListUsersFilter{})
	_, _ = logged.UpdateUserRole(ctx, &UpdateUserRoleRequest{})
	_, _ = logged.ListActiveSessions(ctx, &ListActiveSessionsRequest{})
	_, _ = logged.RevokeSession(ctx, &RevokeSessionRequest{})
	_, _ = logged.RevokeAllSessions(ctx, &RevokeAllSessionsRequest{})

	if !authCalled || !authVersionCalled || !currentUserCalled || !listSecEventsCalled ||
		!loginCalled || !logoutCalled || !refreshCalled || !registerCalled ||
		!adminCreateCalled || !approveCalled || !rejectCalled || !listUsersCalled ||
		!updateRoleCalled || !listSessionsCalled || !revokeSessionCalled || !revokeAllCalled {
		t.Error("expected all methods to be delegated by LoggingCoordinator")
	}

	// Verify error propagation across all logged methods
	errMock := &CoordinatorMock{
		AuthenticateFunc: func(ctx context.Context, identifier string, password string) (*identity.User, error) {
			return nil, expectedErr
		},
		GetAuthVersionFunc: func(ctx context.Context, id identity.UserID) (int64, error) {
			return 0, expectedErr
		},
		GetCurrentUserFunc: func(ctx context.Context, userID identity.UserID) (*identity.User, error) {
			return nil, expectedErr
		},
		ListSecurityEventsFunc: func(ctx context.Context, filter identity.SecurityEventFilter) (*paging.Page[*identity.SecurityEvent], error) {
			return nil, expectedErr
		},
		LoginFunc: func(ctx context.Context, req *LoginRequest) (*LoginResponse, error) {
			return nil, expectedErr
		},
		LogoutFunc: func(ctx context.Context, req *LogoutRequest) (*LogoutResponse, error) {
			return nil, expectedErr
		},
		RefreshSessionFunc: func(ctx context.Context, req *RefreshSessionRequest) (*RefreshSessionResponse, error) {
			return nil, expectedErr
		},
		RegisterFunc: func(ctx context.Context, req *RegisterUserRequest) (*RegisterUserResponse, error) {
			return nil, expectedErr
		},
		AdminCreateUserFunc: func(ctx context.Context, req *AdminCreateUserRequest) (*AdminCreateUserResponse, error) {
			return nil, expectedErr
		},
		ApproveUserFunc: func(ctx context.Context, req *ApproveUserRequest) (*ApproveUserResponse, error) {
			return nil, expectedErr
		},
		RejectUserFunc: func(ctx context.Context, req *RejectUserRequest) (*RejectUserResponse, error) {
			return nil, expectedErr
		},
		ListUsersFunc: func(ctx context.Context, filter *ListUsersFilter) (*paging.Page[*identity.User], error) {
			return nil, expectedErr
		},
		UpdateUserRoleFunc: func(ctx context.Context, req *UpdateUserRoleRequest) (*UpdateUserRoleResponse, error) {
			return nil, expectedErr
		},
		ListActiveSessionsFunc: func(ctx context.Context, req *ListActiveSessionsRequest) (*ListActiveSessionsResponse, error) {
			return nil, expectedErr
		},
		RevokeSessionFunc: func(ctx context.Context, req *RevokeSessionRequest) (*RevokeSessionResponse, error) {
			return nil, expectedErr
		},
		RevokeAllSessionsFunc: func(ctx context.Context, req *RevokeAllSessionsRequest) (*RevokeAllSessionsResponse, error) {
			return nil, expectedErr
		},
	}

	loggedErr := NewLoggingCoordinator(errMock, logger)

	if _, err := loggedErr.Authenticate(ctx, "id", "pass"); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := loggedErr.GetAuthVersion(ctx, "usr_1"); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := loggedErr.GetCurrentUser(ctx, "usr_1"); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := loggedErr.ListSecurityEvents(ctx, identity.SecurityEventFilter{}); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := loggedErr.Login(ctx, &LoginRequest{}); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := loggedErr.Logout(ctx, &LogoutRequest{}); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := loggedErr.RefreshSession(ctx, &RefreshSessionRequest{}); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := loggedErr.Register(ctx, &RegisterUserRequest{}); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := loggedErr.AdminCreateUser(ctx, &AdminCreateUserRequest{}); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := loggedErr.ApproveUser(ctx, &ApproveUserRequest{}); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := loggedErr.RejectUser(ctx, &RejectUserRequest{}); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := loggedErr.ListUsers(ctx, &ListUsersFilter{}); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := loggedErr.UpdateUserRole(ctx, &UpdateUserRoleRequest{}); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := loggedErr.ListActiveSessions(ctx, &ListActiveSessionsRequest{}); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := loggedErr.RevokeSession(ctx, &RevokeSessionRequest{}); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
	if _, err := loggedErr.RevokeAllSessions(ctx, &RevokeAllSessionsRequest{}); err != expectedErr {
		t.Errorf("expected %v, got %v", expectedErr, err)
	}
}
