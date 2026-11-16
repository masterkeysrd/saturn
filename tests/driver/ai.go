//go:build integration

package driver

import (
	"bufio"
	"bytes"
	"encoding/json/v2"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/masterkeysrd/saturn/apis/saturn"
	aiv1 "github.com/masterkeysrd/saturn/apis/saturn/platform/ai/v1"
	"github.com/stretchr/testify/require"
)

// AIDriver provides fluent helpers for interacting with AIService and HTTP SSE endpoints in integration tests.
type AIDriver struct {
	driver      *Driver
	client      *aiv1.Client
	lastToken   string
	lastSpaceID string
}

// Client returns a cached HTTP SDK client configured with the current user token and active space ID.
func (a *AIDriver) Client() *aiv1.Client {
	if a.client == nil || a.lastToken != a.driver.state.AccessToken || a.lastSpaceID != a.driver.state.SpaceID {
		a.lastToken = a.driver.state.AccessToken
		a.lastSpaceID = a.driver.state.SpaceID
		a.client = aiv1.NewClient(saturn.Config{
			BaseURL:     a.driver.env.ServerURL,
			AccessToken: a.lastToken,
			SpaceID:     a.lastSpaceID,
			HTTPClient:  a.driver.httpClient,
		})
	}
	return a.client
}

// SetupMockOpenAIProvider creates an openai_compatible provider pointing at mockURL,
// registers modelName (e.g. "gpt-4o"), and initializes it as workspace Default/Fast/Reasoning model if unset.
func (a *AIDriver) SetupMockOpenAIProvider(tb testing.TB, name, mockURL, modelName string) (*aiv1.Provider, *aiv1.Model) {
	tb.Helper()
	prov, err := a.Client().CreateProvider(tb.Context(), &aiv1.CreateProviderRequest{
		Provider: &aiv1.Provider{
			Name:      name,
			Driver:    "openai_compatible",
			IsEnabled: true,
			Config:    &aiv1.ProviderConfig{BaseUrl: new(mockURL)},
			Secret:    &aiv1.ProviderSecretInput{ApiKey: new("sk-mock-integration")},
		},
	})
	require.NoError(tb, err)
	a.driver.state.LastProviderID = prov.GetId()

	model, err := a.Client().CreateModel(tb.Context(), &aiv1.CreateModelRequest{
		Model: &aiv1.Model{
			ProviderId:  prov.GetId(),
			ModelId:     modelName,
			DisplayName: modelName,
			IsEnabled:   true,
			Profile: &aiv1.ModelProfile{
				Capabilities: &aiv1.ModelCapabilities{
					ToolCalling:      true,
					StructuredOutput: true,
					Streaming:        true,
				},
				Limits: &aiv1.ModelLimits{
					ContextWindow:   128000,
					MaxOutputTokens: 4096,
				},
			},
		},
	})
	require.NoError(tb, err)
	a.driver.state.LastModelID = model.GetId()
	return prov, model
}

// SSEEvent represents a parsed SSE event frame returned from Saturn's HTTP SSE endpoints.
type SSEEvent struct {
	Event string
	Data  map[string]any
}

// StreamThreadTurn calls POST /api/v1/platform/ai/threads/{threadID}:stream and returns all parsed SSE frames.
func (a *AIDriver) StreamThreadTurn(tb testing.TB, threadID string, payload map[string]any) []SSEEvent {
	tb.Helper()
	url := a.driver.env.ServerURL + "/api/v1/platform/ai/threads/" + threadID + ":stream"
	return a.postSSE(tb, url, payload)
}

// ResolveApprovals calls POST /api/v1/platform/ai/threads/{threadID}:resolveApprovals and returns all parsed SSE frames.
func (a *AIDriver) ResolveApprovals(tb testing.TB, threadID string, decisions []map[string]any) []SSEEvent {
	tb.Helper()
	url := a.driver.env.ServerURL + "/api/v1/platform/ai/threads/" + threadID + ":resolveApprovals"
	return a.postSSE(tb, url, map[string]any{"decisions": decisions})
}

func (a *AIDriver) postSSE(tb testing.TB, url string, payload map[string]any) []SSEEvent {
	tb.Helper()
	raw, err := json.Marshal(payload)
	require.NoError(tb, err)

	req, err := http.NewRequestWithContext(tb.Context(), http.MethodPost, url, bytes.NewReader(raw))
	require.NoError(tb, err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+a.driver.state.AccessToken)
	req.Header.Set("Space-Id", a.driver.state.SpaceID)

	resp, err := a.driver.httpClient.Do(req)
	require.NoError(tb, err)
	defer func() { _ = resp.Body.Close() }()
	require.Equal(tb, http.StatusOK, resp.StatusCode)

	bodyBytes, err := io.ReadAll(resp.Body)
	require.NoError(tb, err)

	var events []SSEEvent
	scanner := bufio.NewScanner(bytes.NewReader(bodyBytes))
	var curEvent string
	var curData []string

	flush := func() {
		if len(curData) == 0 {
			curEvent = ""
			return
		}
		joined := strings.Join(curData, "\n")
		var parsed map[string]any
		_ = json.Unmarshal([]byte(joined), &parsed)
		events = append(events, SSEEvent{
			Event: curEvent,
			Data:  parsed,
		})
		curEvent = ""
		curData = nil
	}

	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			flush()
			continue
		}
		if strings.HasPrefix(line, ":") {
			continue
		}
		if after, ok := strings.CutPrefix(line, "event:"); ok {
			curEvent = strings.TrimSpace(after)
		} else if after, ok := strings.CutPrefix(line, "data:"); ok {
			curData = append(curData, strings.TrimSpace(after))
		}
	}
	flush()
	require.NoError(tb, scanner.Err())
	return events
}
