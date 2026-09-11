//go:build integration

package identity_test

import (
	"fmt"
	"testing"
	"time"

	adminidentityv1 "github.com/masterkeysrd/saturn/apis/saturn/identity/admin/v1"
	"github.com/masterkeysrd/saturn/tests/driver"
)

func TestUserRegistrationAndApprovalLifecycle(t *testing.T) {
	d := driver.New(t, testEnv)

	nano := time.Now().UnixNano()
	email := fmt.Sprintf("lifecycle_%d@saturn.local", nano)
	password := "SecretPass123!"
	username := fmt.Sprintf("user_%d", nano)

	// 1. Register a new user
	user, err := d.Auth().RegisterUser(t, driver.RegisterUserOptions{
		Name:     "Lifecycle User",
		Email:    email,
		Username: username,
		Password: password,
	})
	if err != nil {
		t.Fatalf("failed to register user: %v", err)
	}
	if user.GetEmail() != email {
		t.Errorf("user email = %s, want %s", user.GetEmail(), email)
	}
	if user.GetStatus() != "pending_approval" {
		t.Errorf("registered user status = %s, want pending_approval", user.GetStatus())
	}

	// 2. Attempt login before approval (must fail)
	_, err = d.Auth().LoginAs(t, email, password)
	if err == nil {
		t.Fatalf("expected login to fail for pending user, but succeeded")
	}

	// 3. Admin approves user
	approveResp, err := d.Auth().ApproveUser(t, user.GetId())
	if err != nil {
		t.Fatalf("failed to approve user: %v", err)
	}
	if approveResp.GetUser().GetStatus() != "active" {
		t.Errorf("approved user status = %s, want active", approveResp.GetUser().GetStatus())
	}

	// 4. User can now login successfully
	loginResp, err := d.Auth().LoginAs(t, email, password)
	if err != nil {
		t.Fatalf("login failed after approval: %v", err)
	}
	if loginResp.GetAccessToken() == "" {
		t.Errorf("expected non-empty access token")
	}
	if loginResp.GetRefreshToken() == "" {
		t.Errorf("expected non-empty refresh token")
	}

	// 5. Query GetCurrentUser with the new access token
	d.State().AccessToken = loginResp.GetAccessToken()
	me, err := d.Auth().GetCurrentUser(t)
	if err != nil {
		t.Fatalf("failed to get current user: %v", err)
	}
	if me.GetId() != user.GetId() {
		t.Errorf("me user ID = %s, want %s", me.GetId(), user.GetId())
	}
	if me.GetStatus() != "active" {
		t.Errorf("me status = %s, want active", me.GetStatus())
	}
}

func TestUserRegistrationAndRejection(t *testing.T) {
	d := driver.New(t, testEnv)

	nano := time.Now().UnixNano()
	email := fmt.Sprintf("rejected_%d@saturn.local", nano)
	password := "SecretPass123!"
	username := fmt.Sprintf("reject_%d", nano)

	user, err := d.Auth().RegisterUser(t, driver.RegisterUserOptions{
		Name:     "Rejected User",
		Email:    email,
		Username: username,
		Password: password,
	})
	if err != nil {
		t.Fatalf("failed to register user: %v", err)
	}

	// Admin rejects user
	rejectResp, err := d.Auth().RejectUser(t, user.GetId())
	if err != nil {
		t.Fatalf("failed to reject user: %v", err)
	}
	if rejectResp.GetUser().GetStatus() != "rejected" && rejectResp.GetUser().GetStatus() != "inactive" {
		t.Logf("rejected user status = %s", rejectResp.GetUser().GetStatus())
	}

	// Login must fail
	_, err = d.Auth().LoginAs(t, email, password)
	if err == nil {
		t.Fatalf("expected login to fail for rejected user")
	}
}

