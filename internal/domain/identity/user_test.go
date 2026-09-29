package identity

import (
	"strings"
	"testing"
)

func TestUserID(t *testing.T) {
	t.Run("NewUserID generates valid ID with usr_ prefix", func(t *testing.T) {
		uid, err := NewUserID()
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !strings.HasPrefix(string(uid), userIDPrefix) {
			t.Fatalf("expected prefix %s, got %s", userIDPrefix, uid)
		}
		if !uid.IsValid() {
			t.Error("expected valid UserID")
		}
		if err := uid.Validate(); err != nil {
			t.Errorf("expected Validate to succeed: %v", err)
		}
		if uid.String() != string(uid) {
			t.Errorf("expected string representation to match")
		}
	})

	t.Run("ParseUserID succeeds for valid ID and fails for invalid", func(t *testing.T) {
		uid, err := NewUserID()
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		parsed, err := ParseUserID(string(uid))
		if err != nil {
			t.Fatalf("expected parse to succeed: %v", err)
		}
		if parsed != uid {
			t.Errorf("expected %s, got %s", uid, parsed)
		}

		if _, err := ParseUserID("invalid_prefix_123"); err == nil {
			t.Error("expected error parsing invalid prefix")
		}
	})

	t.Run("MustUserID returns UserID on valid and panics on invalid", func(t *testing.T) {
		uid, err := NewUserID()
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		mustUID := MustUserID(string(uid))
		if mustUID != uid {
			t.Errorf("expected %s, got %s", uid, mustUID)
		}

		defer func() {
			r := recover()
			if r == nil {
				t.Error("expected MustUserID to panic on invalid input")
			}
		}()
		MustUserID("bad_id")
	})

	t.Run("IsValid checks non-empty", func(t *testing.T) {
		var empty UserID
		if empty.IsValid() {
			t.Error("expected empty UserID to be invalid")
		}
		valid := UserID("usr_something")
		if !valid.IsValid() {
			t.Error("expected non-empty UserID to be valid")
		}
	})
}
