package ai

import (
	"context"
	"fmt"
	"maps"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/anthropics/anthropic-sdk-go"
	anthroption "github.com/anthropics/anthropic-sdk-go/option"
	"github.com/google/jsonschema-go/jsonschema"
	"github.com/masterkeysrd/loom/llm"
	"github.com/masterkeysrd/loom/message"
	loomanthropic "github.com/masterkeysrd/loom/providers/anthropic"
	loomgenai "github.com/masterkeysrd/loom/providers/genai"
	loomollama "github.com/masterkeysrd/loom/providers/ollama"
	loomopenai "github.com/masterkeysrd/loom/providers/openai"
	"github.com/masterkeysrd/loom/tool"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	ollamaapi "github.com/ollama/ollama/api"
	"github.com/openai/openai-go/v3"
	openaioption "github.com/openai/openai-go/v3/option"
	"google.golang.org/genai"
)

const (
	mockAPIKey                = "mock-key"
	defaultDiscoveryTimeout   = 5 * time.Second
	ollamaDiscoveryTimeout    = 3 * time.Second
	openRouterDefaultEndpoint = "https://openrouter.ai/api/v1"
	ollamaDefaultEndpoint     = "http://localhost:11434"
)

// InvokeRequest encapsulates inputs for blocking or streaming model execution.
type InvokeRequest struct {
	Provider       *Provider
	ModelName      string
	Messages       []message.Message
	Tools          []*tool.Tool
	Generation     GenerationConfig
	ResponseSchema *jsonschema.Schema
}

// StreamCallbacks receives real-time deltas emitted during ModelInvoker.Stream.
type StreamCallbacks struct {
	OnThinkingDelta func(delta string)
	OnTextDelta     func(delta string)
	OnToolCall      func(call *message.ToolCall)
}

// DiscoveredModel describes an upstream model returned by DiscoverModels.
type DiscoveredModel struct {
	ModelID     string
	DisplayName string
	Profile     ModelProfile
}

// ModelInvoker abstracts blocking Invoke, streaming Stream, and upstream model discovery via loom/llm.
// @Mock
type ModelInvoker interface {
	Invoke(ctx context.Context, req InvokeRequest) (*message.Assistant, error)
	Stream(ctx context.Context, req InvokeRequest, cb StreamCallbacks) (*message.Assistant, error)
	DiscoverModels(ctx context.Context, provider *Provider) ([]DiscoveredModel, error)
}

// LoomClient implements ModelInvoker on top of loom/llm and loom/providers/*.
type LoomClient struct {
	httpClient *http.Client
}

// NewLoomClient constructs a new LoomClient.
func NewLoomClient(httpClient *http.Client) *LoomClient {
	if httpClient == nil {
		httpClient = http.DefaultClient
	}
	return &LoomClient{httpClient: httpClient}
}

var _ ModelInvoker = (*LoomClient)(nil)

func (c *LoomClient) Invoke(ctx context.Context, req InvokeRequest) (*message.Assistant, error) {
	if req.Provider == nil {
		return nil, errors.E(errors.Invalid, "provider is required")
	}
	if strings.TrimSpace(req.ModelName) == "" {
		return nil, errors.E(errors.Invalid, "model_name is required")
	}

	if isMockProvider(req.Provider) {
		return mockAssistantMessage(req, StreamCallbacks{}), nil
	}

	model, err := c.buildLoomModel(ctx, req)
	if err != nil {
		return nil, err
	}

	assistantMsg, err := model.Invoke(ctx, req.Messages)
	if err != nil {
		return nil, fmt.Errorf("llm invoke: %w", err)
	}
	return assistantMsg, nil
}

func (c *LoomClient) Stream(ctx context.Context, req InvokeRequest, cb StreamCallbacks) (*message.Assistant, error) {
	if req.Provider == nil {
		return nil, errors.E(errors.Invalid, "provider is required")
	}
	if strings.TrimSpace(req.ModelName) == "" {
		return nil, errors.E(errors.Invalid, "model_name is required")
	}

	if isMockProvider(req.Provider) {
		return mockAssistantMessage(req, cb), nil
	}

	model, err := c.buildLoomModel(ctx, req)
	if err != nil {
		return nil, err
	}

	seq, err := model.Stream(ctx, req.Messages)
	if err != nil {
		return nil, fmt.Errorf("llm stream: %w", err)
	}

	agg := message.NewAssistantAggregator()
	for chunk, streamErr := range seq {
		if streamErr != nil {
			return nil, fmt.Errorf("llm stream chunk: %w", streamErr)
		}
		agg.Add(&chunk)
		dispatchChunkCallbacks(chunk, cb)
	}

	assistantMsg, err := agg.Build()
	if err != nil {
		return nil, fmt.Errorf("aggregate assistant chunks: %w", err)
	}
	return assistantMsg, nil
}

