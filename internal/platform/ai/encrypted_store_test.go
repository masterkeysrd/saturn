package ai

import (
	"context"
	"strings"
	"testing"

	"github.com/masterkeysrd/saturn/internal/platform/crypto"
)

func TestEncryptedStore_ProviderAndMCPServerSecrets(t *testing.T) {
	const testKey = "test-aes-256-gcm-secret-key-for-ai"

	t.Run("encrypts and decrypts Provider.Secret JSON", func(t *testing.T) {
		var storedCiphertext string
		provStore := &ProviderStoreMock{
			CreateFunc: func(_ context.Context, p *Provider) error {
				if p.Secret != nil {
					t.Error("expected plaintext Secret stripped before inner store Create")
				}
				if p.SecretCiphertext == nil || !strings.HasPrefix(*p.SecretCiphertext, crypto.Prefix) {
					t.Fatalf("expected enc:v1: ciphertext, got %v", p.SecretCiphertext)
				}
				storedCiphertext = *p.SecretCiphertext
				return nil
			},
			GetFunc: func(_ context.Context, _, _ string) (*Provider, error) {
				return &Provider{
					ID:               "prv_1",
					SpaceID:          "spc_1",
					Name:             "OpenAI",
					Driver:           DriverOpenAI,
					SecretCiphertext: new(storedCiphertext),
				}, nil
			},
		}

		storeMock := &StoreMock{
			ProvidersFunc:  func() ProviderStore { return provStore },
			MCPServersFunc: func() MCPServerStore { return &MCPServerStoreMock{} },
		}

		enc, err := NewEncryptedStore(storeMock, testKey)
		if err != nil {
			t.Fatalf("NewEncryptedStore failed: %v", err)
		}

		in := &Provider{
			ID:      "prv_1",
			SpaceID: "spc_1",
			Name:    "OpenAI",
			Driver:  DriverOpenAI,
			Secret: &ProviderSecret{
				APIKey:  new("sk-live-123"),
				Headers: map[string]string{"OpenAI-Beta": "assistants=v2"},
			},
		}
		if err := enc.Providers().Create(context.Background(), in); err != nil {
			t.Fatalf("Create failed: %v", err)
		}
		if in.Secret == nil || *in.Secret.APIKey != "sk-live-123" || !in.HasSecret {
			t.Fatalf("expected caller provider to retain decrypted secret, got %+v", in)
		}

		got, err := enc.Providers().Get(context.Background(), "spc_1", "prv_1")
		if err != nil {
			t.Fatalf("Get failed: %v", err)
		}
		if got.Secret == nil || *got.Secret.APIKey != "sk-live-123" || got.Secret.Headers["OpenAI-Beta"] != "assistants=v2" {
			t.Errorf("decrypted secret mismatch: %+v", got.Secret)
		}
		if got.SecretCiphertext != nil {
			t.Error("expected SecretCiphertext cleared after decryption")
		}
	})

	t.Run("decrypts legacy migrated raw API key ciphertext", func(t *testing.T) {
		cipher, _ := crypto.NewCipher(testKey)
		legacyEncrypted, _ := cipher.Encrypt("AIzaLegacyKey")

		provStore := &ProviderStoreMock{
			ListFunc: func(_ context.Context, _ string) ([]*Provider, error) {
				return []*Provider{{
					ID:               "prv_legacy",
					SpaceID:          "spc_1",
					Driver:           DriverGemini,
					SecretCiphertext: new(legacyEncrypted),
				}}, nil
			},
		}
		storeMock := &StoreMock{
			ProvidersFunc:  func() ProviderStore { return provStore },
			MCPServersFunc: func() MCPServerStore { return &MCPServerStoreMock{} },
		}

		enc, err := NewEncryptedStore(storeMock, testKey)
		if err != nil {
			t.Fatalf("NewEncryptedStore failed: %v", err)
		}

		list, err := enc.Providers().List(context.Background(), "spc_1")
		if err != nil {
			t.Fatalf("List failed: %v", err)
		}
		if len(list) != 1 || list[0].Secret == nil || list[0].Secret.APIKey == nil || *list[0].Secret.APIKey != "AIzaLegacyKey" {
			t.Errorf("expected legacy raw API key decrypted, got %+v", list)
		}
	})

	t.Run("encrypts and decrypts MCPServer.AuthSecret JSON", func(t *testing.T) {
		var storedCiphertext string
		mcpStore := &MCPServerStoreMock{
			CreateFunc: func(_ context.Context, m *MCPServer) error {
				if m.AuthSecret != nil {
					t.Error("expected plaintext AuthSecret stripped before inner store Create")
				}
				if m.AuthSecretCiphertext == nil || !strings.HasPrefix(*m.AuthSecretCiphertext, crypto.Prefix) {
					t.Fatalf("expected enc:v1: ciphertext, got %v", m.AuthSecretCiphertext)
				}
				storedCiphertext = *m.AuthSecretCiphertext
				return nil
			},
			GetBySlugFunc: func(_ context.Context, _, _ string) (*MCPServer, error) {
				return &MCPServer{
					ID:                   "mcp_1",
					SpaceID:              "spc_1",
					Slug:                 "github",
					AuthSecretCiphertext: new(storedCiphertext),
				}, nil
			},
		}

		storeMock := &StoreMock{
			ProvidersFunc:  func() ProviderStore { return &ProviderStoreMock{} },
			MCPServersFunc: func() MCPServerStore { return mcpStore },
		}

		enc, err := NewEncryptedStore(storeMock, testKey)
		if err != nil {
			t.Fatalf("NewEncryptedStore failed: %v", err)
		}

		in := &MCPServer{
			ID:      "mcp_1",
			SpaceID: "spc_1",
			Slug:    "github",
			AuthSecret: &MCPAuthSecret{
				BearerToken: new("ghp_secret_token"),
				Headers:     map[string]string{"X-GitHub-Api-Version": "2022-11-28"},
			},
		}
		if err := enc.MCPServers().Create(context.Background(), in); err != nil {
			t.Fatalf("Create failed: %v", err)
		}
		got, err := enc.MCPServers().GetBySlug(context.Background(), "spc_1", "github")
		if err != nil {
			t.Fatalf("GetBySlug failed: %v", err)
		}
		if got.AuthSecret == nil || *got.AuthSecret.BearerToken != "ghp_secret_token" || got.AuthSecret.Headers["X-GitHub-Api-Version"] != "2022-11-28" {
			t.Errorf("decrypted auth_secret mismatch: %+v", got.AuthSecret)
		}
	})
}
