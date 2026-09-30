//go:build integration

package identity_test

import (
	"fmt"
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/tests/driver"
)

func TestProfile_UpdateNameAndAvatar(t *testing.T) {
	d := driver.New(t, testEnv)

	// 1. Register, approve, and log in user
	d.Auth().CreateApprovedUser(t).Login(t)
	userID := d.State().UserID

	newName := "Updated Display Name"
	newAvatar := "https://example.com/avatar_new.png"

	// 2. Update both name and avatar
	updatedUser, err := d.Auth().UpdateProfile(t, &newName, &newAvatar)
	if err != nil {
		t.Fatalf("UpdateProfile failed: %v", err)
	}
	if updatedUser.GetName() != newName {
		t.Errorf("updated name = %q, want %q", updatedUser.GetName(), newName)
	}
	if updatedUser.GetAvatarUrl() != newAvatar {
		t.Errorf("updated avatar_url = %q, want %q", updatedUser.GetAvatarUrl(), newAvatar)
	}

	// 3. Verify persistence via GetCurrentUser
	me, err := d.Auth().GetCurrentUser(t)
	if err != nil {
		t.Fatalf("GetCurrentUser failed: %v", err)
	}
	if me.GetId() != userID {
		t.Errorf("me.Id = %s, want %s", me.GetId(), userID)
	}
	if me.GetName() != newName {
		t.Errorf("me.Name = %q, want %q", me.GetName(), newName)
	}
	if me.GetAvatarUrl() != newAvatar {
		t.Errorf("me.AvatarUrl = %q, want %q", me.GetAvatarUrl(), newAvatar)
	}

	// 4. Update only name (nil avatar should preserve existing avatar)
	anotherName := "Second Updated Name"
	updatedUser2, err := d.Auth().UpdateProfile(t, &anotherName, nil)
	if err != nil {
		t.Fatalf("UpdateProfile name-only failed: %v", err)
	}
	if updatedUser2.GetName() != anotherName {
		t.Errorf("name = %q, want %q", updatedUser2.GetName(), anotherName)
	}
	if updatedUser2.GetAvatarUrl() != newAvatar {
		t.Errorf("avatar_url = %q, want %q", updatedUser2.GetAvatarUrl(), newAvatar)
	}
}

func TestProfile_ChangeEmail_Success(t *testing.T) {
	d := driver.New(t, testEnv)

	d.Auth().CreateApprovedUser(t).Login(t)

	oldEmail := d.State().UserEmail
	password := d.State().UserPassword
	newEmail := fmt.Sprintf("changed_%d@saturn.local", time.Now().UnixNano())

	// 1. Change email successfully with valid password
	updatedUser, err := d.Auth().ChangeEmail(t, newEmail, password, "")
	if err != nil {
		t.Fatalf("ChangeEmail failed: %v", err)
	}
	if updatedUser.GetEmail() != newEmail {
		t.Errorf("updated user email = %q, want %q", updatedUser.GetEmail(), newEmail)
	}

	// 2. Verify GetCurrentUser returns new email
	me, err := d.Auth().GetCurrentUser(t)
	if err != nil {
		t.Fatalf("GetCurrentUser failed: %v", err)
	}
	if me.GetEmail() != newEmail {
		t.Errorf("me.Email = %q, want %q", me.GetEmail(), newEmail)
	}

	// 3. Login with old email fails
	_, err = d.Auth().LoginAs(t, oldEmail, password)
	if err == nil {
		t.Errorf("expected login with old email %q to fail, but succeeded", oldEmail)
	}

	// 4. Login with new email succeeds
	loginResp, err := d.Auth().LoginAs(t, newEmail, password)
	if err != nil {
		t.Fatalf("login with new email failed: %v", err)
	}
	if loginResp.GetAccessToken() == "" {
		t.Errorf("expected non-empty access token after login with new email")
	}
}

