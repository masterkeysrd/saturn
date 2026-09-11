package integration_test

import (
	"testing"

	"github.com/masterkeysrd/saturn/tests/driver"
)

func TestIntegrationCatalog(t *testing.T) {
	d := driver.New(t, testEnv)

	d.Auth().
		CreateApprovedUser(t).
		Login(t)

	d.Space().Ensure(t, "Catalog Verification Space")

	catalogResp, err := d.Integration().ListCatalog(t)
	if err != nil {
		t.Fatalf("failed to list integration catalog: %v", err)
	}

	if len(catalogResp.GetCatalog()) == 0 {
		t.Fatal("expected at least one integration descriptor in catalog, got 0")
	}

	var foundEmail bool
	for _, desc := range catalogResp.GetCatalog() {
		if desc.GetProvider() == "email" && desc.GetKind() == "transaction_ingestion" {
			foundEmail = true
			if desc.GetName() != "Transaction & Receipt Ingestion" {
				t.Errorf("expected name %q, got %q", "Transaction & Receipt Ingestion", desc.GetName())
			}
			if desc.GetConfigSchema() == "" {
				t.Error("expected non-empty config schema for email integration")
			}
			if desc.GetRequestSchema() == "" {
				t.Error("expected non-empty request schema for email integration")
			}
			break
		}
	}

	if !foundEmail {
		t.Error("expected email/transaction_ingestion provider in catalog")
	}
}

