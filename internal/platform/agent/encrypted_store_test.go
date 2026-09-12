package agent_test

import (
	"context"
	"strings"
	"testing"

	"github.com/masterkeysrd/saturn/internal/platform/agent"
	"github.com/masterkeysrd/saturn/internal/platform/crypto"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
)

type mockProviderStore struct {
	createProviderFn func(ctx context.Context, spaceID string, name string, mode agent.CompatibilityMode, url *string, key *string) (*agent.LLMProvider, error)
	getProviderFn    func(ctx context.Context, q agent.GetLLMProvider) (*agent.LLMProvider, error)
	listProvidersFn  func(ctx context.Context, spaceID string) ([]*agent.LLMProvider, error)
	updateProviderFn func(ctx context.Context, spaceID string, id string, name string, url *string, key *string) (*agent.LLMProvider, error)
	deleteProviderFn func(ctx context.Context, spaceID string, id string) error

	getAgentFn    func(ctx context.Context, q agent.GetAgent) (*agent.Agent, error)
	logRunFn      func(ctx context.Context, agentID string, spaceID string, status agent.AgentRunStatus, input string, output *string, errMsg *string, tokens int) (*agent.AgentRun, error)
	createAgentFn func(ctx context.Context, spaceID string, providerID *string, name string, desc *string, purpose string, tags []string, model string, prompt *string, temp float64) (*agent.Agent, error)
	listAgentsFn  func(ctx context.Context, spaceID string) ([]*agent.Agent, error)
	updateAgentFn func(ctx context.Context, spaceID string, id string, providerID *string, name string, desc *string, tags []string, model string, prompt *string, temp float64, isEnabled bool) (*agent.Agent, error)
	deleteAgentFn func(ctx context.Context, spaceID string, id string) error
	listRunsFn    func(ctx context.Context, q agent.ListAgentRuns) (*paging.Page[*agent.AgentRun], error)
}

func (m *mockProviderStore) CreateProvider(ctx context.Context, spaceID string, name string, mode agent.CompatibilityMode, url *string, key *string) (*agent.LLMProvider, error) {
	if m.createProviderFn != nil {
		return m.createProviderFn(ctx, spaceID, name, mode, url, key)
	}
	return nil, nil
}

func (m *mockProviderStore) GetProvider(ctx context.Context, q agent.GetLLMProvider) (*agent.LLMProvider, error) {
	if m.getProviderFn != nil {
		return m.getProviderFn(ctx, q)
	}
	return nil, nil
}

func (m *mockProviderStore) ListProviders(ctx context.Context, spaceID string) ([]*agent.LLMProvider, error) {
	if m.listProvidersFn != nil {
		return m.listProvidersFn(ctx, spaceID)
	}
	return nil, nil
}

func (m *mockProviderStore) UpdateProvider(ctx context.Context, spaceID string, id string, name string, url *string, key *string) (*agent.LLMProvider, error) {
	if m.updateProviderFn != nil {
		return m.updateProviderFn(ctx, spaceID, id, name, url, key)
	}
	return nil, nil
}

func (m *mockProviderStore) DeleteProvider(ctx context.Context, spaceID string, id string) error {
	if m.deleteProviderFn != nil {
		return m.deleteProviderFn(ctx, spaceID, id)
	}
	return nil
}

func (m *mockProviderStore) GetAgent(ctx context.Context, q agent.GetAgent) (*agent.Agent, error) {
	if m.getAgentFn != nil {
		return m.getAgentFn(ctx, q)
	}
	return nil, nil
}

func (m *mockProviderStore) LogRun(ctx context.Context, agentID string, spaceID string, status agent.AgentRunStatus, input string, output *string, errMsg *string, tokens int) (*agent.AgentRun, error) {
	if m.logRunFn != nil {
		return m.logRunFn(ctx, agentID, spaceID, status, input, output, errMsg, tokens)
	}
	return nil, nil
}

func (m *mockProviderStore) CreateAgent(ctx context.Context, spaceID string, providerID *string, name string, desc *string, purpose string, tags []string, model string, prompt *string, temp float64) (*agent.Agent, error) {
	if m.createAgentFn != nil {
		return m.createAgentFn(ctx, spaceID, providerID, name, desc, purpose, tags, model, prompt, temp)
	}
	return nil, nil
}

func (m *mockProviderStore) ListAgents(ctx context.Context, spaceID string) ([]*agent.Agent, error) {
	if m.listAgentsFn != nil {
		return m.listAgentsFn(ctx, spaceID)
	}
	return nil, nil
}

func (m *mockProviderStore) UpdateAgent(ctx context.Context, spaceID string, id string, providerID *string, name string, desc *string, tags []string, model string, prompt *string, temp float64, isEnabled bool) (*agent.Agent, error) {
	if m.updateAgentFn != nil {
		return m.updateAgentFn(ctx, spaceID, id, providerID, name, desc, tags, model, prompt, temp, isEnabled)
	}
	return nil, nil
}

