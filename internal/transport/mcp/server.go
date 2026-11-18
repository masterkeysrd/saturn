package mcptransport

import (
	"context"
	"encoding/json/v2"
	"fmt"
	"log/slog"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"

	spaceapp "github.com/masterkeysrd/saturn/internal/application/space"
	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/settings"
	mcpmiddleware "github.com/masterkeysrd/saturn/internal/transport/mcp/middleware"
	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"
)

var toolNameRegex = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,64}$`)

// ToolSpec defines metadata, authorization requirements, and MCP annotations for a registered tool.
type ToolSpec struct {
	Name          string
	Domain        string
	Title         string
	Description   string
	RequiredScope identity.APIKeyScope
	ReadOnly      bool
	Destructive   bool
	ExternalOnly  bool
}

// ResourceSpec defines metadata and authorization requirements for a registered MCP resource.
type ResourceSpec struct {
	URI           string
	Name          string
	Title         string
	Description   string
	MIMEType      string
	RequiredScope identity.APIKeyScope
}

type registeredTool struct {
	spec     ToolSpec
	register func(s *sdkmcp.Server)
}

type registeredResource struct {
	spec     ResourceSpec
	register func(s *sdkmcp.Server)
}

// DynamicToolBinder registers request-scoped external MCP tools onto a per-request *sdkmcp.Server.
type DynamicToolBinder struct {
	ctx        context.Context
	server     *sdkmcp.Server
	registered map[string]struct{}
}

// RegisterTool registers a typed dynamic external tool onto the per-request MCP server if authorized.
func (b *DynamicToolBinder) RegisterTool[In, Out any](
	spec ToolSpec,
	handler func(ctx context.Context, input In) (Out, error),
) {
	if !toolNameRegex.MatchString(spec.Name) || handler == nil {
		return
	}
	if _, exists := b.registered[spec.Name]; exists {
		return
	}
	if !callerHasScope(b.ctx, spec.RequiredScope) {
		return
	}
	b.registered[spec.Name] = struct{}{}

	toolDef := &sdkmcp.Tool{
		Name:        spec.Name,
		Title:       spec.Title,
		Description: spec.Description,
		Annotations: &sdkmcp.ToolAnnotations{
			Title:           spec.Title,
			ReadOnlyHint:    spec.ReadOnly,
			DestructiveHint: new(spec.Destructive),
		},
	}

	sdkmcp.AddTool(b.server, toolDef, func(ctx context.Context, _ *sdkmcp.CallToolRequest, in In) (*sdkmcp.CallToolResult, Out, error) {
		out, err := handler(ctx, in)
		if err != nil {
			var zero Out
			return nil, zero, mcpmiddleware.FormatToolError(err)
		}
		return nil, out, nil
	})
}

// DynamicToolProvider registers request-scoped external-only tools (such as `agent__<slug>`).
type DynamicToolProvider func(ctx context.Context, binder *DynamicToolBinder)

// Registry stores strongly typed Saturn MCP tools and resources and builds scope-filtered MCP servers.
type Registry struct {
	mu               sync.RWMutex
	tools            []registeredTool
	toolNames        map[string]struct{}
	dynamicProviders []DynamicToolProvider
	resources        []registeredResource
	resourceURI      map[string]struct{}
	schemaCache      *sdkmcp.SchemaCache
}

// NewRegistry creates a new MCP Registry with a shared JSON Schema cache.
func NewRegistry() *Registry {
	return &Registry{
		toolNames:   make(map[string]struct{}),
		resourceURI: make(map[string]struct{}),
		schemaCache: sdkmcp.NewSchemaCache(),
	}
}

// RegisterTool registers a typed MCP tool and handler onto the registry.
// Tool names must satisfy ^[a-zA-Z0-9_-]{1,64}$.
func (r *Registry) RegisterTool[In, Out any](
	spec ToolSpec,
	handler func(ctx context.Context, input In) (Out, error),
) {
	if !toolNameRegex.MatchString(spec.Name) {
		panic(fmt.Sprintf("mcp.Registry.RegisterTool: invalid tool name %q (must match ^[a-zA-Z0-9_-]{1,64}$)", spec.Name))
	}
	if handler == nil {
		panic(fmt.Sprintf("mcp.Registry.RegisterTool: nil handler for tool %q", spec.Name))
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	if _, exists := r.toolNames[spec.Name]; exists {
		panic(fmt.Sprintf("mcp.Registry.RegisterTool: duplicate tool name %q", spec.Name))
	}
	r.toolNames[spec.Name] = struct{}{}

	toolDef := &sdkmcp.Tool{
		Name:        spec.Name,
		Title:       spec.Title,
		Description: spec.Description,
		Annotations: &sdkmcp.ToolAnnotations{
			Title:           spec.Title,
			ReadOnlyHint:    spec.ReadOnly,
			DestructiveHint: new(spec.Destructive),
		},
	}

	r.tools = append(r.tools, registeredTool{
		spec: spec,
		register: func(s *sdkmcp.Server) {
			sdkmcp.AddTool(s, toolDef, func(ctx context.Context, _ *sdkmcp.CallToolRequest, in In) (*sdkmcp.CallToolResult, Out, error) {
				out, err := handler(ctx, in)
				if err != nil {
					var zero Out
					return nil, zero, mcpmiddleware.FormatToolError(err)
				}
				return nil, out, nil
			})
		},
	})
}

// RegisterDynamicProvider registers a request-scoped external tool provider.
func (r *Registry) RegisterDynamicProvider(provider DynamicToolProvider) {
	if provider == nil {
		panic("mcp.Registry.RegisterDynamicProvider: nil provider")
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	r.dynamicProviders = append(r.dynamicProviders, provider)
}

// RegisterResource registers a read-only MCP resource onto the registry.
func (r *Registry) RegisterResource(
	spec ResourceSpec,
	handler func(ctx context.Context, uri string) ([]*sdkmcp.ResourceContents, error),
) {
	if strings.TrimSpace(spec.URI) == "" {
		panic("mcp.Registry.RegisterResource: empty resource URI")
	}
	if strings.TrimSpace(spec.Name) == "" {
		panic(fmt.Sprintf("mcp.Registry.RegisterResource: empty resource name for URI %q", spec.URI))
	}
	if handler == nil {
		panic(fmt.Sprintf("mcp.Registry.RegisterResource: nil handler for resource %q", spec.URI))
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	if _, exists := r.resourceURI[spec.URI]; exists {
		panic(fmt.Sprintf("mcp.Registry.RegisterResource: duplicate resource URI %q", spec.URI))
	}
	r.resourceURI[spec.URI] = struct{}{}

	resDef := &sdkmcp.Resource{
		URI:         spec.URI,
		Name:        spec.Name,
		Title:       spec.Title,
		Description: spec.Description,
		MIMEType:    spec.MIMEType,
	}

	r.resources = append(r.resources, registeredResource{
		spec: spec,
		register: func(s *sdkmcp.Server) {
			s.AddResource(resDef, func(ctx context.Context, req *sdkmcp.ReadResourceRequest) (*sdkmcp.ReadResourceResult, error) {
				contents, err := handler(ctx, req.Params.URI)
				if err != nil {
					return nil, mcpmiddleware.FormatToolError(err)
				}
				return &sdkmcp.ReadResourceResult{
					Contents: contents,
				}, nil
			})
		},
	})
}

// Tools returns a snapshot of all registered tool specifications.
func (r *Registry) Tools() []ToolSpec {
	r.mu.RLock()
	defer r.mu.RUnlock()

	out := make([]ToolSpec, len(r.tools))
	for i, t := range r.tools {
		out[i] = t.spec
	}
	return out
}

// Resources returns a snapshot of all registered resource specifications.
func (r *Registry) Resources() []ResourceSpec {
	r.mu.RLock()
	defer r.mu.RUnlock()

	out := make([]ResourceSpec, len(r.resources))
	for i, res := range r.resources {
		out[i] = res.spec
	}
	return out
}

// ServerConfig configures the Saturn MCP Server.
type ServerConfig struct {
	Name           string
	Version        string
	Registry       *Registry
	AuthMiddleware func(http.Handler) http.Handler
	Logger         *slog.Logger
}

// Server serves registered Saturn MCP tools and resources over Streamable HTTP and In-Memory loopback.
type Server struct {
	impl           *sdkmcp.Implementation
	registry       *Registry
	authMiddleware func(http.Handler) http.Handler
	logger         *slog.Logger
}

// NewServer constructs a new Saturn MCP Server.
func NewServer(cfg ServerConfig) *Server {
	name := strings.TrimSpace(cfg.Name)
	if name == "" {
		name = "saturn-mcp"
	}
	version := strings.TrimSpace(cfg.Version)
	if version == "" {
		version = "1.0.0"
	}
	reg := cfg.Registry
	if reg == nil {
		reg = NewRegistry()
	}
	logger := cfg.Logger
	if logger == nil {
		logger = slog.Default()
	}

	return &Server{
		impl:           &sdkmcp.Implementation{Name: name, Version: version},
		registry:       reg,
		authMiddleware: cfg.AuthMiddleware,
		logger:         logger,
	}
}

// Registry returns the underlying tool and resource registry.
func (s *Server) Registry() *Registry {
	return s.registry
}

// HTTPHandler returns a stateless Streamable HTTP handler wrapped with the configured auth middleware.
func (s *Server) HTTPHandler() http.Handler {
	mcpHandler := sdkmcp.NewStreamableHTTPHandler(func(req *http.Request) *sdkmcp.Server {
		return s.buildServerForContext(req.Context(), true)
	}, &sdkmcp.StreamableHTTPOptions{
		Stateless: true,
		Logger:    s.logger,
	})

	wrapped := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rc := http.NewResponseController(w)
		_ = rc.SetWriteDeadline(time.Time{})
		r.Body = http.MaxBytesReader(w, r.Body, 4*1024*1024)
		mcpHandler.ServeHTTP(w, r)
	})

	if s.authMiddleware != nil {
		return s.authMiddleware(wrapped)
	}
	return wrapped
}

// ConnectInMemory dials an in-process MCP client session scoped to the caller's Principal and SpaceContext.
// ExternalOnly tools (such as agent__<slug>) are excluded to prevent agent self-recursion.
func (s *Server) ConnectInMemory(ctx context.Context) (*sdkmcp.ClientSession, error) {
	clientTransport, serverTransport := sdkmcp.NewInMemoryTransports()
	sdkServer := s.buildServerForContext(ctx, false)

	if _, err := sdkServer.Connect(ctx, serverTransport, nil); err != nil {
		return nil, fmt.Errorf("connect in-memory mcp server: %w", err)
	}

	client := sdkmcp.NewClient(&sdkmcp.Implementation{
		Name:    "saturn-ai-loopback",
		Version: s.impl.Version,
	}, nil)

	session, err := client.Connect(ctx, clientTransport, nil)
	if err != nil {
		return nil, fmt.Errorf("connect in-memory mcp client: %w", err)
	}

	return session, nil
}

func (s *Server) buildServerForContext(ctx context.Context, includeExternal bool) *sdkmcp.Server {
	sdkServer := sdkmcp.NewServer(s.impl, &sdkmcp.ServerOptions{
		Logger:      s.logger,
		SchemaCache: s.registry.schemaCache,
	})

	sdkServer.AddReceivingMiddleware(
		injectAuthContextMiddleware(ctx),
		mcpmiddleware.LoggingMiddleware(s.logger),
	)

	s.registry.mu.RLock()
	tools := make([]registeredTool, len(s.registry.tools))
	copy(tools, s.registry.tools)
	dynProviders := make([]DynamicToolProvider, len(s.registry.dynamicProviders))
	copy(dynProviders, s.registry.dynamicProviders)
	resources := make([]registeredResource, len(s.registry.resources))
	copy(resources, s.registry.resources)
	s.registry.mu.RUnlock()

	registeredNames := make(map[string]struct{}, len(tools))
	for _, t := range tools {
		if t.spec.ExternalOnly && !includeExternal {
			continue
		}
		if !callerHasScope(ctx, t.spec.RequiredScope) {
			continue
		}
		registeredNames[t.spec.Name] = struct{}{}
		t.register(sdkServer)
	}

	if includeExternal && len(dynProviders) > 0 {
		binder := &DynamicToolBinder{
			ctx:        ctx,
			server:     sdkServer,
			registered: registeredNames,
		}
		for _, prov := range dynProviders {
			prov(ctx, binder)
		}
	}

	for _, res := range resources {
		if !callerHasScope(ctx, res.spec.RequiredScope) {
			continue
		}
		res.register(sdkServer)
	}

	return sdkServer
}

func injectAuthContextMiddleware(baseCtx context.Context) sdkmcp.Middleware {
	basePrincipal, hasPrincipal := auth.PrincipalFromContext(baseCtx)
	baseSpace, hasSpace := auth.SpaceContextFromContext(baseCtx)

	return func(next sdkmcp.MethodHandler) sdkmcp.MethodHandler {
		return func(ctx context.Context, method string, req sdkmcp.Request) (sdkmcp.Result, error) {
			if hasPrincipal {
				if _, ok := auth.PrincipalFromContext(ctx); !ok {
					ctx = auth.WithPrincipal(ctx, basePrincipal)
				}
			}
			if hasSpace && baseSpace.SpaceID != "" {
				if _, ok := auth.SpaceIDFromContext(ctx); !ok {
					ctx = auth.WithSpaceScope(ctx, baseSpace.SpaceID, baseSpace.Role)
				}
			}
			return next(ctx, method, req)
		}
	}
}

func callerHasScope(ctx context.Context, required identity.APIKeyScope) bool {
	if required == "" {
		return true
	}

	sc, ok := auth.SpaceContextFromContext(ctx)
	if !ok || sc.SpaceID == "" || sc.Role == "" {
		return false
	}

	isReadScope := strings.HasSuffix(string(required), ":read")

	// Viewers are always restricted to read-only scopes regardless of API key scopes.
	if sc.Role == string(space.RoleViewer) && !isReadScope {
		return false
	}

	if principal, ok := auth.PrincipalFromContext(ctx); ok && principal.IsAPIKey() {
		return apiKeyHasScope(principal, required)
	}

	switch space.SpaceRole(sc.Role) {
	case space.RoleViewer:
		return isReadScope
	case space.RoleMember, space.RoleAdmin, space.RoleOwner:
		return true
	default:
		return false
	}
}

func apiKeyHasScope(principal auth.Principal, required identity.APIKeyScope) bool {
	reqStr := string(required)
	if principal.HasScope(reqStr) {
		return true
	}
	domain, action, ok := strings.Cut(reqStr, ":")
	if !ok || domain == "" {
		return false
	}
	switch action {
	case "read":
		return principal.HasScope(domain+":write") || principal.HasScope(domain+":execute")
	case "execute":
		return principal.HasScope(domain + ":write")
	default:
		return false
	}
}

// RequireSpaceID extracts the active workspace ID from ctx or returns an unauthenticated error.
func RequireSpaceID(ctx context.Context) (string, error) {
	spaceID, ok := auth.SpaceIDFromContext(ctx)
	if !ok || strings.TrimSpace(spaceID) == "" {
		return "", errors.E(errors.Unauthenticated, "missing active space context")
	}
	return spaceID, nil
}

// ClampLimit bounds a requested page/list limit to [1, maxVal], falling back to def when <= 0.
func ClampLimit[T ~int | ~int32](limit, def, maxVal T) T {
	if limit <= 0 {
		return def
	}
	return min(limit, maxVal)
}

// ParseTimeInLocation parses an RFC3339 timestamp or YYYY-MM-DD date in loc.
func ParseTimeInLocation(raw, field string, loc *time.Location) (time.Time, error) {
	if loc == nil {
		loc = time.UTC
	}
	trimmed := strings.TrimSpace(raw)
	if t, err := time.Parse(time.RFC3339, trimmed); err == nil {
		return t.In(loc), nil
	}
	if t, err := time.ParseInLocation("2006-01-02", trimmed, loc); err == nil {
		return t, nil
	}
	return time.Time{}, errors.E(errors.Invalid, fmt.Sprintf("invalid %s: use YYYY-MM-DD or RFC3339", field))
}

// ParseOptionalTime parses an optional date/time string in loc, returning nil when raw is blank.
func ParseOptionalTime(raw, field string, loc *time.Location) (*time.Time, error) {
	if strings.TrimSpace(raw) == "" {
		return nil, nil
	}
	t, err := ParseTimeInLocation(raw, field, loc)
	if err != nil {
		return nil, err
	}
	return new(t), nil
}

// ResolveLocation loads the workspace IANA timezone using getSettings, falling back to UTC.
func ResolveLocation(
	ctx context.Context,
	getSettings func(context.Context, *spaceapp.GetSettingsRequest) (*settings.Entry[space.Settings], error),
	spaceID string,
) *time.Location {
	principal, _ := auth.PrincipalFromContext(ctx)
	entry, err := getSettings(ctx, &spaceapp.GetSettingsRequest{
		SpaceID: spaceID,
		UserID:  principal.Subject,
	})
	if err == nil && entry != nil && entry.Value.Timezone != "" {
		if loc, lErr := time.LoadLocation(entry.Value.Timezone); lErr == nil {
			return loc
		}
	}
	return time.UTC
}

// JSONResource marshals v as application/json MCP ResourceContents.
func JSONResource(uri string, v any) ([]*sdkmcp.ResourceContents, error) {
	raw, err := json.Marshal(v)
	if err != nil {
		return nil, errors.E(errors.Internal, err)
	}
	return []*sdkmcp.ResourceContents{{
		URI:      uri,
		MIMEType: "application/json",
		Text:     string(raw),
	}}, nil
}
