package iam

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/masterkeysrd/saturn/internal/domain/identity"
	platErrors "github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/token"
)

func TestCoordinator_Sessions(t *testing.T) {
	now := time.Now()
	usedAt := now.Add(-5 * time.Minute)

	t.Run("ListActiveSessions", func(t *testing.T) {
		tests := []struct {
			name          string
			req           *ListActiveSessionsRequest
			mockList      func(ctx context.Context, userID identity.UserID) ([]*identity.Session, error)
			expectedCount int
			expectedError bool
			validateFirst func(t *testing.T, s *ActiveSession)
		}{
			{
				name: "Success with LastUsedAt populated and nil fallback",
				req:  &ListActiveSessionsRequest{UserID: "usr_1", CurrentSessionID: "sess_1"},
				mockList: func(ctx context.Context, userID identity.UserID) ([]*identity.Session, error) {
					return []*identity.Session{
						{
							ID:         "sess_1",
							UserAgent:  "Firefox",
							IPAddress:  "192.168.1.1",
							CreateTime: now,
							LastUsedAt: &usedAt,
						},
						{
							ID:         "sess_2",
							UserAgent:  "Safari",
							IPAddress:  "192.168.1.2",
							CreateTime: now,
							LastUsedAt: nil, // Should fallback to CreateTime
						},
					}, nil
				},
				expectedCount: 2,
				expectedError: false,
				validateFirst: func(t *testing.T, s *ActiveSession) {
					if s.SessionID != "sess_1" || s.LastUsedAt != usedAt {
						t.Errorf("unexpected session: %+v", s)
					}
					if !s.IsCurrent {
						t.Errorf("expected sess_1 to have IsCurrent=true")
					}
				},
			},
			{
				name: "Domain error",
				req:  &ListActiveSessionsRequest{UserID: "usr_1"},
				mockList: func(ctx context.Context, userID identity.UserID) ([]*identity.Session, error) {
					return nil, errors.New("sessions query error")
				},
				expectedError: true,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				coord := NewCoordinator(Dependencies{
					IdentityService: &IdentityServiceMock{ListActiveSessionsFunc: tc.mockList},
				})
				res, err := coord.ListActiveSessions(context.Background(), tc.req)
				if tc.expectedError {
					if err == nil {
						t.Fatal("expected error, got nil")
					}
					return
				}
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if len(res.Sessions) != tc.expectedCount {
					t.Errorf("expected %d sessions, got %d", tc.expectedCount, len(res.Sessions))
				}
				if tc.validateFirst != nil && len(res.Sessions) > 0 {
					tc.validateFirst(t, res.Sessions[0])
					if res.Sessions[1].LastUsedAt != now {
						t.Errorf("expected fallback to CreateTime %v, got %v", now, res.Sessions[1].LastUsedAt)
					}
				}
			})
		}
	})

	t.Run("RevokeSession", func(t *testing.T) {
		tests := []struct {
			name          string
			req           *RevokeSessionRequest
			mockRevoke    func(ctx context.Context, sessionID identity.SessionID, userID identity.UserID) error
			expectedError bool
		}{
			{
				name: "Success",
				req:  &RevokeSessionRequest{SessionID: "sess_1", UserID: "usr_1"},
				mockRevoke: func(ctx context.Context, sessionID identity.SessionID, userID identity.UserID) error {
					if sessionID != "sess_1" || userID != "usr_1" {
						t.Errorf("unexpected revoke args: session=%v user=%v", sessionID, userID)
					}
					return nil
				},
				expectedError: false,
			},
			{
				name: "Domain error",
				req:  &RevokeSessionRequest{SessionID: "sess_1", UserID: "usr_1"},
				mockRevoke: func(ctx context.Context, sessionID identity.SessionID, userID identity.UserID) error {
					return errors.New("session not found")
				},
				expectedError: true,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				coord := NewCoordinator(Dependencies{
					IdentityService: &IdentityServiceMock{RevokeSessionByIDFunc: tc.mockRevoke},
				})
				res, err := coord.RevokeSession(context.Background(), tc.req)
				if tc.expectedError {
					if err == nil {
						t.Fatal("expected error, got nil")
					}
					return
				}
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if res == nil {
					t.Fatal("expected non-nil response")
				}
			})
		}
	})

	t.Run("RevokeAllSessions", func(t *testing.T) {
		tests := []struct {
			name          string
			req           *RevokeAllSessionsRequest
			mockRevokeAll func(ctx context.Context, userID identity.UserID) (int64, error)
			expectedError bool
		}{
			{
				name: "Success",
				req:  &RevokeAllSessionsRequest{UserID: "usr_1"},
				mockRevokeAll: func(ctx context.Context, userID identity.UserID) (int64, error) {
					if userID != "usr_1" {
						t.Errorf("unexpected user ID: %v", userID)
					}
					return 3, nil
				},
				expectedError: false,
			},
			{
				name: "Domain error",
				req:  &RevokeAllSessionsRequest{UserID: "usr_1"},
				mockRevokeAll: func(ctx context.Context, userID identity.UserID) (int64, error) {
					return 0, errors.New("cannot revoke sessions")
				},
				expectedError: true,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				coord := NewCoordinator(Dependencies{
					IdentityService: &IdentityServiceMock{RevokeAllSessionsFunc: tc.mockRevokeAll},
				})
				res, err := coord.RevokeAllSessions(context.Background(), tc.req)
				if tc.expectedError {
					if err == nil {
						t.Fatal("expected error, got nil")
					}
					return
				}
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if res == nil {
					t.Fatal("expected non-nil response")
				}
			})
		}
	})
}

