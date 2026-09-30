//go:build integration

package space_test

import (
	"fmt"
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/tests/driver"
)

func TestSpaceCRUDAndOptimisticLocking(t *testing.T) {
	d := driver.New(t, testEnv)

	d.Auth().
		CreateApprovedUser(t).
		Login(t)

	nano := time.Now().UnixNano()
	initialName := fmt.Sprintf("Workspace_%d", nano)
	initialDesc := "Initial workspace description"

	// 1. Create Space
	created, err := d.Space().CreateSpace(t, initialName, initialDesc)
	if err != nil {
		t.Fatalf("failed to create space: %v", err)
	}
	if created.GetName() != initialName {
		t.Errorf("created space name = %s, want %s", created.GetName(), initialName)
	}
	if created.GetDescription() != initialDesc {
		t.Errorf("created space desc = %s, want %s", created.GetDescription(), initialDesc)
	}
	if created.GetVersion() != 1 {
		t.Errorf("created space version = %d, want 1", created.GetVersion())
	}
	if created.GetOwnerId() != d.State().UserID {
		t.Errorf("created space owner_id = %s, want %s", created.GetOwnerId(), d.State().UserID)
	}

	spaceID := created.GetId()

	// 2. Get Space
	fetched, err := d.Space().GetSpace(t, spaceID)
	if err != nil {
		t.Fatalf("failed to get space: %v", err)
	}
	if fetched.GetId() != spaceID {
		t.Errorf("fetched space id = %s, want %s", fetched.GetId(), spaceID)
	}

	// 3. Partial Update with FieldMask and valid version
	updatedName := fmt.Sprintf("Renamed_Space_%d", nano)
	updatedDesc := "Updated description via patch"
	v1 := int64(1)

	updated, err := d.Space().UpdateSpace(t, spaceID, updatedName, updatedDesc, []string{"name", "description"}, &v1)
	if err != nil {
		t.Fatalf("failed to update space: %v", err)
	}
	if updated.GetName() != updatedName {
		t.Errorf("updated space name = %s, want %s", updated.GetName(), updatedName)
	}
	if updated.GetDescription() != updatedDesc {
		t.Errorf("updated space desc = %s, want %s", updated.GetDescription(), updatedDesc)
	}
	if updated.GetVersion() != 2 {
		t.Errorf("updated space version = %d, want 2", updated.GetVersion())
	}

	// 4. Stale Version CAS Conflict (version 1 against version 2)
	staleVer := int64(1)
	_, err = d.Space().UpdateSpace(t, spaceID, "Conflict_Name", "Conflict Desc", []string{"name"}, &staleVer)
	if err == nil {
		t.Fatalf("expected optimistic locking error with stale version, but succeeded")
	}

	// 5. Delete Space
	_, err = d.Space().DeleteSpace(t, spaceID)
	if err != nil {
		t.Fatalf("failed to delete space: %v", err)
	}

	// 6. Verify space is deleted
	_, err = d.Space().GetSpace(t, spaceID)
	if err == nil {
		t.Fatalf("expected space to not be found after deletion, but succeeded")
	}
}

func TestMultiTenantSpaceIsolation(t *testing.T) {
	d := driver.New(t, testEnv)

	// User A creates space
	d.Auth().
		CreateApprovedUser(t).
		Login(t)

	userASpace, err := d.Space().CreateSpace(t, "User A Secret Space", "Private data")
	if err != nil {
		t.Fatalf("user A failed to create space: %v", err)
	}

	// User B registers, approves, and logs in
	nano := time.Now().UnixNano()
	userBEmail := fmt.Sprintf("user_b_%d@saturn.local", nano)
	userBPass := "Password123!"
	uB, err := d.Auth().RegisterUser(t, driver.RegisterUserOptions{
		Name:     "User B",
		Email:    userBEmail,
		Username: fmt.Sprintf("ub_%d", nano),
		Password: userBPass,
	})
	if err != nil {
		t.Fatalf("failed to register user B: %v", err)
	}
	if _, err := d.Auth().ApproveUser(t, uB.GetId()); err != nil {
		t.Fatalf("failed to approve user B: %v", err)
	}

	loginB, err := d.Auth().LoginAs(t, userBEmail, userBPass)
	if err != nil {
		t.Fatalf("user B login failed: %v", err)
	}

	// Act as User B
	d.State().AccessToken = loginB.GetAccessToken()

	// 1. User B should NOT be able to get User A's space
	_, err = d.Space().GetSpace(t, userASpace.GetId())
	if err == nil {
		t.Fatalf("expected user B to be denied access to user A's space, but got success")
	}

	// 2. User B's ListSpaces should NOT contain User A's space
	listResp, err := d.Space().ListSpaces(t, 20, "")
	if err != nil {
		t.Fatalf("user B failed to list spaces: %v", err)
	}
	for _, sp := range listResp.GetSpaces() {
		if sp.GetId() == userASpace.GetId() {
			t.Errorf("user A space %s found in user B's spaces list", sp.GetId())
		}
	}
}

