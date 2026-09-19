package iam

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/masterkeysrd/saturn/internal/platform/token"
)

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
