package iam

import (
	"context"
	"errors"
	"testing"

	"github.com/masterkeysrd/saturn/internal/domain/identity"
)

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
				if tc.errMsg != "" && !contains(err.Error(), tc.errMsg) {
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
				if tc.errMsg != "" && !contains(err.Error(), tc.errMsg) {
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
				if tc.errMsg != "" && !contains(err.Error(), tc.errMsg) {
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
