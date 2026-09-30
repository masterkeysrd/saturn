//go:build integration

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

func TestActiveSessionIsCurrent(t *testing.T) {
	d := driver.New(t, testEnv)

	nano := time.Now().UnixNano()
	email := fmt.Sprintf("iscurrent_%d@saturn.local", nano)
	password := "Password123!"
	username := fmt.Sprintf("curr_%d", nano)

	user, err := d.Auth().RegisterUser(t, driver.RegisterUserOptions{
		Name:     "Current Session User",
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

	// 1. Client 1 login
	loginResp1, err := d.Auth().LoginAs(t, email, password)
	if err != nil {
		t.Fatalf("client 1 login failed: %v", err)
	}
	accToken1 := loginResp1.GetAccessToken()
	rfToken1 := loginResp1.GetRefreshToken()

	// 2. Client 2 login
	loginResp2, err := d.Auth().LoginAs(t, email, password)
	if err != nil {
		t.Fatalf("client 2 login failed: %v", err)
	}
	accToken2 := loginResp2.GetAccessToken()

	// 3. Query active sessions using Client 1 token
	d.State().AccessToken = accToken1
	sessionsResp1, err := d.Auth().ListActiveSessions(t)
	if err != nil {
		t.Fatalf("failed to list active sessions for client 1: %v", err)
	}
	if len(sessionsResp1.GetSessions()) < 2 {
		t.Fatalf("expected at least 2 active sessions, got %d", len(sessionsResp1.GetSessions()))
	}

	var client1SessionID string
	var client1CurrentCount int
	for _, s := range sessionsResp1.GetSessions() {
		if s.GetIsCurrent() {
			client1CurrentCount++
			client1SessionID = s.GetSessionId()
		}
	}
	if client1CurrentCount != 1 {
		t.Fatalf("client 1: expected exactly 1 current session, got %d", client1CurrentCount)
	}
	if client1SessionID == "" {
		t.Fatalf("client 1: current session ID should not be empty")
	}

	// 4. Query active sessions using Client 2 token
	d.State().AccessToken = accToken2
	sessionsResp2, err := d.Auth().ListActiveSessions(t)
	if err != nil {
		t.Fatalf("failed to list active sessions for client 2: %v", err)
	}

	var client2SessionID string
	var client2CurrentCount int
	for _, s := range sessionsResp2.GetSessions() {
		if s.GetIsCurrent() {
			client2CurrentCount++
			client2SessionID = s.GetSessionId()
		}
	}
	if client2CurrentCount != 1 {
		t.Fatalf("client 2: expected exactly 1 current session, got %d", client2CurrentCount)
	}
	if client2SessionID == "" {
		t.Fatalf("client 2: current session ID should not be empty")
	}

	if client1SessionID == client2SessionID {
		t.Fatalf("expected different session IDs for client 1 and client 2, got same: %s", client1SessionID)
	}

	// Verify that Client 1's session was NOT marked current for Client 2
	for _, s := range sessionsResp2.GetSessions() {
		if s.GetSessionId() == client1SessionID && s.GetIsCurrent() {
			t.Errorf("client 1 session %s was marked is_current=true when requested by client 2", client1SessionID)
		}
	}

	// 5. Rotate Client 1 session via refresh token and verify new current session
	refreshResp1, err := d.Auth().RefreshSession(t, rfToken1)
	if err != nil {
		t.Fatalf("client 1 session rotation failed: %v", err)
	}
	accToken1Rotated := refreshResp1.GetAccessToken()

	d.State().AccessToken = accToken1Rotated
	sessionsResp3, err := d.Auth().ListActiveSessions(t)
	if err != nil {
		t.Fatalf("failed to list active sessions after refresh: %v", err)
	}

	var rotatedCurrentCount int
	var rotatedSessionID string
	for _, s := range sessionsResp3.GetSessions() {
		if s.GetIsCurrent() {
			rotatedCurrentCount++
			rotatedSessionID = s.GetSessionId()
		}
	}
	if rotatedCurrentCount != 1 {
		t.Fatalf("rotated client 1: expected exactly 1 current session, got %d", rotatedCurrentCount)
	}
	if rotatedSessionID == "" {
		t.Fatalf("rotated client 1: session ID should not be empty")
	}
	if rotatedSessionID == client2SessionID {
		t.Errorf("rotated client 1 session matches client 2 session ID %s", client2SessionID)
	}
}

