//go:build integration

package driver

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"crypto/x509"
	"fmt"
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/apis/saturn"
	adminidentityv1 "github.com/masterkeysrd/saturn/apis/saturn/identity/admin/v1"
	identityv1 "github.com/masterkeysrd/saturn/apis/saturn/identity/v1"
	"google.golang.org/protobuf/types/known/emptypb"
)

// AuthDriver provides composable fluent methods for user registration, admin approval, and authentication.
type AuthDriver struct {
	driver        *Driver
	client        *identityv1.Client
	lastToken     string
	pendingUserID string
}

func (a *AuthDriver) getClient() *identityv1.Client {
	if a.client == nil || a.lastToken != a.driver.state.AccessToken {
		a.lastToken = a.driver.state.AccessToken
		a.client = identityv1.NewClient(saturn.Config{
			BaseURL:     a.driver.env.ServerURL,
			AccessToken: a.lastToken,
			HTTPClient:  a.driver.httpClient,
		})
	}
	return a.client
}

func (a *AuthDriver) getAdminClient(tb testing.TB) *adminidentityv1.Client {
	adminToken := a.driver.env.getAdminToken(tb)
	return adminidentityv1.NewClient(saturn.Config{
		BaseURL:     a.driver.env.ServerURL,
		AccessToken: adminToken,
		HTTPClient:  a.driver.httpClient,
	})
}

// RegisterUserOptions holds parameters for registering a user.
type RegisterUserOptions struct {
	Name     string
	Email    string
	Username string
	Password string
}

// Register registers a new user (status: PENDING) via identityv1.Client.
func (a *AuthDriver) Register(tb testing.TB) *AuthDriver {
	tb.Helper()
	if tb.Failed() {
		return a
	}
	nano := time.Now().UnixNano()
	a.driver.state.UserEmail = fmt.Sprintf("testuser_%d@saturn.local", nano)
	a.driver.state.UserPassword = "Password123!"

	client := a.getClient()

	regResp, err := client.RegisterUser(tb.Context(), &identityv1.RegisterUserRequest{
		Name:     "Integration Test User",
		Email:    a.driver.state.UserEmail,
		Username: fmt.Sprintf("user_%d", nano),
		Password: a.driver.state.UserPassword,
	})
	if err != nil {
		tb.Fatalf("RegisterUser SDK call failed: %v", err)
	}

	a.pendingUserID = regResp.GetId()
	a.driver.state.UserID = regResp.GetId()
	return a
}

// RegisterUser registers a user with custom attributes.
func (a *AuthDriver) RegisterUser(tb testing.TB, opts RegisterUserOptions) (*identityv1.User, error) {
	tb.Helper()
	client := a.getClient()
	return client.RegisterUser(tb.Context(), &identityv1.RegisterUserRequest{
		Name:     opts.Name,
		Email:    opts.Email,
		Username: opts.Username,
		Password: opts.Password,
	})
}

// Approve approves the pending registered user via adminidentityv1.Client SDK.
func (a *AuthDriver) Approve(tb testing.TB) *AuthDriver {
	tb.Helper()
	if tb.Failed() {
		return a
	}
	if a.pendingUserID == "" {
		tb.Fatalf("Approve called but no pending user exists in AuthDriver state")
		return a
	}

	_, err := a.ApproveUser(tb, a.pendingUserID)
	if err != nil {
		tb.Fatalf("ApproveUser Admin SDK call failed for user %s: %v", a.pendingUserID, err)
	}
	return a
}

// ApproveUser approves a specific user by ID.
func (a *AuthDriver) ApproveUser(tb testing.TB, userID string) (*adminidentityv1.ApproveUserResponse, error) {
	tb.Helper()
	adminClient := a.getAdminClient(tb)
	return adminClient.ApproveUser(tb.Context(), &adminidentityv1.ApproveUserRequest{
		UserId: userID,
	})
}

// RejectUser rejects a specific user by ID.
func (a *AuthDriver) RejectUser(tb testing.TB, userID string) (*adminidentityv1.RejectUserResponse, error) {
	tb.Helper()
	adminClient := a.getAdminClient(tb)
	return adminClient.RejectUser(tb.Context(), &adminidentityv1.RejectUserRequest{
		UserId: userID,
	})
}

