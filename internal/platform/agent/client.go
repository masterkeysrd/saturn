package agent

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"

	"github.com/anthropics/anthropic-sdk-go"
	anthroption "github.com/anthropics/anthropic-sdk-go/option"
	"github.com/google/jsonschema-go/jsonschema"
	"github.com/masterkeysrd/loom/llm"
	loomanthropic "github.com/masterkeysrd/loom/llm/anthropic"
	loomgenai "github.com/masterkeysrd/loom/llm/genai"
	loomollama "github.com/masterkeysrd/loom/llm/ollama"
	loomopenai "github.com/masterkeysrd/loom/llm/openai"
	"github.com/masterkeysrd/loom/message"
	ollamaapi "github.com/ollama/ollama/api"
	"github.com/openai/openai-go/v3"
	"github.com/openai/openai-go/v3/option"
	"google.golang.org/genai"
)

// ExecutionRequest holds inputs for running a prompt on an LLM provider.
type ExecutionRequest struct {
	CompatibilityMode CompatibilityMode
	APIUrl            string
	APIKey            string
	ModelName         string
	SystemInstruction string
	Prompt            string
	Temperature       float64
	ResponseSchema    string // Optional JSON Schema to enforce structured outputs
}

// ExecutionResponse holds the text returned by the model and execution metadata.
type ExecutionResponse struct {
	Text       string
	TokensUsed int
}

// Client executes prompts against LLM endpoints via Loom framework.
type Client struct{}

// NewClient creates a new Client instance.
func NewClient() *Client {
	return &Client{}
}

// authTransport wraps an http.RoundTripper to inject Authorization bearer credentials.
type authTransport struct {
	transport http.RoundTripper
	apiKey    string
}

// RoundTrip injects the Authorization Bearer header into outgoing requests.
func (t *authTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	req.Header.Set("Authorization", "Bearer "+t.apiKey)
	return t.transport.RoundTrip(req)
}

// Execute dispatches the request to the target model using Loom.
func (c *Client) Execute(ctx context.Context, req ExecutionRequest) (ExecutionResponse, error) {
	// If credentials are set to mock-key, allow falling back to Mock Response for unit tests
	if req.APIKey == "mock-key" {
		return c.mockResponse(req.Prompt)
	}

	// Strictly require API keys for all provider runs in production
	if req.APIKey == "" {
		return ExecutionResponse{}, errors.New("api_key is required for all provider connections")
	}

	var prov llm.Provider
	var err error

	switch req.CompatibilityMode {
	case ModeGeminiNative:
		config := &genai.ClientConfig{
			APIKey: req.APIKey,
		}
		if req.APIUrl != "" {
			config.HTTPOptions = genai.HTTPOptions{
				BaseURL: req.APIUrl,
			}
		}
		prov, err = loomgenai.NewProvider(ctx, config)
		if err != nil {
			return ExecutionResponse{}, fmt.Errorf("init Gemini native provider: %w", err)
		}

	case ModeOpenAICompatible:
		opts := []option.RequestOption{
			option.WithAPIKey(req.APIKey),
		}
		if req.APIUrl != "" {
			opts = append(opts, option.WithBaseURL(req.APIUrl))
		}
		client := openai.NewClient(opts...)
		prov = loomopenai.NewProvider(&client)

	case ModeAnthropicCompat:
		opts := []anthroption.RequestOption{
			anthroption.WithAPIKey(req.APIKey),
		}
		if req.APIUrl != "" {
			opts = append(opts, anthroption.WithBaseURL(req.APIUrl))
		}
		client := anthropic.NewClient(opts...)
		prov = loomanthropic.NewProvider(&client)

	case ModeOllamaNative:
		if req.APIUrl == "" {
			return ExecutionResponse{}, errors.New("api_url (Ollama Host) is required for Ollama connection")
		}
		u, err := url.Parse(req.APIUrl)
		if err != nil {
			return ExecutionResponse{}, fmt.Errorf("invalid Ollama host URL: %w", err)
		}

		var rt = http.DefaultTransport
		if req.APIKey != "" {
			rt = &authTransport{
				transport: rt,
				apiKey:    req.APIKey,
			}
		}
		httpClient := &http.Client{
			Transport: rt,
		}

		ollamaClient := ollamaapi.NewClient(u, httpClient)
		prov = (&loomollama.Provider{}).NewProvider(ollamaClient, u)

	default:
		return ExecutionResponse{}, fmt.Errorf("unsupported compatibility mode: %q", req.CompatibilityMode)
	}

	model, err := llm.NewModel(prov, req.ModelName, nil)
	if err != nil {
		return ExecutionResponse{}, fmt.Errorf("initialize model: %w", err)
	}

	model = model.WithTemperature(float32(req.Temperature))
	if req.ResponseSchema != "" {
		var schema jsonschema.Schema
		if err := json.Unmarshal([]byte(req.ResponseSchema), &schema); err == nil {
			model = model.WithStructuredOutput(&schema)
		} else {
			model = model.WithJSON()
		}
	}

	var msgs []message.Message
	if req.SystemInstruction != "" {
		msgs = append(msgs, message.NewSystemText(req.SystemInstruction))
	}
	msgs = append(msgs, message.NewUserText(req.Prompt))

	assistantMsg, err := model.Invoke(ctx, msgs)
	if err != nil {
		return ExecutionResponse{}, fmt.Errorf("model invoke: %w", err)
	}

	var outputText string
	for _, block := range assistantMsg.Content {
		if textBlock, ok := block.(*message.TextBlock); ok {
			outputText += textBlock.Text
		}
	}

	var tokensUsed int
	if assistantMsg.Metrics != nil {
		tokensUsed = assistantMsg.Metrics.TotalTokens
	}

	return ExecutionResponse{
		Text:       outputText,
		TokensUsed: tokensUsed,
	}, nil
}

// mockResponse returns fallback mock transaction JSON if run locally offline.
func (c *Client) mockResponse(prompt string) (ExecutionResponse, error) {
	mockTxn := `{
		"reference_number": "MOCK-TXN-129380",
		"transaction_type": "EXPENSE",
		"date": "2026-07-23T20:00:00Z",
		"amount": 45.00,
		"currency": "USD",
		"counterparty": "Netflix.com",
		"source_account": {
			"raw_name": "Chase Credit Card",
			"last_four": "1234"
		}
	}`
	return ExecutionResponse{
		Text:       mockTxn,
		TokensUsed: 100,
	}, nil
}
