package mcptransport

import (
	"context"
	stderrors "errors"
	"net/http"
	"net/http/httptest"
	"slices"
	"testing"

	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	platformerrors "github.com/masterkeysrd/saturn/internal/platform/errors"
	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"
)

type sampleInput struct {
	Query string `json:"query" jsonschema:"Search query"`
}

type sampleOutput struct {
	Count int    `json:"count"`
	Echo  string `json:"echo"`
}

func TestRegistry_ValidationAndAnnotations(t *testing.T) {
	t.Run("rejects invalid tool names", func(t *testing.T) {
		invalidNames := []string{"", "has space", "has.dot", "tool/slash", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}
		for _, name := range invalidNames {
			reg := NewRegistry()
			func() {
				defer func() {
					if r := recover(); r == nil {
						t.Errorf("expected panic for invalid tool name %q", name)
					}
				}()
				reg.RegisterTool(ToolSpec{Name: name}, func(_ context.Context, in sampleInput) (sampleOutput, error) {
					return sampleOutput{Echo: in.Query}, nil
				})
			}()
		}
	})

	t.Run("rejects duplicate tool name", func(t *testing.T) {
		reg := NewRegistry()
		reg.RegisterTool(ToolSpec{Name: "finance_list_accounts"}, func(_ context.Context, _ sampleInput) (sampleOutput, error) {
			return sampleOutput{}, nil
		})
		defer func() {
			if r := recover(); r == nil {
				t.Fatal("expected panic for duplicate tool name")
			}
		}()
		reg.RegisterTool(ToolSpec{Name: "finance_list_accounts"}, func(_ context.Context, _ sampleInput) (sampleOutput, error) {
			return sampleOutput{}, nil
		})
	})
}

