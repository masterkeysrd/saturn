package auth

import (
	"context"
	"testing"
)

func TestPrincipal_APIKeyHelpers(t *testing.T) {
	jwtPrincipal := Principal{
		Subject:     "usr_123",
		AccessLevel: "user",
		SessionID:   "ses_123",
	}
	if jwtPrincipal.IsAPIKey() {
		t.Error("expected JWT principal IsAPIKey() to be false")
	}
	if !jwtPrincipal.HasScope("finance:read") {
		t.Error("expected JWT principal HasScope() to be true")
	}
	if !jwtPrincipal.HasSpaceGrant("spc_1") {
		t.Error("expected JWT principal HasSpaceGrant() to be true")
	}

	apiKeyPrincipal := Principal{
		Subject:         "usr_123",
		AccessLevel:     "user",
		APIKeyID:        "apk_123",
		Scopes:          []string{"finance:read", "spaces:read"},
		GrantedSpaceIDs: []string{"spc_1", "spc_2"},
	}
	if !apiKeyPrincipal.IsAPIKey() {
		t.Error("expected API key principal IsAPIKey() to be true")
	}
	if !apiKeyPrincipal.HasScope("finance:read", "finance:write") {
		t.Error("expected HasScope to match finance:read")
	}
	if apiKeyPrincipal.HasScope("finance:write") {
		t.Error("expected HasScope to reject finance:write")
	}
	if !apiKeyPrincipal.HasSpaceGrant("spc_1") {
		t.Error("expected HasSpaceGrant to allow spc_1")
	}
	if apiKeyPrincipal.HasSpaceGrant("spc_3") {
		t.Error("expected HasSpaceGrant to deny spc_3")
	}
}

func TestPrincipalContext(t *testing.T) {
	ctx := WithPrincipal(context.Background(), Principal{
		Subject:  "usr_1",
		APIKeyID: "apk_1",
	})
	p, ok := PrincipalFromContext(ctx)
	if !ok || p.Subject != "usr_1" || !p.IsAPIKey() {
		t.Fatalf("unexpected principal from context: ok=%v p=%+v", ok, p)
	}
}
