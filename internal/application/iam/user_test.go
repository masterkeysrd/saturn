package iam

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/platform/password"
)

func TestCoordinator_Register(t *testing.T) {
	tests := []struct {
		name                 string
		req                  *RegisterUserRequest
		hasher               PasswordHasher
		mockCreateUser       func(ctx context.Context, user *identity.User) error
		mockCreateCredential func(ctx context.Context, credential *identity.Credential) error
		expectedError        bool
		errorContains        string
		validateResult       func(t *testing.T, resp *RegisterUserResponse, createdUser *identity.User, createdCred *identity.Credential)
	}{
		{
			name: "Success with mock hasher",
			req: &RegisterUserRequest{
				Email:     "test@example.com",
				Username:  "testuser",
				Name:      "Test User",
				AvatarURL: "https://example.com/avatar.png",
				Password:  "securepassword123",
			},
			hasher: &PasswordHasherMock{
				HashFunc: func(raw string) (string, error) {
					if raw != "securepassword123" {
						t.Errorf("expected raw password 'securepassword123', got %s", raw)
					}
					return "hashed_securepassword123", nil
				},
			},
			mockCreateUser: func(ctx context.Context, user *identity.User) error {
				return nil
			},
			mockCreateCredential: func(ctx context.Context, credential *identity.Credential) error {
				return nil
			},
			expectedError: false,
			validateResult: func(t *testing.T, resp *RegisterUserResponse, createdUser *identity.User, createdCred *identity.Credential) {
				if resp == nil {
					t.Fatal("expected non-nil response")
				}
				if resp.Email != "test@example.com" || resp.Username != "testuser" || resp.Name != "Test User" {
					t.Errorf("unexpected response user data: %+v", resp)
				}
				if resp.Status != identity.UserStatusPendingApproval {
					t.Errorf("expected status %v, got %v", identity.UserStatusPendingApproval, resp.Status)
				}
				if resp.AccessLevel != identity.AccessLevelUser {
					t.Errorf("expected access level %v, got %v", identity.AccessLevelUser, resp.AccessLevel)
				}
				if createdCred == nil {
					t.Fatal("expected credential to be created")
				}
				if createdCred.SecretData == "securepassword123" {
					t.Error("SecretData must not contain plaintext password")
				}
				if createdCred.SecretData != "hashed_securepassword123" {
					t.Errorf("expected hashed password, got %s", createdCred.SecretData)
				}
				if createdCred.AuthType != "password" {
					t.Errorf("expected authType 'password', got %s", createdCred.AuthType)
				}
				if string(createdCred.UserID) != resp.UserID {
					t.Errorf("credential UserID %s does not match response UserID %s", createdCred.UserID, resp.UserID)
				}
			},
		},
		{
			name: "Success with real Argon2id hasher",
			req: &RegisterUserRequest{
				Email:    "argon@example.com",
				Username: "argonuser",
				Name:     "Argon User",
				Password: "argonpassword123",
			},
			hasher: func() PasswordHasher {
				h, err := password.NewArgon2id(password.DefaultParams())
				if err != nil {
					t.Fatalf("failed to create argon2id: %v", err)
				}
				return h
			}(),
			mockCreateUser: func(ctx context.Context, user *identity.User) error {
				return nil
			},
			mockCreateCredential: func(ctx context.Context, credential *identity.Credential) error {
				return nil
			},
			expectedError: false,
			validateResult: func(t *testing.T, resp *RegisterUserResponse, createdUser *identity.User, createdCred *identity.Credential) {
				if createdCred == nil {
					t.Fatal("expected credential to be created")
				}
				if !strings.HasPrefix(createdCred.SecretData, "$argon2id$") {
					t.Errorf("expected Argon2id hash prefix, got %s", createdCred.SecretData)
				}
				if createdCred.SecretData == "argonpassword123" {
					t.Error("SecretData must not contain plaintext password")
				}
			},
		},
		{
			name: "Hasher failure returns error",
			req: &RegisterUserRequest{
				Email:    "test@example.com",
				Username: "testuser",
				Name:     "Test User",
				Password: "securepassword123",
			},
			hasher: &PasswordHasherMock{
				HashFunc: func(raw string) (string, error) {
					return "", errors.New("hashing engine failure")
				},
			},
			expectedError: true,
			errorContains: "hash password",
		},
		{
			name: "CreateUser failure returns error",
			req: &RegisterUserRequest{
				Email:    "test@example.com",
				Username: "testuser",
				Name:     "Test User",
				Password: "securepassword123",
			},
			hasher: &PasswordHasherMock{
				HashFunc: func(raw string) (string, error) {
					return "hash_ok", nil
				},
			},
			mockCreateUser: func(ctx context.Context, user *identity.User) error {
				return errors.New("user already exists")
			},
			expectedError: true,
			errorContains: "user already exists",
		},
		{
			name: "CreateCredential failure returns error",
			req: &RegisterUserRequest{
				Email:    "test@example.com",
				Username: "testuser",
				Name:     "Test User",
				Password: "securepassword123",
			},
			hasher: &PasswordHasherMock{
				HashFunc: func(raw string) (string, error) {
					return "hash_ok", nil
				},
			},
			mockCreateUser: func(ctx context.Context, user *identity.User) error {
				return nil
			},
			mockCreateCredential: func(ctx context.Context, credential *identity.Credential) error {
				return errors.New("credential store unavailable")
			},
			expectedError: true,
			errorContains: "credential store unavailable",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			var capturedUser *identity.User
			var capturedCred *identity.Credential

			mockID := &IdentityServiceMock{
				CreateUserFunc: func(ctx context.Context, user *identity.User) error {
					capturedUser = user
					if tc.mockCreateUser != nil {
						return tc.mockCreateUser(ctx, user)
					}
					return nil
				},
				CreateCredentialFunc: func(ctx context.Context, credential *identity.Credential) error {
					capturedCred = credential
					if tc.mockCreateCredential != nil {
						return tc.mockCreateCredential(ctx, credential)
					}
					return nil
				},
			}

			coord := NewCoordinator(Dependencies{
				IdentityService: mockID,
				PasswordHasher:  tc.hasher,
			})

			resp, err := coord.Register(context.Background(), tc.req)

			if tc.expectedError {
				if err == nil {
					t.Fatalf("expected error, got nil")
				}
				if tc.errorContains != "" && !strings.Contains(err.Error(), tc.errorContains) {
					t.Errorf("expected error to contain %q, got %q", tc.errorContains, err.Error())
				}
				return
			}

			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}

			if tc.validateResult != nil {
				tc.validateResult(t, resp, capturedUser, capturedCred)
			}
		})
	}
}