func (c *LoomClient) DiscoverModels(ctx context.Context, provider *Provider) ([]DiscoveredModel, error) {
	if provider == nil {
		return nil, errors.E(errors.Invalid, "provider is required")
	}

	if isMockProvider(provider) {
		specs := DefaultSeedModelsForDriver(provider.Driver)
		out := make([]DiscoveredModel, 0, len(specs))
		for _, sp := range specs {
			out = append(out, DiscoveredModel{
				ModelID:     sp.ModelID,
				DisplayName: sp.DisplayName,
				Profile:     sp.Profile,
			})
		}
		return out, nil
	}

	timeout := defaultDiscoveryTimeout
	if provider.Driver == DriverOllama {
		timeout = ollamaDiscoveryTimeout
	}
	discCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	loomProv, err := c.buildLoomProvider(discCtx, provider)
	if err != nil {
		return nil, err
	}

	lister, ok := loomProv.(llm.ModelLister)
	if !ok {
		return nil, errors.E(errors.Invalid, "provider driver does not support model discovery")
	}

	profiles, err := lister.ListModels(discCtx)
	if err != nil {
		return nil, errors.E(errors.Unavailable, CodeProviderVerifyFailed, fmt.Sprintf("discover models for %s: %v", provider.Driver, err))
	}

	out := make([]DiscoveredModel, 0, len(profiles))
	for _, lp := range profiles {
		mapped := FromLoomProfile(lp)
		name := lp.Name
		if name == "" {
			name = lp.ID
		}
		if prof, catalogName, found := LookupLoomProfile(provider.Driver, lp.ID); found {
			mapped = prof
			if name == lp.ID && catalogName != "" {
				name = catalogName
			}
		}
		out = append(out, DiscoveredModel{
			ModelID:     lp.ID,
			DisplayName: name,
			Profile:     mapped,
		})
	}
	return out, nil
}

func (c *LoomClient) buildLoomModel(ctx context.Context, req InvokeRequest) (*llm.Model, error) {
	prov, err := c.buildLoomProvider(ctx, req.Provider)
	if err != nil {
		return nil, err
	}

	model, err := llm.NewModel(prov, req.ModelName, nil)
	if err != nil {
		return nil, fmt.Errorf("init loom model %q: %w", req.ModelName, err)
	}

	gen := req.Generation
	anthropicThinking := req.Provider.Driver == DriverAnthropic && gen.Thinking.Enabled
	if gen.Temperature != nil && (!anthropicThinking || *gen.Temperature == 1.0) {
		model = model.WithTemperature(float32(*gen.Temperature))
	}
	if gen.MaxTokens != nil && *gen.MaxTokens > 0 {
		model = model.WithMaxTokens(int(*gen.MaxTokens))
	}
	if gen.TopP != nil && !anthropicThinking {
		model = model.WithTopP(float32(*gen.TopP))
	}
	if gen.Thinking.Enabled && (req.Provider.Driver != DriverOllama || req.ResponseSchema == nil) {
		if req.Provider.Driver == DriverAnthropic {
			if gen.Thinking.BudgetTokens != nil && *gen.Thinking.BudgetTokens >= 1024 {
				model = model.WithThinking(int(*gen.Thinking.BudgetTokens))
			} else {
				model = model.WithAdaptiveThinking()
			}
		} else {
			model = model.WithThinkingEnabled(true)
			if gen.Thinking.BudgetTokens != nil && *gen.Thinking.BudgetTokens > 0 {
				model = model.WithThinking(int(*gen.Thinking.BudgetTokens))
			}
		}
		if gen.Thinking.Effort != nil && *gen.Thinking.Effort != "" {
			model = model.WithThinkingEffort(*gen.Thinking.Effort)
		}
	}

	if len(req.Tools) > 0 {
		model = model.BindTools(req.Tools...)
	}
	if req.ResponseSchema != nil {
		model = model.WithStructuredOutput(req.ResponseSchema)
	}
	return model, nil
}

