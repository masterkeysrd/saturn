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

func TestProvider_ApplyPatch_NilSecretSafetyAndBaseURLSSRF(t *testing.T) {
	p := &Provider{
		ID:     "prv_1",
		Name:   "OpenAI",
		Driver: DriverOpenAI,
		Secret: &ProviderSecret{APIKey: new("sk-keep")},
	}
	// Empty mask (full update) with incoming.Secret == nil must not panic and must preserve existing secret.
	if err := p.ApplyPatch(&Provider{Name: "OpenAI v2", Driver: DriverOpenAI}, nil); err != nil {
		t.Fatalf("ApplyPatch(nil mask) failed: %v", err)
	}
	if p.Secret == nil || p.Secret.APIKey == nil || *p.Secret.APIKey != "sk-keep" {
		t.Fatalf("expected existing secret preserved on full update with nil incoming secret, got %+v", p.Secret)
	}

	// Nil initial secret + mask containing both "secret" and "secret.api_key" with nil incoming.Secret must not panic.
	p2 := &Provider{ID: "prv_2", Name: "Anthropic", Driver: DriverAnthropic}
	if err := p2.ApplyPatch(&Provider{Name: "Anthropic"}, []string{"secret", "secret.api_key"}); err != nil {
		t.Fatalf("ApplyPatch(secret + secret.api_key) failed: %v", err)
	}

	// BaseURL SSRF validation rejects metadata IP even with allowPrivateNetworks=true, and localhost when false.
	metaProv := &Provider{Name: "Meta", Driver: DriverOpenAICompatible, Config: ProviderConfig{BaseURL: new("http://169.254.169.254/v1")}}
	if err := metaProv.Validate(true); !errors.Is(err, ErrProviderSSRFBlocked) {
		t.Fatalf("expected ErrProviderSSRFBlocked for metadata BaseURL, got %v", err)
	}
	localProv := &Provider{Name: "Local", Driver: DriverOllama, Config: ProviderConfig{BaseURL: new("http://localhost:11434")}}
	if err := localProv.Validate(false); !errors.Is(err, ErrProviderSSRFBlocked) {
		t.Fatalf("expected ErrProviderSSRFBlocked for localhost BaseURL when allowPrivate=false, got %v", err)
	}
	if err := localProv.Validate(true); err != nil {
		t.Fatalf("expected localhost BaseURL allowed when allowPrivate=true, got %v", err)
	}
	badSchemeProv := &Provider{Name: "BadScheme", Driver: DriverOpenAICompatible, Config: ProviderConfig{BaseURL: new("ftp://example.com/v1")}}
	if err := badSchemeProv.Validate(true); !errors.Is(err, ErrInvalidProviderURL) {
		t.Fatalf("expected ErrInvalidProviderURL for ftp BaseURL, got %v", err)
	}
}
