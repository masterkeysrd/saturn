package iam

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/platform/token"
)

func TestCoordinator_ChangePassword(t *testing.T) {
	ctx := context.Background()

	tests := []struct {
		name        string
		req         *ChangePasswordRequest
		setup       func(idMock *IdentityServiceMock, hasherMock *PasswordHasherMock, tokMock *TokenServiceMock)
		expectedErr bool
		errMsg      string
	}{
		{
			name:        "nil request",
			req:         nil,
			expectedErr: true,
			errMsg:      "request is required",
		},
		{
			name: "missing user id",
			req: &ChangePasswordRequest{
				CurrentPassword: "old-password-123",
				NewPassword:     "new-password-456",
			},
			expectedErr: true,
			errMsg:      "user id is required",
		},
		{
			name: "missing current password",
			req: &ChangePasswordRequest{
				UserID:      "usr_123",
				NewPassword: "new-password-456",
			},
			expectedErr: true,
			errMsg:      "current password is required",
		},
		{
			name: "missing new password",
			req: &ChangePasswordRequest{
				UserID:          "usr_123",
				CurrentPassword: "old-password-123",
			},
			expectedErr: true,
			errMsg:      "new password is required",
		},
		{
			name: "same password",
			req: &ChangePasswordRequest{
				UserID:          "usr_123",
				CurrentPassword: "same-password-123",
				NewPassword:     "same-password-123",
			},
			expectedErr: true,
			errMsg:      "new password cannot be the same as current password",
		},
		{
			name: "hasher failure",
			req: &ChangePasswordRequest{
				UserID:          "usr_123",
				CurrentPassword: "old-password-123",
				NewPassword:     "new-password-456",
			},
			setup: func(idMock *IdentityServiceMock, hasherMock *PasswordHasherMock, tokMock *TokenServiceMock) {
				hasherMock.HashFunc = func(raw string) (string, error) {
					return "", errors.New("hasher failure")
				}
			},
			expectedErr: true,
			errMsg:      "hash password",
		},
		{
			name: "identity service ChangePassword failure",
			req: &ChangePasswordRequest{
				UserID:          "usr_123",
				CurrentPassword: "wrong-password",
				NewPassword:     "new-password-456",
			},
			setup: func(idMock *IdentityServiceMock, hasherMock *PasswordHasherMock, tokMock *TokenServiceMock) {
				hasherMock.HashFunc = func(raw string) (string, error) {
					return "$argon2id$hashed", nil
				}
				idMock.ChangePasswordFunc = func(ctx context.Context, req identity.ChangePasswordRequest) (*identity.User, error) {
					return nil, errors.New("current password is incorrect")
				}
			},
			expectedErr: true,
			errMsg:      "current password is incorrect",
		},
		{
			name: "token service IssueAccessToken failure",
			req: &ChangePasswordRequest{
				UserID:          "usr_123",
				CurrentPassword: "old-password-123",
				NewPassword:     "new-password-456",
			},
			setup: func(idMock *IdentityServiceMock, hasherMock *PasswordHasherMock, tokMock *TokenServiceMock) {
				hasherMock.HashFunc = func(raw string) (string, error) {
					return "$argon2id$hashed", nil
				}
				idMock.ChangePasswordFunc = func(ctx context.Context, req identity.ChangePasswordRequest) (*identity.User, error) {
					return &identity.User{
						ID:          identity.UserID(req.UserID),
						AccessLevel: identity.AccessLevelUser,
						AuthVersion: 2,
					}, nil
				}
				tokMock.IssueRefreshTokenFunc = func(input token.IssueInput, now, absoluteExpiry time.Time) (string, time.Time, error) {
					return "fresh-refresh-token", now.Add(24 * time.Hour), nil
				}
				idMock.CreateSessionFunc = func(ctx context.Context, req *identity.CreateSessionRequest) (*identity.Session, error) {
					return &identity.Session{ID: "ses_123"}, nil
				}
				tokMock.IssueAccessTokenFunc = func(input token.IssueInput, now time.Time) (string, time.Time, error) {
					return "", time.Time{}, errors.New("sign token error")
				}
			},
			expectedErr: true,
			errMsg:      "issue access token",
		},
		{
			name: "token service IssueRefreshToken failure",
			req: &ChangePasswordRequest{
				UserID:          "usr_123",
				CurrentPassword: "old-password-123",
				NewPassword:     "new-password-456",
			},
			setup: func(idMock *IdentityServiceMock, hasherMock *PasswordHasherMock, tokMock *TokenServiceMock) {
				hasherMock.HashFunc = func(raw string) (string, error) {
					return "$argon2id$hashed", nil
				}
				idMock.ChangePasswordFunc = func(ctx context.Context, req identity.ChangePasswordRequest) (*identity.User, error) {
					return &identity.User{
						ID:          identity.UserID(req.UserID),
						AccessLevel: identity.AccessLevelUser,
						AuthVersion: 2,
					}, nil
				}
				tokMock.IssueAccessTokenFunc = func(input token.IssueInput, now time.Time) (string, time.Time, error) {
					return "fresh-access-token", now.Add(15 * time.Minute), nil
				}
				tokMock.IssueRefreshTokenFunc = func(input token.IssueInput, now, absoluteExpiry time.Time) (string, time.Time, error) {
					return "", time.Time{}, errors.New("refresh token error")
				}
			},
			expectedErr: true,
			errMsg:      "issue refresh token",
		},
		{
			name: "identity service CreateSession failure",
			req: &ChangePasswordRequest{
				UserID:          "usr_123",
				CurrentPassword: "old-password-123",
				NewPassword:     "new-password-456",
			},
			setup: func(idMock *IdentityServiceMock, hasherMock *PasswordHasherMock, tokMock *TokenServiceMock) {
				hasherMock.HashFunc = func(raw string) (string, error) {
					return "$argon2id$hashed", nil
				}
				idMock.ChangePasswordFunc = func(ctx context.Context, req identity.ChangePasswordRequest) (*identity.User, error) {
					return &identity.User{
						ID:          identity.UserID(req.UserID),
						AccessLevel: identity.AccessLevelUser,
						AuthVersion: 2,
					}, nil
				}
				tokMock.IssueAccessTokenFunc = func(input token.IssueInput, now time.Time) (string, time.Time, error) {
					return "fresh-access-token", now.Add(15 * time.Minute), nil
				}
				tokMock.IssueRefreshTokenFunc = func(input token.IssueInput, now, absoluteExpiry time.Time) (string, time.Time, error) {
					return "fresh-refresh-token", now.Add(24 * time.Hour), nil
				}
				idMock.CreateSessionFunc = func(ctx context.Context, req *identity.CreateSessionRequest) (*identity.Session, error) {
					return nil, errors.New("db insert session error")
				}
			},
			expectedErr: true,
			errMsg:      "create session",
		},
		{
			name: "success",
			req: &ChangePasswordRequest{
				UserID:              "usr_123",
				CurrentPassword:     "old-password-123",
				NewPassword:         "new-password-456",
				TOTPCode:            "123456",
				RevokeOtherSessions: true,
				UserAgent:           "test-agent",
				IPAddress:           "127.0.0.1",
			},
			setup: func(idMock *IdentityServiceMock, hasherMock *PasswordHasherMock, tokMock *TokenServiceMock) {
				hasherMock.HashFunc = func(raw string) (string, error) {
					return "$argon2id$newhash", nil
				}
				idMock.ChangePasswordFunc = func(ctx context.Context, req identity.ChangePasswordRequest) (*identity.User, error) {
					if req.UserID != "usr_123" || req.CurrentPassword != "old-password-123" || req.NewPassword != "new-password-456" {
						t.Errorf("unexpected change password req: %+v", req)
					}
					if req.TOTPCode != "123456" || !req.RevokeOtherSessions {
						t.Errorf("expected TOTP 123456 and RevokeOtherSessions true")
					}
					return &identity.User{
						ID:          identity.UserID(req.UserID),
						AccessLevel: identity.AccessLevelUser,
						AuthVersion: 2,
					}, nil
				}
				tokMock.IssueAccessTokenFunc = func(input token.IssueInput, now time.Time) (string, time.Time, error) {
					if input.AuthVersion != 2 {
						t.Errorf("expected AuthVersion 2, got %d", input.AuthVersion)
					}
					return "fresh-access-token", now.Add(15 * time.Minute), nil
				}
				tokMock.IssueRefreshTokenFunc = func(input token.IssueInput, now, absoluteExpiry time.Time) (string, time.Time, error) {
					if input.AuthVersion != 2 {
						t.Errorf("expected AuthVersion 2, got %d", input.AuthVersion)
					}
					return "fresh-refresh-token", now.Add(24 * time.Hour), nil
				}
				idMock.CreateSessionFunc = func(ctx context.Context, req *identity.CreateSessionRequest) (*identity.Session, error) {
					if req.UserID != "usr_123" {
						t.Errorf("expected user id usr_123, got %s", req.UserID)
					}
					return &identity.Session{ID: "ses_123"}, nil
				}
			},
			expectedErr: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			idMock := &IdentityServiceMock{}
			hasherMock := &PasswordHasherMock{}
			tokMock := &TokenServiceMock{}
			if tc.setup != nil {
				tc.setup(idMock, hasherMock, tokMock)
			}
			coord := NewCoordinator(Dependencies{
				IdentityService: idMock,
				PasswordHasher:  hasherMock,
				TokenService:    tokMock,
			})
			resp, err := coord.ChangePassword(ctx, tc.req)
			if tc.expectedErr {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				if tc.errMsg != "" && !strings.Contains(err.Error(), tc.errMsg) {
					t.Fatalf("expected error containing %q, got %q", tc.errMsg, err.Error())
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if resp == nil {
				t.Fatal("expected response, got nil")
			}
			if resp.AccessToken != "fresh-access-token" || resp.RefreshToken != "fresh-refresh-token" {
				t.Fatalf("unexpected tokens in response: %+v", resp)
			}
			if resp.AccessTokenExpiresAt == 0 || resp.RefreshTokenExpiresAt == 0 {
				t.Fatalf("expected expiry timestamps to be set, got %+v", resp)
			}
		})
	}
}

func TestCoordinator_PasswordReset(t *testing.T) {
	ctx := context.Background()
	now := time.Now().UTC()

	t.Run("ResetPassword", func(t *testing.T) {
		tests := []struct {
			name        string
			req         *ResetPasswordRequest
			setupMock   func(m *IdentityServiceMock)
			expectedErr bool
		}{
			{
				name: "Success",
				req: &ResetPasswordRequest{
					AdminUserID:  "usr_admin",
					TargetUserID: "usr_target",
					TTLMinutes:   15,
				},
				setupMock: func(m *IdentityServiceMock) {
					m.CreatePasswordResetTokenFunc = func(ctx context.Context, req identity.CreatePasswordResetTokenRequest) (*identity.PasswordResetToken, error) {
						return &identity.PasswordResetToken{
							ID:        "rst_123",
							UserID:    req.TargetUserID,
							TokenHash: req.TokenHash,
							ExpiresAt: now.Add(15 * time.Minute),
						}, nil
					}
				},
				expectedErr: false,
			},
			{
				name: "Service error",
				req: &ResetPasswordRequest{
					AdminUserID:  "usr_admin",
					TargetUserID: "usr_unknown",
					TTLMinutes:   15,
				},
				setupMock: func(m *IdentityServiceMock) {
					m.CreatePasswordResetTokenFunc = func(ctx context.Context, req identity.CreatePasswordResetTokenRequest) (*identity.PasswordResetToken, error) {
						return nil, errors.New("user not found")
					}
				},
				expectedErr: true,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				idMock := &IdentityServiceMock{}
				if tc.setupMock != nil {
					tc.setupMock(idMock)
				}
				coord := NewCoordinator(Dependencies{IdentityService: idMock})
				resp, err := coord.ResetPassword(ctx, tc.req)
				if tc.expectedErr {
					if err == nil {
						t.Fatal("expected error, got nil")
					}
					return
				}
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if resp.Token == "" || len(resp.Token) != 64 {
					t.Errorf("expected 64-character hex token, got %s", resp.Token)
				}
				if !strings.Contains(resp.ResetURL, resp.Token) {
					t.Errorf("expected reset URL to contain token, got %s", resp.ResetURL)
				}
			})
		}
	})

	t.Run("ValidateResetToken", func(t *testing.T) {
		tests := []struct {
			name        string
			req         *ValidateResetTokenRequest
			setupMock   func(m *IdentityServiceMock)
			expectedErr bool
			expectUser  string
		}{
			{
				name:        "Empty token",
				req:         &ValidateResetTokenRequest{Token: ""},
				expectedErr: true,
			},
			{
				name: "Success",
				req:  &ValidateResetTokenRequest{Token: "valid_tok"},
				setupMock: func(m *IdentityServiceMock) {
					m.ValidatePasswordResetTokenFunc = func(ctx context.Context, req identity.ValidatePasswordResetTokenRequest) (*identity.User, *identity.PasswordResetToken, error) {
						return &identity.User{Username: "alice"}, &identity.PasswordResetToken{}, nil
					}
				},
				expectedErr: false,
				expectUser:  "alice",
			},
			{
				name: "Service error",
				req:  &ValidateResetTokenRequest{Token: "bad_tok"},
				setupMock: func(m *IdentityServiceMock) {
					m.ValidatePasswordResetTokenFunc = func(ctx context.Context, req identity.ValidatePasswordResetTokenRequest) (*identity.User, *identity.PasswordResetToken, error) {
						return nil, nil, errors.New("token expired")
					}
				},
				expectedErr: true,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				idMock := &IdentityServiceMock{}
				if tc.setupMock != nil {
					tc.setupMock(idMock)
				}
				coord := NewCoordinator(Dependencies{IdentityService: idMock})
				resp, err := coord.ValidateResetToken(ctx, tc.req)
				if tc.expectedErr {
					if err == nil {
						t.Fatal("expected error, got nil")
					}
					return
				}
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if resp.Username != tc.expectUser {
					t.Errorf("expected username %s, got %s", tc.expectUser, resp.Username)
				}
			})
		}
	})

	t.Run("CompleteResetPassword", func(t *testing.T) {
		tests := []struct {
			name        string
			req         *CompleteResetPasswordRequest
			setupMock   func(m *IdentityServiceMock, h *PasswordHasherMock)
			expectedErr bool
		}{
			{
				name: "Empty new password",
				req:  &CompleteResetPasswordRequest{Token: "tok", NewPassword: ""},
				setupMock: func(m *IdentityServiceMock, h *PasswordHasherMock) {
				},
				expectedErr: true,
			},
			{
				name: "Hasher failure",
				req:  &CompleteResetPasswordRequest{Token: "tok", NewPassword: "newpassword123"},
				setupMock: func(m *IdentityServiceMock, h *PasswordHasherMock) {
					h.HashFunc = func(raw string) (string, error) {
						return "", errors.New("hash error")
					}
				},
				expectedErr: true,
			},
			{
				name: "Service error",
				req:  &CompleteResetPasswordRequest{Token: "tok", NewPassword: "newpassword123"},
				setupMock: func(m *IdentityServiceMock, h *PasswordHasherMock) {
					h.HashFunc = func(raw string) (string, error) {
						return "hashed_password", nil
					}
					m.CompletePasswordResetFunc = func(ctx context.Context, req identity.CompletePasswordResetRequest) (*identity.User, error) {
						return nil, errors.New("reset failed")
					}
				},
				expectedErr: true,
			},
			{
				name: "Success",
				req:  &CompleteResetPasswordRequest{Token: "valid_tok", NewPassword: "newpassword123"},
				setupMock: func(m *IdentityServiceMock, h *PasswordHasherMock) {
					h.HashFunc = func(raw string) (string, error) {
						return "hashed_password", nil
					}
					m.CompletePasswordResetFunc = func(ctx context.Context, req identity.CompletePasswordResetRequest) (*identity.User, error) {
						return &identity.User{Username: "alice"}, nil
					}
				},
				expectedErr: false,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				idMock := &IdentityServiceMock{}
				hasherMock := &PasswordHasherMock{}
				if tc.setupMock != nil {
					tc.setupMock(idMock, hasherMock)
				}
				coord := NewCoordinator(Dependencies{
					IdentityService: idMock,
					PasswordHasher:  hasherMock,
				})
				err := coord.CompleteResetPassword(ctx, tc.req)
				if tc.expectedErr {
					if err == nil {
						t.Fatal("expected error, got nil")
					}
					return
				}
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
			})
		}
	})
}