func TestIntegrationLifecycleAndConfiguration(t *testing.T) {
	d := driver.New(t, testEnv)

	d.Auth().
		CreateApprovedUser(t).
		Login(t)

	d.Space().Ensure(t, "Integration Lifecycle Space")

	// 1. Configure Integration
	configJSON := `{"allowed_senders": ["invoices@vendor.com", "alerts@bank.com"]}`
	configured, err := d.Integration().Configure(t, driver.ConfigureIntegrationOptions{
		Provider:  "email",
		Kind:      "transaction_ingestion",
		IsEnabled: true,
		Config:    configJSON,
	})
	if err != nil {
		t.Fatalf("failed to configure integration: %v", err)
	}

	if configured.GetId() == "" {
		t.Fatal("expected integration ID to be generated")
	}
	if configured.GetProvider() != "email" {
		t.Errorf("expected provider %q, got %q", "email", configured.GetProvider())
	}
	if configured.GetKind() != "transaction_ingestion" {
		t.Errorf("expected kind %q, got %q", "transaction_ingestion", configured.GetKind())
	}
	if !configured.GetIsEnabled() {
		t.Error("expected integration to be enabled")
	}

	// 2. Get Integration
	fetched, err := d.Integration().Get(t, driver.GetIntegrationOptions{
		Provider: "email",
		Kind:     "transaction_ingestion",
	})
	if err != nil {
		t.Fatalf("failed to get integration: %v", err)
	}
	if fetched.GetId() != configured.GetId() {
		t.Errorf("expected id %q, got %q", configured.GetId(), fetched.GetId())
	}
	if !fetched.GetIsEnabled() {
		t.Error("expected fetched integration to be enabled")
	}

	// 3. List Integrations
	listResp, err := d.Integration().List(t)
	if err != nil {
		t.Fatalf("failed to list integrations: %v", err)
	}
	var found bool
	for _, itg := range listResp.GetIntegrations() {
		if itg.GetId() == configured.GetId() {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("configured integration %q not found in space integrations list", configured.GetId())
	}

	// 4. Update Integration (disable)
	disabled, err := d.Integration().Configure(t, driver.ConfigureIntegrationOptions{
		Provider:  "email",
		Kind:      "transaction_ingestion",
		IsEnabled: false,
		Config:    configJSON,
	})
	if err != nil {
		t.Fatalf("failed to update integration: %v", err)
	}
	if disabled.GetIsEnabled() {
		t.Error("expected integration to be disabled after update")
	}
}

func TestIntegrationTokenManagement(t *testing.T) {
	d := driver.New(t, testEnv)

	d.Auth().
		CreateApprovedUser(t).
		Login(t)

	d.Space().Ensure(t, "Token Management Space")

	// Pre-requisite: Configure integration first
	_, err := d.Integration().Configure(t, driver.ConfigureIntegrationOptions{
		Provider:  "email",
		Kind:      "transaction_ingestion",
		IsEnabled: true,
		Config:    `{"allowed_senders": ["user@example.com"]}`,
	})
	if err != nil {
		t.Fatalf("failed to configure integration: %v", err)
	}

	// Verify initial default token created automatically during configuration
	initialTokens, err := d.Integration().ListTokens(t, driver.ListIntegrationTokensOptions{
		Provider: "email",
		Kind:     "transaction_ingestion",
	})
	if err != nil {
		t.Fatalf("failed to list initial tokens: %v", err)
	}
	if len(initialTokens.GetTokens()) != 1 {
		t.Fatalf("expected 1 initial default token, got %d", len(initialTokens.GetTokens()))
	}
	if initialTokens.GetTokens()[0].GetName() != "Default Key" {
		t.Errorf("expected default token name %q, got %q", "Default Key", initialTokens.GetTokens()[0].GetName())
	}

	// 1. Create Token 1
	tok1Resp, err := d.Integration().CreateToken(t, driver.CreateIntegrationTokenOptions{
		Provider: "email",
		Name:     "Forwarder Token 1",
	})
	if err != nil {
		t.Fatalf("failed to create token 1: %v", err)
	}

	tok1 := tok1Resp.GetToken()
	if tok1 == nil {
		t.Fatal("expected token metadata, got nil")
	}
	if tok1.GetId() == "" {
		t.Fatal("expected token ID, got empty")
	}
	if tok1.GetName() != "Forwarder Token 1" {
		t.Errorf("expected token name %q, got %q", "Forwarder Token 1", tok1.GetName())
	}
	rawToken1 := tok1Resp.GetRawToken()
	if rawToken1 == "" {
		t.Fatal("expected non-empty rawToken in creation response")
	}

	// 2. Create Token 2
	tok2Resp, err := d.Integration().CreateToken(t, driver.CreateIntegrationTokenOptions{
		Provider: "email",
		Name:     "Forwarder Token 2",
	})
	if err != nil {
		t.Fatalf("failed to create token 2: %v", err)
	}
	if tok2Resp.GetToken().GetId() == "" {
		t.Fatal("expected token 2 ID")
	}

	// 3. List Tokens (1 default + 2 created = 3)
	tokensResp, err := d.Integration().ListTokens(t, driver.ListIntegrationTokensOptions{
		Provider: "email",
		Kind:     "transaction_ingestion",
	})
	if err != nil {
		t.Fatalf("failed to list tokens: %v", err)
	}
	if len(tokensResp.GetTokens()) != 3 {
		t.Fatalf("expected 3 tokens, got %d", len(tokensResp.GetTokens()))
	}

	// 4. Delete Token 1
	err = d.Integration().DeleteToken(t, driver.DeleteIntegrationTokenOptions{
		Provider: "email",
		ID:       tok1.GetId(),
		Kind:     "transaction_ingestion",
	})
	if err != nil {
		t.Fatalf("failed to delete token 1: %v", err)
	}

	// Verify remaining tokens (3 - 1 = 2)
	tokensAfterDelete, err := d.Integration().ListTokens(t, driver.ListIntegrationTokensOptions{
		Provider: "email",
		Kind:     "transaction_ingestion",
	})
	if err != nil {
		t.Fatalf("failed to list tokens after deletion: %v", err)
	}
	if len(tokensAfterDelete.GetTokens()) != 2 {
		t.Fatalf("expected 2 remaining tokens, got %d", len(tokensAfterDelete.GetTokens()))
	}
}
