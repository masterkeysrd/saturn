package identity

import (
	"crypto/sha256"
	"encoding/base64"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

func TestOAuthClient_Validate(t *testing.T) {
	validSpaceID := "spc_000000000000000000000000001"

	tests := []struct {
		name              string
		client            *OAuthClient
		expectedError     bool
		expectedErrorCode errors.Code
	}{
		{
			name: "Valid instance client with HTTPS exact, subpath prefix, and loopback URIs",
			client: &OAuthClient{
				Name: "Remote MCP Client",
				RedirectURIs: []string{
					"https://app.example.com/oauth/callback",
					"https://broker.example.com/oauth/*",
					"http://127.0.0.1:8080/callback",
					"http://[::1]:9000/cb",
					"http://localhost/cb",
				},
				AllowedScopes:           []string{"spaces:read", "finance:read"},
				TokenEndpointAuthMethod: TokenAuthMethodClientSecretBasic,
				RefreshTokenPolicy:      RefreshTokenPolicyRotate,
				RegistrationSource:      RegistrationSourceAdmin,
			},
			expectedError: false,
		},
		{
			name: "Valid workspace client with persistent refresh policy",
			client: &OAuthClient{
				SpaceID:                 new(validSpaceID),
				Name:                    "Workspace Server Connector",
				RedirectURIs:            []string{"https://connector.example.org/cb/*"},
				AllowedScopes:           []string{"finance:read", "finance:write"},
				TokenEndpointAuthMethod: TokenAuthMethodClientSecretPost,
				RefreshTokenPolicy:      RefreshTokenPolicyPersistent,
				RegistrationSource:      RegistrationSourceSpace,
			},
			expectedError: false,
		},
		{
			name:              "Nil client fails",
			client:            nil,
			expectedError:     true,
			expectedErrorCode: OAuthInvalidClient,
		},
		{
			name: "Empty name fails",
			client: &OAuthClient{
				Name:               "   ",
				RedirectURIs:       []string{"https://app.example.com/cb"},
				AllowedScopes:      []string{"spaces:read"},
				RegistrationSource: RegistrationSourceAdmin,
			},
			expectedError:     true,
			expectedErrorCode: OAuthInvalidClient,
		},
		{
			name: "Wildcard host rejected",
			client: &OAuthClient{
				Name:               "Wildcard Host",
				RedirectURIs:       []string{"https://*.example.com/cb"},
				AllowedScopes:      []string{"spaces:read"},
				RegistrationSource: RegistrationSourceAdmin,
			},
			expectedError:     true,
			expectedErrorCode: OAuthInvalidRedirectURI,
		},
		{
			name: "Root wildcard path rejected",
			client: &OAuthClient{
				Name:               "Root Wildcard Path",
				RedirectURIs:       []string{"https://example.com/*"},
				AllowedScopes:      []string{"spaces:read"},
				RegistrationSource: RegistrationSourceAdmin,
			},
			expectedError:     true,
			expectedErrorCode: OAuthInvalidRedirectURI,
		},
		{
			name: "Non-loopback http rejected",
			client: &OAuthClient{
				Name:               "Insecure HTTP",
				RedirectURIs:       []string{"http://example.com/cb"},
				AllowedScopes:      []string{"spaces:read"},
				RegistrationSource: RegistrationSourceAdmin,
			},
			expectedError:     true,
			expectedErrorCode: OAuthInvalidRedirectURI,
		},
		{
			name: "Invalid scope rejected",
			client: &OAuthClient{
				Name:               "Bad Scope",
				RedirectURIs:       []string{"https://example.com/cb"},
				AllowedScopes:      []string{"superadmin:all"},
				RegistrationSource: RegistrationSourceAdmin,
			},
			expectedError:     true,
			expectedErrorCode: OAuthInvalidScope,
		},
		{
			name: "Unsupported refresh token policy rejected",
			client: &OAuthClient{
				Name:               "Bad Refresh Policy",
				RedirectURIs:       []string{"https://example.com/cb"},
				AllowedScopes:      []string{"spaces:read"},
				RefreshTokenPolicy: RefreshTokenPolicy("forever"),
				RegistrationSource: RegistrationSourceAdmin,
			},
			expectedError:     true,
			expectedErrorCode: OAuthInvalidClient,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := tc.client.Validate()
			if tc.expectedError {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				if tc.expectedErrorCode != "" && errors.CodeOf(err) != tc.expectedErrorCode {
					t.Fatalf("expected error code %q, got %q (%v)", tc.expectedErrorCode, errors.CodeOf(err), err)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
		})
	}
}

func TestOAuthClient_MatchesRedirectURI(t *testing.T) {
	client := &OAuthClient{
		RedirectURIs: []string{
			"https://exact.example.com/oauth/callback",
			"https://broker.example.com/oauth/cb/*",
			"http://127.0.0.1/callback",
			"http://[::1]:5555/cb",
			"http://localhost:3000/done",
		},
	}

	tests := []struct {
		name      string
		candidate string
		want      bool
	}{
		{name: "exact https match", candidate: "https://exact.example.com/oauth/callback", want: true},
		{name: "exact https mismatch path", candidate: "https://exact.example.com/oauth/callback/extra", want: false},
		{name: "subpath prefix match", candidate: "https://broker.example.com/oauth/cb/session-123", want: true},
		{name: "subpath prefix root match", candidate: "https://broker.example.com/oauth/cb/", want: true},
		{name: "subpath prefix rejects path traversal", candidate: "https://broker.example.com/oauth/cb/../admin", want: false},
		{name: "subpath prefix rejects wrong host", candidate: "https://evil.example.com/oauth/cb/session-123", want: false},
		{name: "RFC 8252 IPv4 loopback ignores ephemeral port", candidate: "http://127.0.0.1:49152/callback", want: true},
		{name: "RFC 8252 IPv6 loopback ignores ephemeral port", candidate: "http://[::1]:61234/cb", want: true},
		{name: "RFC 8252 localhost ignores ephemeral port", candidate: "http://localhost:9999/done", want: true},
		{name: "loopback rejects wrong path", candidate: "http://127.0.0.1:49152/other", want: false},
		{name: "candidate with fragment rejected", candidate: "https://exact.example.com/oauth/callback#frag", want: false},
		{name: "candidate with wildcard rejected", candidate: "https://broker.example.com/oauth/cb/*", want: false},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := client.MatchesRedirectURI(tc.candidate); got != tc.want {
				t.Errorf("MatchesRedirectURI(%q) = %v, want %v", tc.candidate, got, tc.want)
			}
		})
	}
}

