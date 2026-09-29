//go:build integration

package identity_test

import (
	"testing"

	identityv1 "github.com/masterkeysrd/saturn/apis/saturn/identity/v1"
	"github.com/masterkeysrd/saturn/tests/driver"
)

func TestDevice_RegistrationWithoutMFA(t *testing.T) {
	d := driver.New(t, testEnv)
	d.Auth().CreateApprovedUser(t).Login(t)

	// 1. Initial devices list should be empty
	initDevices, err := d.Auth().ListDevices(t)
	if err != nil {
		t.Fatalf("ListDevices failed: %v", err)
	}
	if len(initDevices.GetDevices()) != 0 {
		t.Errorf("expected 0 devices initially, got %d", len(initDevices.GetDevices()))
	}

	// 2. Obtain challenge nonce
	challengeResp, err := d.Auth().CreateAuthChallenge(t)
	if err != nil {
		t.Fatalf("CreateAuthChallenge failed: %v", err)
	}
	challenge := challengeResp.GetChallenge()
	if challenge == "" {
		t.Fatalf("expected non-empty challenge string")
	}

	// 3. Generate keypair and sign challenge
	pubBytes, signFn := driver.GenerateTestDeviceKeypair(t)
	sig := signFn(challenge)

	// 4. Register device (without MFA, totpCode is empty)
	createdDev, err := d.Auth().CreateDevice(t, &identityv1.Device{
		DeviceName: "Test iPhone 16",
		Algorithm:  "ES256",
		PublicKey:  pubBytes,
		Challenge:  challenge,
		Signature:  sig,
		TotpCode:   "",
	})
	if err != nil {
		t.Fatalf("CreateDevice failed: %v", err)
	}

	if createdDev.GetId() == "" {
		t.Errorf("expected non-empty device id")
	}
	if createdDev.GetDeviceName() != "Test iPhone 16" {
		t.Errorf("device name = %s, want Test iPhone 16", createdDev.GetDeviceName())
	}
	if createdDev.GetAlgorithm() != "ES256" {
		t.Errorf("device algorithm = %s, want ES256", createdDev.GetAlgorithm())
	}

	// 5. Query ListDevices and verify registered device is present
	listed, err := d.Auth().ListDevices(t)
	if err != nil {
		t.Fatalf("ListDevices failed after creation: %v", err)
	}
	if len(listed.GetDevices()) != 1 {
		t.Fatalf("expected 1 registered device, got %d", len(listed.GetDevices()))
	}
	if listed.GetDevices()[0].GetId() != createdDev.GetId() {
		t.Errorf("listed device ID = %s, want %s", listed.GetDevices()[0].GetId(), createdDev.GetId())
	}
}

func TestDevice_MFAEnforcementAndStepUp(t *testing.T) {
	d := driver.New(t, testEnv)
	d.Auth().CreateApprovedUser(t).Login(t)

	// 1. Enroll TOTP factor so the user has active MFA
	_, secret, _ := d.Auth().EnrollTOTP(t)

	// 2. Generate keypair and get challenge
	pubBytes, signFn := driver.GenerateTestDeviceKeypair(t)

	challengeResp1, err := d.Auth().CreateAuthChallenge(t)
	if err != nil {
		t.Fatalf("CreateAuthChallenge failed: %v", err)
	}
	sig1 := signFn(challengeResp1.GetChallenge())

	// 3. ATTEMPT A: Register device WITHOUT TOTP code when MFA is active -> MUST FAIL
	_, err = d.Auth().CreateDevice(t, &identityv1.Device{
		DeviceName: "MFA Enforced Device",
		Algorithm:  "ES256",
		PublicKey:  pubBytes,
		Challenge:  challengeResp1.GetChallenge(),
		Signature:  sig1,
		TotpCode:   "",
	})
	if err == nil {
		t.Fatalf("expected CreateDevice to fail when user has active MFA and no TOTP is provided")
	}

	// 4. ATTEMPT B: Register device with INVALID TOTP code -> MUST FAIL
	challengeResp2, err := d.Auth().CreateAuthChallenge(t)
	if err != nil {
		t.Fatalf("CreateAuthChallenge failed: %v", err)
	}
	sig2 := signFn(challengeResp2.GetChallenge())

	_, err = d.Auth().CreateDevice(t, &identityv1.Device{
		DeviceName: "MFA Enforced Device",
		Algorithm:  "ES256",
		PublicKey:  pubBytes,
		Challenge:  challengeResp2.GetChallenge(),
		Signature:  sig2,
		TotpCode:   "000000",
	})
	if err == nil {
		t.Fatalf("expected CreateDevice with invalid TOTP code to fail")
	}

	// 5. ATTEMPT C: Register device with VALID TOTP code -> MUST SUCCEED
	challengeResp3, err := d.Auth().CreateAuthChallenge(t)
	if err != nil {
		t.Fatalf("CreateAuthChallenge failed: %v", err)
	}
	sig3 := signFn(challengeResp3.GetChallenge())

	validTotp := driver.GenerateTestTOTP(t, secret)
	createdDev, err := d.Auth().CreateDevice(t, &identityv1.Device{
		DeviceName: "MFA Enforced Device",
		Algorithm:  "ES256",
		PublicKey:  pubBytes,
		Challenge:  challengeResp3.GetChallenge(),
		Signature:  sig3,
		TotpCode:   validTotp,
	})
	if err != nil {
		t.Fatalf("CreateDevice with valid TOTP failed: %v", err)
	}
	if createdDev.GetId() == "" {
		t.Errorf("expected non-empty device id")
	}

	// 6. Verify device is in ListDevices
	devices, err := d.Auth().ListDevices(t)
	if err != nil {
		t.Fatalf("ListDevices failed: %v", err)
	}
	if len(devices.GetDevices()) != 1 {
		t.Errorf("expected 1 device, got %d", len(devices.GetDevices()))
	}
}

