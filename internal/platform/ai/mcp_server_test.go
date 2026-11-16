package ai

import (
	"testing"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

func TestMCPServer_ValidateAndSSRF(t *testing.T) {
	tests := []struct {
		name         string
		server       *MCPServer
		allowPrivate bool
		wantErr      bool
		wantCode     errors.Code
	}{
		{
			name: "valid public HTTPS server",
			server: &MCPServer{
				Slug:      "github",
				Name:      "GitHub MCP",
				Transport: TransportHTTP,
				Config:    MCPServerConfig{URL: "https://mcp.example.com/mcp", AuthType: MCPAuthBearer},
			},
		},
		{
			name: "blocks cloud metadata IP even when allowPrivate=true",
			server: &MCPServer{
				Slug:      "meta",
				Name:      "Metadata",
				Transport: TransportHTTP,
				Config:    MCPServerConfig{URL: "http://169.254.169.254/latest/meta-data"},
			},
			allowPrivate: true,
			wantErr:      true,
			wantCode:     CodeMCPSSRFBlocked,
		},
		{
			name: "blocks localhost when allowPrivate=false",
			server: &MCPServer{
				Slug:      "local",
				Name:      "Local",
				Transport: TransportHTTP,
				Config:    MCPServerConfig{URL: "http://127.0.0.1:8080/mcp"},
			},
			allowPrivate: false,
			wantErr:      true,
			wantCode:     CodeMCPSSRFBlocked,
		},
		{
			name: "allows localhost when allowPrivate=true",
			server: &MCPServer{
				Slug:      "local",
				Name:      "Local",
				Transport: TransportHTTP,
				Config:    MCPServerConfig{URL: "http://127.0.0.1:8080/mcp"},
			},
			allowPrivate: true,
		},
		{
			name: "blocks private RFC1918 when allowPrivate=false",
			server: &MCPServer{
				Slug:      "lan",
				Name:      "LAN",
				Transport: TransportHTTP,
				Config:    MCPServerConfig{URL: "http://10.0.0.12:3000/mcp"},
			},
			allowPrivate: false,
			wantErr:      true,
			wantCode:     CodeMCPSSRFBlocked,
		},
		{
			name: "rejects in_memory transport for non-system server",
			server: &MCPServer{
				Slug:      "custom-mem",
				Name:      "Custom",
				IsSystem:  false,
				Transport: TransportInMemory,
			},
			wantErr: true,
		},
		{
			name: "allows in_memory transport for system server",
			server: &MCPServer{
				SystemKey: new(SystemSaturnMCPKey),
				IsSystem:  true,
				Slug:      "saturn",
				Name:      "Saturn Workspace",
				Transport: TransportInMemory,
				Config:    MCPServerConfig{URL: "in-memory://saturn", AuthType: MCPAuthNone, TrustReadHints: true},
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := tc.server.Validate(tc.allowPrivate)
			if tc.wantErr {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				if tc.wantCode != "" && errors.CodeOf(err) != tc.wantCode {
					t.Errorf("code = %q, want %q (err: %v)", errors.CodeOf(err), tc.wantCode, err)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
		})
	}
}

func TestMCPServer_EnsureDeletableAndPatch(t *testing.T) {
	sys := &MCPServer{
		ID:        "mcp_sys",
		SystemKey: new(SystemSaturnMCPKey),
		IsSystem:  true,
		Slug:      "saturn",
		Name:      "Saturn Workspace",
		Transport: TransportInMemory,
	}
	if err := sys.EnsureDeletable(); !errors.Is(err, errors.Permission) || errors.CodeOf(err) != CodeMCPServerProtected {
		t.Fatalf("expected CodeMCPServerProtected, got %v", err)
	}
	if err := sys.ApplyPatch(&MCPServer{Slug: "other"}, []string{"slug"}, false); !errors.Is(err, errors.Permission) {
		t.Fatalf("expected permission error mutating system slug, got %v", err)
	}

	userSrv := &MCPServer{
		ID:         "mcp_1",
		Slug:       "stripe",
		Name:       "Stripe",
		Transport:  TransportHTTP,
		Config:     MCPServerConfig{URL: "https://mcp.stripe.com/v1", AuthType: MCPAuthBearer},
		AuthSecret: &MCPAuthSecret{BearerToken: new("tok_old"), Headers: map[string]string{"X-Env": "prod"}},
	}
	if err := userSrv.EnsureDeletable(); err != nil {
		t.Fatalf("expected user MCP server deletable, got %v", err)
	}
	err := userSrv.ApplyPatch(&MCPServer{
		Config:     MCPServerConfig{TrustReadHints: true, TimeoutSeconds: 45},
		AuthSecret: &MCPAuthSecret{BearerToken: new("tok_new")},
	}, []string{"config.trust_read_hints", "config.timeout_seconds", "auth_secret.bearer_token"}, false)
	if err != nil {
		t.Fatalf("ApplyPatch failed: %v", err)
	}
	if !userSrv.Config.TrustReadHints || userSrv.Config.TimeoutSeconds != 45 {
		t.Errorf("unexpected config after patch: %+v", userSrv.Config)
	}
	if userSrv.AuthSecret == nil || *userSrv.AuthSecret.BearerToken != "tok_new" || userSrv.AuthSecret.Headers["X-Env"] != "prod" {
		t.Errorf("unexpected auth_secret after patch: %+v", userSrv.AuthSecret)
	}
}
