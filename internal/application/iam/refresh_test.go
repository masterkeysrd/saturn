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
