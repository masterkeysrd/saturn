package iam

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/identity"
)

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
