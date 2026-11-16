package ai

import (
	"context"
	"encoding/json/v2"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/jsonschema-go/jsonschema"
	"github.com/masterkeysrd/loom/message"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

func TestLoomClient_MockKeyAndValidation(t *testing.T) {
	client := NewLoomClient(nil)

	t.Run("mock-key Invoke unstructured and structured", func(t *testing.T) {
		prov := &Provider{
			Driver: DriverOpenAI,
			Secret: &ProviderSecret{APIKey: new(mockAPIKey)},
		}

		res, err := client.Invoke(context.Background(), InvokeRequest{
			Provider:  prov,
			ModelName: "gpt-4.1",
			Messages:  []message.Message{message.NewUserText("Hello")},
		})
		if err != nil {
			t.Fatalf("Invoke failed: %v", err)
		}
		if res.Metrics == nil || res.Metrics.TotalTokens != 42 {
			t.Errorf("unexpected metrics: %+v", res.Metrics)
		}

		resStruct, err := client.Invoke(context.Background(), InvokeRequest{
			Provider:       prov,
			ModelName:      "gpt-4.1",
			Messages:       []message.Message{message.NewUserText("Extract JSON")},
			ResponseSchema: &jsonschema.Schema{Type: "object"},
		})
		if err != nil {
			t.Fatalf("Invoke structured failed: %v", err)
		}
		var parsed map[string]any
		text := resStruct.Content[1].(*message.TextBlock).Text
		if err := json.Unmarshal([]byte(text), &parsed); err != nil || parsed["status"] != "ok" {
			t.Errorf("expected valid JSON mock output, got %q (err=%v)", text, err)
		}
	})

	t.Run("mock-key Stream emits thinking and text deltas", func(t *testing.T) {
		prov := &Provider{
			Driver: DriverGemini,
			Secret: &ProviderSecret{APIKey: new(mockAPIKey)},
		}
		var thinkingOut, textOut strings.Builder
		res, err := client.Stream(context.Background(), InvokeRequest{
			Provider:  prov,
			ModelName: "gemini-2.5-flash",
			Messages:  []message.Message{message.NewUserText("Stream")},
		}, StreamCallbacks{
			OnThinkingDelta: func(d string) { thinkingOut.WriteString(d) },
			OnTextDelta:     func(d string) { textOut.WriteString(d) },
		})
		if err != nil {
			t.Fatalf("Stream failed: %v", err)
		}
		if thinkingOut.Len() == 0 || textOut.Len() == 0 || !res.Done {
			t.Errorf("unexpected stream output: thinking=%q text=%q done=%v", thinkingOut.String(), textOut.String(), res.Done)
		}
	})

	t.Run("requires API key for cloud drivers, allows keyless ollama", func(t *testing.T) {
		if _, err := client.buildLoomProvider(context.Background(), &Provider{Driver: DriverOpenAI}); !errors.Is(err, errors.Invalid) {
			t.Errorf("expected Invalid when OpenAI missing API key, got %v", err)
		}
		if _, err := client.buildLoomProvider(context.Background(), &Provider{Driver: DriverOllama}); err != nil {
			t.Errorf("expected keyless Ollama provider to build cleanly, got %v", err)
		}
		if _, err := client.buildLoomProvider(context.Background(), &Provider{
			Driver: DriverOpenAICompatible,
			Config: ProviderConfig{BaseURL: new("http://localhost:8000/v1")},
		}); err != nil {
			t.Errorf("expected keyless openai_compatible with base_url to build cleanly, got %v", err)
		}
	})
}

func TestLoomClient_DiscoverModels_OllamaAndOpenAICompatible(t *testing.T) {
	client := NewLoomClient(nil)

	t.Run("ollama /api/tags discovery", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path != "/api/tags" {
				http.NotFound(w, r)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"models":[{"name":"llama3.2:latest","model":"llama3.2:latest"},{"name":"qwen2.5:14b","model":"qwen2.5:14b"}]}`))
		}))
		defer srv.Close()

		models, err := client.DiscoverModels(context.Background(), &Provider{
			Driver: DriverOllama,
			Config: ProviderConfig{BaseURL: new(srv.URL)},
		})
		if err != nil {
			t.Fatalf("DiscoverModels failed: %v", err)
		}
		if len(models) != 2 || models[0].ModelID != "llama3.2:latest" || models[1].ModelID != "qwen2.5:14b" {
			t.Errorf("unexpected discovered ollama models: %+v", models)
		}
	})

	t.Run("openai_compatible /models discovery with custom header", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path != "/models" {
				http.NotFound(w, r)
				return
			}
			if r.Header.Get("X-Custom") != "abc" {
				w.WriteHeader(http.StatusUnauthorized)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"object":"list","data":[{"id":"gpt-4.1","created":1700000000},{"id":"my-local-model","created":1700000000}]}`))
		}))
		defer srv.Close()

		models, err := client.DiscoverModels(context.Background(), &Provider{
			Driver: DriverOpenAICompatible,
			Config: ProviderConfig{BaseURL: new(srv.URL)},
			Secret: &ProviderSecret{Headers: map[string]string{"X-Custom": "abc"}},
		})
		if err != nil {
			t.Fatalf("DiscoverModels failed: %v", err)
		}
		if len(models) != 2 || models[0].ModelID != "gpt-4.1" || models[1].ModelID != "my-local-model" {
			t.Errorf("unexpected discovered models: %+v", models)
		}
	})
}
