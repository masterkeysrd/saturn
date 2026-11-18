package ai

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json/v2"
	"fmt"
	"maps"
	"regexp"
	"slices"
	"strings"
	"time"

	"github.com/google/jsonschema-go/jsonschema"
	"github.com/masterkeysrd/loom/message"
	"github.com/masterkeysrd/loom/tool"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"
)

var validBoundToolNameRegex = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,64}$`)

// InMemoryMCPDialer opens an in-process MCP client session scoped to the caller context.
type InMemoryMCPDialer func(ctx context.Context) (*sdkmcp.ClientSession, error)

// BoundMCPTool binds an executable loom *tool.Tool together with its originating MCP server metadata.
type BoundMCPTool struct {
	MCPServerID      string
	MCPServerName    string
	OriginalToolName string
	Tool             *tool.Tool
	ReadOnlyHint     bool
	DestructiveHint  bool
}

// ConnectedMCPTools holds bound tools from one or more MCP servers and a cleanup callback.
type ConnectedMCPTools struct {
	Tools []*BoundMCPTool
	Close func()
}

// MCPConnector handles discovery and live tool binding for both in-memory and remote HTTP MCP servers.
// @Mock
type MCPConnector interface {
	Discover(ctx context.Context, server *MCPServer) (MCPDiscoveryState, error)
	ConnectTools(ctx context.Context, server *MCPServer, allowedTools []string) (*ConnectedMCPTools, error)
}

// UnifiedMCPConnector implements MCPConnector over InMemoryMCPDialer and loom/mcp HTTP clients.
type UnifiedMCPConnector struct {
	inMemoryDialer       InMemoryMCPDialer
	allowPrivateNetworks bool
}

// NewUnifiedMCPConnector constructs a UnifiedMCPConnector.
func NewUnifiedMCPConnector(dialer InMemoryMCPDialer, allowPrivateNetworks bool) *UnifiedMCPConnector {
	return &UnifiedMCPConnector{
		inMemoryDialer:       dialer,
		allowPrivateNetworks: allowPrivateNetworks,
	}
}

var _ MCPConnector = (*UnifiedMCPConnector)(nil)

func (c *UnifiedMCPConnector) Discover(ctx context.Context, server *MCPServer) (MCPDiscoveryState, error) {
	if server == nil {
		return MCPDiscoveryState{}, errors.E(errors.Invalid, "mcp server is required")
	}

	timeout := time.Duration(max(server.Config.TimeoutSeconds, 1)) * time.Second
	if server.Config.TimeoutSeconds <= 0 {
		timeout = 30 * time.Second
	}
	dialCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	if server.Transport == TransportInMemory {
		return c.discoverInMemory(dialCtx, server)
	}
	return c.discoverHTTP(dialCtx, server)
}

func (c *UnifiedMCPConnector) ConnectTools(ctx context.Context, server *MCPServer, allowedTools []string) (*ConnectedMCPTools, error) {
	if server == nil {
		return nil, errors.E(errors.Invalid, "mcp server is required")
	}
	if !server.IsEnabled {
		return &ConnectedMCPTools{Close: func() {}}, nil
	}

	if server.Transport == TransportInMemory {
		return c.connectInMemoryTools(ctx, server, allowedTools)
	}
	return c.connectHTTPTools(ctx, server, allowedTools)
}

func (c *UnifiedMCPConnector) discoverInMemory(ctx context.Context, server *MCPServer) (MCPDiscoveryState, error) {
	if !server.IsSystem {
		return MCPDiscoveryState{}, errors.E(errors.Invalid, "in_memory transport is restricted to built-in system MCP servers")
	}
	if c.inMemoryDialer == nil {
		return MCPDiscoveryState{
			HealthStatus: MCPHealthUnhealthy,
			Error:        &ErrorDetail{Code: new(string(CodeMCPConnectionFailed)), Message: "in-memory MCP dialer not configured"},
		}, errors.E(errors.Unavailable, CodeMCPConnectionFailed, "in-memory MCP dialer not configured")
	}

	session, err := c.inMemoryDialer(ctx)
	if err != nil {
		return MCPDiscoveryState{
			HealthStatus: MCPHealthUnhealthy,
			Error:        &ErrorDetail{Code: new(string(CodeMCPConnectionFailed)), Message: err.Error()},
		}, errors.E(errors.Unavailable, CodeMCPConnectionFailed, err)
	}
	defer func() { _ = session.Close() }()

	state := MCPDiscoveryState{
		HealthStatus: MCPHealthHealthy,
		LastSyncedAt: new(time.Now().UTC()),
	}
	if initRes := session.InitializeResult(); initRes != nil && initRes.ServerInfo != nil {
		state.ServerInfo = &MCPServerInfo{
			Name:    initRes.ServerInfo.Name,
			Version: initRes.ServerInfo.Version,
		}
	}

	listRes, err := session.ListTools(ctx, &sdkmcp.ListToolsParams{})
	if err != nil {
		state.HealthStatus = MCPHealthUnhealthy
		state.Error = &ErrorDetail{Code: new(string(CodeMCPConnectionFailed)), Message: err.Error()}
		return state, errors.E(errors.Unavailable, CodeMCPConnectionFailed, err)
	}

	state.Tools = make([]MCPToolSummary, 0, len(listRes.Tools))
	for _, st := range listRes.Tools {
		ro, dest := extractSDKAnnotations(st.Annotations)
		var schemaMap map[string]any
		if st.InputSchema != nil {
			if raw, mErr := json.Marshal(st.InputSchema); mErr == nil {
				_ = json.Unmarshal(raw, &schemaMap)
			}
		}
		var titlePtr *string
		if st.Title != "" {
			titlePtr = new(st.Title)
		}
		state.Tools = append(state.Tools, MCPToolSummary{
			Name:            st.Name,
			Title:           titlePtr,
			Description:     st.Description,
			InputSchema:     schemaMap,
			ReadOnlyHint:    ro,
			DestructiveHint: dest,
		})
	}
	return state, nil
}

func (c *UnifiedMCPConnector) connectHTTPSession(ctx context.Context, server *MCPServer) (*sdkmcp.ClientSession, error) {
	timeout := time.Duration(max(server.Config.TimeoutSeconds, 1)) * time.Second
	if server.Config.TimeoutSeconds <= 0 {
		timeout = 30 * time.Second
	}
	httpClient := NewSSRFSafeHTTPClient(c.allowPrivateNetworks, timeout)
	if headers := buildMCPAuthHeaders(server); len(headers) > 0 {
		httpClient.Transport = &headerRoundTripper{
			base:    httpClient.Transport,
			headers: headers,
		}
	}
	transport := &sdkmcp.StreamableClientTransport{
		Endpoint:   server.Config.URL,
		HTTPClient: httpClient,
	}
	client := sdkmcp.NewClient(&sdkmcp.Implementation{
		Name:    "saturn-mcp-client",
		Version: "1.0.0",
	}, nil)
	return client.Connect(ctx, transport, nil)
}

func (c *UnifiedMCPConnector) discoverHTTP(ctx context.Context, server *MCPServer) (MCPDiscoveryState, error) {
	if err := ValidateMCPURL(server.Config.URL, c.allowPrivateNetworks); err != nil {
		return MCPDiscoveryState{
			HealthStatus: MCPHealthUnhealthy,
			Error:        &ErrorDetail{Code: new(string(errors.CodeOf(err))), Message: errors.UserMessage(err)},
		}, err
	}

	session, err := c.connectHTTPSession(ctx, server)
	if err != nil {
		return MCPDiscoveryState{
			HealthStatus: MCPHealthUnhealthy,
			Error:        &ErrorDetail{Code: new(string(CodeMCPConnectionFailed)), Message: err.Error()},
		}, errors.E(errors.Unavailable, CodeMCPConnectionFailed, err)
	}
	defer func() { _ = session.Close() }()

	state := MCPDiscoveryState{
		HealthStatus: MCPHealthHealthy,
		LastSyncedAt: new(time.Now().UTC()),
	}

	if initRes := session.InitializeResult(); initRes != nil && initRes.ServerInfo != nil {
		state.ServerInfo = &MCPServerInfo{
			Name:    initRes.ServerInfo.Name,
			Version: initRes.ServerInfo.Version,
		}
	}

	listRes, err := session.ListTools(ctx, &sdkmcp.ListToolsParams{})
	if err != nil {
		state.HealthStatus = MCPHealthUnhealthy
		state.Error = &ErrorDetail{Code: new(string(CodeMCPConnectionFailed)), Message: err.Error()}
		return state, errors.E(errors.Unavailable, CodeMCPConnectionFailed, err)
	}

	state.Tools = make([]MCPToolSummary, 0, len(listRes.Tools))
	for _, st := range listRes.Tools {
		ro, dest := extractSDKAnnotations(st.Annotations)
		var schemaMap map[string]any
		if st.InputSchema != nil {
			if raw, mErr := json.Marshal(st.InputSchema); mErr == nil {
				_ = json.Unmarshal(raw, &schemaMap)
			}
		}
		var titlePtr *string
		if st.Title != "" {
			titlePtr = new(st.Title)
		}
		state.Tools = append(state.Tools, MCPToolSummary{
			Name:            st.Name,
			Title:           titlePtr,
			Description:     st.Description,
			InputSchema:     schemaMap,
			ReadOnlyHint:    ro,
			DestructiveHint: dest,
		})
	}
	return state, nil
}

func (c *UnifiedMCPConnector) connectInMemoryTools(ctx context.Context, server *MCPServer, allowedTools []string) (*ConnectedMCPTools, error) {
	if !server.IsSystem {
		return nil, errors.E(errors.Invalid, "in_memory transport is restricted to built-in system MCP servers")
	}
	if c.inMemoryDialer == nil {
		return nil, errors.E(errors.Unavailable, CodeMCPConnectionFailed, "in-memory MCP dialer not configured")
	}

	session, err := c.inMemoryDialer(ctx)
	if err != nil {
		return nil, errors.E(errors.Unavailable, CodeMCPConnectionFailed, err)
	}

	listRes, err := session.ListTools(ctx, &sdkmcp.ListToolsParams{})
	if err != nil {
		_ = session.Close()
		return nil, errors.E(errors.Unavailable, CodeMCPConnectionFailed, err)
	}

	bound := make([]*BoundMCPTool, 0, len(listRes.Tools))
	for _, st := range listRes.Tools {
		if !isToolAllowed(st.Name, allowedTools) {
			continue
		}
		lt, err := adaptSDKToolToLoom(st, session)
		if err != nil {
			_ = session.Close()
			return nil, fmt.Errorf("adapt in-memory mcp tool %q: %w", st.Name, err)
		}
		ro, dest := extractSDKAnnotations(st.Annotations)
		bound = append(bound, &BoundMCPTool{
			MCPServerID:      server.ID,
			MCPServerName:    server.Name,
			OriginalToolName: st.Name,
			Tool:             lt,
			ReadOnlyHint:     ro,
			DestructiveHint:  dest,
		})
	}

	return &ConnectedMCPTools{
		Tools: bound,
		Close: func() { _ = session.Close() },
	}, nil
}

func (c *UnifiedMCPConnector) connectHTTPTools(ctx context.Context, server *MCPServer, allowedTools []string) (*ConnectedMCPTools, error) {
	if err := ValidateMCPURL(server.Config.URL, c.allowPrivateNetworks); err != nil {
		return nil, err
	}

	session, err := c.connectHTTPSession(ctx, server)
	if err != nil {
		return nil, errors.E(errors.Unavailable, CodeMCPConnectionFailed, err)
	}

	listRes, err := session.ListTools(ctx, &sdkmcp.ListToolsParams{})
	if err != nil {
		_ = session.Close()
		return nil, errors.E(errors.Unavailable, CodeMCPConnectionFailed, err)
	}

	cachedHints := make(map[string]MCPToolSummary, len(server.Discovery.Tools))
	for _, dt := range server.Discovery.Tools {
		cachedHints[dt.Name] = dt
	}

	bound := make([]*BoundMCPTool, 0, len(listRes.Tools))
	for _, st := range listRes.Tools {
		origName := st.Name
		if !isToolAllowed(origName, allowedTools) {
			continue
		}

		lt, err := adaptSDKToolToLoom(st, session)
		if err != nil {
			_ = session.Close()
			return nil, fmt.Errorf("adapt http mcp tool %q: %w", origName, err)
		}

		namespaced := NamespaceMCPToolName(server.Slug, origName)
		ro := lt.Annotation.IsReadOnly
		dest := lt.Annotation.IsDangerous
		if !ro && !dest {
			if cached, ok := cachedHints[origName]; ok {
				ro = cached.ReadOnlyHint
				dest = cached.DestructiveHint
			}
		}

		origHandler := lt.Handler
		wrappedDef := lt.Definition
		wrappedDef.Name = namespaced
		wrappedDef.Annotation = tool.Annotation{
			IsReadOnly:  ro,
			IsDangerous: dest,
			IsOpenWorld: true,
		}

		wrappedTool := &tool.Tool{
			Definition: wrappedDef,
			Annotation: wrappedDef.Annotation,
			Handler: func(callCtx context.Context, call *message.ToolCall) (tool.ToolStream, error) {
				fwd := *call
				fwd.Name = origName
				return origHandler(callCtx, &fwd)
			},
		}

		bound = append(bound, &BoundMCPTool{
			MCPServerID:      server.ID,
			MCPServerName:    server.Name,
			OriginalToolName: origName,
			Tool:             wrappedTool,
			ReadOnlyHint:     ro,
			DestructiveHint:  dest,
		})
	}

	return &ConnectedMCPTools{
		Tools: bound,
		Close: func() { _ = session.Close() },
	}, nil
}

// NamespaceMCPToolName formats external MCP tools as `mcp__<slug>__<sanitized_tool>` bounded to 64 chars.
func NamespaceMCPToolName(serverSlug, toolName string) string {
	slugPart := sanitizeToolSegment(strings.ToLower(strings.TrimSpace(serverSlug)))
	if slugPart == "" {
		slugPart = "mcp"
	}
	toolPart := sanitizeToolSegment(strings.TrimSpace(toolName))
	if toolPart == "" {
		toolPart = "tool"
	}

	full := "mcp__" + slugPart + "__" + toolPart
	if len(full) <= 64 && validBoundToolNameRegex.MatchString(full) {
		return full
	}

	sum := sha256.Sum256([]byte(serverSlug + ":" + toolName))
	suffix := "_" + hex.EncodeToString(sum[:3]) // 7 chars
	maxPrefixLen := 64 - len(suffix)
	if len(full) > maxPrefixLen {
		full = full[:maxPrefixLen]
	}
	return full + suffix
}

func sanitizeToolSegment(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_' || r == '-' {
			b.WriteRune(r)
		} else {
			b.WriteByte('_')
		}
	}
	return b.String()
}

func buildMCPAuthHeaders(server *MCPServer) map[string]string {
	if server == nil || server.AuthSecret == nil {
		return nil
	}
	headers := make(map[string]string, len(server.AuthSecret.Headers)+1)
	maps.Copy(headers, server.AuthSecret.Headers)
	if server.Config.AuthType == MCPAuthBearer && server.AuthSecret.BearerToken != nil && strings.TrimSpace(*server.AuthSecret.BearerToken) != "" {
		headers["Authorization"] = "Bearer " + strings.TrimSpace(*server.AuthSecret.BearerToken)
	}
	if len(headers) == 0 {
		return nil
	}
	return headers
}

func isToolAllowed(toolName string, allowedTools []string) bool {
	if len(allowedTools) == 0 {
		return false
	}
	if slices.Contains(allowedTools, "*") {
		return true
	}
	return slices.Contains(allowedTools, toolName)
}

func extractSDKAnnotations(ann *sdkmcp.ToolAnnotations) (readOnly, destructive bool) {
	if ann == nil {
		return false, false
	}
	readOnly = ann.ReadOnlyHint
	if ann.DestructiveHint != nil {
		destructive = *ann.DestructiveHint
	} else if !readOnly {
		destructive = false
	}
	return readOnly, destructive
}

func adaptSDKToolToLoom(st *sdkmcp.Tool, session *sdkmcp.ClientSession) (*tool.Tool, error) {
	var inputSchema jsonschema.Schema
	if st.InputSchema != nil {
		raw, err := json.Marshal(st.InputSchema)
		if err != nil {
			return nil, err
		}
		if err := json.Unmarshal(raw, &inputSchema); err != nil {
			return nil, err
		}
	} else {
		inputSchema = jsonschema.Schema{Type: "object"}
	}

	resolvedInput, err := inputSchema.Resolve(nil)
	if err != nil {
		return nil, err
	}

	ro, dest := extractSDKAnnotations(st.Annotations)
	ann := tool.Annotation{
		IsReadOnly:  ro,
		IsDangerous: dest,
	}

	title := st.Title
	if title == "" && st.Annotations != nil {
		title = st.Annotations.Title
	}
	if title == "" {
		title = st.Name
	}

	toolName := st.Name
	return &tool.Tool{
		Definition: tool.Definition{
			Name:        toolName,
			Title:       title,
			Description: st.Description,
			Annotation:  ann,
			InputSchema: &inputSchema,
		},
		Annotation: ann,
		Handler: func(ctx context.Context, call *message.ToolCall) (tool.ToolStream, error) {
			if err := resolvedInput.Validate(call.Args); err != nil {
				return nil, &tool.ValidationError{ToolName: toolName, Err: err}
			}
			return func(yield func(message.ToolChunk, error) bool) {
				res, callErr := session.CallTool(ctx, &sdkmcp.CallToolParams{
					Name:      toolName,
					Arguments: call.Args,
				})
				if callErr != nil {
					yield(message.ToolChunk{}, callErr)
					return
				}
				var content message.Content
				for _, mc := range res.Content {
					if txt, ok := mc.(*sdkmcp.TextContent); ok {
						content = append(content, &message.TextBlock{Text: txt.Text})
					}
				}
				yield(message.ToolChunk{
					Content:           content,
					StructuredContent: res.StructuredContent,
					IsError:           res.IsError,
				}, nil)
			}, nil
		},
	}, nil
}
