//go:build integration

package driver

import (
	"fmt"
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/apis/saturn"
	adminidentityv1 "github.com/masterkeysrd/saturn/apis/saturn/identity/admin/v1"
	identityv1 "github.com/masterkeysrd/saturn/apis/saturn/identity/v1"
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