func (m *mockProviderStore) DeleteAgent(ctx context.Context, spaceID string, id string) error {
	if m.deleteAgentFn != nil {
		return m.deleteAgentFn(ctx, spaceID, id)
	}
	return nil
}

func (m *mockProviderStore) ListRuns(ctx context.Context, q agent.ListAgentRuns) (*paging.Page[*agent.AgentRun], error) {
	if m.listRunsFn != nil {
		return m.listRunsFn(ctx, q)
	}
	return nil, nil
}

func TestEncryptedStore(t *testing.T) {
	ctx := context.Background()
	secret := "test-secret-encryption-key-12345"

	t.Run("CreateProvider encrypts key in store and decrypts on return", func(t *testing.T) {
		plainKey := "sk-test-secret-key-123"
		mock := &mockProviderStore{
			createProviderFn: func(ctx context.Context, spaceID string, name string, mode agent.CompatibilityMode, url *string, key *string) (*agent.LLMProvider, error) {
				if key == nil || !strings.HasPrefix(*key, crypto.Prefix) {
					t.Errorf("expected encrypted key with prefix %s, got: %v", crypto.Prefix, key)
				}
				// Return provider containing the encrypted key as stored in DB
				return &agent.LLMProvider{
					ID:      "prv_1",
					SpaceID: spaceID,
					Name:    name,
					APIKey:  key,
				}, nil
			},
		}

		store, err := agent.NewEncryptedStore(mock, secret)
		if err != nil {
			t.Fatalf("NewEncryptedStore error: %v", err)
		}

		p, err := store.CreateProvider(ctx, "spc_1", "OpenAI", agent.ModeOpenAICompatible, nil, &plainKey)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if p.APIKey == nil || *p.APIKey != plainKey {
			t.Errorf("expected decrypted key %q, got %v", plainKey, p.APIKey)
		}
	})

	t.Run("CreateProvider handles nil key without encryption", func(t *testing.T) {
		mock := &mockProviderStore{
			createProviderFn: func(ctx context.Context, spaceID string, name string, mode agent.CompatibilityMode, url *string, key *string) (*agent.LLMProvider, error) {
				if key != nil {
					t.Errorf("expected nil key, got: %v", *key)
				}
				return &agent.LLMProvider{
					ID:      "prv_ollama",
					SpaceID: spaceID,
					Name:    name,
				}, nil
			},
		}

		store, _ := agent.NewEncryptedStore(mock, secret)
		p, err := store.CreateProvider(ctx, "spc_1", "Ollama", agent.ModeOllamaNative, nil, nil)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if p.APIKey != nil {
			t.Errorf("expected nil APIKey, got %v", *p.APIKey)
		}
	})

	t.Run("GetProvider decrypts returned provider", func(t *testing.T) {
		plainKey := "sk-get-key"
		cipher, _ := crypto.NewCipher(secret)
		encKey, _ := cipher.Encrypt(plainKey)

		mock := &mockProviderStore{
			getProviderFn: func(ctx context.Context, q agent.GetLLMProvider) (*agent.LLMProvider, error) {
				if q.ID == "prv_notfound" {
					return nil, nil
				}
				return &agent.LLMProvider{
					ID:      q.ID,
					SpaceID: q.SpaceID,
					APIKey:  &encKey,
				}, nil
			},
		}

		store, _ := agent.NewEncryptedStore(mock, secret)

		// Found
		p, err := store.GetProvider(ctx, agent.GetLLMProvider{SpaceID: "spc_1", ID: "prv_1"})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if p == nil || p.APIKey == nil || *p.APIKey != plainKey {
			t.Errorf("expected decrypted key %q, got %v", plainKey, p.APIKey)
		}

		// Not found
		pNotFound, err := store.GetProvider(ctx, agent.GetLLMProvider{SpaceID: "spc_1", ID: "prv_notfound"})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if pNotFound != nil {
			t.Errorf("expected nil provider, got %+v", pNotFound)
		}
	})

	t.Run("ListProviders decrypts all returned providers", func(t *testing.T) {
		cipher, _ := crypto.NewCipher(secret)
		encKey1, _ := cipher.Encrypt("key-1")
		encKey2, _ := cipher.Encrypt("key-2")

		mock := &mockProviderStore{
			listProvidersFn: func(ctx context.Context, spaceID string) ([]*agent.LLMProvider, error) {
				return []*agent.LLMProvider{
					{ID: "prv_1", APIKey: &encKey1},
					{ID: "prv_2", APIKey: &encKey2},
					{ID: "prv_3", APIKey: nil}, // nil key should be preserved safely
				}, nil
			},
		}

		store, _ := agent.NewEncryptedStore(mock, secret)
		list, err := store.ListProviders(ctx, "spc_1")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(list) != 3 {
			t.Fatalf("expected 3 providers, got %d", len(list))
		}
		if *list[0].APIKey != "key-1" || *list[1].APIKey != "key-2" || list[2].APIKey != nil {
			t.Errorf("unexpected decrypted keys: %v, %v, %v", list[0].APIKey, list[1].APIKey, list[2].APIKey)
		}
	})

	t.Run("UpdateProvider encrypts key and decrypts returned provider", func(t *testing.T) {
		plainKey := "sk-updated-key"
		mock := &mockProviderStore{
			updateProviderFn: func(ctx context.Context, spaceID string, id string, name string, url *string, key *string) (*agent.LLMProvider, error) {
				if key == nil || !strings.HasPrefix(*key, crypto.Prefix) {
					t.Errorf("expected encrypted key with prefix %s, got: %v", crypto.Prefix, key)
				}
				return &agent.LLMProvider{
					ID:      id,
					SpaceID: spaceID,
					Name:    name,
					APIKey:  key,
				}, nil
			},
		}

		store, _ := agent.NewEncryptedStore(mock, secret)
		p, err := store.UpdateProvider(ctx, "spc_1", "prv_1", "New Name", nil, &plainKey)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if p.APIKey == nil || *p.APIKey != plainKey {
			t.Errorf("expected decrypted key %q, got %v", plainKey, p.APIKey)
		}
	})

	t.Run("Delegated methods pass through transparently", func(t *testing.T) {
		called := make(map[string]bool)
		mock := &mockProviderStore{
			deleteProviderFn: func(ctx context.Context, spaceID string, id string) error {
				called["DeleteProvider"] = true
				return nil
			},
			getAgentFn: func(ctx context.Context, q agent.GetAgent) (*agent.Agent, error) {
				called["GetAgent"] = true
				return &agent.Agent{ID: "agt_1"}, nil
			},
			logRunFn: func(ctx context.Context, agentID string, spaceID string, status agent.AgentRunStatus, input string, output *string, errMsg *string, tokens int) (*agent.AgentRun, error) {
				called["LogRun"] = true
				return &agent.AgentRun{ID: "run_1"}, nil
			},
			createAgentFn: func(ctx context.Context, spaceID string, providerID *string, name string, desc *string, purpose string, tags []string, model string, prompt *string, temp float64) (*agent.Agent, error) {
				called["CreateAgent"] = true
				return &agent.Agent{ID: "agt_new"}, nil
			},
			listAgentsFn: func(ctx context.Context, spaceID string) ([]*agent.Agent, error) {
				called["ListAgents"] = true
				return []*agent.Agent{{ID: "agt_1"}}, nil
			},
			updateAgentFn: func(ctx context.Context, spaceID string, id string, providerID *string, name string, desc *string, tags []string, model string, prompt *string, temp float64, isEnabled bool) (*agent.Agent, error) {
				called["UpdateAgent"] = true
				return &agent.Agent{ID: id}, nil
			},
			deleteAgentFn: func(ctx context.Context, spaceID string, id string) error {
				called["DeleteAgent"] = true
				return nil
			},
			listRunsFn: func(ctx context.Context, q agent.ListAgentRuns) (*paging.Page[*agent.AgentRun], error) {
				called["ListRuns"] = true
				return &paging.Page[*agent.AgentRun]{Items: []*agent.AgentRun{{ID: "run_1"}}}, nil
			},
		}

		store, _ := agent.NewEncryptedStore(mock, secret)

		_ = store.DeleteProvider(ctx, "spc_1", "prv_1")
		_, _ = store.GetAgent(ctx, agent.GetAgent{SpaceID: "spc_1", ID: "agt_1"})
		_, _ = store.LogRun(ctx, "agt_1", "spc_1", agent.RunSuccess, "input", nil, nil, 10)
		_, _ = store.CreateAgent(ctx, "spc_1", nil, "agent", nil, "PURPOSE", nil, "model", nil, 0.5)
		_, _ = store.ListAgents(ctx, "spc_1")
		_, _ = store.UpdateAgent(ctx, "spc_1", "agt_1", nil, "agent", nil, nil, "model", nil, 0.5, true)
		_ = store.DeleteAgent(ctx, "spc_1", "agt_1")
		_, _ = store.ListRuns(ctx, agent.ListAgentRuns{SpaceID: "spc_1", AgentID: "agt_1"})

		expectedMethods := []string{
			"DeleteProvider", "GetAgent", "LogRun", "CreateAgent",
			"ListAgents", "UpdateAgent", "DeleteAgent", "ListRuns",
		}
		for _, m := range expectedMethods {
			if !called[m] {
				t.Errorf("expected delegated method %s to be called", m)
			}
		}
	})
}
