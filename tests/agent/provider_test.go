package agent_test

import (
	"testing"

	"github.com/masterkeysrd/saturn/tests/driver"
)

func TestProviderCRUD(t *testing.T) {
	d := driver.New(t, testEnv)

	d.Auth().
		CreateApprovedUser(t).
		Login(t)

	d.Space().Ensure(t, "AI Providers Workspace")

	// 1. Create Provider
	prov, err := d.Agent().CreateProvider(t, driver.CreateProviderOptions{
		Name:              "Test OpenAI Provider",
		CompatibilityMode: "OPENAI_COMPATIBLE",
		APIUrl:            "https://api.openai.com/v1",
		APIKey:            "sk-test-live-key-9999",
	})
	if err != nil {
		t.Fatalf("failed to create provider: %v", err)
	}

	if prov.GetId() == "" {
		t.Fatal("expected provider ID to be generated, got empty")
	}
	if prov.GetName() != "Test OpenAI Provider" {
		t.Errorf("expected name %q, got %q", "Test OpenAI Provider", prov.GetName())
	}
	if prov.GetCompatibilityMode() != "OPENAI_COMPATIBLE" {
		t.Errorf("expected mode %q, got %q", "OPENAI_COMPATIBLE", prov.GetCompatibilityMode())
	}
	// API key must be masked in API responses
	if prov.GetApiKey() != "••••••••••••" {
		t.Errorf("expected masked api key, got %q", prov.GetApiKey())
	}

	providerID := prov.GetId()

	// 2. Get Provider
	fetched, err := d.Agent().GetProvider(t, providerID)
	if err != nil {
		t.Fatalf("failed to get provider: %v", err)
	}
	if fetched.GetId() != providerID {
		t.Errorf("expected id %q, got %q", providerID, fetched.GetId())
	}
	if fetched.GetName() != "Test OpenAI Provider" {
		t.Errorf("expected name %q, got %q", "Test OpenAI Provider", fetched.GetName())
	}
	if fetched.GetApiKey() != "••••••••••••" {
		t.Errorf("expected masked api key, got %q", fetched.GetApiKey())
	}

	// 3. List Providers
	listResp, err := d.Agent().ListProviders(t)
	if err != nil {
		t.Fatalf("failed to list providers: %v", err)
	}
	found := false
	for _, p := range listResp.GetProviders() {
		if p.GetId() == providerID {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("created provider %q not found in list", providerID)
	}

	// 4. Update Provider
	updatedName := "Updated OpenAI Provider"
	updatedURL := "https://api.custom-openai.com/v1"
	updated, err := d.Agent().UpdateProvider(t, driver.UpdateProviderOptions{
		ID:     providerID,
		Name:   updatedName,
		APIUrl: updatedURL,
		APIKey: "sk-test-live-key-updated",
	})
	if err != nil {
		t.Fatalf("failed to update provider: %v", err)
	}
	if updated.GetName() != updatedName {
		t.Errorf("expected updated name %q, got %q", updatedName, updated.GetName())
	}
	if updated.GetApiUrl() != updatedURL {
		t.Errorf("expected updated url %q, got %q", updatedURL, updated.GetApiUrl())
	}

	// 5. Delete Provider
	if err := d.Agent().DeleteProvider(t, providerID); err != nil {
		t.Fatalf("failed to delete provider: %v", err)
	}

	// 6. Verify Deletion
	_, err = d.Agent().GetProvider(t, providerID)
	if err == nil {
		t.Fatal("expected error getting deleted provider, got nil")
	}
}

func TestProviderCatalog(t *testing.T) {
	d := driver.New(t, testEnv)

	d.Auth().
		CreateApprovedUser(t).
		Login(t)

	d.Space().Ensure(t, "Catalog Workspace")

	catResp, err := d.Agent().GetProviderCatalog(t)
	if err != nil {
		t.Fatalf("failed to get provider catalog: %v", err)
	}

	if len(catResp.GetBlueprints()) == 0 {
		t.Fatal("expected provider catalog blueprints, got empty")
	}

	blueprintIDs := make(map[string]bool)
	for _, bp := range catResp.GetBlueprints() {
		blueprintIDs[bp.GetId()] = true
	}

	expectedProviders := []string{"gemini", "openai", "anthropic", "ollama", "openrouter"}
	for _, exp := range expectedProviders {
		if !blueprintIDs[exp] {
			t.Errorf("expected provider blueprint %q in catalog", exp)
		}
	}
}

func TestProviderIsolationAcrossSpaces(t *testing.T) {
	d := driver.New(t, testEnv)

	d.Auth().
		CreateApprovedUser(t).
		Login(t)

	// Space 1
	d.Space().Ensure(t, "Space Alpha")
	provA, err := d.Agent().CreateProvider(t, driver.CreateProviderOptions{
		Name:              "Alpha Provider",
		CompatibilityMode: "OPENAI_COMPATIBLE",
		APIUrl:            "https://alpha.example.com",
		APIKey:            "alpha-key-12345",
	})
	if err != nil {
		t.Fatalf("failed to create provider in space Alpha: %v", err)
	}

	// Space 2
	d.Space().Ensure(t, "Space Beta")
	listResp, err := d.Agent().ListProviders(t)
	if err != nil {
		t.Fatalf("failed to list providers in space Beta: %v", err)
	}

	for _, p := range listResp.GetProviders() {
		if p.GetId() == provA.GetId() {
			t.Errorf("provider %q from Space Alpha leaked into Space Beta", provA.GetId())
		}
	}
}
