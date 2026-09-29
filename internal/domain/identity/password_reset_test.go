package identity

import (
	"strings"
	"testing"
	"time"
)

func TestResetTokenID(t *testing.T) {
	t.Run("NewResetTokenID generates valid ID with rst_ prefix", func(t *testing.T) {
		id, err := NewResetTokenID()
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !strings.HasPrefix(string(id), resetTokenPrefix) {
			t.Fatalf("expected prefix %s, got %s", resetTokenPrefix, id)
		}
	})

	t.Run("ParseResetTokenID succeeds for valid ID and fails for invalid", func(t *testing.T) {
		id, err := NewResetTokenID()
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		parsed, err := ParseResetTokenID(string(id))
		if err != nil {
			t.Fatalf("expected parse to succeed: %v", err)
		}
		if parsed != id {
			t.Errorf("expected %s, got %s", id, parsed)
		}

		if _, err := ParseResetTokenID("invalid_prefix_123"); err == nil {
			t.Error("expected error parsing invalid prefix")
		}
	})
}

func TestPasswordResetToken_Validity(t *testing.T) {
	now := time.Now().UTC()

	tests := []struct {
		name          string
		token         *PasswordResetToken
		expectUsed    bool
		expectExpired bool
		expectValid   bool
	}{
		{
			name: "Valid unconsumed token in future",
			token: &PasswordResetToken{
				ExpiresAt: now.Add(15 * time.Minute),
				UsedAt:    nil,
			},
			expectUsed:    false,
			expectExpired: false,
			expectValid:   true,
		},
		{
			name: "Expired token",
			token: &PasswordResetToken{
				ExpiresAt: now.Add(-1 * time.Minute),
				UsedAt:    nil,
			},
			expectUsed:    false,
			expectExpired: true,
			expectValid:   false,
		},
		{
			name: "Consumed token",
			token: &PasswordResetToken{
				ExpiresAt: now.Add(15 * time.Minute),
				UsedAt:    &now,
			},
			expectUsed:    true,
			expectExpired: false,
			expectValid:   false,
		},
		{
			name: "Consumed and expired token",
			token: &PasswordResetToken{
				ExpiresAt: now.Add(-10 * time.Minute),
				UsedAt:    &now,
			},
			expectUsed:    true,
			expectExpired: true,
			expectValid:   false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if tc.token.IsUsed() != tc.expectUsed {
				t.Errorf("IsUsed() = %v, expected %v", tc.token.IsUsed(), tc.expectUsed)
			}
			if tc.token.IsExpired(now) != tc.expectExpired {
				t.Errorf("IsExpired() = %v, expected %v", tc.token.IsExpired(now), tc.expectExpired)
			}
			if tc.token.IsValid(now) != tc.expectValid {
				t.Errorf("IsValid() = %v, expected %v", tc.token.IsValid(now), tc.expectValid)
			}
		})
	}
}
