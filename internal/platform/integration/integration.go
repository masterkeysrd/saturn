package integration

import (
	"context"
	"sync"
	"time"

	"github.com/jmoiron/sqlx"
)

// Descriptor holds catalog metadata for an integration.
type Descriptor struct {
	Provider       string `json:"provider"`
	Kind           string `json:"kind"`
	Name           string `json:"name"`
	Description    string `json:"description"`
	Icon           string `json:"icon"`
	ConfigSchema   string `json:"config_schema"`
	RequestSchema  string `json:"request_schema"`
	ResponseSchema string `json:"response_schema"`
	SamplePayload  string `json:"sample_payload"`
}

// Provider defines the contract that concrete integration adapters (e.g., Stripe, Cloudflare) must implement.
type Provider interface {
	Provider() string
	Kind() string
	Descriptor() Descriptor
	Verify(ctx context.Context, headers map[string][]string, body []byte) error
	Process(ctx context.Context, headers map[string][]string, body []byte) error
}

// Integration represents a configured connection in the database.
type Integration struct {
	ID         string    `db:"id"`
	SpaceID    string    `db:"space_id"`
	Kind       string    `db:"kind"`
	Provider   string    `db:"provider"`
	Config     string    `db:"config"` // JSON string representation
	IsEnabled  bool      `db:"is_enabled"`
	CreateTime time.Time `db:"create_time"`
	UpdateTime time.Time `db:"update_time"`
}

// IntegrationToken represents a cryptographically secure token assigned to an integration.
type IntegrationToken struct {
	ID            string     `db:"id"`
	IntegrationID string     `db:"integration_id"`
	Name          string     `db:"name"`
	TokenHash     string     `db:"token_hash"`
	CreateTime    time.Time  `db:"create_time"`
	LastUsedTime  *time.Time `db:"last_used_time"`
}

// Registry maintains a thread-safe map of active concrete integration providers in memory.
type Registry struct {
	db        *sqlx.DB
	providers map[string]Provider
	mu        sync.RWMutex
}

// NewRegistry instantiates a new platform integration Registry.
func NewRegistry(db *sqlx.DB) *Registry {
	return &Registry{
		db:        db,
		providers: make(map[string]Provider),
	}
}

// Register registers a concrete integration provider.
func (r *Registry) Register(p Provider) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.providers[p.Provider()+":"+p.Kind()] = p
}

// GetProvider retrieves a registered provider by name (returns the first matching provider for backward compatibility).
func (r *Registry) GetProvider(provider string) (Provider, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	for _, p := range r.providers {
		if p.Provider() == provider {
			return p, true
		}
	}
	return nil, false
}

// GetProviderByKind retrieves a registered provider matching both name and kind.
func (r *Registry) GetProviderByKind(provider, kind string) (Provider, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	p, exists := r.providers[provider+":"+kind]
	return p, exists
}

// ListCatalog returns the aggregated catalog descriptors from all registered providers.
func (r *Registry) ListCatalog() []Descriptor {
	r.mu.RLock()
	defer r.mu.RUnlock()
	list := make([]Descriptor, 0, len(r.providers))
	for _, p := range r.providers {
		list = append(list, p.Descriptor())
	}
	return list
}

// GetIntegration is the parameter struct for resolving an integration.
type GetIntegration struct {
	SpaceID  string
	Provider string
	Kind     string
}

// ConfigureIntegration is the parameter struct for registering or updating an integration.
type ConfigureIntegration struct {
	SpaceID    string
	Kind       string
	Provider   string
	ConfigJSON string
	IsEnabled  bool
}
