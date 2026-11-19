package ai

import (
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"slices"
	"strings"
	"syscall"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

var cloudMetadataIPs = []netip.Addr{
	netip.MustParseAddr("169.254.169.254"),
	netip.MustParseAddr("fd00:ec2::254"),
}

// OutboundURLPolicy configures SSRF validation and error mapping for outbound HTTP targets.
type OutboundURLPolicy struct {
	Label                string
	AllowPrivateNetworks bool
	InvalidURLErr        error
	SSRFBlockedErr       error
}

func (p OutboundURLPolicy) label() string {
	if strings.TrimSpace(p.Label) != "" {
		return p.Label
	}
	return "URL"
}

func (p OutboundURLPolicy) invalidURLErr(msg any) error {
	if code := errors.CodeOf(p.InvalidURLErr); code != "" {
		return errors.E(errors.Invalid, code, msg)
	}
	return errors.E(errors.Invalid, msg)
}

func (p OutboundURLPolicy) ssrfBlockedErr() error {
	if p.SSRFBlockedErr != nil {
		return p.SSRFBlockedErr
	}
	return ErrSSRFBlocked
}

// MCPURLPolicy returns the SSRF validation policy for external HTTP MCP servers.
func MCPURLPolicy(allowPrivateNetworks bool) OutboundURLPolicy {
	return OutboundURLPolicy{
		Label:                "MCP server URL",
		AllowPrivateNetworks: allowPrivateNetworks,
		InvalidURLErr:        ErrInvalidMCPURL,
		SSRFBlockedErr:       ErrMCPSSRFBlocked,
	}
}

// ProviderURLPolicy returns the SSRF validation policy for LLM provider BaseURLs and outbound requests.
func ProviderURLPolicy(allowPrivateNetworks bool) OutboundURLPolicy {
	return OutboundURLPolicy{
		Label:                "AI provider URL",
		AllowPrivateNetworks: allowPrivateNetworks,
		InvalidURLErr:        ErrInvalidProviderURL,
		SSRFBlockedErr:       ErrProviderSSRFBlocked,
	}
}

// ValidateMCPURL validates an outbound HTTP(S) MCP endpoint URL against SSRF rules.
func ValidateMCPURL(rawURL string, allowPrivateNetworks bool) error {
	return ValidateOutboundURL(rawURL, MCPURLPolicy(allowPrivateNetworks))
}

// ValidateProviderURL validates an outbound HTTP(S) AI provider endpoint URL against SSRF rules.
func ValidateProviderURL(rawURL string, allowPrivateNetworks bool) error {
	return ValidateOutboundURL(rawURL, ProviderURLPolicy(allowPrivateNetworks))
}

// ValidateOutboundURL validates an outbound HTTP(S) URL against SSRF rules using the provided policy.
func ValidateOutboundURL(rawURL string, policy OutboundURLPolicy) error {
	label := policy.label()
	trimmed := strings.TrimSpace(rawURL)
	if trimmed == "" {
		return policy.invalidURLErr(label + " is required")
	}

	u, err := url.Parse(trimmed)
	if err != nil {
		return policy.invalidURLErr(err)
	}

	scheme := strings.ToLower(u.Scheme)
	if scheme != "http" && scheme != "https" {
		return policy.invalidURLErr(label + " scheme must be http or https")
	}

	host := strings.ToLower(strings.TrimSpace(u.Hostname()))
	if host == "" {
		return policy.invalidURLErr(label + " host is required")
	}

	// Unconditionally block cloud metadata endpoints.
	if host == "169.254.169.254" || host == "fd00:ec2::254" || host == "metadata.google.internal" {
		return policy.ssrfBlockedErr()
	}

	if addr, err := netip.ParseAddr(host); err == nil {
		if isBlockedSSRFIP(addr, policy.AllowPrivateNetworks) {
			return policy.ssrfBlockedErr()
		}
		return nil
	}

	if !policy.AllowPrivateNetworks {
		if host == "localhost" || strings.HasSuffix(host, ".localhost") || strings.HasSuffix(host, ".local") || strings.HasSuffix(host, ".internal") {
			return policy.ssrfBlockedErr()
		}
	}

	return nil
}

func isBlockedSSRFIP(addr netip.Addr, allowPrivateNetworks bool) bool {
	if !addr.IsValid() {
		return true
	}
	addr = addr.Unmap()
	if slices.Contains(cloudMetadataIPs, addr) {
		return true
	}
	if addr.IsLinkLocalUnicast() || addr.IsLinkLocalMulticast() || addr.IsMulticast() || addr.IsUnspecified() {
		return true
	}
	if !allowPrivateNetworks && (addr.IsLoopback() || addr.IsPrivate()) {
		return true
	}
	return false
}

// NewSSRFSafeHTTPClient returns an *http.Client that enforces SSRF protections on resolved IPs
// via net.Dialer.Control and re-validates HTTP redirects via CheckRedirect.
func NewSSRFSafeHTTPClient(policy OutboundURLPolicy, timeout time.Duration) *http.Client {
	dialer := &net.Dialer{
		Timeout:   10 * time.Second,
		KeepAlive: 30 * time.Second,
		Control: func(_, address string, _ syscall.RawConn) error {
			host, _, err := net.SplitHostPort(address)
			if err != nil {
				host = address
			}
			addr, err := netip.ParseAddr(host)
			if err != nil || isBlockedSSRFIP(addr, policy.AllowPrivateNetworks) {
				return policy.ssrfBlockedErr()
			}
			return nil
		},
	}

	transport := &http.Transport{
		Proxy:                 http.ProxyFromEnvironment,
		DialContext:           dialer.DialContext,
		ForceAttemptHTTP2:     true,
		MaxIdleConns:          100,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
	}

	return &http.Client{
		Timeout:   timeout,
		Transport: transport,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 10 {
				return errors.E(errors.Invalid, "stopped after 10 redirects")
			}
			return ValidateOutboundURL(req.URL.String(), policy)
		},
	}
}
