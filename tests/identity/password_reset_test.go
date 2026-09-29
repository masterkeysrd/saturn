//go:build integration

package identity_test

import (
	"testing"

	"github.com/masterkeysrd/saturn/tests/driver"
)

func TestPasswordReset_FullFlow(t *testing.T) {
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

	// 2. Admin generates a password reset link and token
	resetResp, err := d.Auth().AdminResetPassword(t, userID, 15)
	if err != nil {
		t.Fatalf("AdminResetPassword failed: %v", err)
	}
	if resetResp.GetToken() == "" {
		t.Fatalf("expected non-empty reset token")
	}
	if resetResp.GetResetUrl() == "" {
		t.Fatalf("expected non-empty reset URL")
	}
	if resetResp.GetExpiresAt() == nil {
		t.Fatalf("expected non-nil expires_at timestamp")
	}

	// 3. Public endpoint validates the reset token
	valResp, err := d.Auth().ValidateResetToken(t, resetResp.GetToken())
	if err != nil {
		t.Fatalf("ValidateResetToken failed: %v", err)
	}
	if valResp.GetUsername() == "" {
		t.Errorf("expected non-empty username from ValidateResetToken")
	}

	// 4. User completes password reset with new password
	newPassword := "NewSecurePassword456!"
	_, err = d.Auth().CompleteResetPassword(t, resetResp.GetToken(), newPassword)
	if err != nil {
		t.Fatalf("CompleteResetPassword failed: %v", err)
	}

	// 5. Invariant: Old refresh token is invalidated immediately
	_, err = d.Auth().RefreshSession(t, oldRefreshToken)
	if err == nil {
		t.Errorf("expected old refresh token to be revoked after password reset, but refresh succeeded")
	}

	// 6. Invariant: Login with old password fails
	_, err = d.Auth().LoginAs(t, email, oldPassword)
	if err == nil {
		t.Errorf("expected login with old password to fail, but succeeded")
	}

	// 7. Login with new password succeeds
	loginResp, err := d.Auth().LoginAs(t, email, newPassword)
	if err != nil {
		t.Fatalf("login with new password failed: %v", err)
	}
	if loginResp.GetAccessToken() == "" {
		t.Errorf("expected non-empty access token after login")
	}
	if loginResp.GetRefreshToken() == "" {
		t.Errorf("expected non-empty refresh token after login")
	}

	// 8. Verify authenticated session functions properly
	d.State().AccessToken = loginResp.GetAccessToken()
	me, err := d.Auth().GetCurrentUser(t)
	if err != nil {
		t.Fatalf("GetCurrentUser failed with new access token: %v", err)
	}
	if me.GetId() != userID {
		t.Errorf("me.Id = %s, want %s", me.GetId(), userID)
	}
}

func TestPasswordReset_SingleUse(t *testing.T) {
	d := driver.New(t, testEnv)

	d.Auth().CreateApprovedUser(t).Login(t)
	userID := d.State().UserID

	resetResp, err := d.Auth().AdminResetPassword(t, userID, 15)
	if err != nil {
		t.Fatalf("AdminResetPassword failed: %v", err)
	}
	token := resetResp.GetToken()

	// Complete the password reset successfully
	newPassword := "PasswordAfterReset123!"
	_, err = d.Auth().CompleteResetPassword(t, token, newPassword)
	if err != nil {
		t.Fatalf("CompleteResetPassword failed: %v", err)
	}

	// Attempting to validate the already-used token must fail
	_, err = d.Auth().ValidateResetToken(t, token)
	if err == nil {
		t.Errorf("expected ValidateResetToken to fail for consumed token, but succeeded")
	}

	// Attempting to complete reset again with the consumed token must fail
	_, err = d.Auth().CompleteResetPassword(t, token, "AnotherPassword789!")
	if err == nil {
		t.Errorf("expected CompleteResetPassword to fail for consumed token, but succeeded")
	}
}

func TestPasswordReset_InvalidToken(t *testing.T) {
	d := driver.New(t, testEnv)

	bogusToken := "rst_invalid_bogus_token_12345"

	// Validate bogus token must fail
	_, err := d.Auth().ValidateResetToken(t, bogusToken)
	if err == nil {
		t.Errorf("expected ValidateResetToken to fail for bogus token, but succeeded")
	}

	// Complete reset with bogus token must fail
	_, err = d.Auth().CompleteResetPassword(t, bogusToken, "ValidPassword123!")
	if err == nil {
		t.Errorf("expected CompleteResetPassword to fail for bogus token, but succeeded")
	}
}

func TestPasswordReset_NonExistentUser(t *testing.T) {
	d := driver.New(t, testEnv)

	// Admin attempts reset for non-existent user
	_, err := d.Auth().AdminResetPassword(t, "usr_nonexistent_99999", 15)
	if err == nil {
		t.Errorf("expected AdminResetPassword to fail for non-existent user, but succeeded")
	}
}
