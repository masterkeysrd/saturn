package ai

import (
	"net"
	"net/http"
	"net/netip"
	"slices"
	"syscall"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

var cloudMetadataIPs = []netip.Addr{
	netip.MustParseAddr("169.254.169.254"),
	netip.MustParseAddr("fd00:ec2::254"),
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
func NewSSRFSafeHTTPClient(allowPrivateNetworks bool, timeout time.Duration) *http.Client {
	dialer := &net.Dialer{
		Timeout:   10 * time.Second,
		KeepAlive: 30 * time.Second,
		Control: func(_, address string, _ syscall.RawConn) error {
			host, _, err := net.SplitHostPort(address)
			if err != nil {
				host = address
			}
			addr, err := netip.ParseAddr(host)
			if err != nil || isBlockedSSRFIP(addr, allowPrivateNetworks) {
				return ErrSSRFBlocked
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
			return ValidateMCPURL(req.URL.String(), allowPrivateNetworks)
		},
	}
}