func TestCoordinator_RefreshSession(t *testing.T) {
	now := time.Now()
	expiry := now.Add(7 * 24 * time.Hour)

	validClaims := &token.Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   "usr_1",
			ExpiresAt: jwt.NewNumericDate(expiry),
		},
		AccessLevel: "user",
		AuthVersion: 2,
	}

	tests := []struct {
		name                string
		req                 *RefreshSessionRequest
		mockValidateRefresh func(raw string, now time.Time) (*token.Claims, error)
		mockGetAuthVersion  func(ctx context.Context, id identity.UserID) (int64, error)
		mockIssueAccess     func(input token.IssueInput, now time.Time) (string, time.Time, error)
		mockIssueRefresh    func(input token.IssueInput, now time.Time, absoluteExpiry time.Time) (string, time.Time, error)
		mockRotateSession   func(ctx context.Context, req *identity.RotateSessionRequest) (*identity.Session, error)
		expectedError       bool
		expectedErrorCode   platErrors.Code
		validate            func(t *testing.T, res *RefreshSessionResponse)
	}{
		{
			name: "Success rotating tokens",
			req: &RefreshSessionRequest{
				RefreshToken: "refresh_old",
				UserAgent:    "Chrome",
				IPAddress:    "10.0.0.1",
			},
			mockValidateRefresh: func(raw string, now time.Time) (*token.Claims, error) {
				return validClaims, nil
			},
			mockGetAuthVersion: func(ctx context.Context, id identity.UserID) (int64, error) {
				return 2, nil
			},
			mockIssueAccess: func(input token.IssueInput, now time.Time) (string, time.Time, error) {
				if input.Subject != "usr_1" || input.AuthVersion != 2 {
					t.Errorf("unexpected issue input: %+v", input)
				}
				return "access_new", now.Add(15 * time.Minute), nil
			},
			mockIssueRefresh: func(input token.IssueInput, now time.Time, absoluteExpiry time.Time) (string, time.Time, error) {
				return "refresh_new", now.Add(24 * time.Hour), nil
			},
			mockRotateSession: func(ctx context.Context, req *identity.RotateSessionRequest) (*identity.Session, error) {
				if req.UserAgent != "Chrome" || req.IPAddress != "10.0.0.1" {
					t.Errorf("unexpected rotate request: %+v", req)
				}
				return &identity.Session{ID: "sess_1"}, nil
			},
			expectedError: false,
			validate: func(t *testing.T, res *RefreshSessionResponse) {
				if res.AccessToken != "access_new" || res.RefreshToken != "refresh_new" {
					t.Errorf("unexpected tokens: %+v", res)
				}
			},
		},
		{
			name: "Expired refresh token returns SessionExpired",
			req: &RefreshSessionRequest{
				RefreshToken: "expired_token",
			},
			mockValidateRefresh: func(raw string, now time.Time) (*token.Claims, error) {
				return nil, errors.New("jwt expired")
			},
			expectedError:     true,
			expectedErrorCode: identity.SessionExpired,
		},
		{
			name: "GetAuthVersion failure",
			req: &RefreshSessionRequest{
				RefreshToken: "valid_token",
			},
			mockValidateRefresh: func(raw string, now time.Time) (*token.Claims, error) {
				return validClaims, nil
			},
			mockGetAuthVersion: func(ctx context.Context, id identity.UserID) (int64, error) {
				return 0, errors.New("auth version query error")
			},
			expectedError: true,
		},
		{
			name: "AuthVersion mismatch returns SessionRevoked",
			req: &RefreshSessionRequest{
				RefreshToken: "valid_token",
			},
			mockValidateRefresh: func(raw string, now time.Time) (*token.Claims, error) {
				return validClaims, nil // claims has AuthVersion: 2
			},
			mockGetAuthVersion: func(ctx context.Context, id identity.UserID) (int64, error) {
				return 3, nil // active is 3 (sessions revoked)
			},
			expectedError:     true,
			expectedErrorCode: identity.SessionRevoked,
		},
		{
			name: "IssueAccessToken failure",
			req: &RefreshSessionRequest{
				RefreshToken: "valid_token",
			},
			mockValidateRefresh: func(raw string, now time.Time) (*token.Claims, error) {
				return validClaims, nil
			},
			mockGetAuthVersion: func(ctx context.Context, id identity.UserID) (int64, error) {
				return 2, nil
			},
			mockIssueRefresh: func(input token.IssueInput, now time.Time, absoluteExpiry time.Time) (string, time.Time, error) {
				return "refresh_new", now, nil
			},
			mockRotateSession: func(ctx context.Context, req *identity.RotateSessionRequest) (*identity.Session, error) {
				return &identity.Session{ID: "sess_rotated"}, nil
			},
			mockIssueAccess: func(input token.IssueInput, now time.Time) (string, time.Time, error) {
				return "", time.Time{}, errors.New("issue access error")
			},
			expectedError: true,
		},
		{
			name: "IssueRefreshToken failure",
			req: &RefreshSessionRequest{
				RefreshToken: "valid_token",
			},
			mockValidateRefresh: func(raw string, now time.Time) (*token.Claims, error) {
				return validClaims, nil
			},
			mockGetAuthVersion: func(ctx context.Context, id identity.UserID) (int64, error) {
				return 2, nil
			},
			mockIssueAccess: func(input token.IssueInput, now time.Time) (string, time.Time, error) {
				return "access_new", now, nil
			},
			mockIssueRefresh: func(input token.IssueInput, now time.Time, absoluteExpiry time.Time) (string, time.Time, error) {
				return "", time.Time{}, errors.New("issue refresh error")
			},
			expectedError: true,
		},
		{
			name: "RotateSession failure",
			req: &RefreshSessionRequest{
				RefreshToken: "valid_token",
			},
			mockValidateRefresh: func(raw string, now time.Time) (*token.Claims, error) {
				return validClaims, nil
			},
			mockGetAuthVersion: func(ctx context.Context, id identity.UserID) (int64, error) {
				return 2, nil
			},
			mockIssueAccess: func(input token.IssueInput, now time.Time) (string, time.Time, error) {
				return "access_new", now, nil
			},
			mockIssueRefresh: func(input token.IssueInput, now time.Time, absoluteExpiry time.Time) (string, time.Time, error) {
				return "refresh_new", now, nil
			},
			mockRotateSession: func(ctx context.Context, req *identity.RotateSessionRequest) (*identity.Session, error) {
				return nil, errors.New("concurrent session rotation conflict")
			},
			expectedError: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			tokenMock := &TokenServiceMock{
				ValidateRefreshTokenFunc: tc.mockValidateRefresh,
				IssueAccessTokenFunc:     tc.mockIssueAccess,
				IssueRefreshTokenFunc:    tc.mockIssueRefresh,
			}
			idMock := &IdentityServiceMock{
				GetAuthVersionFunc: tc.mockGetAuthVersion,
				RotateSessionFunc:  tc.mockRotateSession,
			}

			coord := NewCoordinator(Dependencies{
				TokenService:    tokenMock,
				IdentityService: idMock,
			})

			res, err := coord.RefreshSession(context.Background(), tc.req)
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

func TestCoordinator_Logout(t *testing.T) {
	tests := []struct {
		name                string
		req                 *LogoutRequest
		mockValidateRefresh func(raw string, now time.Time) (*token.Claims, error)
		mockRevokeByHash    func(ctx context.Context, refreshTokenHash []byte) error
		expectedError       bool
	}{
		{
			name: "Success",
			req:  &LogoutRequest{RefreshToken: "valid_refresh_token"},
			mockValidateRefresh: func(raw string, now time.Time) (*token.Claims, error) {
				return &token.Claims{
					RegisteredClaims: jwt.RegisteredClaims{Subject: "usr_1"},
				}, nil
			},
			mockRevokeByHash: func(ctx context.Context, refreshTokenHash []byte) error {
				if len(refreshTokenHash) == 0 {
					t.Error("expected non-empty hash")
				}
				return nil
			},
			expectedError: false,
		},
		{
			name: "Token validation failure",
			req:  &LogoutRequest{RefreshToken: "expired_refresh_token"},
			mockValidateRefresh: func(raw string, now time.Time) (*token.Claims, error) {
				return nil, errors.New("token expired")
			},
			expectedError: true,
		},
		{
			name: "Revoke session in database failure",
			req:  &LogoutRequest{RefreshToken: "valid_token"},
			mockValidateRefresh: func(raw string, now time.Time) (*token.Claims, error) {
				return &token.Claims{
					RegisteredClaims: jwt.RegisteredClaims{Subject: "usr_1"},
				}, nil
			},
			mockRevokeByHash: func(ctx context.Context, refreshTokenHash []byte) error {
				return errors.New("database connection failure")
			},
			expectedError: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			tokenMock := &TokenServiceMock{
				ValidateRefreshTokenFunc: tc.mockValidateRefresh,
			}
			idMock := &IdentityServiceMock{
				RevokeSessionByHashFunc: tc.mockRevokeByHash,
			}

			coord := NewCoordinator(Dependencies{
				TokenService:    tokenMock,
				IdentityService: idMock,
			})

			res, err := coord.Logout(context.Background(), tc.req)
			if tc.expectedError {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if res == nil {
				t.Fatal("expected non-nil response")
			}
		})
	}
}
