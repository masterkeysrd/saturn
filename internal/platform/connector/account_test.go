package connector_test

import (
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/connector"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAccountIDGenerationAndValidation(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name      string
		fn        func() (string, error)
		validator func(string) error
		prefix    string
	}{
		{
			name:      "ConnectedAccountID",
			fn:        connector.GenerateConnectedAccountID,
			validator: connector.ValidateConnectedAccountID,
			prefix:    connector.ConnectedAccountPrefix,
		},
		{
			name:      "AccountContactID",
			fn:        connector.GenerateAccountContactID,
			validator: connector.ValidateAccountContactID,
			prefix:    connector.AccountContactPrefix,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			id, err := tc.fn()
			require.NoError(t, err)
			assert.NotEmpty(t, id)
			assert.Contains(t, id, tc.prefix)

			err = tc.validator(id)
			assert.NoError(t, err)

			// Invalid prefix
			err = tc.validator("invalid_" + id)
			assert.Error(t, err)

			// Too short
			err = tc.validator("short")
			assert.Error(t, err)

			// Empty
			err = tc.validator("")
			assert.Error(t, err)
		})
	}
}

func TestConnectedAccountHelpers(t *testing.T) {
	t.Parallel()

	now := time.Now()
	future := now.Add(10 * time.Minute)
	past := now.Add(-10 * time.Minute)

	tests := []struct {
		name          string
		account       *connector.ConnectedAccount
		hasCap        connector.Capability
		wantHasCap    bool
		hasScope      string
		wantHasScope  bool
		wantHealthy   bool
		wantReauth    bool
		wantRateLimit bool
	}{
		{
			name: "healthy account with calendar and mail",
			account: &connector.ConnectedAccount{
				Status:              connector.AccountStatusHealthy,
				EnabledCapabilities: []string{"calendar", "mail"},
				GrantedScopes:       []string{"openid", "email", "https://www.googleapis.com/auth/calendar"},
			},
			hasCap:        connector.CapabilityCalendar,
			wantHasCap:    true,
			hasScope:      "https://www.googleapis.com/auth/calendar",
			wantHasScope:  true,
			wantHealthy:   true,
			wantReauth:    false,
			wantRateLimit: false,
		},
		{
			name: "reauth required account",
			account: &connector.ConnectedAccount{
				Status:              connector.AccountStatusReauthRequired,
				EnabledCapabilities: []string{"contacts"},
			},
			hasCap:        connector.CapabilityContacts,
			wantHasCap:    true,
			hasScope:      "calendar",
			wantHasScope:  false,
			wantHealthy:   false,
			wantReauth:    true,
			wantRateLimit: false,
		},
		{
			name: "rate limited account with active backoff",
			account: &connector.ConnectedAccount{
				Status:       connector.AccountStatusRateLimited,
				BackoffUntil: &future,
			},
			hasCap:        connector.CapabilityMail,
			wantHasCap:    false,
			wantHealthy:   false,
			wantReauth:    false,
			wantRateLimit: true,
		},
		{
			name: "rate limited account with expired backoff",
			account: &connector.ConnectedAccount{
				Status:       connector.AccountStatusRateLimited,
				BackoffUntil: &past,
			},
			hasCap:        connector.CapabilityMail,
			wantHasCap:    false,
			wantHealthy:   false,
			wantReauth:    false,
			wantRateLimit: false,
		},
		{
			name:          "nil account safe",
			account:       nil,
			hasCap:        connector.CapabilityCalendar,
			wantHasCap:    false,
			hasScope:      "openid",
			wantHasScope:  false,
			wantHealthy:   false,
			wantReauth:    false,
			wantRateLimit: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			assert.Equal(t, tc.wantHasCap, tc.account.HasCapability(tc.hasCap))
			assert.Equal(t, tc.wantHasScope, tc.account.HasScope(tc.hasScope))
			assert.Equal(t, tc.wantHealthy, tc.account.IsHealthy())
			assert.Equal(t, tc.wantReauth, tc.account.RequiresReauth())
			assert.Equal(t, tc.wantRateLimit, tc.account.IsRateLimited(now))
		})
	}
}