// UpdateUserRole updates a user's access level.
func (a *AuthDriver) UpdateUserRole(tb testing.TB, userID string, accessLevel adminidentityv1.AccessLevel) (*adminidentityv1.UpdateUserRoleResponse, error) {
	tb.Helper()
	adminClient := a.getAdminClient(tb)
	return adminClient.UpdateUserRole(tb.Context(), &adminidentityv1.UpdateUserRoleRequest{
		UserId:      userID,
		AccessLevel: accessLevel,
	})
}

// ListUsers lists users matching the request filter.
func (a *AuthDriver) ListUsers(tb testing.TB, req *adminidentityv1.ListUsersRequest) (*adminidentityv1.ListUsersResponse, error) {
	tb.Helper()
	adminClient := a.getAdminClient(tb)
	return adminClient.ListUsers(tb.Context(), req)
}

// CreateApprovedUser composes Register and Approve into a single step.
func (a *AuthDriver) CreateApprovedUser(tb testing.TB) *AuthDriver {
	tb.Helper()
	return a.Register(tb).Approve(tb)
}

// Login authenticates the current user using identityv1.Client.
func (a *AuthDriver) Login(tb testing.TB) *AuthDriver {
	tb.Helper()
	if tb.Failed() {
		return a
	}

	resp, err := a.LoginAs(tb, a.driver.state.UserEmail, a.driver.state.UserPassword)
	if err != nil {
		tb.Fatalf("LoginUser SDK call failed: %v", err)
	}

	a.driver.state.AccessToken = resp.GetAccessToken()
	a.driver.state.RefreshToken = resp.GetRefreshToken()
	a.driver.state.UserID = resp.GetUserId()
	return a
}

// LoginAs logs in with specified credentials without setting driver state unless desired.
func (a *AuthDriver) LoginAs(tb testing.TB, identifier, password string) (*identityv1.LoginUserResponse, error) {
	tb.Helper()
	client := a.getClient()

	return client.LoginUser(tb.Context(), &identityv1.LoginUserRequest{
		Method: &identityv1.LoginUserRequest_UserPassword_{
			UserPassword: &identityv1.LoginUserRequest_UserPassword{
				Identifier: identifier,
				Password:   password,
			},
		},
	})
}

// RefreshSession exchanges a refresh token for newly issued tokens.
func (a *AuthDriver) RefreshSession(tb testing.TB, refreshToken string) (*identityv1.RefreshSessionResponse, error) {
	tb.Helper()
	client := a.getClient()
	return client.RefreshSession(tb.Context(), &identityv1.RefreshSessionRequest{
		RefreshToken: refreshToken,
	})
}

// Logout revokes the given refresh token.
func (a *AuthDriver) Logout(tb testing.TB, refreshToken string) (*identityv1.LogoutResponse, error) {
	tb.Helper()
	client := a.getClient()
	return client.Logout(tb.Context(), &identityv1.LogoutRequest{
		RefreshToken: refreshToken,
	})
}

// GetCurrentUser returns the currently authenticated user's profile.
func (a *AuthDriver) GetCurrentUser(tb testing.TB) (*identityv1.User, error) {
	tb.Helper()
	client := a.getClient()
	return client.GetCurrentUser(tb.Context(), &identityv1.GetCurrentUserRequest{})
}

// ListActiveSessions returns all active sessions for the current user.
func (a *AuthDriver) ListActiveSessions(tb testing.TB) (*identityv1.ListActiveSessionsResponse, error) {
	tb.Helper()
	client := a.getClient()
	return client.ListActiveSessions(tb.Context(), &identityv1.ListActiveSessionsRequest{})
}

// RevokeSession revokes a specific session.
func (a *AuthDriver) RevokeSession(tb testing.TB, sessionID string) (*identityv1.RevokeSessionResponse, error) {
	tb.Helper()
	client := a.getClient()
	return client.RevokeSession(tb.Context(), &identityv1.RevokeSessionRequest{
		SessionId: sessionID,
	})
}

// RevokeAllSessions revokes all sessions for the authenticated user.
func (a *AuthDriver) RevokeAllSessions(tb testing.TB) (*identityv1.RevokeAllSessionsResponse, error) {
	tb.Helper()
	client := a.getClient()
	return client.RevokeAllSessions(tb.Context(), &identityv1.RevokeAllSessionsRequest{})
}

// AdminRevokeAllSessions revokes all sessions for a user as an admin.
func (a *AuthDriver) AdminRevokeAllSessions(tb testing.TB, userID string) (*adminidentityv1.RevokeAllSessionsResponse, error) {
	tb.Helper()
	adminClient := a.getAdminClient(tb)
	return adminClient.RevokeAllSessions(tb.Context(), &adminidentityv1.RevokeAllSessionsRequest{
		UserId: userID,
	})
}