func TestAdminUserRoleUpdate(t *testing.T) {
	d := driver.New(t, testEnv)

	nano := time.Now().UnixNano()
	email := fmt.Sprintf("role_update_%d@saturn.local", nano)
	password := "SecretPass123!"
	username := fmt.Sprintf("role_%d", nano)

	user, err := d.Auth().RegisterUser(t, driver.RegisterUserOptions{
		Name:     "Role Update User",
		Email:    email,
		Username: username,
		Password: password,
	})
	if err != nil {
		t.Fatalf("failed to register user: %v", err)
	}

	_, err = d.Auth().ApproveUser(t, user.GetId())
	if err != nil {
		t.Fatalf("failed to approve user: %v", err)
	}

	// Promote user to admin
	updateResp, err := d.Auth().UpdateUserRole(t, user.GetId(), adminidentityv1.AccessLevel_ACCESS_LEVEL_ADMIN)
	if err != nil {
		t.Fatalf("failed to update user role to admin: %v", err)
	}
	if updateResp.GetUser().GetAccessLevel() != adminidentityv1.AccessLevel_ACCESS_LEVEL_ADMIN {
		t.Errorf("updated access level = %v, want ACCESS_LEVEL_ADMIN", updateResp.GetUser().GetAccessLevel())
	}

	// Login and verify access token issued
	loginResp, err := d.Auth().LoginAs(t, email, password)
	if err != nil {
		t.Fatalf("login failed: %v", err)
	}
	if loginResp.GetAccessToken() == "" {
		t.Fatalf("expected non-empty access token")
	}

	d.State().AccessToken = loginResp.GetAccessToken()
	me, err := d.Auth().GetCurrentUser(t)
	if err != nil {
		t.Fatalf("failed to get current user: %v", err)
	}
	if me.GetId() != user.GetId() {
		t.Errorf("me id = %s, want %s", me.GetId(), user.GetId())
	}
}

func TestAdminListUsersWithFiltersAndPagination(t *testing.T) {
	d := driver.New(t, testEnv)

	nano := time.Now().UnixNano()
	// User 1: will be approved
	u1, err := d.Auth().RegisterUser(t, driver.RegisterUserOptions{
		Name:     "Active User",
		Email:    fmt.Sprintf("act_%d@saturn.local", nano),
		Username: fmt.Sprintf("act_%d", nano),
		Password: "Password123!",
	})
	if err != nil {
		t.Fatalf("failed to register u1: %v", err)
	}
	if _, err := d.Auth().ApproveUser(t, u1.GetId()); err != nil {
		t.Fatalf("failed to approve u1: %v", err)
	}

	// User 2: remains pending
	u2, err := d.Auth().RegisterUser(t, driver.RegisterUserOptions{
		Name:     "Pending User",
		Email:    fmt.Sprintf("pnd_%d@saturn.local", nano),
		Username: fmt.Sprintf("pnd_%d", nano),
		Password: "Password123!",
	})
	if err != nil {
		t.Fatalf("failed to register u2: %v", err)
	}

	// 1. List with PENDING_APPROVAL filter
	pendingList, err := d.Auth().ListUsers(t, &adminidentityv1.ListUsersRequest{
		StatusFilter: adminidentityv1.ListUsersRequest_PENDING_APPROVAL,
	})
	if err != nil {
		t.Fatalf("failed to list pending users: %v", err)
	}

	foundPending := false
	for _, u := range pendingList.GetUsers() {
		if u.GetId() == u2.GetId() {
			foundPending = true
		}
		if u.GetId() == u1.GetId() {
			t.Errorf("active user %s appeared in pending users list", u1.GetId())
		}
	}
	if !foundPending {
		t.Errorf("pending user %s not found in pending list", u2.GetId())
	}

	// 2. List with ACTIVE filter
	activeList, err := d.Auth().ListUsers(t, &adminidentityv1.ListUsersRequest{
		StatusFilter: adminidentityv1.ListUsersRequest_ACTIVE,
	})
	if err != nil {
		t.Fatalf("failed to list active users: %v", err)
	}

	foundActive := false
	for _, u := range activeList.GetUsers() {
		if u.GetId() == u1.GetId() {
			foundActive = true
		}
		if u.GetId() == u2.GetId() {
			t.Errorf("pending user %s appeared in active users list", u2.GetId())
		}
	}
	if !foundActive {
		t.Errorf("active user %s not found in active list", u1.GetId())
	}

	// 3. Test pagination: page size = 1
	page1, err := d.Auth().ListUsers(t, &adminidentityv1.ListUsersRequest{
		PageSize: 1,
	})
	if err != nil {
		t.Fatalf("failed to list users with limit 1: %v", err)
	}
	if len(page1.GetUsers()) != 1 {
		t.Errorf("page 1 users count = %d, want 1", len(page1.GetUsers()))
	}
	if page1.GetNextPageToken() == "" {
		t.Errorf("expected non-empty next page token for page 1")
	}

	// Page 2
	page2, err := d.Auth().ListUsers(t, &adminidentityv1.ListUsersRequest{
		PageSize:      1,
		NextPageToken: page1.GetNextPageToken(),
	})
	if err != nil {
		t.Fatalf("failed to fetch page 2: %v", err)
	}
	if len(page2.GetUsers()) != 1 {
		t.Errorf("page 2 users count = %d, want 1", len(page2.GetUsers()))
	}
	if page2.GetUsers()[0].GetId() == page1.GetUsers()[0].GetId() {
		t.Errorf("page 2 returned duplicate user from page 1: %s", page2.GetUsers()[0].GetId())
	}
}