func TestSpaceSettings_Lifecycle(t *testing.T) {
	d := driver.New(t, testEnv)

	d.Auth().
		CreateApprovedUser(t).
		Login(t)

	nano := time.Now().UnixNano()
	sp, err := d.Space().CreateSpace(t, fmt.Sprintf("Settings_Space_%d", nano), "Space for settings test")
	if err != nil {
		t.Fatalf("failed to create space: %v", err)
	}
	spaceID := sp.GetId()

	// 1. Initial settings should default to "UTC"
	initialSettings, err := d.Space().GetSettings(t, spaceID)
	if err != nil {
		t.Fatalf("failed to get initial space settings: %v", err)
	}
	if initialSettings.GetTimezone() != "UTC" {
		t.Errorf("expected initial timezone UTC, got %s", initialSettings.GetTimezone())
	}
	if initialSettings.GetSpaceId() != spaceID {
		t.Errorf("expected space_id %s, got %s", spaceID, initialSettings.GetSpaceId())
	}

	// 2. Update timezone to "America/Santo_Domingo"
	v0 := initialSettings.GetVersion()
	updatedSettings, err := d.Space().UpdateSettings(t, spaceID, "America/Santo_Domingo", []string{"timezone"}, &v0)
	if err != nil {
		t.Fatalf("failed to update space settings: %v", err)
	}
	if updatedSettings.GetTimezone() != "America/Santo_Domingo" {
		t.Errorf("expected updated timezone America/Santo_Domingo, got %s", updatedSettings.GetTimezone())
	}
	if updatedSettings.GetVersion() != 1 {
		t.Errorf("expected version 1, got %d", updatedSettings.GetVersion())
	}

	// 3. Refetch to verify persistence
	refetched, err := d.Space().GetSettings(t, spaceID)
	if err != nil {
		t.Fatalf("failed to refetch space settings: %v", err)
	}
	if refetched.GetTimezone() != "America/Santo_Domingo" {
		t.Errorf("expected refetched timezone America/Santo_Domingo, got %s", refetched.GetTimezone())
	}
	if refetched.GetVersion() != 1 {
		t.Errorf("expected refetched version 1, got %d", refetched.GetVersion())
	}

	// 4. Concurrency conflict with stale version
	staleVersion := int64(99)
	_, err = d.Space().UpdateSettings(t, spaceID, "Europe/London", []string{"timezone"}, &staleVersion)
	if err == nil {
		t.Fatalf("expected conflict error with stale version, but got nil")
	}

	// 5. User B (non-member) cannot read or write settings
	userBEmail := fmt.Sprintf("userb_%d@test.com", nano)
	userBPass := "Password123!"
	uB, err := d.Auth().RegisterUser(t, driver.RegisterUserOptions{
		Name:     "User B",
		Email:    userBEmail,
		Username: fmt.Sprintf("ub_%d", nano),
		Password: userBPass,
	})
	if err != nil {
		t.Fatalf("failed to register user B: %v", err)
	}
	if _, err := d.Auth().ApproveUser(t, uB.GetId()); err != nil {
		t.Fatalf("failed to approve user B: %v", err)
	}

	loginB, err := d.Auth().LoginAs(t, userBEmail, userBPass)
	if err != nil {
		t.Fatalf("user B login failed: %v", err)
	}

	d.State().AccessToken = loginB.GetAccessToken()

	_, err = d.Space().GetSettings(t, spaceID)
	if err == nil {
		t.Fatalf("expected user B to be denied getting space settings, but got success")
	}

	_, err = d.Space().UpdateSettings(t, spaceID, "Asia/Tokyo", []string{"timezone"}, nil)
	if err == nil {
		t.Fatalf("expected user B to be denied updating space settings, but got success")
	}
}
