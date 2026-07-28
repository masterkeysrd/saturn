package agent

import (
	"context"
	"fmt"

	"github.com/masterkeysrd/saturn/internal/platform/crypto"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
)

// ProviderStore abstracts database persistence for LLM Provider configurations.
type ProviderStore interface {
	CreateProvider(ctx context.Context, spaceID string, name string, mode CompatibilityMode, url *string, key *string) (*LLMProvider, error)
	GetProvider(ctx context.Context, q GetLLMProvider) (*LLMProvider, error)
	ListProviders(ctx context.Context, spaceID string) ([]*LLMProvider, error)
	UpdateProvider(ctx context.Context, spaceID string, id string, name string, url *string, key *string) (*LLMProvider, error)
	DeleteProvider(ctx context.Context, spaceID string, id string) error

	GetAgent(ctx context.Context, q GetAgent) (*Agent, error)
	LogRun(ctx context.Context, agentID string, spaceID string, status AgentRunStatus, input string, output *string, errMsg *string, tokens int) (*AgentRun, error)
	CreateAgent(ctx context.Context, spaceID string, providerID *string, name string, desc *string, purpose string, tags []string, model string, prompt *string, temp float64) (*Agent, error)
	ListAgents(ctx context.Context, spaceID string) ([]*Agent, error)
	UpdateAgent(ctx context.Context, spaceID string, id string, providerID *string, name string, desc *string, tags []string, model string, prompt *string, temp float64, isEnabled bool) (*Agent, error)
	DeleteAgent(ctx context.Context, spaceID string, id string) error
	ListRuns(ctx context.Context, q ListAgentRuns) (*paging.Page[*AgentRun], error)
}

// EncryptedStore decorates a ProviderStore to handle field-level AES-256-GCM encryption on API keys.
type EncryptedStore struct {
	next   ProviderStore
	cipher *crypto.Cipher
}

// NewEncryptedStore creates a Decorator for field-level API key encryption.
func NewEncryptedStore(next ProviderStore, secretKey string) (*EncryptedStore, error) {
	cipher, err := crypto.NewCipher(secretKey)
	if err != nil {
		return nil, fmt.Errorf("init cipher: %w", err)
	}
	return &EncryptedStore{
		next:   next,
		cipher: cipher,
	}, nil
}

func (s *EncryptedStore) CreateProvider(ctx context.Context, spaceID string, name string, mode CompatibilityMode, url *string, key *string) (*LLMProvider, error) {
	var encKey *string
	if key != nil && *key != "" {
		encrypted, err := s.cipher.Encrypt(*key)
		if err != nil {
			return nil, fmt.Errorf("encrypt api_key: %w", err)
		}
		encKey = &encrypted
	}

	p, err := s.next.CreateProvider(ctx, spaceID, name, mode, url, encKey)
	if err != nil {
		return nil, err
	}

	s.decryptProvider(p)
	return p, nil
}

func (s *EncryptedStore) GetProvider(ctx context.Context, q GetLLMProvider) (*LLMProvider, error) {
	p, err := s.next.GetProvider(ctx, q)
	if err != nil || p == nil {
		return p, err
	}

	s.decryptProvider(p)
	return p, nil
}

func (s *EncryptedStore) ListProviders(ctx context.Context, spaceID string) ([]*LLMProvider, error) {
	list, err := s.next.ListProviders(ctx, spaceID)
	if err != nil {
		return nil, err
	}

	for _, p := range list {
		s.decryptProvider(p)
	}

	return list, nil
}

func (s *EncryptedStore) UpdateProvider(ctx context.Context, spaceID string, id string, name string, url *string, key *string) (*LLMProvider, error) {
	var encKey *string
	if key != nil && *key != "" {
		encrypted, err := s.cipher.Encrypt(*key)
		if err != nil {
			return nil, fmt.Errorf("encrypt api_key: %w", err)
		}
		encKey = &encrypted
	}

	p, err := s.next.UpdateProvider(ctx, spaceID, id, name, url, encKey)
	if err != nil {
		return nil, err
	}

	s.decryptProvider(p)
	return p, nil
}

func (s *EncryptedStore) decryptProvider(p *LLMProvider) {
	if p == nil || p.APIKey == nil || *p.APIKey == "" {
		return
	}
	decrypted, err := s.cipher.Decrypt(*p.APIKey)
	if err == nil {
		p.APIKey = &decrypted
	}
}

// Delegate unencrypted methods directly to inner store:

func (s *EncryptedStore) DeleteProvider(ctx context.Context, spaceID string, id string) error {
	return s.next.DeleteProvider(ctx, spaceID, id)
}

func (s *EncryptedStore) GetAgent(ctx context.Context, q GetAgent) (*Agent, error) {
	return s.next.GetAgent(ctx, q)
}

func (s *EncryptedStore) LogRun(ctx context.Context, agentID string, spaceID string, status AgentRunStatus, input string, output *string, errMsg *string, tokens int) (*AgentRun, error) {
	return s.next.LogRun(ctx, agentID, spaceID, status, input, output, errMsg, tokens)
}

func (s *EncryptedStore) CreateAgent(ctx context.Context, spaceID string, providerID *string, name string, desc *string, purpose string, tags []string, model string, prompt *string, temp float64) (*Agent, error) {
	return s.next.CreateAgent(ctx, spaceID, providerID, name, desc, purpose, tags, model, prompt, temp)
}

func (s *EncryptedStore) ListAgents(ctx context.Context, spaceID string) ([]*Agent, error) {
	return s.next.ListAgents(ctx, spaceID)
}

func (s *EncryptedStore) UpdateAgent(ctx context.Context, spaceID string, id string, providerID *string, name string, desc *string, tags []string, model string, prompt *string, temp float64, isEnabled bool) (*Agent, error) {
	return s.next.UpdateAgent(ctx, spaceID, id, providerID, name, desc, tags, model, prompt, temp, isEnabled)
}

func (s *EncryptedStore) DeleteAgent(ctx context.Context, spaceID string, id string) error {
	return s.next.DeleteAgent(ctx, spaceID, id)
}

func (s *EncryptedStore) ListRuns(ctx context.Context, q ListAgentRuns) (*paging.Page[*AgentRun], error) {
	return s.next.ListRuns(ctx, q)
}