func TestServer_ConnectInMemory_ScopeAndRoleFiltering(t *testing.T) {
	srv := NewServer(ServerConfig{})
	reg := srv.Registry()

	reg.RegisterTool(ToolSpec{
		Name:          "finance_list_accounts",
		Domain:        "finance",
		Title:         "List Accounts",
		Description:   "Lists workspace accounts",
		RequiredScope: identity.ScopeFinanceRead,
		ReadOnly:      true,
	}, func(ctx context.Context, in sampleInput) (sampleOutput, error) {
		sid, _ := auth.SpaceIDFromContext(ctx)
		return sampleOutput{Count: 1, Echo: sid + ":" + in.Query}, nil
	})

	reg.RegisterTool(ToolSpec{
		Name:          "finance_create_transaction",
		Domain:        "finance",
		Title:         "Create Transaction",
		Description:   "Creates a transaction",
		RequiredScope: identity.ScopeFinanceWrite,
		ReadOnly:      false,
		Destructive:   false,
	}, func(_ context.Context, in sampleInput) (sampleOutput, error) {
		if in.Query == "fail_internal" {
			return sampleOutput{}, stderrors.New("secret sql connection string")
		}
		if in.Query == "fail_domain" {
			return sampleOutput{}, platformerrors.E(platformerrors.Invalid, "invalid amount")
		}
		return sampleOutput{Count: 1, Echo: "created:" + in.Query}, nil
	})

	reg.RegisterTool(ToolSpec{
		Name:          "agent__assistant",
		Domain:        "ai",
		Title:         "Run Assistant",
		Description:   "External-only agent tool",
		RequiredScope: identity.ScopeAIExecute,
		ExternalOnly:  true,
	}, func(_ context.Context, in sampleInput) (sampleOutput, error) {
		return sampleOutput{Count: 1, Echo: "agent:" + in.Query}, nil
	})

	reg.RegisterResource(ResourceSpec{
		URI:           "saturn://space/context",
		Name:          "space_context",
		Title:         "Workspace Context",
		MIMEType:      "application/json",
		RequiredScope: identity.ScopeSpacesRead,
	}, func(ctx context.Context, uri string) ([]*sdkmcp.ResourceContents, error) {
		sid, _ := auth.SpaceIDFromContext(ctx)
		return []*sdkmcp.ResourceContents{{
			URI:      uri,
			MIMEType: "application/json",
			Text:     `{"space_id":"` + sid + `"}`,
		}}, nil
	})

	tests := []struct {
		name           string
		ctx            context.Context
		wantTools      []string
		wantResources  []string
		callTool       string
		callQuery      string
		wantEcho       string
		wantToolErr    bool
		wantToolErrMsg string
	}{
		{
			name: "member JWT sees read and write tools, excludes ExternalOnly",
			ctx: auth.WithSpaceScope(
				auth.WithPrincipal(context.Background(), auth.Principal{Subject: "usr_1"}),
				"spc_1",
				string(space.RoleMember),
			),
			wantTools:     []string{"finance_list_accounts", "finance_create_transaction"},
			wantResources: []string{"saturn://space/context"},
			callTool:      "finance_list_accounts",
			callQuery:     "checking",
			wantEcho:      "spc_1:checking",
		},
		{
			name: "viewer JWT sees only read-only tools",
			ctx: auth.WithSpaceScope(
				auth.WithPrincipal(context.Background(), auth.Principal{Subject: "usr_2"}),
				"spc_2",
				string(space.RoleViewer),
			),
			wantTools:     []string{"finance_list_accounts"},
			wantResources: []string{"saturn://space/context"},
			callTool:      "finance_list_accounts",
			callQuery:     "savings",
			wantEcho:      "spc_2:savings",
		},
		{
			name: "API key filtered by granted scopes",
			ctx: auth.WithSpaceScope(
				auth.WithPrincipal(context.Background(), auth.Principal{
					Subject:  "usr_3",
					APIKeyID: "apk_1",
					Scopes:   []string{"finance:write"},
				}),
				"spc_3",
				string(space.RoleOwner),
			),
			wantTools:      []string{"finance_list_accounts", "finance_create_transaction"},
			wantResources:  nil,
			callTool:       "finance_create_transaction",
			callQuery:      "fail_internal",
			wantToolErr:    true,
			wantToolErrMsg: "internal error: operation failed",
		},
		{
			name: "missing space context exposes zero scoped tools",
			ctx: auth.WithPrincipal(context.Background(), auth.Principal{
				Subject: "usr_4",
			}),
			wantTools:     nil,
			wantResources: nil,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			session, err := srv.ConnectInMemory(tc.ctx)
			if err != nil {
				t.Fatalf("ConnectInMemory failed: %v", err)
			}
			defer func() { _ = session.Close() }()

			toolsRes, err := session.ListTools(context.Background(), &sdkmcp.ListToolsParams{})
			if err != nil {
				t.Fatalf("ListTools failed: %v", err)
			}

			var gotTools []string
			for _, tool := range toolsRes.Tools {
				gotTools = append(gotTools, tool.Name)
				if tool.Name == "finance_list_accounts" {
					if tool.Annotations == nil || !tool.Annotations.ReadOnlyHint {
						t.Errorf("expected ReadOnlyHint=true on finance_list_accounts, got %+v", tool.Annotations)
					}
					if tool.InputSchema == nil {
						t.Error("expected generated InputSchema on finance_list_accounts")
					}
				}
				if tool.Name == "finance_create_transaction" {
					if tool.Annotations == nil || tool.Annotations.ReadOnlyHint || tool.Annotations.DestructiveHint == nil || *tool.Annotations.DestructiveHint {
						t.Errorf("unexpected annotations on finance_create_transaction: %+v", tool.Annotations)
					}
				}
			}
			slices.Sort(gotTools)
			wantSorted := slices.Clone(tc.wantTools)
			slices.Sort(wantSorted)
			if !slices.Equal(gotTools, wantSorted) {
				t.Errorf("tools = %v, want %v", gotTools, wantSorted)
			}

			resList, err := session.ListResources(context.Background(), &sdkmcp.ListResourcesParams{})
			if err != nil {
				t.Fatalf("ListResources failed: %v", err)
			}
			var gotURIs []string
			for _, res := range resList.Resources {
				gotURIs = append(gotURIs, res.URI)
			}
			if !slices.Equal(gotURIs, tc.wantResources) {
				t.Errorf("resources = %v, want %v", gotURIs, tc.wantResources)
			}

			if len(tc.wantResources) > 0 {
				readRes, err := session.ReadResource(context.Background(), &sdkmcp.ReadResourceParams{URI: tc.wantResources[0]})
				if err != nil {
					t.Fatalf("ReadResource failed: %v", err)
				}
				if len(readRes.Contents) != 1 || readRes.Contents[0].Text == "" {
					t.Errorf("unexpected resource contents: %+v", readRes.Contents)
				}
			}

			if tc.callTool != "" {
				callRes, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
					Name:      tc.callTool,
					Arguments: map[string]any{"query": tc.callQuery},
				})
				if err != nil {
					t.Fatalf("CallTool failed at protocol level: %v", err)
				}
				if tc.wantToolErr {
					if !callRes.IsError {
						t.Fatalf("expected tool IsError=true, got %+v", callRes)
					}
					txt, ok := callRes.Content[0].(*sdkmcp.TextContent)
					if !ok || txt.Text != tc.wantToolErrMsg {
						t.Errorf("tool error = %v, want %q", callRes.Content[0], tc.wantToolErrMsg)
					}
					return
				}
				if callRes.IsError {
					t.Fatalf("unexpected tool error: %+v", callRes.Content)
				}
				structured, ok := callRes.StructuredContent.(map[string]any)
				if !ok || structured["echo"] != tc.wantEcho {
					t.Errorf("StructuredContent = %#v, want echo=%q", callRes.StructuredContent, tc.wantEcho)
				}
			}
		})
	}
}

