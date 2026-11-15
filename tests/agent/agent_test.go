//go:build integration

package agent_test

import (
	"encoding/json/v2"
	"strings"
	"testing"

	"github.com/masterkeysrd/saturn/apis/saturn"
	workflowv1 "github.com/masterkeysrd/saturn/apis/saturn/platform/workflow/v1"
	"github.com/masterkeysrd/saturn/tests/driver"
	"google.golang.org/protobuf/types/known/fieldmaskpb"
	"google.golang.org/protobuf/types/known/structpb"
)

func TestAgentCRUD(t *testing.T) {
	d := driver.New(t, testEnv)

	d.Auth().
		CreateApprovedUser(t).
		Login(t)

	d.Space().Ensure(t, "Agent Management Space")

	// 1. Create LLM Provider first
	prov, err := d.Agent().CreateProvider(t, driver.CreateProviderOptions{
		Name:              "OpenAI Backend",
		CompatibilityMode: "OPENAI_COMPATIBLE",
		APIUrl:            "https://api.openai.com/v1",
		APIKey:            "sk-provider-secret-test",
	})
	if err != nil {
		t.Fatalf("failed to create provider: %v", err)
	}

	// 2. Create Agent
	agentName := "Receipt Scanner"
	agentDesc := "Custom receipt scanning agent"
	createdAgent, err := d.Agent().CreateAgent(t, driver.CreateAgentOptions{
		Name:              agentName,
		Description:       agentDesc,
		Purpose:           "INBOX_PARSER",
		Tags:              []string{"finance", "receipts"},
		ModelName:         "gpt-4o",
		SystemInstruction: "Extract all items and amounts",
		Temperature:       0.1,
		LLMProviderID:     prov.GetId(),
	})
	if err != nil {
		t.Fatalf("failed to create agent: %v", err)
	}

	if createdAgent.GetId() == "" {
		t.Fatal("expected agent ID to be non-empty")
	}
	if createdAgent.GetName() != agentName {
		t.Errorf("expected name %q, got %q", agentName, createdAgent.GetName())
	}
	if createdAgent.GetPurpose() != "INBOX_PARSER" {
		t.Errorf("expected purpose %q, got %q", "INBOX_PARSER", createdAgent.GetPurpose())
	}
	if createdAgent.GetLlmProviderId() != prov.GetId() {
		t.Errorf("expected provider id %q, got %q", prov.GetId(), createdAgent.GetLlmProviderId())
	}
	if !createdAgent.GetIsEnabled() {
		t.Error("expected new agent to be enabled by default")
	}

	agentID := createdAgent.GetId()

	// 3. Get Agent
	fetched, err := d.Agent().GetAgent(t, agentID)
	if err != nil {
		t.Fatalf("failed to get agent: %v", err)
	}
	if fetched.GetId() != agentID {
		t.Errorf("expected id %q, got %q", agentID, fetched.GetId())
	}
	if fetched.GetName() != agentName {
		t.Errorf("expected name %q, got %q", agentName, fetched.GetName())
	}

	// 4. List Agents
	listResp, err := d.Agent().ListAgents(t)
	if err != nil {
		t.Fatalf("failed to list agents: %v", err)
	}
	found := false
	for _, a := range listResp.GetAgents() {
		if a.GetId() == agentID {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("agent %q not found in list", agentID)
	}

	// 5. Update Agent
	updatedName := "Renamed Receipt Scanner"
	updated, err := d.Agent().UpdateAgent(t, driver.UpdateAgentOptions{
		ID:                agentID,
		Name:              updatedName,
		Description:       agentDesc,
		Tags:              []string{"finance", "invoices"},
		ModelName:         "gpt-4o-mini",
		SystemInstruction: "Updated instructions",
		Temperature:       0.3,
		LLMProviderID:     prov.GetId(),
		IsEnabled:         false,
	})
	if err != nil {
		t.Fatalf("failed to update agent: %v", err)
	}
	if updated.GetName() != updatedName {
		t.Errorf("expected name %q, got %q", updatedName, updated.GetName())
	}
	if updated.GetModelName() != "gpt-4o-mini" {
		t.Errorf("expected model %q, got %q", "gpt-4o-mini", updated.GetModelName())
	}
	if updated.GetIsEnabled() {
		t.Error("expected agent to be disabled")
	}

	// 6. Delete Agent
	if err := d.Agent().DeleteAgent(t, agentID); err != nil {
		t.Fatalf("failed to delete agent: %v", err)
	}

	// 7. Verify Agent Deletion
	_, err = d.Agent().GetAgent(t, agentID)
	if err == nil {
		t.Fatal("expected error getting deleted agent, got nil")
	}
}

func TestAgentCatalog(t *testing.T) {
	d := driver.New(t, testEnv)

	d.Auth().
		CreateApprovedUser(t).
		Login(t)

	d.Space().Ensure(t, "Agent Catalog Space")

	if _, err := d.Agent().GetAgentCatalog(t); err != nil {
		t.Fatalf("failed to get agent catalog: %v", err)
	}

	provCatalog, err := d.Agent().GetProviderCatalog(t)
	if err != nil {
		t.Fatalf("failed to get provider catalog: %v", err)
	}
	if len(provCatalog.GetBlueprints()) == 0 {
		t.Fatal("expected provider blueprints in catalog, got empty")
	}

	var foundOpenAI bool
	for _, p := range provCatalog.GetBlueprints() {
		if p.GetId() == "openai" {
			foundOpenAI = true
			break
		}
	}
	if !foundOpenAI {
		t.Error("expected openai provider in provider catalog")
	}
}

func TestAgentExecutionAndSuggestionsWithMockLLM(t *testing.T) {
	d := driver.New(t, testEnv)

	d.Auth().
		CreateApprovedUser(t).
		Login(t)

	d.Space().Ensure(t, "AI Processing Space")

	// 1. Spin up ephemeral Mock LLM HTTP Server simulating OpenAI SSE responses.
	// NOTE: We do NOT use the "mock-key" fallback. This is a real HTTP server communicating
	// with Loom's OpenAI HTTP client over the wire.
	mock := driver.StartMockLLMServer(t, "")
	mock.SetResponseFunc(func(body map[string]any) string {
		bodyBytes, _ := json.Marshal(body)
		bodyStr := string(bodyBytes)

		// Hyperion workflow node 1: classification
		if strings.Contains(bodyStr, "Classify this document:") {
			return `{"category": "bank_notification", "confidence": 0.99, "reason": "bank authorization"}`
		}

		// Hyperion workflow node 3: deduplication
		if strings.Contains(bodyStr, "Extracted transaction:") {
			return `{"is_duplicate": false, "reason": "no matching transaction"}`
		}

		// Hyperion workflow node 2: extraction
		return `{
			"transaction_type": "EXPENSE",
			"vendor": "Acme Supermarket",
			"amount": 78.50,
			"currency": "USD",
			"date": "2026-09-10",
			"card_last_four": "7788"
		}`
	})

	// 2. Register LLM Provider pointing to ephemeral Mock LLM server with a real secret key
	testAPIKey := "sk-genuine-test-key-xyz123"
	prov, err := d.Agent().CreateProvider(t, driver.CreateProviderOptions{
		Name:              "Mocked OpenAI Service",
		CompatibilityMode: "OPENAI_COMPATIBLE",
		APIUrl:            mock.URL,
		APIKey:            testAPIKey,
	})
	if err != nil {
		t.Fatalf("failed to create provider: %v", err)
	}

	// 3. Register Agent instance linked to this provider with purpose INBOX_PARSER
	agentInstance, err := d.Agent().CreateAgent(t, driver.CreateAgentOptions{
		Name:          "Hyperion Live Agent",
		Purpose:       "INBOX_PARSER",
		ModelName:     "gpt-4o",
		Temperature:   0.0,
		LLMProviderID: prov.GetId(),
	})
	if err != nil {
		t.Fatalf("failed to create agent: %v", err)
	}

	// 4. Bind agent as default_model on system.finance.transaction_suggestions & execute synchronously
	wfClient := workflowv1.NewClient(saturn.Config{
		BaseURL:     d.Env().ServerURL,
		AccessToken: d.State().AccessToken,
		SpaceID:     d.State().SpaceID,
		HTTPClient:  d.HTTPClient(),
	})
	flow, err := wfClient.GetFlow(t.Context(), &workflowv1.GetFlowRequest{
		Id: "system.finance.transaction_suggestions",
	})
	if err != nil {
		t.Fatalf("GetFlow failed: %v", err)
	}
	flow.Config = &workflowv1.Flow_Config{
		DefaultModel: &workflowv1.ModelConfig{
			AgentId: new(agentInstance.GetId()),
		},
	}
	if _, err := wfClient.UpdateFlow(t.Context(), &workflowv1.UpdateFlowRequest{
		Id:         flow.GetId(),
		Flow:       flow,
		UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"config"}},
	}); err != nil {
		t.Fatalf("UpdateFlow failed: %v", err)
	}

	textContent := "You authorized a transaction of $78.50 at Acme Supermarket on card ending in 7788."
	inStruct, err := structpb.NewStruct(map[string]any{"text": textContent})
	if err != nil {
		t.Fatalf("NewStruct failed: %v", err)
	}
	runResp, err := wfClient.ExecuteFlow(t.Context(), &workflowv1.ExecuteFlowRequest{
		Id:    "system.finance.transaction_suggestions",
		Input: inStruct,
	})
	if err != nil {
		t.Fatalf("ExecuteFlow failed: %v", err)
	}

	// 5. Verify the structured suggestions parsed from the Mock LLM SSE stream
	st := runResp.GetOutput()
	if st == nil {
		t.Fatal("expected output struct in FlowRun response, got nil")
	}

	fields := st.GetFields()
	if vendor := fields["vendor"].GetStringValue(); vendor != "Acme Supermarket" {
		t.Errorf("expected vendor %q, got %q", "Acme Supermarket", vendor)
	}
	if amount := fields["amount_cents"].GetNumberValue(); amount != 7850 {
		t.Errorf("expected amount_cents 7850, got %v", amount)
	}
	if currency := fields["currency"].GetStringValue(); currency != "USD" {
		t.Errorf("expected currency %q, got %q", "USD", currency)
	}
	if card := fields["card_last_four"].GetStringValue(); card != "7788" {
		t.Errorf("expected card_last_four %q, got %q", "7788", card)
	}

	// 6. Verify Mock Server received requests and authenticated via HTTP header
	if mock.RequestCount() == 0 {
		t.Fatal("expected mock LLM server to receive HTTP requests from Loom, but received 0")
	}

	authHeader := mock.LastHeader().Get("Authorization")
	expectedAuth := "Bearer " + testAPIKey
	if authHeader != expectedAuth {
		t.Errorf("expected Authorization header %q, got %q", expectedAuth, authHeader)
	}

	// 7. Verify Audit Log was recorded in platform.agent_runs
	runsResp, err := d.Agent().ListAgentRuns(t, driver.ListAgentRunsOptions{
		AgentID: agentInstance.GetId(),
	})
	if err != nil {
		t.Fatalf("failed to list agent runs: %v", err)
	}

	if len(runsResp.GetRuns()) == 0 {
		t.Fatal("expected at least one agent run to be recorded in audit log")
	}

	latestRun := runsResp.GetRuns()[0]
	if latestRun.GetAgentId() != agentInstance.GetId() {
		t.Errorf("expected run agent_id %q, got %q", agentInstance.GetId(), latestRun.GetAgentId())
	}
	if latestRun.GetStatus() != "SUCCESS" {
		t.Errorf("expected run status SUCCESS, got %q", latestRun.GetStatus())
	}
	if latestRun.GetOutputRaw() == "" {
		t.Error("expected non-empty output_raw in audit log")
	}
}
