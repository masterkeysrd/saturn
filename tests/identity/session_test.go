package identity_test

import (
	"fmt"
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/tests/driver"
)

func TestSessionRotationAndReuseDetection(t *testing.T) {
	d := driver.New(t, testEnv)

	nano := time.Now().UnixNano()
	email := fmt.Sprintf("session_rotate_%d@saturn.local", nano)
	password := "Password123!"
	username := fmt.Sprintf("rot_%d", nano)

	user, err := d.Auth().RegisterUser(t, driver.RegisterUserOptions{
		Name:     "Rotate User",
		Email:    email,
		Username: username,
		Password: password,
	})
	if err != nil {
		t.Fatalf("failed to register user: %v", err)
	}
	if _, err := d.Auth().ApproveUser(t, user.GetId()); err != nil {
		t.Fatalf("failed to approve user: %v", err)
	}

	// 1. Initial Login
	loginResp1, err := d.Auth().LoginAs(t, email, password)
	if err != nil {
		t.Fatalf("login 1 failed: %v", err)
	}
	rfToken1 := loginResp1.GetRefreshToken()
	if rfToken1 == "" {
		t.Fatalf("expected non-empty initial refresh token")
	}

	// 2. Rotate session using RefreshToken 1
	refreshResp, err := d.Auth().RefreshSession(t, rfToken1)
	if err != nil {
		t.Fatalf("failed to rotate session: %v", err)
	}
	rfToken2 := refreshResp.GetRefreshToken()
	accToken2 := refreshResp.GetAccessToken()
	if rfToken2 == "" || rfToken2 == rfToken1 {
		t.Fatalf("expected fresh refresh token, got %s (previous %s)", rfToken2, rfToken1)
	}

	// 3. Verify new access token works
	d.State().AccessToken = accToken2
	me, err := d.Auth().GetCurrentUser(t)
	if err != nil {
		t.Fatalf("failed to use new access token: %v", err)
	}
	if me.GetId() != user.GetId() {
		t.Errorf("me id = %s, want %s", me.GetId(), user.GetId())
	}

	// 4. Reuse Detection: replay previous rotated token (rfToken1)
	_, err = d.Auth().RefreshSession(t, rfToken1)
	if err == nil {
		t.Fatalf("expected replay of rotated refresh token to fail, but succeeded")
	}

	// 5. Automatic Family Revocation: because rfToken1 was reused, rfToken2 must now also be revoked!
	_, err = d.Auth().RefreshSession(t, rfToken2)
	if err == nil {
		t.Fatalf("expected descendant token in session family to be revoked after reuse detection")
	}
}

func TestMultiSessionListingAndRevocation(t *testing.T) {
	d := driver.New(t, testEnv)

	nano := time.Now().UnixNano()
	email := fmt.Sprintf("multisess_%d@saturn.local", nano)
	password := "Password123!"
	username := fmt.Sprintf("msess_%d", nano)

	user, err := d.Auth().RegisterUser(t, driver.RegisterUserOptions{
		Name:     "Multi Session User",
		Email:    email,
		Username: username,
		Password: password,
	})
	if err != nil {
		t.Fatalf("failed to register user: %v", err)
	}
	if _, err := d.Auth().ApproveUser(t, user.GetId()); err != nil {
		t.Fatalf("failed to approve user: %v", err)
	}

	// 1. Device A login
	_, err = d.Auth().LoginAs(t, email, password)
	if err != nil {
		t.Fatalf("device A login failed: %v", err)
	}

	// 2. Device B login
	loginB, err := d.Auth().LoginAs(t, email, password)
	if err != nil {
		t.Fatalf("device B login failed: %v", err)
	}

	// 3. As Device B, list active sessions
	d.State().AccessToken = loginB.GetAccessToken()
	sessionsResp, err := d.Auth().ListActiveSessions(t)
	if err != nil {
		t.Fatalf("failed to list active sessions: %v", err)
	}
	if len(sessionsResp.GetSessions()) < 2 {
		t.Fatalf("expected at least 2 active sessions, got %d", len(sessionsResp.GetSessions()))
	}

	// Identify the session for Device A (e.g. the first session in the list)
	sessions := sessionsResp.GetSessions()
	sessionAToRevoke := sessions[0].GetSessionId()

	// 4. Revoke Device A session
	_, err = d.Auth().RevokeSession(t, sessionAToRevoke)
	if err != nil {
		t.Fatalf("failed to revoke session A: %v", err)
	}

	// 5. Verify the active sessions count decreased
	sessionsRespAfter, err := d.Auth().ListActiveSessions(t)
	if err != nil {
		t.Fatalf("failed to list sessions after revocation: %v", err)
	}
	if len(sessionsRespAfter.GetSessions()) != len(sessions)-1 {
		t.Errorf("sessions count after revocation = %d, want %d", len(sessionsRespAfter.GetSessions()), len(sessions)-1)
	}
}

