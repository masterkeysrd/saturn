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
