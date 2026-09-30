//go:build integration

package identity_test

import (
	"testing"

	"github.com/masterkeysrd/saturn/tests/driver"
)

func TestPasswordChange_Success(t *testing.T) {
	d := driver.New(t, testEnv)

	// 1. Register, approve, and log in user
	d.Auth().CreateApprovedUser(t).Login(t)

	userID := d.State().UserID
	email := d.State().UserEmail
	oldPassword := d.State().UserPassword
	oldRefreshToken := d.State().RefreshToken

	if userID == "" || oldRefreshToken == "" {
		t.Fatalf("expected active user session with ID and refresh token")
	}

	newPassword := "NewChangedPassword789!"

	// 2. Change password
	resp, err := d.Auth().ChangePassword(t, oldPassword, newPassword, "", true)
	if err != nil {
		t.Fatalf("ChangePassword failed: %v", err)
	}
	if resp.GetAccessToken() == "" {
		t.Errorf("expected non-empty access token")
	}
	if resp.GetRefreshToken() == "" {
		t.Errorf("expected non-empty refresh token")
	}

	// 3. Invariant: Old refresh token is invalidated immediately
	_, err = d.Auth().RefreshSession(t, oldRefreshToken)
	if err == nil {
		t.Errorf("expected old refresh token to be revoked after password change, but refresh succeeded")
	}

	// 4. Invariant: Login with old password fails
	_, err = d.Auth().LoginAs(t, email, oldPassword)
	if err == nil {
		t.Errorf("expected login with old password to fail, but succeeded")
	}

	// 5. Login with new password succeeds
	loginResp, err := d.Auth().LoginAs(t, email, newPassword)
	if err != nil {
		t.Fatalf("login with new password failed: %v", err)
	}
	if loginResp.GetAccessToken() == "" {
		t.Errorf("expected non-empty access token after login")
	}

	// 6. Verify authenticated session functions properly with token from ChangePassword
	me, err := d.Auth().GetCurrentUser(t)
	if err != nil {
		t.Fatalf("GetCurrentUser failed with new access token: %v", err)
	}
	if me.GetId() != userID {
		t.Errorf("me.Id = %s, want %s", me.GetId(), userID)
	}
}

func TestPasswordChange_InvalidCurrentPassword(t *testing.T) {
	d := driver.New(t, testEnv)

	d.Auth().CreateApprovedUser(t).Login(t)

	_, err := d.Auth().ChangePassword(t, "IncorrectOldPassword!", "BrandNewPassword123!", "", true)
	if err == nil {
		t.Errorf("expected ChangePassword with wrong current password to fail, but succeeded")
	}
}

func TestPasswordChange_SamePassword(t *testing.T) {
	d := driver.New(t, testEnv)

	d.Auth().CreateApprovedUser(t).Login(t)
	currPassword := d.State().UserPassword

	_, err := d.Auth().ChangePassword(t, currPassword, currPassword, "", true)
	if err == nil {
		t.Errorf("expected ChangePassword with identical new password to fail, but succeeded")
	}
}

func TestPasswordChange_MFA(t *testing.T) {
	d := driver.New(t, testEnv)

	d.Auth().CreateApprovedUser(t).Login(t)
	oldPassword := d.State().UserPassword

	// 1. Enroll TOTP factor
	_, secret, _ := d.Auth().EnrollTOTP(t)

	newPassword := "MfaUpdatedPassword999!"

	// 2. Change password without TOTP code must fail
	_, err := d.Auth().ChangePassword(t, oldPassword, newPassword, "", true)
	if err == nil {
		t.Errorf("expected ChangePassword without TOTP code to fail when MFA is enabled, but succeeded")
	}

	// 3. Change password with invalid TOTP code must fail
	_, err = d.Auth().ChangePassword(t, oldPassword, newPassword, "000000", true)
	if err == nil {
		t.Errorf("expected ChangePassword with invalid TOTP code to fail, but succeeded")
	}

	// 4. Change password with valid TOTP code succeeds
	validCode := driver.GenerateTestTOTP(t, secret)
	resp, err := d.Auth().ChangePassword(t, oldPassword, newPassword, validCode, true)
	if err != nil {
		t.Fatalf("ChangePassword with valid TOTP failed: %v", err)
	}
	if resp.GetAccessToken() == "" || resp.GetRefreshToken() == "" {
		t.Errorf("expected non-empty tokens in response: %+v", resp)
	}

	// 5. Invariant: Current user can still be fetched
	me, err := d.Auth().GetCurrentUser(t)
	if err != nil {
		t.Fatalf("GetCurrentUser failed after password change: %v", err)
	}
	if me.GetId() != d.State().UserID {
		t.Errorf("me.Id = %s, want %s", me.GetId(), d.State().UserID)
	}
}