// ListMySecurityEvents retrieves security audit events for the current user.
func (a *AuthDriver) ListMySecurityEvents(tb testing.TB, limit int32, pageToken string) (*identityv1.ListMySecurityEventsResponse, error) {
	tb.Helper()
	client := a.getClient()
	return client.ListMySecurityEvents(tb.Context(), &identityv1.ListMySecurityEventsRequest{
		Limit:         limit,
		NextPageToken: pageToken,
	})
}

// SetupTOTP initiates TOTP setup for the currently authenticated user.
func (a *AuthDriver) SetupTOTP(tb testing.TB) (*identityv1.SetupTOTPResponse, error) {
	tb.Helper()
	client := a.getClient()
	return client.SetupTOTP(tb.Context(), &identityv1.SetupTOTPRequest{})
}

// ConfirmTOTP verifies the initial 6-digit TOTP code and activates the factor, returning backup codes.
func (a *AuthDriver) ConfirmTOTP(tb testing.TB, factorID, code string) (*identityv1.ConfirmTOTPResponse, error) {
	tb.Helper()
	client := a.getClient()
	return client.ConfirmTOTP(tb.Context(), &identityv1.ConfirmTOTPRequest{
		FactorId: factorID,
		Code:     code,
	})
}

// EnrollTOTP initiates and activates TOTP for the current user, returning factorID, secret, and backup codes.
func (a *AuthDriver) EnrollTOTP(tb testing.TB) (string, string, []string) {
	tb.Helper()
	setupResp, err := a.SetupTOTP(tb)
	if err != nil {
		tb.Fatalf("SetupTOTP failed: %v", err)
	}

	code := GenerateTestTOTP(tb, setupResp.GetSecret())

	confirmResp, err := a.ConfirmTOTP(tb, setupResp.GetFactorId(), code)
	if err != nil {
		tb.Fatalf("ConfirmTOTP failed: %v", err)
	}

	return setupResp.GetFactorId(), setupResp.GetSecret(), confirmResp.GetBackupCodes()
}

// ListMFAFactors returns enrolled MFA factors and backup code status for the current user.
func (a *AuthDriver) ListMFAFactors(tb testing.TB) (*identityv1.ListMFAFactorsResponse, error) {
	tb.Helper()
	client := a.getClient()
	return client.ListMFAFactors(tb.Context(), &identityv1.ListMFAFactorsRequest{})
}

// DeleteMFAFactor removes an enrolled MFA factor.
func (a *AuthDriver) DeleteMFAFactor(tb testing.TB, factorID string) error {
	tb.Helper()
	client := a.getClient()
	_, err := client.DeleteMFAFactor(tb.Context(), &identityv1.DeleteMFAFactorRequest{
		FactorId: factorID,
	})
	return err
}

// RegenerateBackupCodes replaces single-use recovery backup codes using a valid verification code.
func (a *AuthDriver) RegenerateBackupCodes(tb testing.TB, verificationCode string) (*identityv1.RegenerateBackupCodesResponse, error) {
	tb.Helper()
	client := a.getClient()
	return client.RegenerateBackupCodes(tb.Context(), &identityv1.RegenerateBackupCodesRequest{
		VerificationCode: verificationCode,
	})
}

// LoginWithTOTP completes MFA Step 2 using a 6-digit TOTP code.
func (a *AuthDriver) LoginWithTOTP(tb testing.TB, mfaTicket, factorID, code string) (*identityv1.LoginUserResponse, error) {
	tb.Helper()
	client := a.getClient()
	return client.LoginUser(tb.Context(), &identityv1.LoginUserRequest{
		Method: &identityv1.LoginUserRequest_MfaAssertion_{
			MfaAssertion: &identityv1.LoginUserRequest_MfaAssertion{
				MfaTicket: mfaTicket,
				FactorId:  factorID,
				FactorPayload: &identityv1.LoginUserRequest_MfaAssertion_TotpCode{
					TotpCode: code,
				},
			},
		},
	})
}

// LoginWithBackupCode completes MFA Step 2 using a single-use recovery backup code.
func (a *AuthDriver) LoginWithBackupCode(tb testing.TB, mfaTicket, backupCode string) (*identityv1.LoginUserResponse, error) {
	tb.Helper()
	client := a.getClient()
	return client.LoginUser(tb.Context(), &identityv1.LoginUserRequest{
		Method: &identityv1.LoginUserRequest_MfaAssertion_{
			MfaAssertion: &identityv1.LoginUserRequest_MfaAssertion{
				MfaTicket: mfaTicket,
				FactorPayload: &identityv1.LoginUserRequest_MfaAssertion_BackupCode{
					BackupCode: backupCode,
				},
			},
		},
	})
}

