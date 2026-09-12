package token

import (
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func TestClaims_IsAccess_IsRefresh(t *testing.T) {
	accessClaims := &Claims{TokenUse: "access"}
	if !accessClaims.IsAccess() {
		t.Error("expected IsAccess() to be true for 'access'")
	}
	if accessClaims.IsRefresh() {
		t.Error("expected IsRefresh() to be false for 'access'")
	}

	refreshClaims := &Claims{TokenUse: "refresh"}
	if refreshClaims.IsAccess() {
		t.Error("expected IsAccess() to be false for 'refresh'")
	}
	if !refreshClaims.IsRefresh() {
		t.Error("expected IsRefresh() to be true for 'refresh'")
	}

	otherClaims := &Claims{TokenUse: "id"}
	if otherClaims.IsAccess() || otherClaims.IsRefresh() {
		t.Error("expected both IsAccess and IsRefresh to be false for 'id'")
	}
}

func TestClaims_ValidateBasic(t *testing.T) {
	valid := &Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:  "usr_123",
			Issuer:   "saturn",
			Audience: []string{"saturn-api"},
			ID:       "jti_abc",
		},
		TokenUse: "access",
	}

	if err := valid.ValidateBasic(); err != nil {
		t.Fatalf("expected valid claims to pass, got: %v", err)
	}

	// Test each missing required claim individually
	tests := []struct {
		name    string
		modify  func(c *Claims)
		missing string
	}{
		{
			name:    "missing subject",
			modify:  func(c *Claims) { c.Subject = "" },
			missing: "subject",
		},
		{
			name:    "missing issuer",
			modify:  func(c *Claims) { c.Issuer = "" },
			missing: "issuer",
		},
		{
			name:    "missing audience",
			modify:  func(c *Claims) { c.Audience = nil },
			missing: "audience",
		},
		{
			name:    "missing jti ID",
			modify:  func(c *Claims) { c.ID = "" },
			missing: "jti",
		},
		{
			name:    "missing token_use",
			modify:  func(c *Claims) { c.TokenUse = "" },
			missing: "token_use",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			copy := *valid
			tt.modify(&copy)
			err := copy.ValidateBasic()
			if err == nil {
				t.Fatalf("expected error for %s, got nil", tt.name)
			}
			if !strings.Contains(err.Error(), tt.missing) {
				t.Errorf("expected error to contain %q, got %q", tt.missing, err.Error())
			}
		})
	}

	// Test all missing
	empty := &Claims{}
	err := empty.ValidateBasic()
	if err == nil {
		t.Fatal("expected error for empty claims, got nil")
	}
	for _, expected := range []string{"subject", "issuer", "audience", "jti", "token_use"} {
		if !strings.Contains(err.Error(), expected) {
			t.Errorf("expected error to contain %q, got %q", expected, err.Error())
		}
	}
}

func TestSanitizeClaims(t *testing.T) {
	now := time.Now()
	original := &Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    "saturn-issuer",
			Subject:   "usr_test",
			Audience:  []string{"saturn-audience"},
			ExpiresAt: jwt.NewNumericDate(now.Add(time.Hour)),
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			ID:        "jti_test_123",
		},
		AccessLevel: "admin",
		TokenUse:    "access",
		AuthVersion: 2,
	}

	sanitized := SanitizeClaims(original)

	if sanitized.Issuer != original.Issuer ||
		sanitized.Subject != original.Subject ||
		sanitized.ID != original.ID ||
		sanitized.AccessLevel != original.AccessLevel ||
		sanitized.TokenUse != original.TokenUse ||
		sanitized.AuthVersion != original.AuthVersion ||
		len(sanitized.Audience) != len(original.Audience) ||
		sanitized.Audience[0] != original.Audience[0] {
		t.Errorf("sanitized claims do not match original: %+v vs %+v", sanitized, original)
	}

	// Verify it's a distinct instance
	if sanitized == original {
		t.Error("SanitizeClaims returned pointer to original instead of copy")
	}
}
