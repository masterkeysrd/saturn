package agent

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestExecuteOpenAI(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		w.WriteHeader(http.StatusOK)

		// Send chat completion chunk
		_, _ = w.Write([]byte("data: {\"choices\":[{\"delta\":{\"content\":\"mocked response content\"}}]}\n\n"))
		_, _ = w.Write([]byte("data: [DONE]\n\n"))
	}))
	defer server.Close()

	client := NewClient()
	resp, err := client.Execute(context.Background(), ExecutionRequest{
		CompatibilityMode: ModeOpenAICompatible,
		APIUrl:            server.URL,
		APIKey:            "test-key",
		ModelName:         "gpt-4o",
		SystemInstruction: "You are a helpful assistant.",
		Prompt:            "Hello!",
		Temperature:       0.7,
	})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if resp.Text != "mocked response content" {
		t.Errorf("expected response 'mocked response content', got %q", resp.Text)
	}
}

func TestExecuteAnthropic(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		w.WriteHeader(http.StatusOK)

		// Send standard Anthropic SSE stream sequence
		_, _ = w.Write([]byte("event: message_start\n"))
		_, _ = w.Write([]byte("data: {\"type\":\"message_start\",\"message\":{\"id\":\"msg_mock\",\"role\":\"assistant\",\"content\":[],\"model\":\"claude-3\",\"usage\":{\"input_tokens\":20,\"output_tokens\":0}}}\n\n"))

		_, _ = w.Write([]byte("event: content_block_start\n"))
		_, _ = w.Write([]byte("data: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}\n\n"))

		_, _ = w.Write([]byte("event: content_block_delta\n"))
		_, _ = w.Write([]byte("data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"anthropic response\"}}\n\n"))

		_, _ = w.Write([]byte("event: content_block_stop\n"))
		_, _ = w.Write([]byte("data: {\"type\":\"content_block_stop\",\"index\":0}\n\n"))

		_, _ = w.Write([]byte("event: message_delta\n"))
		_, _ = w.Write([]byte("data: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\"},\"usage\":{\"output_tokens\":30}}\n\n"))

		_, _ = w.Write([]byte("event: message_stop\n"))
		_, _ = w.Write([]byte("data: {\"type\":\"message_stop\"}\n\n"))
	}))
	defer server.Close()

	client := NewClient()
	resp, err := client.Execute(context.Background(), ExecutionRequest{
		CompatibilityMode: ModeAnthropicCompat,
		APIUrl:            server.URL,
		APIKey:            "test-key",
		ModelName:         "claude-3",
		SystemInstruction: "Prompt prefix instructions",
		Prompt:            "Hello Claude",
		Temperature:       0.2,
	})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if resp.Text != "anthropic response" {
		t.Errorf("expected response 'anthropic response', got %q", resp.Text)
	}
}

func TestExecuteGeminiMockFallback(t *testing.T) {
	client := NewClient()
	resp, err := client.Execute(context.Background(), ExecutionRequest{
		CompatibilityMode: ModeGeminiNative,
		APIKey:            "mock-key",
		Prompt:            "Extract this receipt",
	})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if !strings.Contains(resp.Text, "MOCK-TXN-129380") {
		t.Errorf("expected response to contain mock transaction ID, got %q", resp.Text)
	}

	var parsed struct {
		ReferenceNumber string `json:"reference_number"`
	}
	if err := json.Unmarshal([]byte(resp.Text), &parsed); err != nil {
		t.Fatalf("failed to unmarshal mock response: %v", err)
	}
	if parsed.ReferenceNumber != "MOCK-TXN-129380" {
		t.Errorf("expected reference number 'MOCK-TXN-129380', got %q", parsed.ReferenceNumber)
	}
}
