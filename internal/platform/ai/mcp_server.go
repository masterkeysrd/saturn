package ai

import (
	"maps"
	"regexp"
	"slices"
	"strings"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/patch"
)

const SystemSaturnMCPKey = "system.saturn.mcp"

var slugRegex = regexp.MustCompile(`^[a-z0-9][a-z0-9-]*$`)

// MCPTransport identifies how Saturn connects to an MCPServer.
type MCPTransport string

const (
	TransportHTTP     MCPTransport = "http"
	TransportInMemory MCPTransport = "in_memory"
)

// MCPAuthType identifies outbound authentication for an HTTP MCP server.
type MCPAuthType string

const (
	MCPAuthNone          MCPAuthType = "none"
	MCPAuthBearer        MCPAuthType = "bearer"
	MCPAuthCustomHeaders MCPAuthType = "custom_headers"
)

// MCPHealthStatus represents the discovery health status of an MCP server.
type MCPHealthStatus string

const (
	MCPHealthUnknown   MCPHealthStatus = "unknown"
	MCPHealthHealthy   MCPHealthStatus = "healthy"
	MCPHealthUnhealthy MCPHealthStatus = "unhealthy"
)

// MCPServerConfig configures connection and tool trust behavior for an MCPServer.
type MCPServerConfig struct {
	URL            string      `json:"url"`
	AuthType       MCPAuthType `json:"auth_type"`
	TrustReadHints bool        `json:"trust_read_hints"`
	TimeoutSeconds int32       `json:"timeout_seconds"`
}

// MCPAuthSecret holds decrypted auth credentials for external HTTP MCP servers.
type MCPAuthSecret struct {
	BearerToken *string           `json:"bearer_token,omitempty"`
	Headers     map[string]string `json:"headers,omitempty"`
}

// HasCredentials reports whether any bearer token or header is populated.
func (s *MCPAuthSecret) HasCredentials() bool {
	if s == nil {
		return false
	}
	if s.BearerToken != nil && strings.TrimSpace(*s.BearerToken) != "" {
		return true
	}
	return len(s.Headers) > 0
}

// Clone returns a deep copy of MCPAuthSecret.
func (s *MCPAuthSecret) Clone() *MCPAuthSecret {
	if s == nil {
		return nil
	}
	out := &MCPAuthSecret{}
	if s.BearerToken != nil {
		out.BearerToken = new(*s.BearerToken)
	}
	if s.Headers != nil {
		out.Headers = make(map[string]string, len(s.Headers))
		maps.Copy(out.Headers, s.Headers)
	}
	return out
}

// MCPServerInfo captures server metadata returned by the MCP initialize handshake.
type MCPServerInfo struct {
	Name    string `json:"name"`
	Version string `json:"version"`
}

// MCPToolSummary describes a discovered tool exposed by an MCPServer.
type MCPToolSummary struct {
	Name            string         `json:"name"`
	Title           *string        `json:"title,omitempty"`
	Description     string         `json:"description"`
	InputSchema     map[string]any `json:"input_schema,omitempty"`
	ReadOnlyHint    bool           `json:"read_only_hint"`
	DestructiveHint bool           `json:"destructive_hint"`
}

// MCPDiscoveryState caches discovered health and tool metadata for an MCPServer.
type MCPDiscoveryState struct {
	HealthStatus MCPHealthStatus  `json:"health_status"`
	ServerInfo   *MCPServerInfo   `json:"server_info,omitempty"`
	Tools        []MCPToolSummary `json:"tools,omitempty"`
	LastSyncedAt *time.Time       `json:"last_synced_at,omitempty"`
	Error        *ErrorDetail     `json:"error,omitempty"`
}

// MCPServer represents a built-in or remote HTTP MCP server (`platform.ai_mcp_servers`).
type MCPServer struct {
	ID                   string
	SpaceID              string
	SystemKey            *string
	IsSystem             bool
	Slug                 string
	Name                 string
	Description          string
	Transport            MCPTransport
	Config               MCPServerConfig
	AuthSecret           *MCPAuthSecret
	AuthSecretCiphertext *string
	HasAuthSecret        bool
	Discovery            MCPDiscoveryState
	IsEnabled            bool
	CreateTime           time.Time
	UpdateTime           time.Time
}

// EnsureDeletable rejects deletion of protected built-in system MCP servers.
func (m *MCPServer) EnsureDeletable() error {
	if m == nil {
		return errors.E(errors.Invalid, "MCP server is required")
	}
	if m.IsSystem {
		return ErrMCPServerProtected
	}
	return nil
}

