package ai

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/masterkeysrd/loom/message"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"
)

type echoArgs struct {
	Message string `json:"message" jsonschema:"Echo message"`
}

type echoOut struct {
	Reply string `json:"reply"`
}

func newTestSDKServer() *sdkmcp.Server {
	srv := sdkmcp.NewServer(&sdkmcp.Implementation{Name: "test-mcp", Version: "1.0.0"}, nil)
	sdkmcp.AddTool(srv, &sdkmcp.Tool{
		Name:        "finance_list_accounts",
		Title:       "List Accounts",
		Description: "Read-only tool",
		Annotations: &sdkmcp.ToolAnnotations{
			ReadOnlyHint:    true,
			DestructiveHint: new(false),
		},
	}, func(_ context.Context, _ *sdkmcp.CallToolRequest, in echoArgs) (*sdkmcp.CallToolResult, echoOut, error) {
		return nil, echoOut{Reply: "read:" + in.Message}, nil
	})
	sdkmcp.AddTool(srv, &sdkmcp.Tool{
		Name:        "finance_create_transaction",
		Title:       "Create Transaction",
		Description: "Mutating tool",
		Annotations: &sdkmcp.ToolAnnotations{
			ReadOnlyHint:    false,
			DestructiveHint: new(true),
		},
	}, func(_ context.Context, _ *sdkmcp.CallToolRequest, in echoArgs) (*sdkmcp.CallToolResult, echoOut, error) {
		return nil, echoOut{Reply: "write:" + in.Message}, nil
	})
	return srv
}

func TestUnifiedMCPConnector_InMemory(t *testing.T) {
	dialer := func(ctx context.Context) (*sdkmcp.ClientSession, error) {
		ct, st := sdkmcp.NewInMemoryTransports()
		srv := newTestSDKServer()
		if _, err := srv.Connect(ctx, st, nil); err != nil {
			return nil, err
		}
		client := sdkmcp.NewClient(&sdkmcp.Implementation{Name: "loopback", Version: "1.0.0"}, nil)
		return client.Connect(ctx, ct, nil)
	}

	conn := NewUnifiedMCPConnector(dialer, false)
	sysSrv := SystemSaturnMCPBlueprint("spc_1")
	sysSrv.ID = "mcp_saturn"

	disc, err := conn.Discover(context.Background(), sysSrv)
	if err != nil {
		t.Fatalf("Discover failed: %v", err)
	}
	if disc.HealthStatus != MCPHealthHealthy || disc.ServerInfo == nil || disc.ServerInfo.Name != "test-mcp" || len(disc.Tools) != 2 {
		t.Fatalf("unexpected discovery state: %+v", disc)
	}
	byName := make(map[string]MCPToolSummary, len(disc.Tools))
	for _, dt := range disc.Tools {
		byName[dt.Name] = dt
	}
	if !byName["finance_list_accounts"].ReadOnlyHint || byName["finance_list_accounts"].DestructiveHint {
		t.Errorf("unexpected annotations on read tool: %+v", byName["finance_list_accounts"])
	}
	if byName["finance_create_transaction"].ReadOnlyHint || !byName["finance_create_transaction"].DestructiveHint {
		t.Errorf("unexpected annotations on write tool: %+v", byName["finance_create_transaction"])
	}

	bound, err := conn.ConnectTools(context.Background(), sysSrv, []string{"finance_list_accounts"})
	if err != nil {
		t.Fatalf("ConnectTools failed: %v", err)
	}
	defer bound.Close()

	if len(bound.Tools) != 1 || bound.Tools[0].Tool.Definition.Name != "finance_list_accounts" || !bound.Tools[0].ReadOnlyHint {
		t.Fatalf("unexpected bound tools: %+v", bound.Tools)
	}

	stream, err := bound.Tools[0].Tool.Handler(context.Background(), &message.ToolCall{
		ID:   "tc_1",
		Name: "finance_list_accounts",
		Args: map[string]any{"message": "hi"},
	})
	if err != nil {
		t.Fatalf("Handler failed: %v", err)
	}
	for chunk, callErr := range stream {
		if callErr != nil {
			t.Fatalf("tool call error: %v", callErr)
		}
		sc, ok := chunk.StructuredContent.(map[string]any)
		if !ok || sc["reply"] != "read:hi" {
			t.Errorf("unexpected structured content: %#v", chunk.StructuredContent)
		}
	}
}

