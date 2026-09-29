//go:build integration

package identity_test

import (
	"strings"
	"testing"

	"github.com/masterkeysrd/saturn/tests/driver"
)

func TestMFA_EnrollmentAndLifecycle(t *testing.T) {
	d := driver.New(t, testEnv)
	d.Auth().CreateApprovedUser(t).Login(t)

	// 1. Initial MFA factor list should be empty
	initialFactors, err := d.Auth().ListMFAFactors(t)
	if err != nil {
		t.Fatalf("ListMFAFactors failed: %v", err)
	}
	if len(initialFactors.GetFactors()) != 0 {
		t.Errorf("expected 0 factors, got %d", len(initialFactors.GetFactors()))
	}
	if initialFactors.GetHasBackupCodes() {
		t.Errorf("expected has_backup_codes = false")
	}

	// 2. Initiate TOTP setup
	setupResp, err := d.Auth().SetupTOTP(t)
	if err != nil {
		t.Fatalf("SetupTOTP failed: %v", err)
	}
	if setupResp.GetFactorId() == "" {
		t.Errorf("expected non-empty factorId")
	}
	if setupResp.GetSecret() == "" {
		t.Errorf("expected non-empty secret")
	}
	if !strings.HasPrefix(setupResp.GetOtpauthUri(), "otpauth://totp/") {
		t.Errorf("invalid otpauth uri: %s", setupResp.GetOtpauthUri())
	}
	if !strings.Contains(setupResp.GetQrCodeSvg(), "<svg") {
		t.Errorf("expected SVG qr code, got %s", setupResp.GetQrCodeSvg())
	}

	// 3. Attempt confirmation with invalid code (must fail)
	_, err = d.Auth().ConfirmTOTP(t, setupResp.GetFactorId(), "000000")
	if err == nil {
		t.Fatalf("expected ConfirmTOTP with invalid code to fail, but succeeded")
	}

	// 4. Confirm with valid code generated from secret
	validCode := driver.GenerateTestTOTP(t, setupResp.GetSecret())
	confirmResp, err := d.Auth().ConfirmTOTP(t, setupResp.GetFactorId(), validCode)
	if err != nil {
		t.Fatalf("ConfirmTOTP failed with valid code: %v", err)
	}

	// 5. Verify 8 backup codes were returned
	backupCodes := confirmResp.GetBackupCodes()
	if len(backupCodes) != 8 {
		t.Errorf("expected 8 backup codes, got %d", len(backupCodes))
	}
	for _, code := range backupCodes {
		if len(code) != 9 || code[4] != '-' {
			t.Errorf("unexpected backup code format: %q (want XXXX-XXXX)", code)
		}
	}

	// 6. List factors now verifies TOTP is active with backup codes
	listed, err := d.Auth().ListMFAFactors(t)
	if err != nil {
		t.Fatalf("ListMFAFactors failed: %v", err)
	}
	if len(listed.GetFactors()) != 1 {
		t.Fatalf("expected 1 factor, got %d", len(listed.GetFactors()))
	}
	factor := listed.GetFactors()[0]
	if factor.GetFactorId() != setupResp.GetFactorId() {
		t.Errorf("factor id = %s, want %s", factor.GetFactorId(), setupResp.GetFactorId())
	}
	if factor.GetType() != "totp" {
		t.Errorf("factor type = %s, want totp", factor.GetType())
	}
	if !factor.GetIsPrimary() {
		t.Errorf("expected first factor to be primary")
	}
	if !listed.GetHasBackupCodes() {
		t.Errorf("expected has_backup_codes = true")
	}
	if listed.GetRemainingBackupCodes() != 8 {
		t.Errorf("remaining backup codes = %d, want 8", listed.GetRemainingBackupCodes())
	}

	// 7. Delete factor
	err = d.Auth().DeleteMFAFactor(t, setupResp.GetFactorId())
	if err != nil {
		t.Fatalf("DeleteMFAFactor failed: %v", err)
	}

	// 8. Verify factors are now empty
	postDelete, err := d.Auth().ListMFAFactors(t)
	if err != nil {
		t.Fatalf("ListMFAFactors failed after deletion: %v", err)
	}
	if len(postDelete.GetFactors()) != 0 {
		t.Errorf("expected 0 factors after deletion, got %d", len(postDelete.GetFactors()))
	}
}