func TestCoordinator_UpdateProfile(t *testing.T) {
	ctx := context.Background()

	name := "Alice"
	avatar := "https://example.com/avatar.png"

	tests := []struct {
		name        string
		req         *UpdateProfileRequest
		setup       func(idMock *IdentityServiceMock)
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
			req: &UpdateProfileRequest{
				Name: &name,
			},
			expectedErr: true,
			errMsg:      "user id is required",
		},
		{
			name: "service error",
			req: &UpdateProfileRequest{
				UserID: "usr_123",
				Name:   &name,
			},
			setup: func(idMock *IdentityServiceMock) {
				idMock.UpdateProfileFunc = func(ctx context.Context, params identity.UpdateProfileParams) (*identity.User, error) {
					return nil, errors.New("update failed")
				}
			},
			expectedErr: true,
			errMsg:      "update failed",
		},
		{
			name: "success",
			req: &UpdateProfileRequest{
				UserID:    "usr_123",
				Name:      &name,
				AvatarURL: &avatar,
			},
			setup: func(idMock *IdentityServiceMock) {
				idMock.UpdateProfileFunc = func(ctx context.Context, params identity.UpdateProfileParams) (*identity.User, error) {
					return &identity.User{
						ID:        params.UserID,
						Name:      *params.Name,
						AvatarURL: *params.AvatarURL,
					}, nil
				}
			},
			expectedErr: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			idMock := &IdentityServiceMock{}
			if tc.setup != nil {
				tc.setup(idMock)
			}
			c := NewCoordinator(Dependencies{
				IdentityService: idMock,
			})
			resp, err := c.UpdateProfile(ctx, tc.req)
			if tc.expectedErr {
				if err == nil {
					t.Fatalf("expected error containing %q, got nil", tc.errMsg)
				}
				if tc.errMsg != "" && !strings.Contains(err.Error(), tc.errMsg) {
					t.Fatalf("expected error containing %q, got %v", tc.errMsg, err)
				}
			} else {
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if resp == nil || resp.Name != name {
					t.Fatalf("expected updated user with name %q, got %v", name, resp)
				}
			}
		})
	}
}

