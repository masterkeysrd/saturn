//go:build integration

package driver

import (
	"encoding/json/v2"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
)

// MockToolCall describes an OpenAI-format tool call returned by MockLLMServer.
type MockToolCall struct {
	ID        string
	Name      string
	Arguments string
}

// MockLLMTurn defines either a text response or tool calls returned by MockLLMServer for a single completion request.
type MockLLMTurn struct {
	Text      string
	Reasoning string
	ToolCalls []MockToolCall
}

// MockLLMServer wraps an httptest.Server simulating an OpenAI-compatible chat completion & models API.
type MockLLMServer struct {
	server       *httptest.Server
	URL          string
	mu           sync.Mutex
	responseFunc func(body map[string]any) string
	turnFunc     func(body map[string]any) MockLLMTurn
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
		if r.Method == http.MethodGet && strings.HasSuffix(r.URL.Path, "/models") {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"object":"list","data":[{"id":"gpt-4o","object":"model"},{"id":"gpt-4o-mini","object":"model"}]}`))
			return
		}

		bodyBytes, _ := io.ReadAll(r.Body)
		var bodyMap map[string]any
		_ = json.Unmarshal(bodyBytes, &bodyMap)

		mock.mu.Lock()
		mock.requests = append(mock.requests, bodyMap)
		mock.headers = append(mock.headers, r.Header.Clone())
		fn := mock.responseFunc
		tFn := mock.turnFunc
		respText := mock.defaultResp
		mock.mu.Unlock()

		var turn MockLLMTurn
		if tFn != nil {
			turn = tFn(bodyMap)
		} else {
			if fn != nil {
				respText = fn(bodyMap)
			}
			turn = MockLLMTurn{Text: respText}
		}

		isStreaming, _ := bodyMap["stream"].(bool)
		if !isStreaming {
			writeOpenAIJSONCompletion(w, turn)
			return
		}
		writeOpenAISSECompletion(w, turn)
	}))

	mock.URL = mock.server.URL

	tb.Cleanup(func() {
		mock.server.Close()
	})

	return mock
}

func writeOpenAIJSONCompletion(w http.ResponseWriter, turn MockLLMTurn) {
	msg := map[string]any{
		"role":    "assistant",
		"content": turn.Text,
	}
	finishReason := "stop"
	if len(turn.ToolCalls) > 0 {
		finishReason = "tool_calls"
		tcs := make([]map[string]any, 0, len(turn.ToolCalls))
		for _, tc := range turn.ToolCalls {
			args := tc.Arguments
			if args == "" {
				args = "{}"
			}
			tcs = append(tcs, map[string]any{
				"id":   tc.ID,
				"type": "function",
				"function": map[string]any{
					"name":      tc.Name,
					"arguments": args,
				},
			})
		}
		msg["tool_calls"] = tcs
	}

	payload := map[string]any{
		"id":     "chatcmpl-mock",
		"object": "chat.completion",
		"model":  "gpt-4o",
		"choices": []map[string]any{
			{
				"index":         0,
				"message":       msg,
				"finish_reason": finishReason,
			},
		},
		"usage": map[string]any{
			"prompt_tokens":     25,
			"completion_tokens": 15,
			"total_tokens":      40,
		},
	}

	raw, _ := json.Marshal(payload)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(raw)
}

func writeOpenAISSECompletion(w http.ResponseWriter, turn MockLLMTurn) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)

	if turn.Reasoning != "" {
		chunk := map[string]any{
			"id":     "chatcmpl-mock",
			"object": "chat.completion.chunk",
			"choices": []map[string]any{
				{
					"index": 0,
					"delta": map[string]any{
						"reasoning_content": turn.Reasoning,
					},
				},
			},
		}
		data, _ := json.Marshal(chunk)
		_, _ = fmt.Fprintf(w, "data: %s\n\n", data)
	}

	if len(turn.ToolCalls) > 0 {
		tcs := make([]map[string]any, 0, len(turn.ToolCalls))
		for i, tc := range turn.ToolCalls {
			args := tc.Arguments
			if args == "" {
				args = "{}"
			}
			tcs = append(tcs, map[string]any{
				"index": i,
				"id":    tc.ID,
				"type":  "function",
				"function": map[string]any{
					"name":      tc.Name,
					"arguments": args,
				},
			})
		}
		chunk := map[string]any{
			"id":     "chatcmpl-mock",
			"object": "chat.completion.chunk",
			"choices": []map[string]any{
				{
					"index":         0,
					"delta":         map[string]any{"tool_calls": tcs},
					"finish_reason": "tool_calls",
				},
			},
			"usage": map[string]any{
				"prompt_tokens":     25,
				"completion_tokens": 15,
				"total_tokens":      40,
			},
		}
		data, _ := json.Marshal(chunk)
		_, _ = fmt.Fprintf(w, "data: %s\n\n", data)
		_, _ = fmt.Fprintf(w, "data: [DONE]\n\n")
		return
	}

	chunk := map[string]any{
		"id":     "chatcmpl-mock",
		"object": "chat.completion.chunk",
		"choices": []map[string]any{
			{
				"index": 0,
				"delta": map[string]any{
					"content": turn.Text,
				},
				"finish_reason": "stop",
			},
		},
		"usage": map[string]any{
			"prompt_tokens":     25,
			"completion_tokens": 15,
			"total_tokens":      40,
		},
	}
	data, _ := json.Marshal(chunk)
	_, _ = fmt.Fprintf(w, "data: %s\n\n", data)
	_, _ = fmt.Fprintf(w, "data: [DONE]\n\n")
}

// SetDefaultResponse updates the default response string.
func (m *MockLLMServer) SetDefaultResponse(resp string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.defaultResp = resp
}

// SetResponseFunc registers a custom function to generate text responses dynamically from the request body.
func (m *MockLLMServer) SetResponseFunc(fn func(body map[string]any) string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.responseFunc = fn
}

// SetTurnFunc registers a custom function returning full text, reasoning, and/or tool_calls turns.
func (m *MockLLMServer) SetTurnFunc(fn func(body map[string]any) MockLLMTurn) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.turnFunc = fn
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