// CreateAuthChallenge requests an ephemeral challenge nonce for device verification.
func (a *AuthDriver) CreateAuthChallenge(tb testing.TB) (*identityv1.CreateAuthChallengeResponse, error) {
	tb.Helper()
	client := a.getClient()
	return client.CreateAuthChallenge(tb.Context(), &identityv1.CreateAuthChallengeRequest{})
}

// CreateDevice registers a new trusted hardware device.
func (a *AuthDriver) CreateDevice(tb testing.TB, dev *identityv1.Device) (*identityv1.Device, error) {
	tb.Helper()
	client := a.getClient()
	return client.CreateDevice(tb.Context(), &identityv1.CreateDeviceRequest{
		Device: dev,
	})
}

// ListDevices returns all registered devices for the current user.
func (a *AuthDriver) ListDevices(tb testing.TB) (*identityv1.ListDevicesResponse, error) {
	tb.Helper()
	client := a.getClient()
	return client.ListDevices(tb.Context(), &identityv1.ListDevicesRequest{})
}

// RevokeDevice revokes a registered device by ID.
func (a *AuthDriver) RevokeDevice(tb testing.TB, deviceID string) error {
	tb.Helper()
	client := a.getClient()
	_, err := client.RevokeDevice(tb.Context(), &identityv1.RevokeDeviceRequest{
		DeviceId: deviceID,
	})
	return err
}

// LoginWithDeviceAssertion authenticates using a registered hardware device.
func (a *AuthDriver) LoginWithDeviceAssertion(tb testing.TB, deviceID, challenge string, signature []byte) (*identityv1.LoginUserResponse, error) {
	tb.Helper()
	client := a.getClient()
	return client.LoginUser(tb.Context(), &identityv1.LoginUserRequest{
		Method: &identityv1.LoginUserRequest_DeviceAssertion_{
			DeviceAssertion: &identityv1.LoginUserRequest_DeviceAssertion{
				DeviceId:  deviceID,
				Challenge: challenge,
				Signature: signature,
			},
		},
	})
}

// GenerateTestDeviceKeypair generates an ECDSA P-256 keypair and returns DER PKIX public key bytes
// and a sign helper function that signs a challenge string using ASN.1 DER.
func GenerateTestDeviceKeypair(tb testing.TB) ([]byte, func(challenge string) []byte) {
	tb.Helper()
	priv, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		tb.Fatalf("failed to generate ECDSA keypair: %v", err)
	}
	pubBytes, err := x509.MarshalPKIXPublicKey(&priv.PublicKey)
	if err != nil {
		tb.Fatalf("failed to marshal PKIX public key: %v", err)
	}
	signFn := func(challenge string) []byte {
		hash := sha256.Sum256([]byte(challenge))
		sig, err := ecdsa.SignASN1(rand.Reader, priv, hash[:])
		if err != nil {
			tb.Fatalf("failed to sign challenge: %v", err)
		}
		return sig
	}
	return pubBytes, signFn
}

// AdminResetPassword generates a password reset link and token for the specified user ID.
func (a *AuthDriver) AdminResetPassword(tb testing.TB, userID string, ttlMinutes int32) (*adminidentityv1.ResetPasswordResponse, error) {
	tb.Helper()
	adminClient := a.getAdminClient(tb)
	return adminClient.ResetPassword(tb.Context(), &adminidentityv1.ResetPasswordRequest{
		UserId:     userID,
		TtlMinutes: ttlMinutes,
	})
}

// ValidateResetToken validates a password reset token publicly.
func (a *AuthDriver) ValidateResetToken(tb testing.TB, token string) (*identityv1.ValidateResetTokenResponse, error) {
	tb.Helper()
	client := a.getClient()
	return client.ValidateResetToken(tb.Context(), &identityv1.ValidateResetTokenRequest{
		Token: token,
	})
}

// CompleteResetPassword consumes a reset token and sets a new password.
func (a *AuthDriver) CompleteResetPassword(tb testing.TB, token, newPassword string) (*emptypb.Empty, error) {
	tb.Helper()
	client := a.getClient()
	return client.CompleteResetPassword(tb.Context(), &identityv1.CompleteResetPasswordRequest{
		Token:       token,
		NewPassword: newPassword,
	})
}