func TestCoordinator_ChangeEmail(t *testing.T) {
	ctx := context.Background()

	tests := []struct {
		name        string
		req         *ChangeEmailRequest
		setup       func(idMock *IdentityServiceMock)
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
			req: &ChangeEmailRequest{
				NewEmail:        "new@example.com",
				CurrentPassword: "pass",
			},
			expectedErr: true,
			errMsg:      "user id is required",
		},
		{
			name: "missing new email",
			req: &ChangeEmailRequest{
				UserID:          "usr_123",
				CurrentPassword: "pass",
			},
			expectedErr: true,
			errMsg:      "new email is required",
		},
		{
			name: "missing current password",
			req: &ChangeEmailRequest{
				UserID:   "usr_123",
				NewEmail: "new@example.com",
			},
			expectedErr: true,
			errMsg:      "current password is required",
		},
		{
			name: "service error",
			req: &ChangeEmailRequest{
				UserID:          "usr_123",
				NewEmail:        "new@example.com",
				CurrentPassword: "pass",
			},
			setup: func(idMock *IdentityServiceMock) {
				idMock.ChangeEmailFunc = func(ctx context.Context, params identity.ChangeEmailParams) (*identity.User, error) {
					return nil, errors.New("email in use")
				}
			},
			expectedErr: true,
			errMsg:      "email in use",
		},
		{
			name: "success",
			req: &ChangeEmailRequest{
				UserID:          "usr_123",
				NewEmail:        "new@example.com",
				CurrentPassword: "pass",
				TOTPCode:        "123456",
			},
			setup: func(idMock *IdentityServiceMock) {
				idMock.ChangeEmailFunc = func(ctx context.Context, params identity.ChangeEmailParams) (*identity.User, error) {
					return &identity.User{
						ID:    params.UserID,
						Email: params.NewEmail,
					}, nil
				}
			},
			expectedErr: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			idMock := &IdentityServiceMock{}
			if tc.setup != nil {
				tc.setup(idMock)
			}
			c := NewCoordinator(Dependencies{
				IdentityService: idMock,
			})
			resp, err := c.ChangeEmail(ctx, tc.req)
			if tc.expectedErr {
				if err == nil {
					t.Fatalf("expected error containing %q, got nil", tc.errMsg)
				}
				if tc.errMsg != "" && !strings.Contains(err.Error(), tc.errMsg) {
					t.Fatalf("expected error containing %q, got %v", tc.errMsg, err)
				}
			} else {
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if resp == nil || resp.Email != "new@example.com" {
					t.Fatalf("expected updated user with email new@example.com, got %v", resp)
				}
			}
		})
	}
}

func TestCoordinator_DeleteAccount(t *testing.T) {
	ctx := context.Background()

	tests := []struct {
		name        string
		req         *DeleteAccountRequest
		setup       func(idMock *IdentityServiceMock)
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
			req: &DeleteAccountRequest{
				CurrentPassword: "pass",
			},
			expectedErr: true,
			errMsg:      "user id is required",
		},
		{
			name: "missing current password",
			req: &DeleteAccountRequest{
				UserID: "usr_123",
			},
			expectedErr: true,
			errMsg:      "current password is required",
		},
		{
			name: "service error",
			req: &DeleteAccountRequest{
				UserID:          "usr_123",
				CurrentPassword: "pass",
			},
			setup: func(idMock *IdentityServiceMock) {
				idMock.DeleteAccountFunc = func(ctx context.Context, params identity.DeleteAccountParams) error {
					return errors.New("delete failed")
				}
			},
			expectedErr: true,
			errMsg:      "delete failed",
		},
		{
			name: "success",
			req: &DeleteAccountRequest{
				UserID:          "usr_123",
				CurrentPassword: "pass",
				TOTPCode:        "123456",
			},
			setup: func(idMock *IdentityServiceMock) {
				idMock.DeleteAccountFunc = func(ctx context.Context, params identity.DeleteAccountParams) error {
					return nil
				}
			},
			expectedErr: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			idMock := &IdentityServiceMock{}
			if tc.setup != nil {
				tc.setup(idMock)
			}
			c := NewCoordinator(Dependencies{
				IdentityService: idMock,
			})
			err := c.DeleteAccount(ctx, tc.req)
			if tc.expectedErr {
				if err == nil {
					t.Fatalf("expected error containing %q, got nil", tc.errMsg)
				}
				if tc.errMsg != "" && !strings.Contains(err.Error(), tc.errMsg) {
					t.Fatalf("expected error containing %q, got %v", tc.errMsg, err)
				}
			} else {
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
			}
		})
	}
}

