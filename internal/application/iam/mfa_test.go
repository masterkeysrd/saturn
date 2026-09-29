package iam

import (
	"context"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/token"
)

func TestCoordinator_MFA(t *testing.T) {
	ctx := context.Background()

	t.Run("ListMFAFactors returns factors and recovery code status", func(t *testing.T) {
		idSvc := &IdentityServiceMock{
			ListMFAFactorsFunc: func(ctx context.Context, userID identity.UserID) (*identity.MFAFactorsSummary, error) {
				return &identity.MFAFactorsSummary{
					Factors: []*identity.MFAFactor{
						{ID: "mfa_1", Name: "Phone", Type: identity.MFAFactorTypeTOTP},
					},
					HasBackupCodes:       true,
					RemainingBackupCodes: 8,
				}, nil
			},
		}

		coord := NewCoordinator(Dependencies{IdentityService: idSvc})
		resp, err := coord.ListMFAFactors(ctx, &ListMFAFactorsRequest{UserID: "usr_1"})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(resp.Factors) != 1 || !resp.HasBackupCodes || resp.RemainingBackupCodes != 8 {
			t.Errorf("unexpected response: %+v", resp)
		}
	})

	t.Run("SetupTOTP returns staged factor details", func(t *testing.T) {
		idSvc := &IdentityServiceMock{
			SetupTOTPFunc: func(ctx context.Context, req identity.SetupTOTPRequest) (*identity.SetupTOTPResult, error) {
				return &identity.SetupTOTPResult{
					FactorID:    "mfa_1",
					Secret:      "JBSWY3DPEHPK3PXP",
					AccountName: "user@example.com",
				}, nil
			},
		}

		coord := NewCoordinator(Dependencies{IdentityService: idSvc})
		resp, err := coord.SetupTOTP(ctx, &SetupTOTPRequest{UserID: "usr_1", Name: "Phone"})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if resp.FactorID != "mfa_1" || resp.Secret != "JBSWY3DPEHPK3PXP" || len(resp.QRCodeSVG) == 0 {
			t.Errorf("unexpected response: %+v", resp)
		}
	})

	t.Run("ConfirmTOTP activates factor and returns backup codes", func(t *testing.T) {
		idSvc := &IdentityServiceMock{
			ConfirmTOTPFunc: func(ctx context.Context, req identity.ConfirmTOTPRequest) ([]string, error) {
				return []string{"CODE1", "CODE2"}, nil
			},
		}

		coord := NewCoordinator(Dependencies{IdentityService: idSvc})
		resp, err := coord.ConfirmTOTP(ctx, &ConfirmTOTPRequest{UserID: "usr_1", FactorID: "mfa_1", Code: "123456"})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(resp.BackupCodes) != 2 {
			t.Errorf("unexpected response: %+v", resp)
		}
	})

	t.Run("RegenerateBackupCodes returns fresh backup codes", func(t *testing.T) {
		idSvc := &IdentityServiceMock{
			RegenerateBackupCodesFunc: func(ctx context.Context, req identity.RegenerateBackupCodesRequest) ([]string, error) {
				return []string{"NEW1", "NEW2"}, nil
			},
		}

		coord := NewCoordinator(Dependencies{IdentityService: idSvc})
		resp, err := coord.RegenerateBackupCodes(ctx, &RegenerateBackupCodesRequest{UserID: "usr_1", VerificationCode: "123456"})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(resp.BackupCodes) != 2 {
			t.Errorf("unexpected response: %+v", resp)
		}
	})

	t.Run("DeleteMFAFactor", func(t *testing.T) {
		tests := []struct {
			name        string
			req         *DeleteMFAFactorRequest
			setupMock   func(m *IdentityServiceMock)
			expectedErr bool
		}{
			{
				name: "Success",
				req:  &DeleteMFAFactorRequest{UserID: "usr_1", FactorID: "mfa_1"},
				setupMock: func(m *IdentityServiceMock) {
					m.DeleteMFAFactorFunc = func(ctx context.Context, req identity.DeleteMFAFactorRequest) error {
						return nil
					}
				},
				expectedErr: false,
			},
			{
				name: "Error",
				req:  &DeleteMFAFactorRequest{UserID: "usr_1", FactorID: "mfa_1"},
				setupMock: func(m *IdentityServiceMock) {
					m.DeleteMFAFactorFunc = func(ctx context.Context, req identity.DeleteMFAFactorRequest) error {
						return errors.New("delete error")
					}
				},
				expectedErr: true,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				idSvc := &IdentityServiceMock{}
				if tc.setupMock != nil {
					tc.setupMock(idSvc)
				}
				coord := NewCoordinator(Dependencies{IdentityService: idSvc})
				err := coord.DeleteMFAFactor(ctx, tc.req)
				if tc.expectedErr && err == nil {
					t.Fatal("expected error, got nil")
				}
				if !tc.expectedErr && err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
			})
		}
	})

	t.Run("SetPrimaryMFAFactor", func(t *testing.T) {
		tests := []struct {
			name        string
			req         *SetPrimaryMFAFactorRequest
			setupMock   func(m *IdentityServiceMock)
			expectedErr bool
		}{
			{
				name: "Success",
				req:  &SetPrimaryMFAFactorRequest{UserID: "usr_1", FactorID: "mfa_1"},
				setupMock: func(m *IdentityServiceMock) {
					m.SetPrimaryMFAFactorFunc = func(ctx context.Context, req identity.SetPrimaryMFAFactorRequest) error {
						return nil
					}
				},
				expectedErr: false,
			},
			{
				name: "Error",
				req:  &SetPrimaryMFAFactorRequest{UserID: "usr_1", FactorID: "mfa_1"},
				setupMock: func(m *IdentityServiceMock) {
					m.SetPrimaryMFAFactorFunc = func(ctx context.Context, req identity.SetPrimaryMFAFactorRequest) error {
						return errors.New("set primary error")
					}
				},
				expectedErr: true,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				idSvc := &IdentityServiceMock{}
				if tc.setupMock != nil {
					tc.setupMock(idSvc)
				}
				coord := NewCoordinator(Dependencies{IdentityService: idSvc})
				err := coord.SetPrimaryMFAFactor(ctx, tc.req)
				if tc.expectedErr && err == nil {
					t.Fatal("expected error, got nil")
				}
				if !tc.expectedErr && err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
			})
		}
	})

	t.Run("Error propagation in MFA methods", func(t *testing.T) {
		tests := []struct {
			name    string
			execute func(coord *coordinator) error
		}{
			{
				name: "ListMFAFactors error",
				execute: func(coord *coordinator) error {
					_, err := coord.ListMFAFactors(ctx, &ListMFAFactorsRequest{UserID: "usr_1"})
					return err
				},
			},
			{
				name: "SetupTOTP error",
				execute: func(coord *coordinator) error {
					_, err := coord.SetupTOTP(ctx, &SetupTOTPRequest{UserID: "usr_1", Name: "Phone"})
					return err
				},
			},
			{
				name: "ConfirmTOTP error",
				execute: func(coord *coordinator) error {
					_, err := coord.ConfirmTOTP(ctx, &ConfirmTOTPRequest{UserID: "usr_1", FactorID: "mfa_1", Code: "123456"})
					return err
				},
			},
			{
				name: "RegenerateBackupCodes error",
				execute: func(coord *coordinator) error {
					_, err := coord.RegenerateBackupCodes(ctx, &RegenerateBackupCodesRequest{UserID: "usr_1", VerificationCode: "123456"})
					return err
				},
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				idSvc := &IdentityServiceMock{
					ListMFAFactorsFunc: func(ctx context.Context, userID identity.UserID) (*identity.MFAFactorsSummary, error) {
						return nil, errors.New("db error")
					},
					SetupTOTPFunc: func(ctx context.Context, req identity.SetupTOTPRequest) (*identity.SetupTOTPResult, error) {
						return nil, errors.New("db error")
					},
					ConfirmTOTPFunc: func(ctx context.Context, req identity.ConfirmTOTPRequest) ([]string, error) {
						return nil, errors.New("db error")
					},
					RegenerateBackupCodesFunc: func(ctx context.Context, req identity.RegenerateBackupCodesRequest) ([]string, error) {
						return nil, errors.New("db error")
					},
				}
				coord := NewCoordinator(Dependencies{IdentityService: idSvc}).(*coordinator)
				if err := tc.execute(coord); err == nil {
					t.Fatal("expected error, got nil")
				}
			})
		}
	})
}

