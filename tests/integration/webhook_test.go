package integration_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"

	financev1 "github.com/masterkeysrd/saturn/apis/saturn/finance/v1"
	"github.com/masterkeysrd/saturn/tests/driver"
)

func TestWebhookSecurityGuards(t *testing.T) {
	d := driver.New(t, testEnv)

	d.Auth().
		CreateApprovedUser(t).
		Login(t)

	d.Space().Ensure(t, "Webhook Security Space")

	// 1. Missing Authorization header
	resp, _, err := d.Integration().PostWebhook(t, driver.PostWebhookOptions{
		Path:   "email",
		Secret: "none",
		Body:   []byte(`{"test": true}`),
	})
	if err != nil {
		t.Fatalf("unexpected network error: %v", err)
	}
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("expected 401 Unauthorized for missing auth header, got %d", resp.StatusCode)
	}

	// 2. Invalid webhook secret
	resp, _, err = d.Integration().PostWebhook(t, driver.PostWebhookOptions{
		Path:   "email",
		Secret: "invalid_secret_token",
		Body:   []byte(`{"test": true}`),
	})
	if err != nil {
		t.Fatalf("unexpected network error: %v", err)
	}
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("expected 401 Unauthorized for invalid secret, got %d", resp.StatusCode)
	}

	// 3. Valid secret but missing + symbol in recipient
	resp, _, err = d.Integration().PostWebhook(t, driver.PostWebhookOptions{
		Path:   "email",
		Secret: "dev_webhook_secret",
		Body: []byte(`{
			"rcptTo": "invalidrecipient@example.com",
			"mailFrom": "user@example.com"
		}`),
	})
	if err != nil {
		t.Fatalf("unexpected network error: %v", err)
	}
	// Missing + symbol in recipient address fails verification
	if resp.StatusCode != http.StatusUnauthorized && resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400 or 401 for recipient without token, got %d", resp.StatusCode)
	}

	// 4. Valid secret but non-existent integration token
	resp, _, err = d.Integration().PostWebhook(t, driver.PostWebhookOptions{
		Path:   "email",
		Secret: "dev_webhook_secret",
		Body: []byte(`{
			"rcptTo": "forward+tok_nonexistent12345@example.com",
			"mailFrom": "user@example.com"
		}`),
	})
	if err != nil {
		t.Fatalf("unexpected network error: %v", err)
	}
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("expected 401 Unauthorized for non-existent token, got %d", resp.StatusCode)
	}
}

func TestSimulateWebhook(t *testing.T) {
	d := driver.New(t, testEnv)

	d.Auth().
		CreateApprovedUser(t).
		Login(t)

	d.Space().Ensure(t, "Simulate Webhook Space")

	// Configure email integration with specific allowed senders
	_, err := d.Integration().Configure(t, driver.ConfigureIntegrationOptions{
		Provider:  "email",
		Kind:      "transaction_ingestion",
		IsEnabled: true,
		Config:    `{"allowed_senders": ["approved@bank.com"]}`,
	})
	if err != nil {
		t.Fatalf("failed to configure integration: %v", err)
	}

	// 1. Non-whitelisted sender must be rejected with permission error
	nonWhitelistedPayload := `{
		"sender": "spammer@evil.com",
		"subject": "Invoice Alert",
		"body": "Please pay immediately"
	}`
	_, err = d.Integration().SimulateWebhook(t, driver.SimulateWebhookOptions{
		Provider:  "email",
		Kind:      "transaction_ingestion",
		Payload:   nonWhitelistedPayload,
		ExpectErr: "not whitelisted",
	})
	if err == nil {
		t.Fatal("expected error for non-whitelisted sender, got nil")
	}

	// 2. System verification email (Google forwarding confirmation) is auto-whitelisted
	systemVerificationPayload := `{
		"sender": "forwarding-noreply@google.com",
		"subject": "Gmail Forwarding Confirmation",
		"body": "Confirmation code: 123456789. Click https://mail-settings.google.com/mail/vf-confirmation to confirm."
	}`
	simResp, err := d.Integration().SimulateWebhook(t, driver.SimulateWebhookOptions{
		Provider: "email",
		Kind:     "transaction_ingestion",
		Payload:  systemVerificationPayload,
	})
	if err != nil {
		t.Fatalf("SimulateWebhook failed for system verification: %v", err)
	}

	if simResp.GetResult() == nil {
		t.Error("expected non-empty result from simulation response")
	}

	// Verify the system verification item was staged in the inbox
	inboxResp, err := d.Finance().ListInboxItems(t, nil)
	if err != nil {
		t.Fatalf("failed to list inbox items: %v", err)
	}
	if len(inboxResp.GetInboxItems()) == 0 {
		t.Fatal("expected staged inbox item from system verification simulation")
	}

	item := inboxResp.GetInboxItems()[0]
	if item.GetDocType() != financev1.InboxItem_SYSTEM_VERIFICATION {
		t.Errorf("expected doc_type SYSTEM_VERIFICATION, got %v", item.GetDocType())
	}
}

