package ai

import (
	"maps"
	"slices"
	"strings"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/patch"
)

// Driver identifies the upstream LLM protocol implementation.
type Driver string

const (
	DriverGemini           Driver = "gemini"
	DriverOpenAI           Driver = "openai"
	DriverAnthropic        Driver = "anthropic"
	DriverOpenRouter       Driver = "openrouter"
	DriverOllama           Driver = "ollama"
	DriverOpenAICompatible Driver = "openai_compatible"
)

// IsValid reports whether d is a supported provider driver.
func (d Driver) IsValid() bool {
	switch d {
	case DriverGemini, DriverOpenAI, DriverAnthropic, DriverOpenRouter, DriverOllama, DriverOpenAICompatible:
		return true
	default:
		return false
	}
}

// RequiresAPIKey reports whether d requires an API key by default.
func (d Driver) RequiresAPIKey() bool {
	return d != DriverOllama && d != DriverOpenAICompatible
}

// ProviderState represents the health verification state of a Provider.
type ProviderState string

const (
	ProviderStateUnverified ProviderState = "unverified"
	ProviderStateHealthy    ProviderState = "healthy"
	ProviderStateUnhealthy  ProviderState = "unhealthy"
)

// ProviderConfig holds non-secret connection configuration for a Provider.
type ProviderConfig struct {
	BaseURL *string `json:"base_url,omitempty"`
}

// ProviderSecret holds decrypted provider credentials stored encrypted at rest.
type ProviderSecret struct {
	APIKey  *string           `json:"api_key,omitempty"`
	Headers map[string]string `json:"headers,omitempty"`
}

// HasCredentials reports whether any API key or custom header is populated.
func (s *ProviderSecret) HasCredentials() bool {
	if s == nil {
		return false
	}
	if s.APIKey != nil && strings.TrimSpace(*s.APIKey) != "" {
		return true
	}
	return len(s.Headers) > 0
}

// Clone returns a deep copy of the ProviderSecret.
func (s *ProviderSecret) Clone() *ProviderSecret {
	if s == nil {
		return nil
	}
	out := &ProviderSecret{}
	if s.APIKey != nil {
		out.APIKey = new(*s.APIKey)
	}
	if s.Headers != nil {
		out.Headers = make(map[string]string, len(s.Headers))
		maps.Copy(out.Headers, s.Headers)
	}
	return out
}

// ProviderStatus records the latest verification check result.
type ProviderStatus struct {
	State          ProviderState `json:"state"`
	LastVerifiedAt *time.Time    `json:"last_verified_at,omitempty"`
	Error          *ErrorDetail  `json:"error,omitempty"`
}

// Provider represents a workspace LLM provider connection (`platform.ai_providers`).
type Provider struct {
	ID               string
	SpaceID          string
	Name             string
	Driver           Driver
	Config           ProviderConfig
	Secret           *ProviderSecret
	SecretCiphertext *string
	HasSecret        bool
	Status           ProviderStatus
	IsEnabled        bool
	CreateTime       time.Time
	UpdateTime       time.Time
}

// Validate checks Provider invariants, SSRF constraints on BaseURL, and normalizes fields.
func (p *Provider) Validate(allowPrivateNetworks ...bool) error {
	if p == nil {
		return errors.E(errors.Invalid, "provider payload is required")
	}
	allowPrivate := false
	if len(allowPrivateNetworks) > 0 {
		allowPrivate = allowPrivateNetworks[0]
	}
	p.Name = strings.TrimSpace(p.Name)
	if p.Name == "" {
		return errors.E(errors.Invalid, "provider name is required")
	}
	if len(p.Name) > 255 {
		return errors.E(errors.Invalid, "provider name must not exceed 255 characters")
	}
	if !p.Driver.IsValid() {
		return errors.E(errors.Invalid, "unsupported provider driver: "+string(p.Driver))
	}
	if p.Config.BaseURL != nil {
		trimmed := strings.TrimSpace(*p.Config.BaseURL)
		if trimmed == "" {
			p.Config.BaseURL = nil
		} else {
			if err := ValidateMCPURL(trimmed, allowPrivate); err != nil {
				return err
			}
			p.Config.BaseURL = new(trimmed)
		}
	}
	if p.Status.State == "" {
		p.Status.State = ProviderStateUnverified
	}
	p.HasSecret = p.Secret.HasCredentials() || (p.SecretCiphertext != nil && *p.SecretCiphertext != "")
	return nil
}

// ProviderPatchSchema defines patchable fields for Provider.
var ProviderPatchSchema = patch.NewSchema[Provider]().
	Field("name", func(p *Provider) *string { return &p.Name }).
	Field("is_enabled", func(p *Provider) *bool { return &p.IsEnabled }).
	Field("config", func(p *Provider) *ProviderConfig { return &p.Config }).
	Field("config.base_url", func(p *Provider) **string { return &p.Config.BaseURL }).
	Field("secret", func(p *Provider) **ProviderSecret { return &p.Secret }).
	Field("secret.api_key", func(p *Provider) **string { return &p.Secret.APIKey }).
	Field("secret.headers", func(p *Provider) *map[string]string { return &p.Secret.Headers })

// ApplyPatch applies partial updates from incoming according to mask.
func (p *Provider) ApplyPatch(incoming *Provider, mask []string, allowPrivateNetworks ...bool) error {
	if incoming == nil {
		return errors.E(errors.Invalid, "provider payload is required")
	}
	inCopy := *incoming
	if len(mask) == 0 {
		if inCopy.Secret == nil {
			inCopy.Secret = p.Secret.Clone()
		}
		if p.Secret == nil {
			p.Secret = &ProviderSecret{}
		}
		if inCopy.Secret == nil {
			inCopy.Secret = &ProviderSecret{}
		}
	} else if slices.Contains(mask, "secret.api_key") || slices.Contains(mask, "secret.headers") {
		if p.Secret == nil {
			p.Secret = &ProviderSecret{}
		}
		if inCopy.Secret == nil {
			inCopy.Secret = &ProviderSecret{}
		}
	}
	if err := ProviderPatchSchema.Apply(p, &inCopy, mask); err != nil {
		return errors.E(errors.Invalid, err)
	}
	if p.Secret != nil && !p.Secret.HasCredentials() {
		p.Secret = nil
	}
	p.UpdateTime = time.Now().UTC()
	return p.Validate(allowPrivateNetworks...)
}
