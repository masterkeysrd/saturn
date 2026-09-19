package iam

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/identity"
	platErrors "github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/token"
)

func TestCoordinator_Login(t *testing.T) {
	now := time.Now()
	lockedFuture := now.Add(10 * time.Minute)

	tests := []struct {
		name                  string
		req                   *LoginRequest
		mockGetUserByEmail    func(ctx context.Context, email string) (*identity.User, error)
		mockGetUserByUsername func(ctx context.Context, username string) (*identity.User, error)
		mockAuthenticate      func(ctx context.Context, identifier string, password string) (*identity.User, error)
		mockGetAuthVersion    func(ctx context.Context, id identity.UserID) (int64, error)
		mockCreateSecEvent    func(ctx context.Context, event *identity.SecurityEvent) error
		mockUpdateLockout     func(ctx context.Context, req identity.UpdateLockoutRequest) error
		mockIssueAccess       func(input token.IssueInput, now time.Time) (string, time.Time, error)
		mockIssueRefresh      func(input token.IssueInput, now time.Time, absoluteExpiry time.Time) (string, time.Time, error)
		mockCreateSession     func(ctx context.Context, req *identity.CreateSessionRequest) (*identity.Session, error)
		expectedError         bool
		expectedErrorCode     platErrors.Code
		validate              func(t *testing.T, res *LoginResponse)
	}{
		{
			name: "User not found (neither email nor username)",
			req: &LoginRequest{
				Identifier: "nonexistent@example.com",
				Password:   "Secret123!",
				IPAddress:  "127.0.0.1",
				UserAgent:  "Mozilla/5.0",
			},
			mockGetUserByEmail: func(ctx context.Context, email string) (*identity.User, error) {
				return nil, errors.New("not found")
			},
			mockGetUserByUsername: func(ctx context.Context, username string) (*identity.User, error) {
				return nil, errors.New("not found")
			},
			expectedError:     true,
			expectedErrorCode: identity.InvalidCredentials,
		},
		{
			name: "User account temporarily locked",
			req: &LoginRequest{
				Identifier: "locked@example.com",
				Password:   "Secret123!",
				IPAddress:  "127.0.0.1",
			},
			mockGetUserByEmail: func(ctx context.Context, email string) (*identity.User, error) {
				return &identity.User{
					ID:          "usr_locked",
					Email:       email,
					LockedUntil: &lockedFuture,
				}, nil
			},
			expectedError:     true,
			expectedErrorCode: identity.AccountLocked,
		},
		{
			name: "Authenticate returns domain status error (AccountPending)",
			req: &LoginRequest{
				Identifier: "pending@example.com",
				Password:   "Secret123!",
			},
			mockGetUserByEmail: func(ctx context.Context, email string) (*identity.User, error) {
				return &identity.User{
					ID:    "usr_pending",
					Email: email,
				}, nil
			},
			mockAuthenticate: func(ctx context.Context, identifier string, password string) (*identity.User, error) {
				return nil, platErrors.E("auth", identity.AccountPending, "account is pending approval")
			},
			expectedError:     true,
			expectedErrorCode: identity.AccountPending,
		},
		{
			name: "Invalid password under threshold (< 5 attempts)",
			req: &LoginRequest{
				Identifier: "user@example.com",
				Password:   "WrongPass!",
			},
			mockGetUserByEmail: func(ctx context.Context, email string) (*identity.User, error) {
				return &identity.User{
					ID:                  "usr_1",
					Email:               email,
					FailedLoginAttempts: 2,
				}, nil
			},
			mockAuthenticate: func(ctx context.Context, identifier string, password string) (*identity.User, error) {
				return nil, errors.New("bad password")
			},
			mockUpdateLockout: func(ctx context.Context, req identity.UpdateLockoutRequest) error {
				if req.Attempts != 3 || req.LockedUntil != nil {
					t.Errorf("unexpected lockout update: %+v", req)
				}
				return nil
			},
			expectedError:     true,
			expectedErrorCode: identity.InvalidCredentials,
		},
		{
			name: "Invalid password reaches lockout threshold (5 attempts)",
			req: &LoginRequest{
				Identifier: "user@example.com",
				Password:   "WrongPass!",
			},
			mockGetUserByEmail: func(ctx context.Context, email string) (*identity.User, error) {
				return &identity.User{
					ID:                  "usr_1",
					Email:               email,
					FailedLoginAttempts: 4,
				}, nil
			},
			mockAuthenticate: func(ctx context.Context, identifier string, password string) (*identity.User, error) {
				return nil, errors.New("bad password")
			},
			mockUpdateLockout: func(ctx context.Context, req identity.UpdateLockoutRequest) error {
				if req.Attempts != 5 || req.LockedUntil == nil {
					t.Errorf("expected lockout until set on 5th attempt: %+v", req)
				}
				return nil
			},
			expectedError:     true,
			expectedErrorCode: identity.AccountLocked,
		},
		{
			name: "Success resets previous failed attempts and issues tokens",
			req: &LoginRequest{
				Identifier: "success@example.com",
				Password:   "CorrectPass123!",
				IPAddress:  "127.0.0.1",
				UserAgent:  "TestAgent",
			},
			mockGetUserByEmail: func(ctx context.Context, email string) (*identity.User, error) {
				return &identity.User{
					ID:                  "usr_success",
					Email:               email,
					FailedLoginAttempts: 3,
				}, nil
			},
			mockAuthenticate: func(ctx context.Context, identifier string, password string) (*identity.User, error) {
				return &identity.User{
					ID:          "usr_success",
					Email:       identifier,
					AccessLevel: identity.AccessLevelUser,
				}, nil
			},
			mockUpdateLockout: func(ctx context.Context, req identity.UpdateLockoutRequest) error {
				if req.Attempts != 0 || req.LockedUntil != nil {
					t.Errorf("expected attempts reset: %+v", req)
				}
				return nil
			},
			mockGetAuthVersion: func(ctx context.Context, id identity.UserID) (int64, error) {
				return 1, nil
			},
			mockIssueAccess: func(input token.IssueInput, now time.Time) (string, time.Time, error) {
				return "access_token_123", now.Add(15 * time.Minute), nil
			},
			mockIssueRefresh: func(input token.IssueInput, now time.Time, absoluteExpiry time.Time) (string, time.Time, error) {
				return "refresh_token_456", now.Add(24 * time.Hour), nil
			},
			mockCreateSession: func(ctx context.Context, req *identity.CreateSessionRequest) (*identity.Session, error) {
				return &identity.Session{ID: "sess_1"}, nil
			},
			expectedError: false,
			validate: func(t *testing.T, res *LoginResponse) {
				if res.AccessToken != "access_token_123" || res.RefreshToken != "refresh_token_456" {
					t.Errorf("unexpected tokens: %+v", res)
				}
				if res.User == nil || res.User.ID != "usr_success" {
					t.Errorf("unexpected user: %+v", res.User)
				}
			},
		},
		{
			name: "GetAuthVersion failure",
			req: &LoginRequest{
				Identifier: "user@example.com",
				Password:   "CorrectPass123!",
			},
			mockGetUserByEmail: func(ctx context.Context, email string) (*identity.User, error) {
				return &identity.User{ID: "usr_1", Email: email}, nil
			},
			mockAuthenticate: func(ctx context.Context, identifier string, password string) (*identity.User, error) {
				return &identity.User{ID: "usr_1", Email: identifier}, nil
			},
			mockGetAuthVersion: func(ctx context.Context, id identity.UserID) (int64, error) {
				return 0, errors.New("db error")
			},
			expectedError: true,
		},
		{
			name: "IssueAccessToken failure",
			req: &LoginRequest{
				Identifier: "user@example.com",
				Password:   "CorrectPass123!",
			},
			mockGetUserByEmail: func(ctx context.Context, email string) (*identity.User, error) {
				return &identity.User{ID: "usr_1", Email: email}, nil
			},
			mockAuthenticate: func(ctx context.Context, identifier string, password string) (*identity.User, error) {
				return &identity.User{ID: "usr_1", Email: identifier}, nil
			},
			mockGetAuthVersion: func(ctx context.Context, id identity.UserID) (int64, error) {
				return 1, nil
			},
			mockIssueAccess: func(input token.IssueInput, now time.Time) (string, time.Time, error) {
				return "", time.Time{}, errors.New("key signing error")
			},
			expectedError: true,
		},
		{
			name: "IssueRefreshToken failure",
			req: &LoginRequest{
				Identifier: "user@example.com",
				Password:   "CorrectPass123!",
			},
			mockGetUserByEmail: func(ctx context.Context, email string) (*identity.User, error) {
				return &identity.User{ID: "usr_1", Email: email}, nil
			},
			mockAuthenticate: func(ctx context.Context, identifier string, password string) (*identity.User, error) {
				return &identity.User{ID: "usr_1", Email: identifier}, nil
			},
			mockGetAuthVersion: func(ctx context.Context, id identity.UserID) (int64, error) {
				return 1, nil
			},
			mockIssueAccess: func(input token.IssueInput, now time.Time) (string, time.Time, error) {
				return "access", now, nil
			},
			mockIssueRefresh: func(input token.IssueInput, now time.Time, absoluteExpiry time.Time) (string, time.Time, error) {
				return "", time.Time{}, errors.New("refresh signing error")
			},
			expectedError: true,
		},
		{
			name: "CreateSession failure",
			req: &LoginRequest{
				Identifier: "user@example.com",
				Password:   "CorrectPass123!",
			},
			mockGetUserByEmail: func(ctx context.Context, email string) (*identity.User, error) {
				return &identity.User{ID: "usr_1", Email: email}, nil
			},
			mockAuthenticate: func(ctx context.Context, identifier string, password string) (*identity.User, error) {
				return &identity.User{ID: "usr_1", Email: identifier}, nil
			},
			mockGetAuthVersion: func(ctx context.Context, id identity.UserID) (int64, error) {
				return 1, nil
			},
			mockIssueAccess: func(input token.IssueInput, now time.Time) (string, time.Time, error) {
				return "access", now, nil
			},
			mockIssueRefresh: func(input token.IssueInput, now time.Time, absoluteExpiry time.Time) (string, time.Time, error) {
				return "refresh", now, nil
			},
			mockCreateSession: func(ctx context.Context, req *identity.CreateSessionRequest) (*identity.Session, error) {
				return nil, errors.New("session table insert error")
			},
			expectedError: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			idMock := &IdentityServiceMock{
				GetUserByEmailFunc: tc.mockGetUserByEmail,
				GetUserByUsernameFunc: func(ctx context.Context, username string) (*identity.User, error) {
					if tc.mockGetUserByUsername != nil {
						return tc.mockGetUserByUsername(ctx, username)
					}
					return nil, errors.New("user not found")
				},
				AuthenticateFunc:        tc.mockAuthenticate,
				GetAuthVersionFunc:      tc.mockGetAuthVersion,
				CreateSecurityEventFunc: func(ctx context.Context, event *identity.SecurityEvent) error { return nil },
				UpdateLockoutStateFunc: func(ctx context.Context, req identity.UpdateLockoutRequest) error {
					if tc.mockUpdateLockout != nil {
						return tc.mockUpdateLockout(ctx, req)
					}
					return nil
				},
				CreateSessionFunc: tc.mockCreateSession,
			}
			tokenMock := &TokenServiceMock{
				IssueAccessTokenFunc:  tc.mockIssueAccess,
				IssueRefreshTokenFunc: tc.mockIssueRefresh,
			}

			coord := NewCoordinator(Dependencies{
				IdentityService: idMock,
				TokenService:    tokenMock,
			})

			res, err := coord.Login(context.Background(), tc.req)
			if tc.expectedError {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				if tc.expectedErrorCode != "" {
					code := platErrors.CodeOf(err)
					if code != tc.expectedErrorCode {
						t.Errorf("expected error code %v, got %v (%v)", tc.expectedErrorCode, code, err)
					}
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if tc.validate != nil {
				tc.validate(t, res)
			}
		})
	}
}