func TestResolveRequestedOAuthScopes(t *testing.T) {
	tests := []struct {
		name          string
		requested     []string
		clientAllowed []string
		memberRole    string
		wantScopes    []string
		wantOffline   bool
		wantErr       bool
	}{
		{
			name:          "Omitted scopes default to client read-only subset",
			requested:     nil,
			clientAllowed: []string{"spaces:read", "finance:read", "finance:write", "mail:read"},
			memberRole:    "member",
			wantScopes:    []string{"spaces:read", "finance:read", "mail:read"},
		},
		{
			name:          "OIDC hints ignored and offline_access tracked",
			requested:     []string{"openid", "profile", "email", "offline_access"},
			clientAllowed: []string{"spaces:read", "finance:read", "finance:write"},
			memberRole:    "owner",
			wantScopes:    []string{"spaces:read", "finance:read"},
			wantOffline:   true,
		},
		{
			name:          "Explicit scopes intersected with client ceiling",
			requested:     []string{"openid", "finance:read", "finance:write", "mail:write"},
			clientAllowed: []string{"spaces:read", "finance:read", "finance:write"},
			memberRole:    "member",
			wantScopes:    []string{"finance:read", "finance:write"},
		},
		{
			name:          "Viewer role capped strictly to :read scopes",
			requested:     []string{"finance:read", "finance:write", "ai:execute"},
			clientAllowed: []string{"finance:read", "finance:write", "ai:execute"},
			memberRole:    "viewer",
			wantScopes:    []string{"finance:read"},
		},
		{
			name:          "Viewer requesting only write scopes fails",
			requested:     []string{"finance:write"},
			clientAllowed: []string{"finance:read", "finance:write"},
			memberRole:    "viewer",
			wantErr:       true,
		},
		{
			name:          "Disjoint requested scopes fail",
			requested:     []string{"mail:write"},
			clientAllowed: []string{"finance:read"},
			memberRole:    "owner",
			wantErr:       true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, offline, err := ResolveRequestedOAuthScopes(tc.requested, tc.clientAllowed, tc.memberRole)
			if tc.wantErr {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if offline != tc.wantOffline {
				t.Errorf("offlineAccess = %v, want %v", offline, tc.wantOffline)
			}
			if !slices.Equal(got, tc.wantScopes) {
				t.Errorf("scopes = %v, want %v", got, tc.wantScopes)
			}
		})
	}
}

func TestVerifyPKCES256(t *testing.T) {
	validVerifier := strings.Repeat("aB1-_~.", 7) // 49 chars in unreserved set
	sum := sha256.Sum256([]byte(validVerifier))
	validChallenge := base64.RawURLEncoding.EncodeToString(sum[:])

	tests := []struct {
		name      string
		verifier  string
		challenge string
		want      bool
	}{
		{name: "valid S256 verifier", verifier: validVerifier, challenge: validChallenge, want: true},
		{name: "wrong verifier", verifier: strings.Repeat("x", 48), challenge: validChallenge, want: false},
		{name: "too short verifier (<43)", verifier: strings.Repeat("a", 42), challenge: validChallenge, want: false},
		{name: "too long verifier (>128)", verifier: strings.Repeat("a", 129), challenge: validChallenge, want: false},
		{name: "invalid char in verifier", verifier: strings.Repeat("a", 42) + "+", challenge: validChallenge, want: false},
		{name: "empty challenge", verifier: validVerifier, challenge: "", want: false},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := VerifyPKCES256(tc.verifier, tc.challenge); got != tc.want {
				t.Errorf("VerifyPKCES256() = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestOAuthClient_ApplyPatch(t *testing.T) {
	now := time.Now().UTC()
	client := &OAuthClient{
		ID:                      "oac_1",
		Name:                    "Old Name",
		Description:             "Old desc",
		RedirectURIs:            []string{"https://old.example.com/cb"},
		AllowedScopes:           []string{"spaces:read"},
		TokenEndpointAuthMethod: TokenAuthMethodClientSecretBasic,
		RefreshTokenPolicy:      RefreshTokenPolicyRotate,
		RegistrationSource:      RegistrationSourceAdmin,
		CreateTime:              now,
		UpdateTime:              now,
	}

	err := client.ApplyPatch(&OAuthClient{
		Name:               "New Name",
		RefreshTokenPolicy: RefreshTokenPolicyPersistent,
	}, []string{"name", "refresh_token_policy"})
	if err != nil {
		t.Fatalf("unexpected patch error: %v", err)
	}
	if client.Name != "New Name" || client.RefreshTokenPolicy != RefreshTokenPolicyPersistent {
		t.Fatalf("unexpected patched client: %+v", client)
	}
	if client.Description != "Old desc" {
		t.Errorf("unmasked description mutated: %q", client.Description)
	}
}
