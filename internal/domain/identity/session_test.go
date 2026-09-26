package identity

import (
	"strings"
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

func TestSessionID(t *testing.T) {
	t.Run("NewSessionID generates valid ID with ses_ prefix", func(t *testing.T) {
		id, err := NewSessionID()
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !strings.HasPrefix(string(id), sessionPrefix) {
			t.Errorf("expected session ID to start with %s, got %s", sessionPrefix, id)
		}
	})

	t.Run("ParseSessionID validates correctly", func(t *testing.T) {
		validID, err := NewSessionID()
		if err != nil {
			t.Fatalf("failed to generate session ID: %v", err)
		}

		parsed, err := ParseSessionID(string(validID))
		if err != nil {
			t.Fatalf("unexpected error parsing valid session ID: %v", err)
		}
		if parsed != validID {
			t.Errorf("expected %s, got %s", validID, parsed)
		}

		// Invalid prefix
		if _, err := ParseSessionID("usr_1234567890123456"); err == nil {
			t.Error("expected error parsing session ID with wrong prefix")
		}

		// Empty ID
		if _, err := ParseSessionID(""); err == nil {
			t.Error("expected error parsing empty session ID")
		}
	})
}

func TestTokenFamilyID(t *testing.T) {
	t.Run("NewTokenFamilyID generates valid ID with tfm_ prefix", func(t *testing.T) {
		id, err := NewTokenFamilyID()
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !strings.HasPrefix(string(id), familyPrefix) {
			t.Errorf("expected token family ID to start with %s, got %s", familyPrefix, id)
		}
	})

	t.Run("ParseTokenFamilyID validates correctly", func(t *testing.T) {
		validID, err := NewTokenFamilyID()
		if err != nil {
			t.Fatalf("failed to generate token family ID: %v", err)
		}

		parsed, err := ParseTokenFamilyID(string(validID))
		if err != nil {
			t.Fatalf("unexpected error parsing valid token family ID: %v", err)
		}
		if parsed != validID {
			t.Errorf("expected %s, got %s", validID, parsed)
		}

		// Invalid prefix
		if _, err := ParseTokenFamilyID("ses_1234567890123456"); err == nil {
			t.Error("expected error parsing token family ID with wrong prefix")
		}

		// Empty ID
		if _, err := ParseTokenFamilyID(""); err == nil {
			t.Error("expected error parsing empty token family ID")
		}
	})
}

func TestSession_Lifecycle(t *testing.T) {
	now := time.Now()

	t.Run("IsRevoked and Revoke", func(t *testing.T) {
		s := &Session{ID: "ses_1"}
		if s.IsRevoked() {
			t.Error("expected session to not be revoked initially")
		}

		revokeTime := now.Add(time.Minute)
		s.Revoke(revokeTime)

		if !s.IsRevoked() {
			t.Error("expected session to be revoked after Revoke()")
		}
		if s.RevokedAt == nil || !s.RevokedAt.Equal(revokeTime) {
			t.Errorf("expected RevokedAt to be %v, got %v", revokeTime, s.RevokedAt)
		}
	})

	t.Run("IsReplaced", func(t *testing.T) {
		s := &Session{ID: "ses_1"}
		if s.IsReplaced() {
			t.Error("expected session to not be replaced initially")
		}

		replaceTime := now.Add(time.Minute)
		s.ReplacedAt = &replaceTime

		if !s.IsReplaced() {
			t.Error("expected session to be replaced")
		}
	})

	t.Run("IsExpired", func(t *testing.T) {
		// Zero time should not be expired
		s := &Session{ID: "ses_1"}
		if s.IsExpired(now) {
			t.Error("expected zero-time session to not be expired")
		}

		// Sliding expiration: not expired
		s.ExpiresAt = now.Add(time.Hour)
		if s.IsExpired(now) {
			t.Error("expected session not to be expired before ExpiresAt")
		}

		// Sliding expiration: expired
		s.ExpiresAt = now.Add(-time.Hour)
		if !s.IsExpired(now) {
			t.Error("expected session to be expired after ExpiresAt")
		}

		// Absolute expiration: not expired
		s.ExpiresAt = now.Add(time.Hour)
		s.AbsoluteExpiresAt = now.Add(24 * time.Hour)
		if s.IsExpired(now) {
			t.Error("expected session not to be expired when within absolute expiry")
		}

		// Absolute expiration: expired even if sliding is valid
		s.ExpiresAt = now.Add(time.Hour)
		s.AbsoluteExpiresAt = now.Add(-time.Hour)
		if !s.IsExpired(now) {
			t.Error("expected session to be expired when AbsoluteExpiresAt has passed")
		}
	})

	t.Run("IsActive", func(t *testing.T) {
		s := &Session{
			ID:                "ses_1",
			ExpiresAt:         now.Add(time.Hour),
			AbsoluteExpiresAt: now.Add(24 * time.Hour),
		}

		if !s.IsActive(now) {
			t.Error("expected fresh session to be active")
		}

		// Revoked session is not active
		sRevoked := *s
		sRevoked.Revoke(now)
		if sRevoked.IsActive(now) {
			t.Error("expected revoked session to not be active")
		}

		// Replaced session is not active
		sReplaced := *s
		repTime := now
		sReplaced.ReplacedAt = &repTime
		if sReplaced.IsActive(now) {
			t.Error("expected replaced session to not be active")
		}

		// Expired session is not active
		sExpired := *s
		sExpired.ExpiresAt = now.Add(-time.Hour)
		if sExpired.IsActive(now) {
			t.Error("expected expired session to not be active")
		}

		// Absolute expired session is not active
		sAbsExpired := *s
		sAbsExpired.AbsoluteExpiresAt = now.Add(-time.Hour)
		if sAbsExpired.IsActive(now) {
			t.Error("expected absolute expired session to not be active")
		}
	})
}

func TestSession_Rotate(t *testing.T) {
	now := time.Now()

	t.Run("rotates successfully and returns successor", func(t *testing.T) {
		oldSession := &Session{
			ID:                "ses_old",
			UserID:            "usr_test",
			RefreshTokenHash:  []byte("old_hash"),
			TokenFamilyID:     "tfm_fam",
			ExpiresAt:         now.Add(time.Hour),
			AbsoluteExpiresAt: now.Add(24 * time.Hour),
			CreateTime:        now.Add(-time.Hour),
			UserAgent:         "agent_v1",
			IPAddress:         "127.0.0.1",
		}

		in := RotateInput{
			SuccessorID:   "ses_new",
			SuccessorHash: []byte("new_hash"),
			UserAgent:     "agent_v2",
			IPAddress:     "192.168.1.1",
			ExpiresAt:     now.Add(2 * time.Hour),
			Now:           now,
		}

		successor, err := oldSession.Rotate(in)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if successor == nil {
			t.Fatal("expected successor session, got nil")
		}

		// Validate old session mutation
		if !oldSession.IsReplaced() {
			t.Error("expected old session to be marked as replaced")
		}
		if oldSession.ReplacedAt == nil || !oldSession.ReplacedAt.Equal(now) {
			t.Errorf("expected old session ReplacedAt to be %v, got %v", now, oldSession.ReplacedAt)
		}
		if oldSession.LastUsedAt == nil || !oldSession.LastUsedAt.Equal(now) {
			t.Errorf("expected old session LastUsedAt to be %v, got %v", now, oldSession.LastUsedAt)
		}

		// Validate successor fields
		if successor.ID != "ses_new" {
			t.Errorf("expected successor ID ses_new, got %s", successor.ID)
		}
		if successor.UserID != oldSession.UserID {
			t.Errorf("expected successor UserID %s, got %s", oldSession.UserID, successor.UserID)
		}
		if string(successor.RefreshTokenHash) != "new_hash" {
			t.Errorf("expected successor hash new_hash, got %s", successor.RefreshTokenHash)
		}
		if successor.TokenFamilyID != oldSession.TokenFamilyID {
			t.Errorf("expected successor TokenFamilyID %s, got %s", oldSession.TokenFamilyID, successor.TokenFamilyID)
		}
		if successor.ParentSessionID == nil || *successor.ParentSessionID != oldSession.ID {
			t.Errorf("expected ParentSessionID to be %s, got %v", oldSession.ID, successor.ParentSessionID)
		}
		if !successor.ExpiresAt.Equal(in.ExpiresAt) {
			t.Errorf("expected successor ExpiresAt %v, got %v", in.ExpiresAt, successor.ExpiresAt)
		}
		if !successor.AbsoluteExpiresAt.Equal(oldSession.AbsoluteExpiresAt) {
			t.Errorf("expected successor AbsoluteExpiresAt %v, got %v", oldSession.AbsoluteExpiresAt, successor.AbsoluteExpiresAt)
		}
		if !successor.CreateTime.Equal(now) {
			t.Errorf("expected successor CreateTime %v, got %v", now, successor.CreateTime)
		}
		if successor.LastUsedAt == nil || !successor.LastUsedAt.Equal(now) {
			t.Errorf("expected successor LastUsedAt %v, got %v", now, successor.LastUsedAt)
		}
		if successor.UserAgent != in.UserAgent {
			t.Errorf("expected successor UserAgent %s, got %s", in.UserAgent, successor.UserAgent)
		}
		if successor.IPAddress != in.IPAddress {
			t.Errorf("expected successor IPAddress %s, got %s", in.IPAddress, successor.IPAddress)
		}
	})

	t.Run("fails with SessionReused conflict when already replaced", func(t *testing.T) {
		repTime := now.Add(-time.Minute)
		oldSession := &Session{
			ID:                "ses_old",
			UserID:            "usr_test",
			TokenFamilyID:     "tfm_fam",
			ExpiresAt:         now.Add(time.Hour),
			AbsoluteExpiresAt: now.Add(24 * time.Hour),
			ReplacedAt:        &repTime,
		}

		in := RotateInput{
			SuccessorID:   "ses_new",
			SuccessorHash: []byte("new_hash"),
			ExpiresAt:     now.Add(time.Hour),
			Now:           now,
		}

		successor, err := oldSession.Rotate(in)
		if successor != nil {
			t.Errorf("expected nil successor, got %v", successor)
		}
		if errors.CodeOf(err) != SessionReused {
			t.Errorf("expected SessionReused error code, got %v", errors.CodeOf(err))
		}
		if errors.KindOf(err) != errors.Conflict {
			t.Errorf("expected errors.Conflict kind, got %v", errors.KindOf(err))
		}
	})

	t.Run("fails with SessionRevoked unauthenticated when already revoked", func(t *testing.T) {
		revTime := now.Add(-time.Minute)
		oldSession := &Session{
			ID:                "ses_old",
			UserID:            "usr_test",
			TokenFamilyID:     "tfm_fam",
			ExpiresAt:         now.Add(time.Hour),
			AbsoluteExpiresAt: now.Add(24 * time.Hour),
			RevokedAt:         &revTime,
		}

		in := RotateInput{
			SuccessorID:   "ses_new",
			SuccessorHash: []byte("new_hash"),
			ExpiresAt:     now.Add(time.Hour),
			Now:           now,
		}

		successor, err := oldSession.Rotate(in)
		if successor != nil {
			t.Errorf("expected nil successor, got %v", successor)
		}
		if errors.CodeOf(err) != SessionRevoked {
			t.Errorf("expected SessionRevoked error code, got %v", errors.CodeOf(err))
		}
		if errors.KindOf(err) != errors.Unauthenticated {
			t.Errorf("expected errors.Unauthenticated kind, got %v", errors.KindOf(err))
		}
	})

	t.Run("fails with SessionExpired unauthenticated when sliding expired", func(t *testing.T) {
		oldSession := &Session{
			ID:                "ses_old",
			UserID:            "usr_test",
			TokenFamilyID:     "tfm_fam",
			ExpiresAt:         now.Add(-time.Minute),
			AbsoluteExpiresAt: now.Add(24 * time.Hour),
		}

		in := RotateInput{
			SuccessorID:   "ses_new",
			SuccessorHash: []byte("new_hash"),
			ExpiresAt:     now.Add(time.Hour),
			Now:           now,
		}

		successor, err := oldSession.Rotate(in)
		if successor != nil {
			t.Errorf("expected nil successor, got %v", successor)
		}
		if errors.CodeOf(err) != SessionExpired {
			t.Errorf("expected SessionExpired error code, got %v", errors.CodeOf(err))
		}
		if errors.KindOf(err) != errors.Unauthenticated {
			t.Errorf("expected errors.Unauthenticated kind, got %v", errors.KindOf(err))
		}
	})

	t.Run("fails with SessionExpired unauthenticated when absolute expired", func(t *testing.T) {
		oldSession := &Session{
			ID:                "ses_old",
			UserID:            "usr_test",
			TokenFamilyID:     "tfm_fam",
			ExpiresAt:         now.Add(time.Hour),
			AbsoluteExpiresAt: now.Add(-time.Minute),
		}

		in := RotateInput{
			SuccessorID:   "ses_new",
			SuccessorHash: []byte("new_hash"),
			ExpiresAt:     now.Add(time.Hour),
			Now:           now,
		}

		successor, err := oldSession.Rotate(in)
		if successor != nil {
			t.Errorf("expected nil successor, got %v", successor)
		}
		if errors.CodeOf(err) != SessionExpired {
			t.Errorf("expected SessionExpired error code, got %v", errors.CodeOf(err))
		}
		if errors.KindOf(err) != errors.Unauthenticated {
			t.Errorf("expected errors.Unauthenticated kind, got %v", errors.KindOf(err))
		}
	})
}
