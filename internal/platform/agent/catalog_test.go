package agent_test

import (
	"testing"

	"github.com/masterkeysrd/saturn/internal/platform/agent"
)

func TestGetProviderCatalog(t *testing.T) {
	catalog := agent.GetProviderCatalog()
	if len(catalog) != 5 {
		t.Fatalf("expected 5 provider descriptors, got %d", len(catalog))
	}

	expectedIDs := map[string]bool{
		"gemini":     true,
		"openai":     true,
		"anthropic":  true,
		"ollama":     true,
		"openrouter": true,
	}

	for _, p := range catalog {
		if !expectedIDs[p.ID] {
			t.Errorf("unexpected provider ID: %s", p.ID)
		}
		if p.DisplayName == "" {
			t.Errorf("provider %s has empty DisplayName", p.ID)
		}
		if p.DefaultAPIUrl == "" {
			t.Errorf("provider %s has empty DefaultAPIUrl", p.ID)
		}
	}
}

func TestAgentCatalog(t *testing.T) {
	initialCatalog := agent.GetAgentCatalog()
	initialLen := len(initialCatalog)

	desc := agent.AgentDescriptor{
		Purpose:                  "TEST_PURPOSE_PUBLIC_CONTRACT",
		DisplayName:              "Test Agent",
		Description:              "An agent for testing public contract",
		DefaultTags:              []string{"test", "agent"},
		DefaultSystemInstruction: "You are a test agent.",
		DefaultPromptTemplate:    "Analyze: {{input}}",
		RequiredResponseSchema:   `{"type": "object"}`,
	}

	// 1. Register new agent blueprint
	agent.RegisterAgent(desc)

	updatedCatalog := agent.GetAgentCatalog()
	if len(updatedCatalog) != initialLen+1 {
		t.Fatalf("expected catalog length %d, got %d", initialLen+1, len(updatedCatalog))
	}

	found := false
	for _, a := range updatedCatalog {
		if a.Purpose == desc.Purpose {
			found = true
			if a.DisplayName != desc.DisplayName {
				t.Errorf("expected DisplayName %s, got %s", desc.DisplayName, a.DisplayName)
			}
			break
		}
	}
	if !found {
		t.Errorf("registered agent %s not found in catalog", desc.Purpose)
	}

	// 2. Register duplicate agent with identical purpose (must be a no-op)
	duplicateDesc := desc
	duplicateDesc.DisplayName = "Duplicate Agent"
	agent.RegisterAgent(duplicateDesc)

	afterDuplicate := agent.GetAgentCatalog()
	if len(afterDuplicate) != len(updatedCatalog) {
		t.Errorf("duplicate registration should be ignored, expected %d items, got %d", len(updatedCatalog), len(afterDuplicate))
	}
}