func TestMFA_LoginWithTOTP(t *testing.T) {
	d := driver.New(t, testEnv)
	d.Auth().CreateApprovedUser(t).Login(t)

	userEmail := d.State().UserEmail
	userPassword := d.State().UserPassword

	// 1. Enroll TOTP
	factorID, secret, _ := d.Auth().EnrollTOTP(t)

	// 2. Clear state token to simulate fresh unauthenticated client
	d.State().AccessToken = ""
	d.State().RefreshToken = ""

	// 3. Step 1: Login with username/password returns MFA ticket challenge
	step1Resp, err := d.Auth().LoginAs(t, userEmail, userPassword)
	if err != nil {
		t.Fatalf("Step 1 login failed: %v", err)
	}
	if step1Resp.GetAccessToken() != "" {
		t.Fatalf("expected empty access token on step 1 MFA challenge")
	}
	if step1Resp.GetMfa() == nil || step1Resp.GetMfa().GetTicket() == "" {
		t.Fatalf("expected non-empty MFA challenge ticket")
	}

	ticket := step1Resp.GetMfa().GetTicket()
	factors := step1Resp.GetMfa().GetAvailableFactors()
	if len(factors) == 0 {
		t.Fatalf("expected available MFA factors in challenge")
	}

	// 4. Attempt Step 2 with incorrect TOTP code (must fail)
	_, err = d.Auth().LoginWithTOTP(t, ticket, factorID, "000000")
	if err == nil {
		t.Fatalf("expected Step 2 login with invalid TOTP to fail, but succeeded")
	}

	// 5. Submit valid TOTP code
	validCode := driver.GenerateTestTOTP(t, secret)
	step2Resp, err := d.Auth().LoginWithTOTP(t, ticket, factorID, validCode)
	if err != nil {
		t.Fatalf("Step 2 login failed: %v", err)
	}
	if step2Resp.GetAccessToken() == "" {
		t.Errorf("expected valid access token after Step 2 MFA")
	}
	if step2Resp.GetRefreshToken() == "" {
		t.Errorf("expected valid refresh token after Step 2 MFA")
	}

	// 6. Verify authenticated session can access protected user endpoint
	d.State().AccessToken = step2Resp.GetAccessToken()
	me, err := d.Auth().GetCurrentUser(t)
	if err != nil {
		t.Fatalf("GetCurrentUser failed with MFA session: %v", err)
	}
	if me.GetEmail() != userEmail {
		t.Errorf("user email = %s, want %s", me.GetEmail(), userEmail)
	}
}