func TestServer_HTTPHandler_StreamableHTTP(t *testing.T) {
	srv := NewServer(ServerConfig{
		AuthMiddleware: func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Header.Get("Authorization") != "Bearer sat_valid" {
					w.WriteHeader(http.StatusUnauthorized)
					return
				}
				ctx := auth.WithPrincipal(r.Context(), auth.Principal{
					Subject:  "usr_http",
					APIKeyID: "apk_http",
					Scopes:   []string{"finance:read", "ai:execute"},
				})
				ctx = auth.WithSpaceScope(ctx, "spc_http", string(space.RoleMember))
				next.ServeHTTP(w, r.WithContext(ctx))
			})
		},
	})

	srv.Registry().RegisterTool(ToolSpec{
		Name:          "finance_list_accounts",
		Domain:        "finance",
		RequiredScope: identity.ScopeFinanceRead,
		ReadOnly:      true,
	}, func(ctx context.Context, _ sampleInput) (sampleOutput, error) {
		sid, _ := auth.SpaceIDFromContext(ctx)
		return sampleOutput{Count: 2, Echo: sid}, nil
	})

	srv.Registry().RegisterTool(ToolSpec{
		Name:          "agent__budget-analyst",
		Domain:        "ai",
		RequiredScope: identity.ScopeAIExecute,
		ExternalOnly:  true,
	}, func(_ context.Context, in sampleInput) (sampleOutput, error) {
		return sampleOutput{Count: 1, Echo: "ran:" + in.Query}, nil
	})

	ts := httptest.NewServer(srv.HTTPHandler())
	defer ts.Close()

	// Unauthenticated request fails with 401
	unauthClient := sdkmcp.NewClient(&sdkmcp.Implementation{Name: "test-client", Version: "1.0.0"}, nil)
	if _, err := unauthClient.Connect(context.Background(), &sdkmcp.StreamableClientTransport{Endpoint: ts.URL}, nil); err == nil {
		t.Fatal("expected unauthenticated HTTP MCP connection to fail")
	}

	// Authenticated request sees both read and ExternalOnly tools over Streamable HTTP
	httpClient := &http.Client{
		Transport: bearerRoundTripper{
			token: "sat_valid",
			next:  http.DefaultTransport,
		},
	}
	client := sdkmcp.NewClient(&sdkmcp.Implementation{Name: "test-client", Version: "1.0.0"}, nil)
	session, err := client.Connect(context.Background(), &sdkmcp.StreamableClientTransport{
		Endpoint:   ts.URL,
		HTTPClient: httpClient,
	}, nil)
	if err != nil {
		t.Fatalf("Streamable HTTP Connect failed: %v", err)
	}
	defer func() { _ = session.Close() }()

	tools, err := session.ListTools(context.Background(), &sdkmcp.ListToolsParams{})
	if err != nil {
		t.Fatalf("ListTools failed: %v", err)
	}
	var names []string
	for _, tool := range tools.Tools {
		names = append(names, tool.Name)
	}
	slices.Sort(names)
	want := []string{"agent__budget-analyst", "finance_list_accounts"}
	if !slices.Equal(names, want) {
		t.Errorf("HTTP tools = %v, want %v", names, want)
	}

	res, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name:      "agent__budget-analyst",
		Arguments: map[string]any{"query": "analyze april"},
	})
	if err != nil || res.IsError {
		t.Fatalf("CallTool failed: res=%+v err=%v", res, err)
	}
	if m, ok := res.StructuredContent.(map[string]any); !ok || m["echo"] != "ran:analyze april" {
		t.Errorf("unexpected StructuredContent: %#v", res.StructuredContent)
	}
}

type bearerRoundTripper struct {
	token string
	next  http.RoundTripper
}

