//go:build integration

package driver

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"
)

// MockMCPCall records a single tool call received by MockMCPServer.
type MockMCPCall struct {
	ToolName string
	Args     map[string]any
	AuthHdr  string
}

// MockMCPServer hosts an ephemeral Streamable HTTP MCP server for external MCP integration tests.
type MockMCPServer struct {
	server *httptest.Server
	URL    string
	mu     sync.Mutex
	calls  []MockMCPCall
}

// StartMockMCPServer starts an HTTP MCP server exposing a read-only tool (`ext_lookup_weather`)
// and a mutating tool (`ext_deploy_release`), optionally enforcing a bearer token.
func StartMockMCPServer(tb testing.TB, expectedBearer string) *MockMCPServer {
	tb.Helper()

	mock := &MockMCPServer{}

	sdkSrv := sdkmcp.NewServer(&sdkmcp.Implementation{
		Name:    "mock-external-mcp",
		Version: "1.0.0",
	}, nil)

	type weatherIn struct {
		City string `json:"city" jsonschema:"Target city name"`
	}
	type weatherOut struct {
		City      string `json:"city"`
		Condition string `json:"condition"`
		TempC     int    `json:"temp_c"`
	}
	sdkmcp.AddTool(sdkSrv, &sdkmcp.Tool{
		Name:        "ext_lookup_weather",
		Title:       "Lookup Weather",
		Description: "Looks up current weather conditions for a city.",
		Annotations: &sdkmcp.ToolAnnotations{
			Title:        "Lookup Weather",
			ReadOnlyHint: true,
		},
	}, func(_ context.Context, _ *sdkmcp.CallToolRequest, in weatherIn) (*sdkmcp.CallToolResult, weatherOut, error) {
		mock.record("ext_lookup_weather", map[string]any{"city": in.City}, "")
		return nil, weatherOut{City: in.City, Condition: "Sunny", TempC: 24}, nil
	})

	type deployIn struct {
		Environment string `json:"environment" jsonschema:"Deployment environment"`
	}
	type deployOut struct {
		Status      string `json:"status"`
		Environment string `json:"environment"`
	}
	sdkmcp.AddTool(sdkSrv, &sdkmcp.Tool{
		Name:        "ext_deploy_release",
		Title:       "Deploy Release",
		Description: "Triggers a deployment to the target environment.",
		Annotations: &sdkmcp.ToolAnnotations{
			Title:           "Deploy Release",
			ReadOnlyHint:    false,
			DestructiveHint: new(true),
		},
	}, func(_ context.Context, _ *sdkmcp.CallToolRequest, in deployIn) (*sdkmcp.CallToolResult, deployOut, error) {
		mock.record("ext_deploy_release", map[string]any{"environment": in.Environment}, "")
		return nil, deployOut{Status: "deployed", Environment: in.Environment}, nil
	})

	mcpHTTP := sdkmcp.NewStreamableHTTPHandler(func(_ *http.Request) *sdkmcp.Server {
		return sdkSrv
	}, &sdkmcp.StreamableHTTPOptions{Stateless: true})

	mock.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if expectedBearer != "" {
			if r.Header.Get("Authorization") != "Bearer "+expectedBearer {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}
		}
		mcpHTTP.ServeHTTP(w, r)
	}))
	mock.URL = mock.server.URL

	tb.Cleanup(func() {
		mock.server.Close()
	})

	return mock
}

func (m *MockMCPServer) record(tool string, args map[string]any, auth string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.calls = append(m.calls, MockMCPCall{ToolName: tool, Args: args, AuthHdr: auth})
}

// Calls returns a copy of all recorded tool invocations.
func (m *MockMCPServer) Calls() []MockMCPCall {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]MockMCPCall, len(m.calls))
	copy(out, m.calls)
	return out
}
