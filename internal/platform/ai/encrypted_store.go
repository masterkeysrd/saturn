package ai

import (
	"context"
	"encoding/json/v2"
	"fmt"
	"strings"

	"github.com/masterkeysrd/saturn/internal/platform/crypto"
)

// EncryptedStore decorates Store to encrypt Provider.Secret and MCPServer.AuthSecret at rest using AES-256-GCM.
type EncryptedStore struct {
	next       Store
	cipher     *crypto.Cipher
	providers  *encryptedProviderStore
	mcpServers *encryptedMCPServerStore
}

// NewEncryptedStore creates a Store decorator encrypting provider and MCP server credentials.
func NewEncryptedStore(next Store, secretKey string) (*EncryptedStore, error) {
	cipher, err := crypto.NewCipher(secretKey)
	if err != nil {
		return nil, fmt.Errorf("init cipher: %w", err)
	}
	es := &EncryptedStore{
		next:   next,
		cipher: cipher,
	}
	es.providers = &encryptedProviderStore{next: next.Providers(), cipher: cipher}
	es.mcpServers = &encryptedMCPServerStore{next: next.MCPServers(), cipher: cipher}
	return es, nil
}

func (s *EncryptedStore) Providers() ProviderStore   { return s.providers }
func (s *EncryptedStore) Models() ModelStore         { return s.next.Models() }
func (s *EncryptedStore) MCPServers() MCPServerStore { return s.mcpServers }
func (s *EncryptedStore) Agents() AgentStore         { return s.next.Agents() }
func (s *EncryptedStore) Threads() ThreadStore       { return s.next.Threads() }
func (s *EncryptedStore) Runs() RunStore             { return s.next.Runs() }

type encryptedProviderStore struct {
	next   ProviderStore
	cipher *crypto.Cipher
}

func (s *encryptedProviderStore) Create(ctx context.Context, p *Provider) error {
	clone, plainSecret, err := s.encryptForWrite(p)
	if err != nil {
		return err
	}
	if err := s.next.Create(ctx, clone); err != nil {
		return err
	}
	*p = *clone
	p.Secret = plainSecret
	p.SecretCiphertext = nil
	p.HasSecret = plainSecret.HasCredentials()
	return nil
}

func (s *encryptedProviderStore) Update(ctx context.Context, p *Provider) error {
	clone, plainSecret, err := s.encryptForWrite(p)
	if err != nil {
		return err
	}
	if err := s.next.Update(ctx, clone); err != nil {
		return err
	}
	*p = *clone
	p.Secret = plainSecret
	p.SecretCiphertext = nil
	p.HasSecret = plainSecret.HasCredentials()
	return nil
}

func (s *encryptedProviderStore) Get(ctx context.Context, spaceID, id string) (*Provider, error) {
	p, err := s.next.Get(ctx, spaceID, id)
	if err != nil {
		return nil, err
	}
	if err := s.decryptAfterRead(p); err != nil {
		return nil, err
	}
	return p, nil
}

func (s *encryptedProviderStore) List(ctx context.Context, spaceID string) ([]*Provider, error) {
	list, err := s.next.List(ctx, spaceID)
	if err != nil {
		return nil, err
	}
	for _, p := range list {
		if err := s.decryptAfterRead(p); err != nil {
			return nil, err
		}
	}
	return list, nil
}

func (s *encryptedProviderStore) Delete(ctx context.Context, spaceID, id string) error {
	return s.next.Delete(ctx, spaceID, id)
}

func (s *encryptedProviderStore) encryptForWrite(p *Provider) (*Provider, *ProviderSecret, error) {
	if p == nil {
		return nil, nil, nil
	}
	clone := *p
	plain := p.Secret.Clone()
	clone.Secret = nil
	clone.SecretCiphertext = nil

	if plain.HasCredentials() {
		raw, err := json.Marshal(plain, json.Deterministic(true))
		if err != nil {
			return nil, nil, fmt.Errorf("marshal provider secret: %w", err)
		}
		enc, err := s.cipher.Encrypt(string(raw))
		if err != nil {
			return nil, nil, fmt.Errorf("encrypt provider secret: %w", err)
		}
		clone.SecretCiphertext = new(enc)
		clone.HasSecret = true
	} else {
		clone.HasSecret = false
	}
	return &clone, plain, nil
}

func (s *encryptedProviderStore) decryptAfterRead(p *Provider) error {
	if p == nil {
		return nil
	}
	if p.SecretCiphertext != nil && *p.SecretCiphertext != "" {
		plain, err := s.cipher.Decrypt(*p.SecretCiphertext)
		if err != nil {
			return fmt.Errorf("decrypt provider secret: %w", err)
		}
		trimmed := strings.TrimSpace(plain)
		if trimmed != "" {
			if strings.HasPrefix(trimmed, "{") {
				var sec ProviderSecret
				if err := json.Unmarshal([]byte(trimmed), &sec); err != nil {
					return fmt.Errorf("unmarshal provider secret: %w", err)
				}
				p.Secret = &sec
			} else {
				// Supports legacy encrypted raw API key strings migrated by 057_platform_ai.sql.
				p.Secret = &ProviderSecret{APIKey: new(trimmed)}
			}
		}
		p.SecretCiphertext = nil
	}
	p.HasSecret = p.Secret.HasCredentials()
	return nil
}

