package identity

import (
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

func TestAPIKeyID(t *testing.T) {
	id, err := NewAPIKeyID()
	if err != nil {
		t.Fatalf("NewAPIKeyID failed: %v", err)
	}
	if !strings.HasPrefix(string(id), "apk_") {
		t.Errorf("expected apk_ prefix, got %q", id)
	}
	parsed, err := ParseAPIKeyID(string(id))
	if err != nil || parsed != id {
		t.Errorf("ParseAPIKeyID failed: parsed=%q err=%v", parsed, err)
	}
	if _, err := ParseAPIKeyID("usr_123"); err == nil {
		t.Error("expected error for invalid prefix")
	}
}

func TestGenerateAPIKeyToken(t *testing.T) {
	raw, prefix, digest, err := GenerateAPIKeyToken()
	if err != nil {
		t.Fatalf("GenerateAPIKeyToken failed: %v", err)
	}
	if !strings.HasPrefix(raw, "sat_") {
		t.Errorf("expected sat_ prefix, got %q", raw)
	}
	if len(raw) != 47 {
		t.Errorf("expected 47-char token, got %d (%q)", len(raw), raw)
	}
	if prefix != raw[:12] || len(prefix) != 12 {
		t.Errorf("expected 12-char prefix %q, got %q", raw[:12], prefix)
	}
	if len(digest) != 64 {
		t.Errorf("expected 64-char sha256 hex digest, got %d", len(digest))
	}
	if got := HashAPIKeyToken(raw); got != digest {
		t.Errorf("HashAPIKeyToken mismatch: got %q want %q", got, digest)
	}
}

func TestValidateAPIKeyScopes(t *testing.T) {
	tests := []struct {
		name      string
		input     []string
		want      []string
		wantError bool
	}{
		{
			name:  "valid deduplicated scopes",
			input: []string{"finance:read", "spaces:read", "finance:read"},
			want:  []string{"finance:read", "spaces:read"},
		},
		{
			name:  "all v1 scopes",
			input: []string{"spaces:read", "finance:read", "finance:write", "calendar:read", "calendar:write", "mail:read", "mail:write", "ai:read", "ai:execute", "ai:write", "workflows:read", "workflows:execute", "workflows:write"},
			want:  []string{"spaces:read", "finance:read", "finance:write", "calendar:read", "calendar:write", "mail:read", "mail:write", "ai:read", "ai:execute", "ai:write", "workflows:read", "workflows:execute", "workflows:write"},
		},
		{
			name:      "legacy agents scope rejected",
			input:     []string{"agents:read"},
			wantError: true,
		},
		{
			name:      "empty scopes",
			input:     nil,
			wantError: true,
		},
		{
			name:      "wildcard rejected",
			input:     []string{"*"},
			wantError: true,
		},
		{
			name:      "unknown scope rejected",
			input:     []string{"identity:write"},
			wantError: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := ValidateAPIKeyScopes(tc.input)
			if tc.wantError {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				if domErr, ok := errors.AsType[*errors.Error](err); ok {
					if domErr.Kind != errors.Invalid {
						t.Errorf("expected Invalid error kind, got %v", domErr.Kind)
					}
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if !slices.Equal(got, tc.want) {
				t.Errorf("got %v, want %v", got, tc.want)
			}
		})
	}
}

func TestAPIKey_ValidateAndExpiry(t *testing.T) {
	now := time.Date(2026, 4, 1, 12, 0, 0, 0, time.UTC)

	tests := []struct {
		name      string
		key       *APIKey
		wantError bool
	}{
		{
			name: "valid key",
			key: &APIKey{
				Name:        "  CLI Token  ",
				Description: "  Local dev  ",
				Scopes:      []string{"finance:read"},
			},
		},
		{
			name:      "nil key",
			key:       nil,
			wantError: true,
		},
		{
			name: "empty name",
			key: &APIKey{
				Name:   "   ",
				Scopes: []string{"finance:read"},
			},
			wantError: true,
		},
		{
			name: "name too long",
			key: &APIKey{
				Name:   strings.Repeat("a", 256),
				Scopes: []string{"finance:read"},
			},
			wantError: true,
		},
		{
			name: "invalid scope",
			key: &APIKey{
				Name:   "Bad Scope",
				Scopes: []string{"admin:all"},
			},
			wantError: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := tc.key.Validate()
			if tc.wantError && err == nil {
				t.Fatal("expected validation error, got nil")
			}
			if !tc.wantError && err != nil {
				t.Fatalf("unexpected validation error: %v", err)
			}
		})
	}

	noExp := &APIKey{}
	if noExp.IsExpired(now) {
		t.Error("expected key without expiration not to be expired")
	}
	futureExp := &APIKey{ExpiresAt: new(now.Add(time.Hour))}
	if futureExp.IsExpired(now) {
		t.Error("expected future key not to be expired")
	}
	exactExp := &APIKey{ExpiresAt: new(now)}
	if !exactExp.IsExpired(now) {
		t.Error("expected key at exact expiration timestamp to be expired")
	}
	pastExp := &APIKey{ExpiresAt: new(now.Add(-time.Second))}
	if !pastExp.IsExpired(now) {
		t.Error("expected past key to be expired")
	}
}

func TestAPIKey_ApplyPatch(t *testing.T) {
	key := &APIKey{
		ID:          "apk_1",
		Name:        "Original",
		Description: "Old desc",
		Scopes:      []string{"finance:read"},
	}

	err := key.ApplyPatch(&APIKey{
		Name:   "Updated",
		Scopes: []string{"finance:read", "finance:write"},
	}, []string{"name", "scopes", "space_ids"})
	if err != nil {
		t.Fatalf("ApplyPatch failed: %v", err)
	}
	if key.Name != "Updated" {
		t.Errorf("expected Updated, got %q", key.Name)
	}
	if key.Description != "Old desc" {
		t.Errorf("expected Description unchanged, got %q", key.Description)
	}
	if !slices.Equal(key.Scopes, []string{"finance:read", "finance:write"}) {
		t.Errorf("unexpected scopes: %v", key.Scopes)
	}

	if err := key.ApplyPatch(&APIKey{Name: "X"}, []string{"unknown_field"}); err == nil {
		t.Error("expected error for unsupported patch field")
	}
}
