package ai

import (
	"net/http"
	"net/http/httptest"
	"net/netip"
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

func TestIsBlockedSSRFIP(t *testing.T) {
	tests := []struct {
		name         string
		ip           string
		allowPrivate bool
		wantBlocked  bool
	}{
		{name: "blocks AWS IPv4 metadata when allowPrivate=true", ip: "169.254.169.254", allowPrivate: true, wantBlocked: true},
		{name: "blocks AWS IPv6 metadata when allowPrivate=true", ip: "fd00:ec2::254", allowPrivate: true, wantBlocked: true},
		{name: "blocks link-local unicast when allowPrivate=true", ip: "169.254.1.1", allowPrivate: true, wantBlocked: true},
		{name: "blocks multicast when allowPrivate=true", ip: "224.0.0.1", allowPrivate: true, wantBlocked: true},
		{name: "blocks unspecified when allowPrivate=true", ip: "0.0.0.0", allowPrivate: true, wantBlocked: true},
		{name: "blocks loopback when allowPrivate=false", ip: "127.0.0.1", allowPrivate: false, wantBlocked: true},
		{name: "blocks IPv4-mapped IPv6 loopback when allowPrivate=false", ip: "::ffff:127.0.0.1", allowPrivate: false, wantBlocked: true},
		{name: "blocks RFC1918 when allowPrivate=false", ip: "10.0.0.5", allowPrivate: false, wantBlocked: true},
		{name: "blocks IPv6 ULA when allowPrivate=false", ip: "fc00::1", allowPrivate: false, wantBlocked: true},
		{name: "allows loopback when allowPrivate=true", ip: "127.0.0.1", allowPrivate: true, wantBlocked: false},
		{name: "allows RFC1918 when allowPrivate=true", ip: "192.168.1.50", allowPrivate: true, wantBlocked: false},
		{name: "allows public IP when allowPrivate=false", ip: "93.184.216.34", allowPrivate: false, wantBlocked: false},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			addr := netip.MustParseAddr(tc.ip)
			if got := isBlockedSSRFIP(addr, tc.allowPrivate); got != tc.wantBlocked {
				t.Fatalf("isBlockedSSRFIP(%s, %v) = %v, want %v", tc.ip, tc.allowPrivate, got, tc.wantBlocked)
			}
		})
	}
}

func TestValidateOutboundURL_ProviderAndMCPPolicies(t *testing.T) {
	tests := []struct {
		name     string
		validate func() error
		wantErr  error
		wantCode errors.Code
	}{
		{
			name:     "provider rejects invalid scheme with provider error code",
			validate: func() error { return ValidateProviderURL("ftp://example.com/v1", true) },
			wantErr:  ErrInvalidProviderURL,
			wantCode: CodeProviderInvalidURL,
		},
		{
			name:     "provider blocks host.docker.internal when allowPrivate=false",
			validate: func() error { return ValidateProviderURL("http://host.docker.internal:8000/v1", false) },
			wantErr:  ErrProviderSSRFBlocked,
			wantCode: CodeProviderSSRFBlocked,
		},
		{
			name:     "provider allows host.docker.internal when allowPrivate=true",
			validate: func() error { return ValidateProviderURL("http://host.docker.internal:8000/v1", true) },
		},
		{
			name:     "mcp rejects invalid scheme with mcp error code",
			validate: func() error { return ValidateMCPURL("ftp://example.com/mcp", true) },
			wantErr:  ErrInvalidMCPURL,
			wantCode: CodeMCPInvalidURL,
		},
		{
			name:     "mcp blocks host.docker.internal when allowPrivate=false",
			validate: func() error { return ValidateMCPURL("http://host.docker.internal:9000/mcp", false) },
			wantErr:  ErrMCPSSRFBlocked,
			wantCode: CodeMCPSSRFBlocked,
		},
		{
			name:     "mcp allows host.docker.internal when allowPrivate=true",
			validate: func() error { return ValidateMCPURL("http://host.docker.internal:9000/mcp", true) },
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := tc.validate()
			if tc.wantErr == nil {
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				return
			}
			if !errors.Is(err, tc.wantErr) || errors.CodeOf(err) != tc.wantCode {
				t.Fatalf("got err=%v (code=%s), want err=%v (code=%s)", err, errors.CodeOf(err), tc.wantErr, tc.wantCode)
			}
		})
	}
}

func TestSSRFSafeHTTPClient_DialAndRedirectBlocking(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/redirect-meta":
			http.Redirect(w, r, "http://169.254.169.254/latest/meta-data", http.StatusFound)
		case "/redirect-loopback":
			http.Redirect(w, r, "http://127.0.0.1:8080/internal", http.StatusFound)
		default:
			w.WriteHeader(http.StatusOK)
		}
	}))
	defer srv.Close()

	t.Run("dialer Control blocks loopback for MCP policy when allowPrivate=false", func(t *testing.T) {
		client := NewSSRFSafeHTTPClient(MCPURLPolicy(false), 2*time.Second)
		_, err := client.Get(srv.URL)
		if !errors.Is(err, ErrMCPSSRFBlocked) {
			t.Fatalf("expected ErrMCPSSRFBlocked on dial to 127.0.0.1, got %v", err)
		}
	})

	t.Run("dialer Control blocks loopback for Provider policy when allowPrivate=false", func(t *testing.T) {
		client := NewSSRFSafeHTTPClient(ProviderURLPolicy(false), 2*time.Second)
		_, err := client.Get(srv.URL)
		if !errors.Is(err, ErrProviderSSRFBlocked) {
			t.Fatalf("expected ErrProviderSSRFBlocked on dial to 127.0.0.1, got %v", err)
		}
	})

	t.Run("CheckRedirect blocks redirect to metadata IP even when allowPrivate=true", func(t *testing.T) {
		client := NewSSRFSafeHTTPClient(ProviderURLPolicy(true), 2*time.Second)
		_, err := client.Get(srv.URL + "/redirect-meta")
		if !errors.Is(err, ErrProviderSSRFBlocked) {
			t.Fatalf("expected ErrProviderSSRFBlocked on redirect to metadata IP, got %v", err)
		}
	})

	t.Run("allows loopback when allowPrivate=true", func(t *testing.T) {
		client := NewSSRFSafeHTTPClient(ProviderURLPolicy(true), 2*time.Second)
		resp, err := client.Get(srv.URL + "/ok")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		_ = resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("status = %d, want 200", resp.StatusCode)
		}
	})
}