func TestMFA_LoginWithRecoveryBackupCodes(t *testing.T) {
	d := driver.New(t, testEnv)
	d.Auth().CreateApprovedUser(t).Login(t)

	userEmail := d.State().UserEmail
	userPassword := d.State().UserPassword

	// 1. Enroll TOTP and obtain the 8 recovery backup codes
	_, _, backupCodes := d.Auth().EnrollTOTP(t)
	if len(backupCodes) != 8 {
		t.Fatalf("expected 8 backup codes, got %d", len(backupCodes))
	}

	// Verify remaining count starts at 8
	factors, err := d.Auth().ListMFAFactors(t)
	if err != nil {
		t.Fatalf("ListMFAFactors failed: %v", err)
	}
	if factors.GetRemainingBackupCodes() != 8 {
		t.Errorf("remaining backup codes = %d, want 8", factors.GetRemainingBackupCodes())
	}

	// 2. Step 1: Login with password
	step1Resp, err := d.Auth().LoginAs(t, userEmail, userPassword)
	if err != nil {
		t.Fatalf("Step 1 login failed: %v", err)
	}
	ticket := step1Resp.GetMfa().GetTicket()

	// 3. Attempt Step 2 with invalid backup code (must fail)
	_, err = d.Auth().LoginWithBackupCode(t, ticket, "INVALID-CODE")
	if err == nil {
		t.Fatalf("expected Step 2 login with invalid backup code to fail")
	}

	// 4. Use first backup code (code[0]) to authenticate
	code1 := backupCodes[0]
	step2Resp, err := d.Auth().LoginWithBackupCode(t, ticket, code1)
	if err != nil {
		t.Fatalf("Step 2 login with backup code %s failed: %v", code1, err)
	}
	if step2Resp.GetAccessToken() == "" {
		t.Fatalf("expected non-empty access token")
	}

	// 5. Verify remaining backup code count decremented to 7
	d.State().AccessToken = step2Resp.GetAccessToken()
	factors, err = d.Auth().ListMFAFactors(t)
	if err != nil {
		t.Fatalf("ListMFAFactors failed: %v", err)
	}
	if factors.GetRemainingBackupCodes() != 7 {
		t.Errorf("remaining backup codes = %d, want 7", factors.GetRemainingBackupCodes())
	}

	// 6. Test Single-Use: Attempting to use the SAME backup code again MUST fail
	step1Second, err := d.Auth().LoginAs(t, userEmail, userPassword)
	if err != nil {
		t.Fatalf("second login step 1 failed: %v", err)
	}
	ticketSecond := step1Second.GetMfa().GetTicket()

	_, err = d.Auth().LoginWithBackupCode(t, ticketSecond, code1)
	if err == nil {
		t.Fatalf("expected re-using consumed backup code %s to fail, but succeeded", code1)
	}

	// 7. Consume a second backup code (code[1]) -> should succeed
	code2 := backupCodes[1]
	step2Second, err := d.Auth().LoginWithBackupCode(t, ticketSecond, code2)
	if err != nil {
		t.Fatalf("login with second backup code %s failed: %v", code2, err)
	}
	if step2Second.GetAccessToken() == "" {
		t.Fatalf("expected non-empty access token")
	}

	// 8. Verify remaining backup code count decremented to 6
	d.State().AccessToken = step2Second.GetAccessToken()
	factors, err = d.Auth().ListMFAFactors(t)
	if err != nil {
		t.Fatalf("ListMFAFactors failed: %v", err)
	}
	if factors.GetRemainingBackupCodes() != 6 {
		t.Errorf("remaining backup codes = %d, want 6", factors.GetRemainingBackupCodes())
	}
}

func TestMFA_RegenerateBackupCodes(t *testing.T) {
	d := driver.New(t, testEnv)
	d.Auth().CreateApprovedUser(t).Login(t)

	userEmail := d.State().UserEmail
	userPassword := d.State().UserPassword

	// 1. Enroll TOTP
	_, secret, oldBackupCodes := d.Auth().EnrollTOTP(t)

	// 2. Attempt regeneration with invalid verification code (must fail)
	_, err := d.Auth().RegenerateBackupCodes(t, "000000")
	if err == nil {
		t.Fatalf("expected RegenerateBackupCodes with invalid code to fail")
	}

	// 3. Regenerate with valid current TOTP code
	currentCode := driver.GenerateTestTOTP(t, secret)
	regenResp, err := d.Auth().RegenerateBackupCodes(t, currentCode)
	if err != nil {
		t.Fatalf("RegenerateBackupCodes failed: %v", err)
	}
	newBackupCodes := regenResp.GetBackupCodes()
	if len(newBackupCodes) != 8 {
		t.Fatalf("expected 8 regenerated backup codes, got %d", len(newBackupCodes))
	}

	// 4. Verify count is reset back to 8
	factors, err := d.Auth().ListMFAFactors(t)
	if err != nil {
		t.Fatalf("ListMFAFactors failed: %v", err)
	}
	if factors.GetRemainingBackupCodes() != 8 {
		t.Errorf("remaining backup codes = %d, want 8", factors.GetRemainingBackupCodes())
	}

	// 5. Old backup code should NO longer work
	step1, err := d.Auth().LoginAs(t, userEmail, userPassword)
	if err != nil {
		t.Fatalf("Step 1 login failed: %v", err)
	}
	ticket := step1.GetMfa().GetTicket()

	_, err = d.Auth().LoginWithBackupCode(t, ticket, oldBackupCodes[0])
	if err == nil {
		t.Fatalf("expected old backup code to be invalidated after regeneration")
	}

	// 6. New backup code should work
	step2, err := d.Auth().LoginWithBackupCode(t, ticket, newBackupCodes[0])
	if err != nil {
		t.Fatalf("login with new regenerated backup code failed: %v", err)
	}
	if step2.GetAccessToken() == "" {
		t.Errorf("expected non-empty access token")
	}
}
