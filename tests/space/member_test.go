package space_test

import (
	"fmt"
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/tests/driver"
)

func TestSpaceMemberLifecycleAndRoles(t *testing.T) {
	d := driver.New(t, testEnv)

	// User A (Owner) registers and creates space
	d.Auth().
		CreateApprovedUser(t).
		Login(t)

	ownerID := d.State().UserID
	space, err := d.Space().CreateSpace(t, "Team Space", "Collaborative space")
	if err != nil {
		t.Fatalf("failed to create space: %v", err)
	}
	spaceID := space.GetId()

	// User B registers & gets approved
	nano := time.Now().UnixNano()
	userBEmail := fmt.Sprintf("teammate_%d@saturn.local", nano)
	userBPass := "Password123!"
	uB, err := d.Auth().RegisterUser(t, driver.RegisterUserOptions{
		Name:     "Teammate Bob",
		Email:    userBEmail,
		Username: fmt.Sprintf("bob_%d", nano),
		Password: userBPass,
	})
	if err != nil {
		t.Fatalf("failed to register teammate: %v", err)
	}
	if _, err := d.Auth().ApproveUser(t, uB.GetId()); err != nil {
		t.Fatalf("failed to approve teammate: %v", err)
	}
	userBID := uB.GetId()

	// 1. User A adds User B as member
	member, err := d.Space().AddSpaceMember(t, spaceID, userBID, "member")
	if err != nil {
		t.Fatalf("failed to add member: %v", err)
	}
	if member.GetRole() != "member" {
		t.Errorf("member role = %s, want member", member.GetRole())
	}
	if member.GetUserId() != userBID {
		t.Errorf("member user_id = %s, want %s", member.GetUserId(), userBID)
	}

	// 2. Login as User B and verify workspace is accessible and listed
	loginB, err := d.Auth().LoginAs(t, userBEmail, userBPass)
	if err != nil {
		t.Fatalf("failed to login as teammate: %v", err)
	}
	d.State().AccessToken = loginB.GetAccessToken()

	spB, err := d.Space().GetSpace(t, spaceID)
	if err != nil {
		t.Fatalf("teammate should be able to get space: %v", err)
	}
	if spB.GetId() != spaceID {
		t.Errorf("got space id = %s, want %s", spB.GetId(), spaceID)
	}

	// 3. User A updates User B role to admin
	d.Auth().Login(t) // switch back to Owner
	updatedMember, err := d.Space().UpdateSpaceMemberRole(t, spaceID, userBID, "admin")
	if err != nil {
		t.Fatalf("failed to update member role: %v", err)
	}
	if updatedMember.GetRole() != "admin" {
		t.Errorf("updated member role = %s, want admin", updatedMember.GetRole())
	}

	// 4. Verify member profile hydration in ListSpaceMembers
	membersList, err := d.Space().ListSpaceMembers(t, spaceID, 10, "")
	if err != nil {
		t.Fatalf("failed to list space members: %v", err)
	}
	if len(membersList.GetMembers()) < 2 {
		t.Fatalf("expected at least 2 members (owner + teammate), got %d", len(membersList.GetMembers()))
	}

	var foundBob bool
	for _, m := range membersList.GetMembers() {
		if m.GetUserId() == userBID {
			foundBob = true
			if m.GetRole() != "admin" {
				t.Errorf("Bob's role in list = %s, want admin", m.GetRole())
			}
			if m.GetProfile() == nil || m.GetProfile().GetName() != "Teammate Bob" {
				t.Errorf("Bob's profile not hydrated properly: %+v", m.GetProfile())
			}
		}
	}
	if !foundBob {
		t.Errorf("teammate Bob not found in member list")
	}

	// 5. User A removes User B from space
	_, err = d.Space().RemoveSpaceMember(t, spaceID, userBID)
	if err != nil {
		t.Fatalf("failed to remove space member: %v", err)
	}

	// 6. User B should no longer be able to access space
	d.State().AccessToken = loginB.GetAccessToken()
	_, err = d.Space().GetSpace(t, spaceID)
	if err == nil {
		t.Fatalf("removed member should not have access to space")
	}

	_ = ownerID
}

func TestSpaceOwnerProtectionGuards(t *testing.T) {
	d := driver.New(t, testEnv)

	d.Auth().
		CreateApprovedUser(t).
		Login(t)

	ownerID := d.State().UserID
	space, err := d.Space().CreateSpace(t, "Owner Protected Space", "Owner security tests")
	if err != nil {
		t.Fatalf("failed to create space: %v", err)
	}
	spaceID := space.GetId()

	// 1. Owner cannot demote self
	_, err = d.Space().UpdateSpaceMemberRole(t, spaceID, ownerID, "member")
	if err == nil {
		t.Fatalf("expected owner demotion to fail, but succeeded")
	}

	// 2. Owner cannot remove self from workspace
	_, err = d.Space().RemoveSpaceMember(t, spaceID, ownerID)
	if err == nil {
		t.Fatalf("expected owner removal to fail, but succeeded")
	}
}

func TestMemberListPagination(t *testing.T) {
	d := driver.New(t, testEnv)

	d.Auth().
		CreateApprovedUser(t).
		Login(t)

	space, err := d.Space().CreateSpace(t, "Pagination Space", "Testing member pagination")
	if err != nil {
		t.Fatalf("failed to create space: %v", err)
	}
	spaceID := space.GetId()

	// Add 2 additional members (total 3: owner + 2 members)
	for i := 1; i <= 2; i++ {
		nano := time.Now().UnixNano()
		u, err := d.Auth().RegisterUser(t, driver.RegisterUserOptions{
			Name:     fmt.Sprintf("Member %d", i),
			Email:    fmt.Sprintf("m%d_%d@saturn.local", i, nano),
			Username: fmt.Sprintf("m%d_%d", i, nano),
			Password: "Password123!",
		})
		if err != nil {
			t.Fatalf("failed to register member %d: %v", i, err)
		}
		if _, err := d.Auth().ApproveUser(t, u.GetId()); err != nil {
			t.Fatalf("failed to approve member %d: %v", i, err)
		}
		if _, err := d.Space().AddSpaceMember(t, spaceID, u.GetId(), "member"); err != nil {
			t.Fatalf("failed to add member %d to space: %v", i, err)
		}
	}

	// Page 1 with limit = 1
	page1, err := d.Space().ListSpaceMembers(t, spaceID, 1, "")
	if err != nil {
		t.Fatalf("failed to list page 1: %v", err)
	}
	if len(page1.GetMembers()) != 1 {
		t.Errorf("page 1 count = %d, want 1", len(page1.GetMembers()))
	}
	if page1.GetNextPageToken() == "" {
		t.Fatalf("expected non-empty next page token for page 1")
	}

	// Page 2
	page2, err := d.Space().ListSpaceMembers(t, spaceID, 1, page1.GetNextPageToken())
	if err != nil {
		t.Fatalf("failed to list page 2: %v", err)
	}
	if len(page2.GetMembers()) != 1 {
		t.Errorf("page 2 count = %d, want 1", len(page2.GetMembers()))
	}
	if page2.GetMembers()[0].GetUserId() == page1.GetMembers()[0].GetUserId() {
		t.Errorf("page 2 returned same member as page 1: %s", page2.GetMembers()[0].GetUserId())
	}
}
