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
	return a
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

	adminToken := a.driver.env.getAdminToken(tb)
	adminClient := adminidentityv1.NewClient(saturn.Config{
		BaseURL:     a.driver.env.ServerURL,
		AccessToken: adminToken,
		HTTPClient:  a.driver.httpClient,
	})

	_, err := adminClient.ApproveUser(tb.Context(), &adminidentityv1.ApproveUserRequest{
		UserId: a.pendingUserID,
	})
	if err != nil {
		tb.Fatalf("ApproveUser Admin SDK call failed for user %s: %v", a.pendingUserID, err)
	}
	return a
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
	client := a.getClient()

	resp, err := client.LoginUser(tb.Context(), &identityv1.LoginUserRequest{
		Method: &identityv1.LoginUserRequest_UserPassword_{
			UserPassword: &identityv1.LoginUserRequest_UserPassword{
				Identifier: a.driver.state.UserEmail,
				Password:   a.driver.state.UserPassword,
			},
		},
	})
	if err != nil {
		tb.Fatalf("LoginUser SDK call failed: %v", err)
	}

	a.driver.state.AccessToken = resp.GetAccessToken()
	return a
}
