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
