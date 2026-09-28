package identity

import (
	"strings"
	"testing"
	"time"
)

func TestMFAFactorID(t *testing.T) {
	id, err := NewMFAFactorID()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.HasPrefix(string(id), mfaFactorPrefix) {
		t.Errorf("expected %s prefix, got %s", mfaFactorPrefix, id)
	}

	parsed, err := ParseMFAFactorID(string(id))
	if err != nil {
		t.Fatalf("unexpected error parsing valid factor ID: %v", err)
	}
	if parsed != id {
		t.Errorf("expected %s, got %s", id, parsed)
	}

	if _, err := ParseMFAFactorID("usr_1234567890123456"); err == nil {
		t.Error("expected error parsing invalid prefix")
	}
}

func TestMFAFactorEntity(t *testing.T) {
	factor := &MFAFactor{
		ID:        "mfa_test",
		UserID:    "usr_test",
		Type:      MFAFactorTypeTOTP,
		Name:      "Authenticator",
		CreatedAt: time.Now(),
	}

	if !factor.IsActive() {
		t.Error("expected new factor without revokedAt to be active")
	}
	if factor.IsRevoked() {
		t.Error("expected new factor without revokedAt to not be revoked")
	}

	now := time.Now()
	factor.Revoke(now)
	if factor.IsActive() {
		t.Error("expected revoked factor to not be active")
	}
	if !factor.IsRevoked() {
		t.Error("expected revoked factor to be revoked")
	}

	factor.MarkUsed(now)
	if factor.LastUsedAt == nil || !factor.LastUsedAt.Equal(now) {
		t.Error("expected lastUsedAt to match timestamp")
	}
}