func TestUnifiedMCPConnector_HTTP_SSRF_And_Namespacing(t *testing.T) {
	var seenAuth string
	httpSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seenAuth = r.Header.Get("Authorization")
		if seenAuth != "Bearer secret-tok" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		handler := sdkmcp.NewStreamableHTTPHandler(func(_ *http.Request) *sdkmcp.Server {
			return newTestSDKServer()
		}, &sdkmcp.StreamableHTTPOptions{Stateless: true})
		handler.ServeHTTP(w, r)
	}))
	defer httpSrv.Close()

	extSrv := &MCPServer{
		ID:         "mcp_ext",
		SpaceID:    "spc_1",
		Slug:       "github",
		Name:       "GitHub",
		Transport:  TransportHTTP,
		Config:     MCPServerConfig{URL: httpSrv.URL, AuthType: MCPAuthBearer, TimeoutSeconds: 10},
		AuthSecret: &MCPAuthSecret{BearerToken: new("secret-tok")},
		IsEnabled:  true,
	}

	// SSRF blocks localhost when allowPrivateNetworks=false
	strictConn := NewUnifiedMCPConnector(nil, false)
	if _, err := strictConn.Discover(context.Background(), extSrv); !errors.Is(err, errors.Invalid) || errors.CodeOf(err) != CodeMCPSSRFBlocked {
		t.Fatalf("expected SSRF block on localhost, got %v", err)
	}

	// When allowPrivateNetworks=true, connects via loom/mcp.NewClient, injects Bearer token, and namespaces tools
	devConn := NewUnifiedMCPConnector(nil, true)
	disc, err := devConn.Discover(context.Background(), extSrv)
	if err != nil {
		t.Fatalf("HTTP Discover failed: %v", err)
	}
	if seenAuth != "Bearer secret-tok" || disc.HealthStatus != MCPHealthHealthy || len(disc.Tools) != 2 {
		t.Fatalf("unexpected HTTP discovery: auth=%q disc=%+v", seenAuth, disc)
	}

	bound, err := devConn.ConnectTools(context.Background(), extSrv, []string{"*"})
	if err != nil {
		t.Fatalf("HTTP ConnectTools failed: %v", err)
	}
	defer bound.Close()

	if len(bound.Tools) != 2 {
		t.Fatalf("expected 2 bound tools, got %d", len(bound.Tools))
	}
	var readTool *BoundMCPTool
	for _, bt := range bound.Tools {
		if bt.OriginalToolName == "finance_list_accounts" {
			readTool = bt
			break
		}
	}
	if readTool == nil || readTool.Tool.Definition.Name != "mcp__github__finance_list_accounts" {
		t.Fatalf("expected mcp__github__finance_list_accounts in bound tools, got %+v", bound.Tools)
	}
	if !readTool.ReadOnlyHint {
		t.Errorf("expected ReadOnlyHint preserved via loom@main adaptTool, got %+v", readTool)
	}

	stream, err := readTool.Tool.Handler(context.Background(), &message.ToolCall{
		ID:   "tc_http",
		Name: readTool.Tool.Definition.Name,
		Args: map[string]any{"message": "ping"},
	})
	if err != nil {
		t.Fatalf("HTTP tool call failed: %v", err)
	}
	for chunk, callErr := range stream {
		if callErr != nil {
			t.Fatalf("HTTP tool stream error: %v", callErr)
		}
		sc, ok := chunk.StructuredContent.(map[string]any)
		if !ok || sc["reply"] != "read:ping" {
			t.Errorf("unexpected HTTP structured content: %#v", chunk.StructuredContent)
		}
	}

	longName := NamespaceMCPToolName("very-long-server-slug", strings.Repeat("extremely_long_tool_name_", 4))
	if len(longName) > 64 || !validBoundToolNameRegex.MatchString(longName) {
		t.Errorf("invalid namespaced long tool name: %q (len=%d)", longName, len(longName))
	}
}
