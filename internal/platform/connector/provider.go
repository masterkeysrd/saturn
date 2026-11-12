package connector

//go:generate go run github.com/masterkeysrd/saturn/tools/mockgen .

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"
)

var (
	// ErrInvalidGrant is returned when an OAuth refresh token or authorization code is rejected, expired, or revoked.
	ErrInvalidGrant = errors.New("invalid_grant: refresh token or authorization code is invalid or revoked")

	// ErrRateLimited is returned when upstream OAuth or API provider responds with HTTP 429 Too Many Requests.
	ErrRateLimited = errors.New("rate_limited: upstream provider rate limit exceeded")

	// ErrProviderNotFound is returned when an unregistered provider is requested.
	ErrProviderNotFound = errors.New("provider not registered")
)

// TokenResponse represents tokens and metadata returned by an OAuth2 provider exchange or refresh.
type TokenResponse struct {
	AccessToken   string
	RefreshToken  string
	Expiry        time.Time
	GrantedScopes []string
	Raw           map[string]any
}

// Identity represents identity details retrieved from an OAuth provider's userinfo/profile endpoint.
type Identity struct {
	ProviderAccountID string
	Email             string
	DisplayName       string
	AvatarURL         string
}

// Contact represents an external contact retrieved from a provider's contacts/people API.
type Contact struct {
	ProviderContactID string
	Email             string
	DisplayName       string
	AvatarURL         string
}

// OAuthProvider defines the contract that external OAuth2 adapters (Google, Microsoft) must implement.
// @Mock
type OAuthProvider interface {
	Provider() string
	AuthCodeURL(state string, challenge string, capabilities []Capability, promptConsent bool) string
	Exchange(ctx context.Context, code string, verifier string) (*TokenResponse, error)
	RefreshToken(ctx context.Context, refreshToken string) (*TokenResponse, error)
	RevokeToken(ctx context.Context, token string) error
	FetchIdentity(ctx context.Context, accessToken string) (*Identity, error)
	FetchContacts(ctx context.Context, accessToken string) ([]*Contact, error)
	ScopesForCapabilities(capabilities []Capability) []string
}

// CleanerFunc cleans up mirror tables and capability-specific records for an account within the active transaction context.
type CleanerFunc func(ctx context.Context, spaceID, accountID string) error

// CleanerRegistry manages CapabilityCleaner callbacks.
type CleanerRegistry struct {
	mu       sync.RWMutex
	cleaners map[Capability][]CleanerFunc
}

// NewCleanerRegistry initializes a new CleanerRegistry.
func NewCleanerRegistry() *CleanerRegistry {
	return &CleanerRegistry{
		cleaners: make(map[Capability][]CleanerFunc),
	}
}

// RegisterCleaner registers a capability-specific cleaner callback.
func (r *CleanerRegistry) RegisterCleaner(capability Capability, fn CleanerFunc) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.cleaners[capability] = append(r.cleaners[capability], fn)
}

// RunCleaners executes all registered cleaner callbacks for the given capabilities.
// If any cleaner fails, it returns the error immediately to allow database transaction rollback.
func (r *CleanerRegistry) RunCleaners(ctx context.Context, spaceID, accountID string, capabilities ...Capability) error {
	r.mu.RLock()
	defer r.mu.RUnlock()

	for _, cap := range capabilities {
		for _, fn := range r.cleaners[cap] {
			if err := fn(ctx, spaceID, accountID); err != nil {
				return fmt.Errorf("capability cleaner for %s failed: %w", cap, err)
			}
		}
	}
	return nil
}

// DefaultCleanerRegistry is the global singleton registry for capability cleaners.
var DefaultCleanerRegistry = NewCleanerRegistry()

// RegisterCleaner registers a cleaner hook into the default registry.
func RegisterCleaner(capability Capability, fn CleanerFunc) {
	DefaultCleanerRegistry.RegisterCleaner(capability, fn)
}

// ProviderRegistry maintains registered OAuth providers.
type ProviderRegistry struct {
	mu        sync.RWMutex
	providers map[string]OAuthProvider
}

// NewProviderRegistry creates an empty ProviderRegistry.
func NewProviderRegistry() *ProviderRegistry {
	return &ProviderRegistry{
		providers: make(map[string]OAuthProvider),
	}
}

// Register adds an OAuthProvider to the registry.
func (r *ProviderRegistry) Register(p OAuthProvider) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.providers[p.Provider()] = p
}

// Get retrieves an OAuthProvider by provider name.
func (r *ProviderRegistry) Get(provider string) (OAuthProvider, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	p, ok := r.providers[provider]
	if !ok {
		return nil, fmt.Errorf("%w: %s", ErrProviderNotFound, provider)
	}
	return p, nil
}