// Validate checks MCPServer invariants, transport rules, and SSRF URL constraints.
func (m *MCPServer) Validate(allowPrivateNetworks bool) error {
	if m == nil {
		return errors.E(errors.Invalid, "MCP server payload is required")
	}
	m.Slug = strings.TrimSpace(strings.ToLower(m.Slug))
	m.Name = strings.TrimSpace(m.Name)
	m.Description = strings.TrimSpace(m.Description)

	if m.Name == "" {
		return errors.E(errors.Invalid, "MCP server name is required")
	}
	if len(m.Name) > 255 {
		return errors.E(errors.Invalid, "MCP server name must not exceed 255 characters")
	}
	if m.Slug == "" || len(m.Slug) > 100 || !slugRegex.MatchString(m.Slug) {
		return errors.E(errors.Invalid, "MCP server slug must match ^[a-z0-9][a-z0-9-]*$ and be <= 100 chars")
	}

	if m.Transport == "" {
		m.Transport = TransportHTTP
	}
	switch m.Transport {
	case TransportHTTP:
		if err := ValidateMCPURL(m.Config.URL, allowPrivateNetworks); err != nil {
			return err
		}
	case TransportInMemory:
		if !m.IsSystem {
			return errors.E(errors.Invalid, "in_memory transport is reserved for built-in system MCP servers")
		}
	default:
		return errors.E(errors.Invalid, "unsupported MCP transport: "+string(m.Transport))
	}

	if m.Config.AuthType == "" {
		m.Config.AuthType = MCPAuthNone
	}
	switch m.Config.AuthType {
	case MCPAuthNone, MCPAuthBearer, MCPAuthCustomHeaders:
	default:
		return errors.E(errors.Invalid, "unsupported MCP auth_type: "+string(m.Config.AuthType))
	}

	if m.Config.TimeoutSeconds <= 0 {
		m.Config.TimeoutSeconds = 30
	}
	if m.Discovery.HealthStatus == "" {
		m.Discovery.HealthStatus = MCPHealthUnknown
	}
	m.HasAuthSecret = m.AuthSecret.HasCredentials() || (m.AuthSecretCiphertext != nil && *m.AuthSecretCiphertext != "")
	return nil
}

// MCPServerPatchSchema defines patchable fields for MCPServer.
var MCPServerPatchSchema = patch.NewSchema[MCPServer]().
	Field("slug", func(m *MCPServer) *string { return &m.Slug }).
	Field("name", func(m *MCPServer) *string { return &m.Name }).
	Field("description", func(m *MCPServer) *string { return &m.Description }).
	Field("is_enabled", func(m *MCPServer) *bool { return &m.IsEnabled }).
	Field("config", func(m *MCPServer) *MCPServerConfig { return &m.Config }).
	Field("config.url", func(m *MCPServer) *string { return &m.Config.URL }).
	Field("config.auth_type", func(m *MCPServer) *MCPAuthType { return &m.Config.AuthType }).
	Field("config.trust_read_hints", func(m *MCPServer) *bool { return &m.Config.TrustReadHints }).
	Field("config.timeout_seconds", func(m *MCPServer) *int32 { return &m.Config.TimeoutSeconds }).
	Field("auth_secret", func(m *MCPServer) **MCPAuthSecret { return &m.AuthSecret }).
	Field("auth_secret.bearer_token", func(m *MCPServer) **string { return &m.AuthSecret.BearerToken }).
	Field("auth_secret.headers", func(m *MCPServer) *map[string]string { return &m.AuthSecret.Headers })

// ApplyPatch applies partial updates from incoming according to mask.
func (m *MCPServer) ApplyPatch(incoming *MCPServer, mask []string, allowPrivateNetworks bool) error {
	if incoming == nil {
		return errors.E(errors.Invalid, "MCP server payload is required")
	}
	if m.IsSystem {
		for _, field := range mask {
			if field == "slug" || field == "config" || field == "config.url" {
				return errors.E(errors.Permission, CodeMCPServerProtected, "cannot change slug or endpoint URL of built-in system MCP server")
			}
		}
	}

	inCopy := *incoming
	if len(mask) == 0 {
		if inCopy.AuthSecret == nil {
			inCopy.AuthSecret = m.AuthSecret.Clone()
		}
		if m.AuthSecret == nil {
			m.AuthSecret = &MCPAuthSecret{}
		}
		if inCopy.AuthSecret == nil {
			inCopy.AuthSecret = &MCPAuthSecret{}
		}
	} else if slices.Contains(mask, "auth_secret.bearer_token") || slices.Contains(mask, "auth_secret.headers") {
		if m.AuthSecret == nil {
			m.AuthSecret = &MCPAuthSecret{}
		}
		if inCopy.AuthSecret == nil {
			inCopy.AuthSecret = &MCPAuthSecret{}
		}
	}

	if err := MCPServerPatchSchema.Apply(m, &inCopy, mask); err != nil {
		return errors.E(errors.Invalid, err)
	}
	if m.AuthSecret != nil && !m.AuthSecret.HasCredentials() {
		m.AuthSecret = nil
	}
	m.UpdateTime = time.Now().UTC()
	return m.Validate(allowPrivateNetworks)
}