func TestCoordinator_Login_MFA(t *testing.T) {
	ctx := context.Background()

	t.Run("Step 1 returns MFARequired and ticket when user has MFA", func(t *testing.T) {
		user := &identity.User{
			ID:          "usr_1",
			Email:       "test@example.com",
			AccessLevel: identity.AccessLevelUser,
			Status:      identity.UserStatusActive,
		}

		idSvc := &IdentityServiceMock{
			GetUserByEmailFunc: func(ctx context.Context, email string) (*identity.User, error) {
				return user, nil
			},
			AuthenticateFunc: func(ctx context.Context, identifier, password string) (*identity.User, error) {
				return user, nil
			},
			HasActiveMFAFunc: func(ctx context.Context, userID identity.UserID) (bool, []*identity.MFAFactor, error) {
				return true, []*identity.MFAFactor{
					{ID: "mfa_1", Name: "Phone", Type: identity.MFAFactorTypeTOTP},
				}, nil
			},
		}

		tokSvc := &TokenServiceMock{
			IssueMFATicketFunc: func(input token.IssueInput, now time.Time) (string, time.Time, error) {
				return "ticket_jwt_123", now.Add(5 * time.Minute), nil
			},
		}

		coord := NewCoordinator(Dependencies{
			IdentityService: idSvc,
			TokenService:    tokSvc,
		})

		resp, err := coord.Login(ctx, &LoginRequest{
			Identifier: "test@example.com",
			Password:   "password123",
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if resp.MFA == nil {
			t.Fatal("expected MFA challenge to be non-nil")
		}
		if resp.MFA.Ticket != "ticket_jwt_123" {
			t.Errorf("expected ticket_jwt_123, got %s", resp.MFA.Ticket)
		}
		if len(resp.MFA.AvailableFactors) != 1 {
			t.Errorf("expected 1 factor, got %d", len(resp.MFA.AvailableFactors))
		}
		if resp.AccessToken != "" {
			t.Error("expected access token to be empty on Step 1 MFA challenge")
		}
	})

	t.Run("Step 2 completes authentication upon valid MFA assertion", func(t *testing.T) {
		user := &identity.User{
			ID:          "usr_1",
			Email:       "test@example.com",
			AccessLevel: identity.AccessLevelUser,
			Status:      identity.UserStatusActive,
			AuthVersion: 1,
		}

		idSvc := &IdentityServiceMock{
			GetUserByIDFunc: func(ctx context.Context, id identity.UserID) (*identity.User, error) {
				return user, nil
			},
			VerifyMFAAssertionFunc: func(ctx context.Context, req identity.VerifyMFAAssertionRequest) error {
				return nil
			},
			CreateSecurityEventFunc: func(ctx context.Context, event *identity.SecurityEvent) error {
				return nil
			},
			GetAuthVersionFunc: func(ctx context.Context, id identity.UserID) (int64, error) {
				return 1, nil
			},
			CreateSessionFunc: func(ctx context.Context, req *identity.CreateSessionRequest) (*identity.Session, error) {
				return &identity.Session{ID: "ses_1"}, nil
			},
		}

		tokSvc := &TokenServiceMock{
			ValidateMFATicketFunc: func(raw string, now time.Time) (*token.Claims, error) {
				return &token.Claims{
					RegisteredClaims: jwt.RegisteredClaims{
						Subject: "usr_1",
					},
					AuthVersion: 1,
					TokenUse:    "mfa_ticket",
				}, nil
			},
			IssueAccessTokenFunc: func(input token.IssueInput, now time.Time) (string, time.Time, error) {
				return "access_jwt", now.Add(15 * time.Minute), nil
			},
			IssueRefreshTokenFunc: func(input token.IssueInput, now, abs time.Time) (string, time.Time, error) {
				return "refresh_jwt", now.Add(24 * time.Hour), nil
			},
		}

		coord := NewCoordinator(Dependencies{
			IdentityService: idSvc,
			TokenService:    tokSvc,
		})

		resp, err := coord.Login(ctx, &LoginRequest{
			MFATicket: "ticket_jwt_123",
			FactorID:  "mfa_1",
			TOTPCode:  "123456",
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if resp.MFA != nil {
			t.Error("expected MFA challenge to be nil on successful Step 2 completion")
		}
		if resp.AccessToken != "access_jwt" {
			t.Errorf("expected access_jwt, got %s", resp.AccessToken)
		}
		if resp.RefreshToken != "refresh_jwt" {
			t.Errorf("expected refresh_jwt, got %s", resp.RefreshToken)
		}
	})

	t.Run("Step 2 rejects invalid MFA ticket", func(t *testing.T) {
		tokSvc := &TokenServiceMock{
			ValidateMFATicketFunc: func(raw string, now time.Time) (*token.Claims, error) {
				return nil, errors.E("invalid token")
			},
		}

		coord := NewCoordinator(Dependencies{
			TokenService: tokSvc,
		})

		_, err := coord.Login(ctx, &LoginRequest{
			MFATicket: "bad_ticket",
			FactorID:  "mfa_1",
			TOTPCode:  "123456",
		})
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		if errors.CodeOf(err) != identity.MFAInvalidTicket {
			t.Errorf("expected MFAInvalidTicket, got %v", errors.CodeOf(err))
		}
	})

	t.Run("Step 2 failure branches", func(t *testing.T) {
		tests := []struct {
			name       string
			setup      func(idSvc *IdentityServiceMock, tokSvc *TokenServiceMock)
			expectCode errors.Code
		}{
			{
				name: "User not found",
				setup: func(idSvc *IdentityServiceMock, tokSvc *TokenServiceMock) {
					tokSvc.ValidateMFATicketFunc = func(raw string, now time.Time) (*token.Claims, error) {
						return &token.Claims{RegisteredClaims: jwt.RegisteredClaims{Subject: "usr_1"}}, nil
					}
					idSvc.GetUserByIDFunc = func(ctx context.Context, id identity.UserID) (*identity.User, error) {
						return nil, errors.New("user not found")
					}
				},
				expectCode: identity.InvalidCredentials,
			},
			{
				name: "User not active",
				setup: func(idSvc *IdentityServiceMock, tokSvc *TokenServiceMock) {
					tokSvc.ValidateMFATicketFunc = func(raw string, now time.Time) (*token.Claims, error) {
						return &token.Claims{RegisteredClaims: jwt.RegisteredClaims{Subject: "usr_1"}, AuthVersion: 1}, nil
					}
					idSvc.GetUserByIDFunc = func(ctx context.Context, id identity.UserID) (*identity.User, error) {
						return &identity.User{ID: id, Status: identity.UserStatusInactive, AuthVersion: 1}, nil
					}
				},
				expectCode: identity.InvalidCredentials,
			},
			{
				name: "AuthVersion changed",
				setup: func(idSvc *IdentityServiceMock, tokSvc *TokenServiceMock) {
					tokSvc.ValidateMFATicketFunc = func(raw string, now time.Time) (*token.Claims, error) {
						return &token.Claims{RegisteredClaims: jwt.RegisteredClaims{Subject: "usr_1"}, AuthVersion: 1}, nil
					}
					idSvc.GetUserByIDFunc = func(ctx context.Context, id identity.UserID) (*identity.User, error) {
						return &identity.User{ID: id, Status: identity.UserStatusActive, AuthVersion: 2}, nil
					}
				},
				expectCode: identity.InvalidCredentials,
			},
			{
				name: "VerifyMFAAssertion error",
				setup: func(idSvc *IdentityServiceMock, tokSvc *TokenServiceMock) {
					tokSvc.ValidateMFATicketFunc = func(raw string, now time.Time) (*token.Claims, error) {
						return &token.Claims{RegisteredClaims: jwt.RegisteredClaims{Subject: "usr_1"}, AuthVersion: 1}, nil
					}
					idSvc.GetUserByIDFunc = func(ctx context.Context, id identity.UserID) (*identity.User, error) {
						return &identity.User{ID: id, Status: identity.UserStatusActive, AuthVersion: 1}, nil
					}
					idSvc.VerifyMFAAssertionFunc = func(ctx context.Context, req identity.VerifyMFAAssertionRequest) error {
						return errors.E(errors.Invalid, identity.MFAInvalidCode, "invalid code")
					}
				},
				expectCode: identity.MFAInvalidCode,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				idSvc := &IdentityServiceMock{}
				tokSvc := &TokenServiceMock{}
				if tc.setup != nil {
					tc.setup(idSvc, tokSvc)
				}
				coord := NewCoordinator(Dependencies{IdentityService: idSvc, TokenService: tokSvc})
				_, err := coord.Login(ctx, &LoginRequest{
					MFATicket: "ticket_jwt_123",
					FactorID:  "mfa_1",
					TOTPCode:  "123456",
				})
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				if tc.expectCode != "" && errors.CodeOf(err) != tc.expectCode {
					t.Errorf("expected code %v, got %v", tc.expectCode, errors.CodeOf(err))
				}
			})
		}
	})
}