func TestWebhookEndToEndPipelineWithEventBus(t *testing.T) {
	d := driver.New(t, testEnv)

	d.Auth().
		CreateApprovedUser(t).
		Login(t)

	d.Space().Ensure(t, "EndToEnd Webhook Space")

	// 1. Start ephemeral Mock LLM Server (genuine OpenAI SSE stream, NO fallback)
	mock := driver.StartMockLLMServer(t, "")
	mock.SetResponseFunc(func(body map[string]any) string {
		bodyBytes, _ := json.Marshal(body)
		bodyStr := string(bodyBytes)

		if strings.Contains(bodyStr, "classification") || strings.Contains(bodyStr, "classify") {
			return `{"classification": "BANK_NOTIFICATION"}`
		}

		return `{
			"reference_number": "TXN-E2E-7788",
			"transaction_type": "EXPENSE",
			"date": "2026-09-11T12:00:00Z",
			"amount": 34.50,
			"currency": "USD",
			"counterparty": "Whole Foods Market",
			"source_account": { "last_four": "9988" }
		}`
	})

	// 2. Register LLM Provider & Agent for this Space
	prov, err := d.Agent().CreateProvider(t, driver.CreateProviderOptions{
		Name:              "Mocked LLM Provider",
		CompatibilityMode: "OPENAI_COMPATIBLE",
		APIUrl:            mock.URL,
		APIKey:            "sk-webhook-e2e-real-secret",
	})
	if err != nil {
		t.Fatalf("failed to create provider: %v", err)
	}

	_, err = d.Agent().CreateAgent(t, driver.CreateAgentOptions{
		Name:          "Webhook Processor Agent",
		Purpose:       "INBOX_PARSER",
		ModelName:     "gpt-4o",
		Temperature:   0.0,
		LLMProviderID: prov.GetId(),
	})
	if err != nil {
		t.Fatalf("failed to create agent: %v", err)
	}

	// 3. Configure Email Integration in this Space
	_, err = d.Integration().Configure(t, driver.ConfigureIntegrationOptions{
		Provider:  "email",
		Kind:      "transaction_ingestion",
		IsEnabled: true,
		Config:    `{"allowed_senders": ["alerts@chase.com"]}`,
	})
	if err != nil {
		t.Fatalf("failed to configure integration: %v", err)
	}

	// 4. Create Integration Token
	tokResp, err := d.Integration().CreateToken(t, driver.CreateIntegrationTokenOptions{
		Provider: "email",
		Name:     "Chase Alerts Forwarder",
	})
	if err != nil {
		t.Fatalf("failed to create integration token: %v", err)
	}
	rawToken := tokResp.GetRawToken()
	if rawToken == "" {
		t.Fatal("expected rawToken in token creation response")
	}

	// 5. Dispatch real HTTP webhook request to /api/v1/webhooks/email
	webhookPayload := fmt.Sprintf(`{
		"rcptTo": "forward+%s@saturn.local",
		"mailFrom": "alerts@chase.com",
		"subject": "Chase Debit Alert: USD 34.50 at Whole Foods",
		"raw": "From: alerts@chase.com\nTo: forward+%s@saturn.local\nSubject: Chase Debit Alert\n\nYour purchase of $34.50 at Whole Foods Market was approved on card ending in 9988."
	}`, rawToken, rawToken)

	resp, _, err := d.Integration().PostWebhook(t, driver.PostWebhookOptions{
		Path:   "email",
		Secret: "dev_webhook_secret",
		Headers: map[string]string{
			"Content-Type": "application/json",
		},
		Body: []byte(webhookPayload),
	})
	if err != nil {
		t.Fatalf("failed to post webhook: %v", err)
	}

	// The webhook dispatcher responds with 202 Accepted and queues the event onto EventBus
	if resp.StatusCode != http.StatusAccepted {
		t.Fatalf("expected 202 Accepted from webhook dispatcher, got %d", resp.StatusCode)
	}

	// 6. Wait for EventBus consumer to asynchronously process the webhook and stage the InboxItem
	var stagedItem *financev1.InboxItem
	deadline := time.Now().Add(6 * time.Second)
	for time.Now().Before(deadline) {
		inboxResp, err := d.Finance().ListInboxItems(t, nil)
		if err == nil && len(inboxResp.GetInboxItems()) > 0 {
			stagedItem = inboxResp.GetInboxItems()[0]
			break
		}
		time.Sleep(100 * time.Millisecond)
	}

	if stagedItem == nil {
		t.Fatal("timed out waiting for EventBus worker to process webhook and stage InboxItem")
	}

	// 7. Verify the staged inbox item details extracted by the pipeline
	if stagedItem.GetVendorName() != "Whole Foods Market" {
		t.Errorf("expected vendor %q, got %q", "Whole Foods Market", stagedItem.GetVendorName())
	}
	// Amount in cents (34.50 * 100 = 3450)
	if stagedItem.GetAmount() != 3450 {
		t.Errorf("expected amount 3450, got %d", stagedItem.GetAmount())
	}
	if stagedItem.GetCurrency() != "USD" {
		t.Errorf("expected currency %q, got %q", "USD", stagedItem.GetCurrency())
	}
	if stagedItem.GetDocType() != financev1.InboxItem_BANK_NOTIFICATION {
		t.Errorf("expected doc_type BANK_NOTIFICATION, got %v", stagedItem.GetDocType())
	}
	if stagedItem.GetStatus() != financev1.InboxItem_PENDING {
		t.Errorf("expected status PENDING, got %v", stagedItem.GetStatus())
	}

	// 8. Confirm the mock LLM server received requests with proper authentication headers
	if mock.RequestCount() == 0 {
		t.Fatal("expected mock LLM server to receive HTTP requests from background worker, got 0")
	}
	authHeader := mock.LastHeader().Get("Authorization")
	if authHeader != "Bearer sk-webhook-e2e-real-secret" {
		t.Errorf("expected Authorization header Bearer sk-webhook-e2e-real-secret, got %q", authHeader)
	}
}