type encryptedMCPServerStore struct {
	next   MCPServerStore
	cipher *crypto.Cipher
}

func (s *encryptedMCPServerStore) Create(ctx context.Context, m *MCPServer) error {
	clone, plainSecret, err := s.encryptForWrite(m)
	if err != nil {
		return err
	}
	if err := s.next.Create(ctx, clone); err != nil {
		return err
	}
	*m = *clone
	m.AuthSecret = plainSecret
	m.AuthSecretCiphertext = nil
	m.HasAuthSecret = plainSecret.HasCredentials()
	return nil
}

func (s *encryptedMCPServerStore) Update(ctx context.Context, m *MCPServer) error {
	clone, plainSecret, err := s.encryptForWrite(m)
	if err != nil {
		return err
	}
	if err := s.next.Update(ctx, clone); err != nil {
		return err
	}
	*m = *clone
	m.AuthSecret = plainSecret
	m.AuthSecretCiphertext = nil
	m.HasAuthSecret = plainSecret.HasCredentials()
	return nil
}

func (s *encryptedMCPServerStore) Get(ctx context.Context, spaceID, id string) (*MCPServer, error) {
	m, err := s.next.Get(ctx, spaceID, id)
	if err != nil {
		return nil, err
	}
	if err := s.decryptAfterRead(m); err != nil {
		return nil, err
	}
	return m, nil
}

func (s *encryptedMCPServerStore) GetBySystemKey(ctx context.Context, spaceID, systemKey string) (*MCPServer, error) {
	m, err := s.next.GetBySystemKey(ctx, spaceID, systemKey)
	if err != nil {
		return nil, err
	}
	if err := s.decryptAfterRead(m); err != nil {
		return nil, err
	}
	return m, nil
}

func (s *encryptedMCPServerStore) GetBySlug(ctx context.Context, spaceID, slug string) (*MCPServer, error) {
	m, err := s.next.GetBySlug(ctx, spaceID, slug)
	if err != nil {
		return nil, err
	}
	if err := s.decryptAfterRead(m); err != nil {
		return nil, err
	}
	return m, nil
}

func (s *encryptedMCPServerStore) List(ctx context.Context, spaceID string) ([]*MCPServer, error) {
	list, err := s.next.List(ctx, spaceID)
	if err != nil {
		return nil, err
	}
	for _, m := range list {
		if err := s.decryptAfterRead(m); err != nil {
			return nil, err
		}
	}
	return list, nil
}

func (s *encryptedMCPServerStore) Delete(ctx context.Context, spaceID, id string) error {
	return s.next.Delete(ctx, spaceID, id)
}

func (s *encryptedMCPServerStore) encryptForWrite(m *MCPServer) (*MCPServer, *MCPAuthSecret, error) {
	if m == nil {
		return nil, nil, nil
	}
	clone := *m
	plain := m.AuthSecret.Clone()
	clone.AuthSecret = nil
	clone.AuthSecretCiphertext = nil

	if plain.HasCredentials() {
		raw, err := json.Marshal(plain, json.Deterministic(true))
		if err != nil {
			return nil, nil, fmt.Errorf("marshal mcp auth_secret: %w", err)
		}
		enc, err := s.cipher.Encrypt(string(raw))
		if err != nil {
			return nil, nil, fmt.Errorf("encrypt mcp auth_secret: %w", err)
		}
		clone.AuthSecretCiphertext = new(enc)
		clone.HasAuthSecret = true
	} else {
		clone.HasAuthSecret = false
	}
	return &clone, plain, nil
}

func (s *encryptedMCPServerStore) decryptAfterRead(m *MCPServer) error {
	if m == nil {
		return nil
	}
	if m.AuthSecretCiphertext != nil && *m.AuthSecretCiphertext != "" {
		plain, err := s.cipher.Decrypt(*m.AuthSecretCiphertext)
		if err != nil {
			return fmt.Errorf("decrypt mcp auth_secret: %w", err)
		}
		trimmed := strings.TrimSpace(plain)
		if trimmed != "" {
			var sec MCPAuthSecret
			if err := json.Unmarshal([]byte(trimmed), &sec); err != nil {
				return fmt.Errorf("unmarshal mcp auth_secret: %w", err)
			}
			m.AuthSecret = &sec
		}
		m.AuthSecretCiphertext = nil
	}
	m.HasAuthSecret = m.AuthSecret.HasCredentials()
	return nil
}