func TestDevice_PasswordlessAssertionLogin(t *testing.T) {
	d := driver.New(t, testEnv)
	d.Auth().CreateApprovedUser(t).Login(t)
	expectedUserID := d.State().UserID

	// 1. Register device
	pubBytes, signFn := driver.GenerateTestDeviceKeypair(t)
	challengeResp, err := d.Auth().CreateAuthChallenge(t)
	if err != nil {
		t.Fatalf("CreateAuthChallenge failed: %v", err)
	}
	sig := signFn(challengeResp.GetChallenge())

	dev, err := d.Auth().CreateDevice(t, &identityv1.Device{
		DeviceName: "Biometric Phone",
		Algorithm:  "ES256",
		PublicKey:  pubBytes,
		Challenge:  challengeResp.GetChallenge(),
		Signature:  sig,
	})
	if err != nil {
		t.Fatalf("CreateDevice failed: %v", err)
	}

	// 2. Clear credentials from driver state to simulate fresh biometric unlock
	d.State().AccessToken = ""
	d.State().RefreshToken = ""

	// 3. Request challenge for login assertion
	loginChallengeResp, err := d.Auth().CreateAuthChallenge(t)
	if err != nil {
		t.Fatalf("CreateAuthChallenge failed: %v", err)
	}
	loginChallenge := loginChallengeResp.GetChallenge()

	// 4. Attempt login with invalid signature -> must fail
	_, err = d.Auth().LoginWithDeviceAssertion(t, dev.GetId(), loginChallenge, []byte("invalid-signature"))
	if err == nil {
		t.Fatalf("expected LoginWithDeviceAssertion with bad signature to fail")
	}

	// 6. Request a fresh challenge (since previous challenge nonce was consumed) and login with valid signature
	validChallengeResp, err := d.Auth().CreateAuthChallenge(t)
	if err != nil {
		t.Fatalf("CreateAuthChallenge failed: %v", err)
	}
	validChallenge := validChallengeResp.GetChallenge()
	validSig := signFn(validChallenge)

	loginResp, err := d.Auth().LoginWithDeviceAssertion(t, dev.GetId(), validChallenge, validSig)
	if err != nil {
		t.Fatalf("LoginWithDeviceAssertion failed: %v", err)
	}

	if loginResp.GetAccessToken() == "" {
		t.Fatalf("expected non-empty access token")
	}
	if loginResp.GetRefreshToken() == "" {
		t.Fatalf("expected non-empty refresh token")
	}
	if loginResp.GetUserId() != expectedUserID {
		t.Errorf("user ID = %s, want %s", loginResp.GetUserId(), expectedUserID)
	}

	// 7. Verify issued access token can call GetCurrentUser
	d.State().AccessToken = loginResp.GetAccessToken()
	me, err := d.Auth().GetCurrentUser(t)
	if err != nil {
		t.Fatalf("GetCurrentUser failed: %v", err)
	}
	if me.GetId() != expectedUserID {
		t.Errorf("current user ID = %s, want %s", me.GetId(), expectedUserID)
	}
}