func (c *LoomClient) buildLoomProvider(ctx context.Context, p *Provider) (llm.Provider, error) {
	apiKey := ""
	var headers map[string]string
	if p.Secret != nil {
		if p.Secret.APIKey != nil {
			apiKey = strings.TrimSpace(*p.Secret.APIKey)
		}
		headers = p.Secret.Headers
	}

	if p.Driver.RequiresAPIKey() && apiKey == "" {
		return nil, errors.E(errors.Invalid, CodeProviderVerifyFailed, fmt.Sprintf("api_key is required for %s provider", p.Driver))
	}

	baseURL := ""
	if p.Config.BaseURL != nil {
		baseURL = strings.TrimSpace(*p.Config.BaseURL)
	}

	rt := c.httpClient.Transport
	if rt == nil {
		rt = http.DefaultTransport
	}

	switch p.Driver {
	case DriverGemini:
		cfg := &genai.ClientConfig{
			APIKey: apiKey,
		}
		if len(headers) > 0 {
			cfg.HTTPClient = &http.Client{
				Timeout:       c.httpClient.Timeout,
				CheckRedirect: c.httpClient.CheckRedirect,
				Transport:     &headerRoundTripper{base: rt, headers: headers},
			}
		} else {
			cfg.HTTPClient = c.httpClient
		}
		if baseURL != "" {
			cfg.HTTPOptions = genai.HTTPOptions{BaseURL: baseURL}
		}
		prov, err := loomgenai.NewProvider(ctx, cfg)
		if err != nil {
			return nil, fmt.Errorf("init gemini provider: %w", err)
		}
		return prov, nil

	case DriverOpenAI, DriverOpenRouter, DriverOpenAICompatible:
		if p.Driver == DriverOpenRouter && baseURL == "" {
			baseURL = openRouterDefaultEndpoint
		}
		if p.Driver == DriverOpenAICompatible && baseURL == "" {
			return nil, errors.E(errors.Invalid, "base_url is required for openai_compatible provider")
		}
		effectiveKey := apiKey
		if effectiveKey == "" {
			effectiveKey = "ollama"
		}
		opts := []openaioption.RequestOption{
			openaioption.WithAPIKey(effectiveKey),
			openaioption.WithHTTPClient(c.httpClient),
		}
		if baseURL != "" {
			opts = append(opts, openaioption.WithBaseURL(baseURL))
		}
		for k, v := range headers {
			opts = append(opts, openaioption.WithHeader(k, v))
		}
		client := openai.NewClient(opts...)
		return loomopenai.NewProvider(&client), nil

	case DriverAnthropic:
		opts := []anthroption.RequestOption{
			anthroption.WithAPIKey(apiKey),
			anthroption.WithHTTPClient(c.httpClient),
		}
		if baseURL != "" {
			opts = append(opts, anthroption.WithBaseURL(baseURL))
		}
		for k, v := range headers {
			opts = append(opts, anthroption.WithHeader(k, v))
		}
		client := anthropic.NewClient(opts...)
		return loomanthropic.NewProvider(&client), nil

	case DriverOllama:
		if baseURL == "" {
			baseURL = ollamaDefaultEndpoint
		}
		u, err := url.Parse(baseURL)
		if err != nil {
			return nil, errors.E(errors.Invalid, fmt.Errorf("invalid ollama base_url: %w", err))
		}
		mergedHeaders := make(map[string]string, len(headers)+1)
		maps.Copy(mergedHeaders, headers)
		if apiKey != "" {
			mergedHeaders["Authorization"] = "Bearer " + apiKey
		}
		ollamaHTTP := c.httpClient
		if len(mergedHeaders) > 0 {
			ollamaHTTP = &http.Client{
				Timeout:       c.httpClient.Timeout,
				CheckRedirect: c.httpClient.CheckRedirect,
				Transport:     &headerRoundTripper{base: rt, headers: mergedHeaders},
			}
		}
		ollamaClient := ollamaapi.NewClient(u, ollamaHTTP)
		return (&loomollama.Provider{}).NewProvider(ollamaClient, u), nil

	default:
		return nil, errors.E(errors.Invalid, fmt.Sprintf("unsupported provider driver: %q", p.Driver))
	}
}

func dispatchChunkCallbacks(chunk message.AssistantChunk, cb StreamCallbacks) {
	for _, block := range chunk.Content {
		switch b := block.(type) {
		case *message.ThinkingBlock:
			if cb.OnThinkingDelta != nil && b.Thinking != "" {
				cb.OnThinkingDelta(b.Thinking)
			}
		case *message.TextBlock:
			if cb.OnTextDelta != nil && b.Text != "" {
				cb.OnTextDelta(b.Text)
			}
		case *message.ToolCall:
			if cb.OnToolCall != nil {
				cb.OnToolCall(b)
			}
		}
	}
}

func isMockProvider(p *Provider) bool {
	return p != nil && p.Secret != nil && p.Secret.APIKey != nil && *p.Secret.APIKey == mockAPIKey
}

func mockAssistantMessage(req InvokeRequest, cb StreamCallbacks) *message.Assistant {
	const thinking = "Analyzing workspace request."
	text := "Mock AI response."
	if req.ResponseSchema != nil {
		text = `{"status":"ok","summary":"mock structured response"}`
	}

	if cb.OnThinkingDelta != nil {
		cb.OnThinkingDelta(thinking)
	}
	if cb.OnTextDelta != nil {
		cb.OnTextDelta(text)
	}

	return &message.Assistant{
		Content: message.Content{
			&message.ThinkingBlock{Thinking: thinking},
			&message.TextBlock{Text: text},
		},
		Metrics: &message.TokenMetrics{
			TotalTokens: 42,
			Tokens: message.TokenDetails{
				Input:     20,
				Output:    15,
				Reasoning: 7,
			},
		},
		Done:       true,
		DoneReason: "stop",
	}
}

type headerRoundTripper struct {
	base    http.RoundTripper
	headers map[string]string
}

func (rt *headerRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	clone := req.Clone(req.Context())
	for k, v := range rt.headers {
		clone.Header.Set(k, v)
	}
	return rt.base.RoundTrip(clone)
}
