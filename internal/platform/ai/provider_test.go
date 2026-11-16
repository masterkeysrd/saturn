package ai

import (
	"testing"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

func TestProvider_ValidateAndApplyPatch(t *testing.T) {
	tests := []struct {
		name      string
		initial   *Provider
		incoming  *Provider
		mask      []string
		wantErr   bool
		wantName  string
		wantURL   string
		wantKey   string
		wantState ProviderState
	}{
		{
			name: "validates and patches nested config.base_url and secret.api_key",
			initial: &Provider{
				ID:        "prv_1",
				SpaceID:   "spc_1",
				Name:      "OpenAI",
				Driver:    DriverOpenAI,
				IsEnabled: true,
				Secret:    &ProviderSecret{APIKey: new("sk-old"), Headers: map[string]string{"X-Org": "org1"}},
			},
			incoming: &Provider{
				Name:   "  OpenAI Prod  ",
				Config: ProviderConfig{BaseURL: new("https://api.openai.com/v1")},
				Secret: &ProviderSecret{APIKey: new("sk-new")},
			},
			mask:      []string{"name", "config.base_url", "secret.api_key"},
			wantName:  "OpenAI Prod",
			wantURL:   "https://api.openai.com/v1",
			wantKey:   "sk-new",
			wantState: ProviderStateUnverified,
		},
		{
			name: "rejects unsupported driver",
			initial: &Provider{
				Name:   "Custom",
				Driver: Driver("unknown"),
			},
			wantErr: true,
		},
		{
			name: "rejects unsupported patch field",
			initial: &Provider{
				Name:   "Gemini",
				Driver: DriverGemini,
			},
			incoming: &Provider{Name: "X"},
			mask:     []string{"driver"},
			wantErr:  true,
		},
		{
			name: "rejects empty name",
			initial: &Provider{
				Name:   "   ",
				Driver: DriverOllama,
			},
			wantErr: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			var err error
			if len(tc.mask) > 0 {
				err = tc.initial.ApplyPatch(tc.incoming, tc.mask)
			} else {
				err = tc.initial.Validate()
			}
			if tc.wantErr {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				if errors.KindOf(err) != errors.Invalid {
					t.Errorf("kind = %v, want Invalid", errors.KindOf(err))
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if tc.initial.Name != tc.wantName {
				t.Errorf("name = %q, want %q", tc.initial.Name, tc.wantName)
			}
			if tc.wantURL != "" && (tc.initial.Config.BaseURL == nil || *tc.initial.Config.BaseURL != tc.wantURL) {
				t.Errorf("base_url = %v, want %q", tc.initial.Config.BaseURL, tc.wantURL)
			}
			if tc.wantKey != "" && (tc.initial.Secret == nil || tc.initial.Secret.APIKey == nil || *tc.initial.Secret.APIKey != tc.wantKey) {
				t.Errorf("api_key = %+v, want %q", tc.initial.Secret, tc.wantKey)
			}
			if tc.initial.Secret.Headers["X-Org"] != "org1" {
				t.Errorf("expected existing secret.headers preserved, got %+v", tc.initial.Secret.Headers)
			}
			if tc.initial.Status.State != tc.wantState {
				t.Errorf("status.state = %q, want %q", tc.initial.Status.State, tc.wantState)
			}
		})
	}
}