func TestRevokeAllSessions(t *testing.T) {
	d := driver.New(t, testEnv)

	nano := time.Now().UnixNano()
	email := fmt.Sprintf("revokeall_%d@saturn.local", nano)
	password := "Password123!"
	username := fmt.Sprintf("revall_%d", nano)

	user, err := d.Auth().RegisterUser(t, driver.RegisterUserOptions{
		Name:     "Revoke All User",
		Email:    email,
		Username: username,
		Password: password,
	})
	if err != nil {
		t.Fatalf("failed to register user: %v", err)
	}
	if _, err := d.Auth().ApproveUser(t, user.GetId()); err != nil {
		t.Fatalf("failed to approve user: %v", err)
	}

	login1, _ := d.Auth().LoginAs(t, email, password)
	login2, _ := d.Auth().LoginAs(t, email, password)

	d.State().AccessToken = login2.GetAccessToken()
	_, err = d.Auth().RevokeAllSessions(t)
	if err != nil {
		t.Fatalf("failed to revoke all sessions: %v", err)
	}

	// Both refresh tokens must now fail
	_, err = d.Auth().RefreshSession(t, login1.GetRefreshToken())
	if err == nil {
		t.Errorf("login1 refresh token should be revoked")
	}

	_, err = d.Auth().RefreshSession(t, login2.GetRefreshToken())
	if err == nil {
		t.Errorf("login2 refresh token should be revoked")
	}
}

func TestSecurityAuditEventsRecorded(t *testing.T) {
	d := driver.New(t, testEnv)

	nano := time.Now().UnixNano()
	email := fmt.Sprintf("audit_%d@saturn.local", nano)
	password := "Password123!"
	username := fmt.Sprintf("audit_%d", nano)

	user, err := d.Auth().RegisterUser(t, driver.RegisterUserOptions{
		Name:     "Audit User",
		Email:    email,
		Username: username,
		Password: password,
	})
	if err != nil {
		t.Fatalf("failed to register user: %v", err)
	}
	if _, err := d.Auth().ApproveUser(t, user.GetId()); err != nil {
		t.Fatalf("failed to approve user: %v", err)
	}

	// Login creates a security event
	loginResp, err := d.Auth().LoginAs(t, email, password)
	if err != nil {
		t.Fatalf("login failed: %v", err)
	}

	d.State().AccessToken = loginResp.GetAccessToken()

	// List security events
	eventsResp, err := d.Auth().ListMySecurityEvents(t, 10, "")
	if err != nil {
		t.Fatalf("failed to list security events: %v", err)
	}
	if len(eventsResp.GetEvents()) == 0 {
		t.Errorf("expected security events to be recorded, but got 0")
	}

	foundLoginEvent := false
	for _, ev := range eventsResp.GetEvents() {
		if ev.GetEmail() == email {
			foundLoginEvent = true
			break
		}
	}
	if !foundLoginEvent {
		t.Errorf("expected security event for user email %s", email)
	}
}