func (rt bearerRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	clone := req.Clone(req.Context())
	clone.Header.Set("Authorization", "Bearer "+rt.token)
	return rt.next.RoundTrip(clone)
}

func TestCallerHasScope_APIKeyInheritanceAndViewerCap(t *testing.T) {
	tests := []struct {
		name     string
		role     space.SpaceRole
		scopes   []string
		required identity.APIKeyScope
		want     bool
	}{
		{name: "finance:write satisfies finance:read", role: space.RoleMember, scopes: []string{"finance:write"}, required: identity.ScopeFinanceRead, want: true},
		{name: "ai:write satisfies ai:execute", role: space.RoleMember, scopes: []string{"ai:write"}, required: identity.ScopeAIExecute, want: true},
		{name: "ai:write satisfies ai:read", role: space.RoleMember, scopes: []string{"ai:write"}, required: identity.ScopeAIRead, want: true},
		{name: "ai:execute satisfies ai:read", role: space.RoleMember, scopes: []string{"ai:execute"}, required: identity.ScopeAIRead, want: true},
		{name: "workflows:execute satisfies workflows:read", role: space.RoleMember, scopes: []string{"workflows:execute"}, required: identity.ScopeWorkflowsRead, want: true},
		{name: "finance:read does not satisfy finance:write", role: space.RoleMember, scopes: []string{"finance:read"}, required: identity.ScopeFinanceWrite, want: false},
		{name: "ai:execute does not satisfy ai:write", role: space.RoleMember, scopes: []string{"ai:execute"}, required: identity.ScopeAIWrite, want: false},
		{name: "finance:write does not satisfy mail:read", role: space.RoleMember, scopes: []string{"finance:write"}, required: identity.ScopeMailRead, want: false},
		{name: "viewer with finance:write is still capped at read-only", role: space.RoleViewer, scopes: []string{"finance:write"}, required: identity.ScopeFinanceWrite, want: false},
		{name: "viewer with finance:write can read", role: space.RoleViewer, scopes: []string{"finance:write"}, required: identity.ScopeFinanceRead, want: true},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			ctx := auth.WithPrincipal(context.Background(), auth.Principal{
				Subject:  "usr_1",
				APIKeyID: "apk_1",
				Scopes:   tc.scopes,
			})
			ctx = auth.WithSpaceScope(ctx, "spc_1", string(tc.role))
			if got := callerHasScope(ctx, tc.required); got != tc.want {
				t.Fatalf("callerHasScope() = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestServer_InstructionsAndOAuthPrincipalScoping(t *testing.T) {
	srv := NewServer(ServerConfig{})
	srv.Registry().RegisterTool(ToolSpec{
		Name:          "finance_list_accounts",
		Domain:        "finance",
		Title:         "List Accounts",
		Description:   "Lists workspace accounts",
		RequiredScope: identity.ScopeFinanceRead,
		ReadOnly:      true,
	}, func(_ context.Context, _ sampleInput) (sampleOutput, error) {
		return sampleOutput{Count: 1, Echo: "ok"}, nil
	})
	srv.Registry().RegisterTool(ToolSpec{
		Name:          "finance_create_tx",
		Domain:        "finance",
		Title:         "Create Tx",
		Description:   "Creates tx",
		RequiredScope: identity.ScopeFinanceWrite,
	}, func(_ context.Context, _ sampleInput) (sampleOutput, error) {
		return sampleOutput{Count: 1, Echo: "created"}, nil
	})

	ctx := auth.WithPrincipal(context.Background(), auth.Principal{
		Subject:         "usr_1",
		OAuthGrantID:    "oag_1",
		Scopes:          []string{"finance:read"},
		GrantedSpaceIDs: []string{"spc_1"},
	})
	ctx = auth.WithSpaceScope(ctx, "spc_1", string(space.RoleOwner))

	session, err := srv.ConnectInMemory(ctx)
	if err != nil {
		t.Fatalf("ConnectInMemory failed: %v", err)
	}
	defer func() { _ = session.Close() }()

	if session.InitializeResult() == nil || session.InitializeResult().Instructions == "" {
		t.Fatal("expected non-empty MCP InitializeResult.Instructions")
	}

	tools, err := session.ListTools(context.Background(), &sdkmcp.ListToolsParams{})
	if err != nil {
		t.Fatalf("ListTools failed: %v", err)
	}
	if len(tools.Tools) != 1 || tools.Tools[0].Name != "finance_list_accounts" {
		t.Errorf("expected only finance_list_accounts for OAuth read grant, got %+v", tools.Tools)
	}
}
