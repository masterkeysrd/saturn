//go:build integration

package driver

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
)

// MockLLMServer wraps an httptest.Server simulating an OpenAI-compatible SSE streaming LLM API.
type MockLLMServer struct {
	server       *httptest.Server
	URL          string
	mu           sync.Mutex
	responseFunc func(body map[string]any) string
	defaultResp  string
	requests     []map[string]any
	headers      []http.Header
}

// StartMockLLMServer starts an ephemeral HTTP server mimicking an OpenAI compatible endpoint.
// Automatically closed on test cleanup.
func StartMockLLMServer(tb testing.TB, defaultResponse string) *MockLLMServer {
	tb.Helper()

	mock := &MockLLMServer{
		defaultResp: defaultResponse,
	}

	mock.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		bodyBytes, _ := io.ReadAll(r.Body)
		var bodyMap map[string]any
		_ = json.Unmarshal(bodyBytes, &bodyMap)

		mock.mu.Lock()
		mock.requests = append(mock.requests, bodyMap)
		mock.headers = append(mock.headers, r.Header.Clone())
		fn := mock.responseFunc
		respText := mock.defaultResp
		mock.mu.Unlock()

		if fn != nil {
			respText = fn(bodyMap)
		}

		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		w.WriteHeader(http.StatusOK)

		// Send OpenAI chat completion SSE chunk
		chunk := map[string]any{
			"choices": []map[string]any{
				{
					"delta": map[string]any{
						"content": respText,
					},
				},
			},
		}
		data, _ := json.Marshal(chunk)
		_, _ = fmt.Fprintf(w, "data: %s\n\n", data)
		_, _ = fmt.Fprintf(w, "data: [DONE]\n\n")
	}))

	mock.URL = mock.server.URL

	tb.Cleanup(func() {
		mock.server.Close()
	})

	return mock
}

// SetDefaultResponse updates the default response string.
func (m *MockLLMServer) SetDefaultResponse(resp string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.defaultResp = resp
}

// SetResponseFunc registers a custom function to generate responses dynamically from the request body.
func (m *MockLLMServer) SetResponseFunc(fn func(body map[string]any) string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.responseFunc = fn
}

// LastRequest returns the parsed JSON body of the most recent request, if any.
func (m *MockLLMServer) LastRequest() map[string]any {
	m.mu.Lock()
	defer m.mu.Unlock()
	if len(m.requests) == 0 {
		return nil
	}
	return m.requests[len(m.requests)-1]
}

// LastHeader returns the HTTP headers of the most recent request, if any.
func (m *MockLLMServer) LastHeader() http.Header {
	m.mu.Lock()
	defer m.mu.Unlock()
	if len(m.headers) == 0 {
		return nil
	}
	return m.headers[len(m.headers)-1]
}

// RequestCount returns the total number of requests received by the mock server.
func (m *MockLLMServer) RequestCount() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.requests)
}

// Close explicitly closes the underlying HTTP test server.
func (m *MockLLMServer) Close() {
	m.server.Close()
}