func TestCoordinator_UserPreferences(t *testing.T) {
	ctx := context.Background()

	t.Run("GetUserPreferences", func(t *testing.T) {
		tests := []struct {
			name        string
			userID      identity.UserID
			setup       func(idMock *IdentityServiceMock)
			want        identity.UserPreferences
			expectedErr bool
			errMsg      string
		}{
			{
				name:        "missing user id",
				userID:      "",
				expectedErr: true,
				errMsg:      "user id is required",
			},
			{
				name:   "service error",
				userID: "usr_123",
				setup: func(idMock *IdentityServiceMock) {
					idMock.GetUserPreferencesFunc = func(ctx context.Context, userID identity.UserID) (*identity.UserPreferences, error) {
						return nil, errors.New("load failed")
					}
				},
				expectedErr: true,
				errMsg:      "load failed",
			},
			{
				name:   "success",
				userID: "usr_123",
				setup: func(idMock *IdentityServiceMock) {
					idMock.GetUserPreferencesFunc = func(ctx context.Context, userID identity.UserID) (*identity.UserPreferences, error) {
						return &identity.UserPreferences{
							Locale:       "es-ES",
							HourCycle:    identity.HourCycle24,
							WeekStartsOn: 1,
						}, nil
					}
				},
				want: identity.UserPreferences{
					Locale:       "es-ES",
					HourCycle:    identity.HourCycle24,
					WeekStartsOn: 1,
				},
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				idMock := &IdentityServiceMock{}
				if tc.setup != nil {
					tc.setup(idMock)
				}
				c := NewCoordinator(Dependencies{IdentityService: idMock})
				got, err := c.GetUserPreferences(ctx, tc.userID)
				if tc.expectedErr {
					if err == nil {
						t.Fatalf("expected error containing %q, got nil", tc.errMsg)
					}
					if tc.errMsg != "" && !strings.Contains(err.Error(), tc.errMsg) {
						t.Fatalf("expected error containing %q, got %v", tc.errMsg, err)
					}
					return
				}
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if *got != tc.want {
					t.Fatalf("got %+v, want %+v", *got, tc.want)
				}
			})
		}
	})

	t.Run("UpdateUserPreferences", func(t *testing.T) {
		tests := []struct {
			name        string
			req         *UpdateUserPreferencesRequest
			setup       func(idMock *IdentityServiceMock)
			want        identity.UserPreferences
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
				req: &UpdateUserPreferencesRequest{
					Preferences: identity.DefaultUserPreferences(),
				},
				expectedErr: true,
				errMsg:      "user id is required",
			},
			{
				name: "service error",
				req: &UpdateUserPreferencesRequest{
					UserID:      "usr_123",
					Preferences: identity.UserPreferences{Locale: "bad"},
					UpdateMask:  []string{"locale"},
				},
				setup: func(idMock *IdentityServiceMock) {
					idMock.UpdateUserPreferencesFunc = func(ctx context.Context, userID identity.UserID, req identity.UpdateUserPreferencesRequest) (*identity.UserPreferences, error) {
						return nil, errors.New("invalid locale")
					}
				},
				expectedErr: true,
				errMsg:      "invalid locale",
			},
			{
				name: "success",
				req: &UpdateUserPreferencesRequest{
					UserID:      "usr_123",
					Preferences: identity.UserPreferences{Locale: "es-419", HourCycle: identity.HourCycle24, WeekStartsOn: 1},
					UpdateMask:  []string{"locale", "hour_cycle", "week_starts_on"},
				},
				setup: func(idMock *IdentityServiceMock) {
					idMock.UpdateUserPreferencesFunc = func(ctx context.Context, userID identity.UserID, req identity.UpdateUserPreferencesRequest) (*identity.UserPreferences, error) {
						if userID != "usr_123" || len(req.Paths) != 3 {
							t.Fatalf("unexpected args: userID=%q paths=%v", userID, req.Paths)
						}
						return &req.Preferences, nil
					}
				},
				want: identity.UserPreferences{Locale: "es-419", HourCycle: identity.HourCycle24, WeekStartsOn: 1},
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				idMock := &IdentityServiceMock{}
				if tc.setup != nil {
					tc.setup(idMock)
				}
				c := NewCoordinator(Dependencies{IdentityService: idMock})
				got, err := c.UpdateUserPreferences(ctx, tc.req)
				if tc.expectedErr {
					if err == nil {
						t.Fatalf("expected error containing %q, got nil", tc.errMsg)
					}
					if tc.errMsg != "" && !strings.Contains(err.Error(), tc.errMsg) {
						t.Fatalf("expected error containing %q, got %v", tc.errMsg, err)
					}
					return
				}
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if *got != tc.want {
					t.Fatalf("got %+v, want %+v", *got, tc.want)
				}
			})
		}
	})
}
