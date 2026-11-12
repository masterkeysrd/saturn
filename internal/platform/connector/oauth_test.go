package connector_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/connector"
	"github.com/masterkeysrd/saturn/internal/platform/crypto"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPKCEDerivation(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		verifier string
		wantS256 string
	}{
		{
			name:     "RFC 7636 Appendix B test vector",
			verifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
			wantS256: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			got := connector.DerivePKCEChallenge(tc.verifier)
			assert.Equal(t, tc.wantS256, got)
		})
	}

	t.Run("GeneratePKCE randomness and RFC compliance", func(t *testing.T) {
		t.Parallel()

		v1, c1, err := connector.GeneratePKCE()
		require.NoError(t, err)
		assert.Len(t, v1, 43)
		assert.NotEmpty(t, c1)
		assert.Equal(t, connector.DerivePKCEChallenge(v1), c1)

		v2, c2, err := connector.GeneratePKCE()
		require.NoError(t, err)
		assert.NotEqual(t, v1, v2)
		assert.NotEqual(t, c1, c2)
	})
}

func TestValidateReturnURL(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name      string
		returnURL string
		wantErr   bool
	}{
		{
			name:      "valid root path",
			returnURL: "/",
			wantErr:   false,
		},
		{
			name:      "valid relative settings path",
			returnURL: "/settings/connected-accounts",
			wantErr:   false,
		},
		{
			name:      "valid relative path with query parameters",
			returnURL: "/spaces/spc_123/integrations?tab=google&page=1",
			wantErr:   false,
		},
		{
			name:      "empty url",
			returnURL: "",
			wantErr:   true,
		},
		{
			name:      "protocol relative url with double slashes",
			returnURL: "//evil.com/phish",
			wantErr:   true,
		},
		{
			name:      "slash backslash attempt",
			returnURL: "/\\evil.com/phish",
			wantErr:   true,
		},
		{
			name:      "backslash in path",
			returnURL: "/foo\\bar",
			wantErr:   true,
		},
		{
			name:      "absolute http URL",
			returnURL: "http://evil.com/redirect",
			wantErr:   true,
		},
		{
			name:      "valid absolute https URL",
			returnURL: "https://app.saturn.local/settings/connectors",
			wantErr:   false,
		},
		{
			name:      "valid mobile saturn deep link",
			returnURL: "saturn://connectors/callback",
			wantErr:   false,
		},
		{
			name:      "valid local dev http URL",
			returnURL: "http://localhost:8080/api/v1/connectors/callback",
			wantErr:   false,
		},
		{
			name:      "javascript pseudo protocol",
			returnURL: "javascript:alert(1)",
			wantErr:   true,
		},
		{
			name:      "missing leading slash",
			returnURL: "settings/accounts",
			wantErr:   true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			err := connector.ValidateReturnURL(tc.returnURL)
			if tc.wantErr {
				assert.Error(t, err)
				assert.True(t, errors.Is(err, connector.ErrInvalidReturnURL))
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

func TestCalculateIncrementalScopes(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name           string
		grantedScopes  []string
		requiredScopes []string
		wantMissing    []string
	}{
		{
			name:           "all scopes already granted",
			grantedScopes:  []string{"openid", "email", "https://www.googleapis.com/auth/calendar"},
			requiredScopes: []string{"openid", "email"},
			wantMissing:    []string{},
		},
		{
			name:           "new capability scope needed",
			grantedScopes:  []string{"openid", "email"},
			requiredScopes: []string{"openid", "email", "https://www.googleapis.com/auth/calendar"},
			wantMissing:    []string{"https://www.googleapis.com/auth/calendar"},
		},
		{
			name:           "multiple scopes needed with whitespace and duplicates",
			grantedScopes:  []string{"openid"},
			requiredScopes: []string{"openid", "email", "https://www.googleapis.com/auth/calendar", "email"},
			wantMissing:    []string{"email", "https://www.googleapis.com/auth/calendar"},
		},
		{
			name:           "empty granted scopes",
			grantedScopes:  nil,
			requiredScopes: []string{"openid", "email"},
			wantMissing:    []string{"email", "openid"},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			got := connector.CalculateIncrementalScopes(tc.grantedScopes, tc.requiredScopes)
			assert.Equal(t, tc.wantMissing, got)
		})
	}
}

func TestMergeScopes(t *testing.T) {
	t.Parallel()

	existing := []string{"openid", "email"}
	newScopes := []string{"email", "https://www.googleapis.com/auth/calendar"}

	merged := connector.MergeScopes(existing, newScopes)
	expected := []string{"email", "https://www.googleapis.com/auth/calendar", "openid"}
	assert.Equal(t, expected, merged)
}

func TestOAuthSessionLifecycle(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	cipher, err := crypto.NewCipher("test-encryption-key-32byteslong!")
	require.NoError(t, err)

	t.Run("successful initiate and consume session", func(t *testing.T) {
		t.Parallel()

		var savedState *connector.OAuthState
		storeMock := &connector.StoreMock{
			CreateOAuthStateFunc: func(ctx context.Context, state *connector.OAuthState) error {
				savedState = state
				return nil
			},
			ConsumeOAuthStateFunc: func(ctx context.Context, stateHash string) (*connector.OAuthState, error) {
				if savedState != nil && savedState.StateHash == stateHash {
					s := savedState
					savedState = nil // single use consumption
					return s, nil
				}
				return nil, nil
			},
		}

		mgr := connector.NewOAuthManager(storeMock, cipher)

		req := connector.CreateStateRequest{
			SpaceID:      "spc_1",
			UserID:       "usr_1",
			Provider:     "google",
			Capabilities: []connector.Capability{connector.CapabilityCalendar},
			ReturnURL:    "/settings/connectors",
			TTL:          10 * time.Minute,
		}

		initiated, err := mgr.InitiateSession(ctx, req)
		require.NoError(t, err)
		assert.NotEmpty(t, initiated.RawState)
		assert.NotEmpty(t, initiated.StateHash)
		assert.NotEmpty(t, initiated.CodeVerifier)
		assert.NotEmpty(t, initiated.CodeChallenge)
		require.NotNil(t, savedState)
		assert.Contains(t, savedState.CodeVerifierEnc, crypto.Prefix)

		// 1. First consume succeeds
		stateRecord, verifier, err := mgr.ConsumeSession(ctx, initiated.RawState)
		require.NoError(t, err)
		assert.Equal(t, initiated.CodeVerifier, verifier)
		assert.Equal(t, "spc_1", stateRecord.SpaceID)
		assert.Equal(t, "usr_1", stateRecord.UserID)

		// 2. Replay consumption rejected
		_, _, err = mgr.ConsumeSession(ctx, initiated.RawState)
		assert.ErrorIs(t, err, connector.ErrInvalidState)
	})

	t.Run("expired state rejection", func(t *testing.T) {
		t.Parallel()

		storeMock := &connector.StoreMock{
			CreateOAuthStateFunc: func(ctx context.Context, state *connector.OAuthState) error {
				return nil
			},
			ConsumeOAuthStateFunc: func(ctx context.Context, stateHash string) (*connector.OAuthState, error) {
				// Simulate state returned that was already past expiration
				encVerifier, _ := cipher.Encrypt("some-verifier")
				return &connector.OAuthState{
					StateHash:       stateHash,
					CodeVerifierEnc: encVerifier,
					ExpiresAt:       time.Now().Add(-1 * time.Minute),
				}, nil
			},
		}

		mgr := connector.NewOAuthManager(storeMock, cipher)
		_, _, err := mgr.ConsumeSession(ctx, "expired-raw-state")
		assert.ErrorIs(t, err, connector.ErrInvalidState)
	})

	t.Run("invalid raw state parameter", func(t *testing.T) {
		t.Parallel()

		mgr := connector.NewOAuthManager(&connector.StoreMock{}, cipher)
		_, _, err := mgr.ConsumeSession(ctx, "")
		assert.ErrorIs(t, err, connector.ErrInvalidState)
	})
}