func TestDevice_RevocationCascades(t *testing.T) {
	d := driver.New(t, testEnv)
	d.Auth().CreateApprovedUser(t).Login(t)

	// ============================================================
	// Scenario A: Revoking Device cascades to revoke linked session
	// ============================================================
	t.Run("RevokeDeviceCascadesToSession", func(t *testing.T) {
		pubBytes, signFn := driver.GenerateTestDeviceKeypair(t)
		cResp, err := d.Auth().CreateAuthChallenge(t)
		if err != nil {
			t.Fatalf("CreateAuthChallenge failed: %v", err)
		}
		sig := signFn(cResp.GetChallenge())

		dev, err := d.Auth().CreateDevice(t, &identityv1.Device{
			DeviceName: "Device A",
			Algorithm:  "ES256",
			PublicKey:  pubBytes,
			Challenge:  cResp.GetChallenge(),
			Signature:  sig,
		})
		if err != nil {
			t.Fatalf("CreateDevice failed: %v", err)
		}

		// Login via device assertion to create a linked session
		loginChallenge, err := d.Auth().CreateAuthChallenge(t)
		if err != nil {
			t.Fatalf("CreateAuthChallenge failed: %v", err)
		}
		loginSig := signFn(loginChallenge.GetChallenge())

		loginResp, err := d.Auth().LoginWithDeviceAssertion(t, dev.GetId(), loginChallenge.GetChallenge(), loginSig)
		if err != nil {
			t.Fatalf("login with device assertion failed: %v", err)
		}
		sessionToken := loginResp.GetAccessToken()

		// Verify session is active
		d.State().AccessToken = sessionToken
		_, err = d.Auth().GetCurrentUser(t)
		if err != nil {
			t.Fatalf("session should be valid before revocation: %v", err)
		}

		// Revoke the device
		err = d.Auth().RevokeDevice(t, dev.GetId())
		if err != nil {
			t.Fatalf("RevokeDevice failed: %v", err)
		}

		// Verify device is removed from active devices
		devices, err := d.Auth().ListDevices(t)
		if err != nil {
			t.Fatalf("ListDevices failed: %v", err)
		}
		for _, existing := range devices.GetDevices() {
			if existing.GetId() == dev.GetId() {
				t.Fatalf("revoked device %s still appears in ListDevices", dev.GetId())
			}
		}

		// Inactive session verification: refreshing the session token should fail
		_, err = d.Auth().RefreshSession(t, loginResp.GetRefreshToken())
		if err == nil {
			t.Errorf("expected RefreshSession to fail for revoked session, but succeeded")
		}
	})

	// ============================================================
	// Scenario B: Revoking Session cascades to revoke linked device
	// ============================================================
	t.Run("RevokeSessionCascadesToDevice", func(t *testing.T) {
		pubBytes, signFn := driver.GenerateTestDeviceKeypair(t)
		cResp, err := d.Auth().CreateAuthChallenge(t)
		if err != nil {
			t.Fatalf("CreateAuthChallenge failed: %v", err)
		}
		sig := signFn(cResp.GetChallenge())

		dev, err := d.Auth().CreateDevice(t, &identityv1.Device{
			DeviceName: "Device B",
			Algorithm:  "ES256",
			PublicKey:  pubBytes,
			Challenge:  cResp.GetChallenge(),
			Signature:  sig,
		})
		if err != nil {
			t.Fatalf("CreateDevice failed: %v", err)
		}

		// Record session IDs before device assertion login
		preSessions, err := d.Auth().ListActiveSessions(t)
		if err != nil {
			t.Fatalf("ListActiveSessions failed: %v", err)
		}
		preSessionIDs := make(map[string]bool)
		for _, s := range preSessions.GetSessions() {
			preSessionIDs[s.GetSessionId()] = true
		}

		// Login via device assertion to create linked session
		loginChallenge, err := d.Auth().CreateAuthChallenge(t)
		if err != nil {
			t.Fatalf("CreateAuthChallenge failed: %v", err)
		}
		loginSig := signFn(loginChallenge.GetChallenge())

		loginResp, err := d.Auth().LoginWithDeviceAssertion(t, dev.GetId(), loginChallenge.GetChallenge(), loginSig)
		if err != nil {
			t.Fatalf("login with device assertion failed: %v", err)
		}

		d.State().AccessToken = loginResp.GetAccessToken()
		postSessions, err := d.Auth().ListActiveSessions(t)
		if err != nil {
			t.Fatalf("ListActiveSessions failed: %v", err)
		}

		var linkedSessionID string
		for _, s := range postSessions.GetSessions() {
			if !preSessionIDs[s.GetSessionId()] {
				linkedSessionID = s.GetSessionId()
				break
			}
		}
		if linkedSessionID == "" {
			t.Fatalf("could not find active session linked to device %s", dev.GetId())
		}

		// Revoke the session
		_, err = d.Auth().RevokeSession(t, linkedSessionID)
		if err != nil {
			t.Fatalf("RevokeSession failed: %v", err)
		}

		// Verify linked device was cascade-revoked!
		devices, err := d.Auth().ListDevices(t)
		if err != nil {
			t.Fatalf("ListDevices failed: %v", err)
		}
		for _, d := range devices.GetDevices() {
			if d.GetId() == dev.GetId() {
				t.Fatalf("linked device %s should have been revoked when session was revoked", dev.GetId())
			}
		}
	})

	// ============================================================
	// Scenario C: Logout (RevokeSessionByHash) cascades to revoke linked device
	// ============================================================
	t.Run("LogoutCascadesToDevice", func(t *testing.T) {
		pubBytes, signFn := driver.GenerateTestDeviceKeypair(t)
		cResp, err := d.Auth().CreateAuthChallenge(t)
		if err != nil {
			t.Fatalf("CreateAuthChallenge failed: %v", err)
		}
		sig := signFn(cResp.GetChallenge())

		dev, err := d.Auth().CreateDevice(t, &identityv1.Device{
			DeviceName: "Device Logout Test",
			Algorithm:  "ES256",
			PublicKey:  pubBytes,
			Challenge:  cResp.GetChallenge(),
			Signature:  sig,
		})
		if err != nil {
			t.Fatalf("CreateDevice failed: %v", err)
		}

		// Login via device assertion
		loginChallenge, err := d.Auth().CreateAuthChallenge(t)
		if err != nil {
			t.Fatalf("CreateAuthChallenge failed: %v", err)
		}
		loginSig := signFn(loginChallenge.GetChallenge())

		loginResp, err := d.Auth().LoginWithDeviceAssertion(t, dev.GetId(), loginChallenge.GetChallenge(), loginSig)
		if err != nil {
			t.Fatalf("login with device assertion failed: %v", err)
		}

		// Logout using the device's refresh token
		_, err = d.Auth().Logout(t, loginResp.GetRefreshToken())
		if err != nil {
			t.Fatalf("Logout failed: %v", err)
		}

		// Verify device was cascade-revoked by Logout
		devices, err := d.Auth().ListDevices(t)
		if err != nil {
			t.Fatalf("ListDevices failed: %v", err)
		}
		for _, existing := range devices.GetDevices() {
			if existing.GetId() == dev.GetId() {
				t.Fatalf("device %s should have been revoked on Logout", dev.GetId())
			}
		}
	})

	// ============================================================
	// Scenario D: Revoking All Sessions cascades to revoke all devices
	// ============================================================
	t.Run("RevokeAllSessionsCascadesToAllDevices", func(t *testing.T) {
		// Register a device
		pubBytes, signFn := driver.GenerateTestDeviceKeypair(t)
		cResp, err := d.Auth().CreateAuthChallenge(t)
		if err != nil {
			t.Fatalf("CreateAuthChallenge failed: %v", err)
		}
		sig := signFn(cResp.GetChallenge())

		dev, err := d.Auth().CreateDevice(t, &identityv1.Device{
			DeviceName: "Device C",
			Algorithm:  "ES256",
			PublicKey:  pubBytes,
			Challenge:  cResp.GetChallenge(),
			Signature:  sig,
		})
		if err != nil {
			t.Fatalf("CreateDevice failed: %v", err)
		}

		// Verify device exists
		devices, err := d.Auth().ListDevices(t)
		if err != nil {
			t.Fatalf("ListDevices failed: %v", err)
		}
		var found bool
		for _, d := range devices.GetDevices() {
			if d.GetId() == dev.GetId() {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("device %s not found in ListDevices before RevokeAllSessions", dev.GetId())
		}

		// Revoke all sessions
		_, err = d.Auth().RevokeAllSessions(t)
		if err != nil {
			t.Fatalf("RevokeAllSessions failed: %v", err)
		}

		// Verify all devices for user have been cascade-revoked
		// We re-login with password to inspect devices list
		reloginResp, err := d.Auth().LoginAs(t, d.State().UserEmail, d.State().UserPassword)
		if err != nil {
			t.Fatalf("re-login with password failed: %v", err)
		}
		d.State().AccessToken = reloginResp.GetAccessToken()

		postDevices, err := d.Auth().ListDevices(t)
		if err != nil {
			t.Fatalf("ListDevices failed after RevokeAllSessions: %v", err)
		}
		if len(postDevices.GetDevices()) != 0 {
			t.Errorf("expected 0 devices after RevokeAllSessions, got %d", len(postDevices.GetDevices()))
		}
	})
}