func TestProfile_ChangeEmail_WrongPassword(t *testing.T) {
	d := driver.New(t, testEnv)

	d.Auth().CreateApprovedUser(t).Login(t)

	newEmail := fmt.Sprintf("invalid_pass_%d@saturn.local", time.Now().UnixNano())

	// Attempt changing email with incorrect password
	_, err := d.Auth().ChangeEmail(t, newEmail, "IncorrectPassword!", "")
	if err == nil {
		t.Errorf("expected ChangeEmail with wrong password to fail, but succeeded")
	}
}

func TestProfile_ChangeEmail_WithMFA(t *testing.T) {
	d := driver.New(t, testEnv)

	d.Auth().CreateApprovedUser(t).Login(t)

	password := d.State().UserPassword
	newEmail := fmt.Sprintf("mfa_email_%d@saturn.local", time.Now().UnixNano())

	// 1. Enroll TOTP factor
	_, secret, _ := d.Auth().EnrollTOTP(t)

	// 2. Change email without TOTP code must fail
	_, err := d.Auth().ChangeEmail(t, newEmail, password, "")
	if err == nil {
		t.Errorf("expected ChangeEmail without TOTP code to fail when MFA is enabled, but succeeded")
	}

	// 3. Change email with invalid TOTP code must fail
	_, err = d.Auth().ChangeEmail(t, newEmail, password, "000000")
	if err == nil {
		t.Errorf("expected ChangeEmail with invalid TOTP code to fail, but succeeded")
	}

	// 4. Change email with valid TOTP code succeeds
	validCode := driver.GenerateTestTOTP(t, secret)
	updatedUser, err := d.Auth().ChangeEmail(t, newEmail, password, validCode)
	if err != nil {
		t.Fatalf("ChangeEmail with valid TOTP failed: %v", err)
	}
	if updatedUser.GetEmail() != newEmail {
		t.Errorf("updated email = %q, want %q", updatedUser.GetEmail(), newEmail)
	}

	// 5. Login with new email triggers Step 2 MFA and completes successfully
	loginResp, err := d.Auth().LoginAs(t, newEmail, password)
	if err != nil {
		t.Fatalf("login step 1 failed: %v", err)
	}
	if loginResp.GetMfa() == nil || loginResp.GetMfa().GetTicket() == "" {
		t.Fatalf("expected MFA ticket in response for MFA-enabled user")
	}

	newCode := driver.GenerateTestTOTP(t, secret)
	mfaFactorID := loginResp.GetMfa().GetAvailableFactors()[0].GetFactorId()
	mfaLoginResp, err := d.Auth().LoginWithTOTP(t, loginResp.GetMfa().GetTicket(), mfaFactorID, newCode)
	if err != nil {
		t.Fatalf("login step 2 with TOTP failed: %v", err)
	}
	if mfaLoginResp.GetAccessToken() == "" {
		t.Errorf("expected non-empty access token after MFA login")
	}
}

func TestProfile_DeleteAccount(t *testing.T) {
	d := driver.New(t, testEnv)

	d.Auth().CreateApprovedUser(t).Login(t)

	email := d.State().UserEmail
	password := d.State().UserPassword
	oldRefreshToken := d.State().RefreshToken

	// 1. Attempt DeleteAccount with wrong password must fail
	_, err := d.Auth().DeleteAccount(t, "WrongPassword!", "")
	if err == nil {
		t.Errorf("expected DeleteAccount with wrong password to fail, but succeeded")
	}

	// 2. DeleteAccount with correct password succeeds
	_, err = d.Auth().DeleteAccount(t, password, "")
	if err != nil {
		t.Fatalf("DeleteAccount failed: %v", err)
	}

	// 3. Login with credentials must now fail (account deleted/inactive)
	_, err = d.Auth().LoginAs(t, email, password)
	if err == nil {
		t.Errorf("expected login to fail after account deletion, but succeeded")
	}

	// 4. Using old refresh token must fail
	_, err = d.Auth().RefreshSession(t, oldRefreshToken)
	if err == nil {
		t.Errorf("expected refresh session to fail after account deletion, but succeeded")
	}
}
