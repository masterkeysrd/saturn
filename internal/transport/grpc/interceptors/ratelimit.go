package interceptors

import (
	"context"
	"net"
	"net/netip"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/masterkeysrd/saturn/api"
	foundationauth "github.com/masterkeysrd/saturn/internal/foundation/auth"
	"golang.org/x/time/rate"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/peer"
	"google.golang.org/grpc/status"
)

// RateLimitConfig configures YAML-driven token-bucket rate limiting for gRPC endpoints.
type RateLimitConfig struct {
	Enabled           bool
	Rules             []api.RateLimitRule
	RequestsPerMinute float64
	Burst             int
	TrustedProxies    []string
}

type resolvedRateLimitPolicy struct {
	Enabled    bool
	RatePerSec float64
	Burst      int
	KeyBy      string
}

type limiterEntry struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

// RateLimitInterceptor enforces declarative rate-limit rules compiled from api/**/*.yaml
// using golang.org/x/time/rate token buckets.
type RateLimitInterceptor struct {
	enabled        bool
	rules          []api.RateLimitRule
	defaultRateSec float64
	defaultBurst   int
	trustedProxies []netip.Prefix
	policyCache    sync.Map // Cache of: string (method) -> *resolvedRateLimitPolicy

	mu       sync.Mutex
	limiters map[string]*limiterEntry
}

// NewRateLimitInterceptor creates a new RateLimitInterceptor configured with compiled YAML rules.
func NewRateLimitInterceptor(cfg RateLimitConfig) *RateLimitInterceptor {
	rpm := cfg.RequestsPerMinute
	if rpm <= 0 {
		rpm = 30
	}
	burst := cfg.Burst
	if burst <= 0 {
		burst = 20
	}

	return &RateLimitInterceptor{
		enabled:        cfg.Enabled,
		rules:          cfg.Rules,
		defaultRateSec: rpm / 60.0,
		defaultBurst:   burst,
		trustedProxies: ParseTrustedProxies(cfg.TrustedProxies),
		limiters:       make(map[string]*limiterEntry),
	}
}

// UnaryServerInterceptor returns a gRPC unary interceptor enforcing rate-limit rules.
func (rl *RateLimitInterceptor) UnaryServerInterceptor() grpc.UnaryServerInterceptor {
	return func(ctx context.Context, req any, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (any, error) {
		if rl.enabled {
			policy := rl.resolvePolicy(info.FullMethod)
			if policy.Enabled {
				subjectKey := rl.extractSubjectKey(ctx, policy.KeyBy)
				if !rl.allow(subjectKey+"|"+info.FullMethod, policy.RatePerSec, policy.Burst) {
					return nil, status.Error(codes.ResourceExhausted, "too many requests; please try again later")
				}
			}
		}
		return handler(ctx, req)
	}
}

func (rl *RateLimitInterceptor) resolvePolicy(method string) *resolvedRateLimitPolicy {
	if cached, ok := rl.policyCache.Load(method); ok {
		return cached.(*resolvedRateLimitPolicy)
	}

	normalizedMethod := strings.TrimPrefix(method, "/")
	normalizedMethod = strings.ReplaceAll(normalizedMethod, "/", ".")

	var policy *resolvedRateLimitPolicy
	for _, rule := range rl.rules {
		if matchSelector(rule.Selector, normalizedMethod) {
			rateSec := rl.defaultRateSec
			if rule.RequestsPerMinute > 0 {
				rateSec = rule.RequestsPerMinute / 60.0
			}
			burst := rl.defaultBurst
			if rule.Burst > 0 {
				burst = rule.Burst
			}
			keyBy := strings.ToLower(strings.TrimSpace(rule.KeyBy))
			if keyBy == "" {
				keyBy = "ip"
			}
			policy = &resolvedRateLimitPolicy{
				Enabled:    rule.Enabled,
				RatePerSec: rateSec,
				Burst:      burst,
				KeyBy:      keyBy,
			}
		}
	}

	if policy == nil {
		policy = &resolvedRateLimitPolicy{Enabled: false}
	}

	rl.policyCache.Store(method, policy)
	return policy
}

func (rl *RateLimitInterceptor) extractSubjectKey(ctx context.Context, keyBy string) string {
	if keyBy == "principal" {
		if p, ok := foundationauth.PrincipalFromContext(ctx); ok && p.Subject != "" {
			return "usr:" + p.Subject
		}
	}
	return "ip:" + ExtractClientIP(ctx, rl.trustedProxies)
}

func (rl *RateLimitInterceptor) allow(key string, ratePerSec float64, burst int) bool {
	now := timeNow()
	rl.mu.Lock()
	if len(rl.limiters) > 10000 {
		cutoff := now.Add(-10 * time.Minute)
		for k, entry := range rl.limiters {
			if entry.lastSeen.Before(cutoff) {
				delete(rl.limiters, k)
			}
		}
	}

	entry, ok := rl.limiters[key]
	if !ok {
		entry = &limiterEntry{
			limiter: rate.NewLimiter(rate.Limit(ratePerSec), burst),
		}
		rl.limiters[key] = entry
	}
	entry.lastSeen = now
	limiter := entry.limiter
	rl.mu.Unlock()

	return limiter.AllowN(now, 1)
}

// ParseTrustedProxies parses CIDR or single IP strings into netip.Prefix entries, ignoring invalid entries.
func ParseTrustedProxies(raw []string) []netip.Prefix {
	prefixes := make([]netip.Prefix, 0, len(raw))
	for _, entry := range raw {
		entry = strings.TrimSpace(entry)
		if entry == "" {
			continue
		}
		if p, err := netip.ParsePrefix(entry); err == nil {
			prefixes = append(prefixes, p)
			continue
		}
		if addr, err := netip.ParseAddr(entry); err == nil {
			prefixes = append(prefixes, netip.PrefixFrom(addr, addr.BitLen()))
		}
	}
	return prefixes
}

// IsTrustedProxy reports whether addr matches any configured trusted proxy prefix.
func IsTrustedProxy(addr netip.Addr, trusted []netip.Prefix) bool {
	if !addr.IsValid() {
		return false
	}
	addr = addr.Unmap()
	for _, p := range trusted {
		if p.Contains(addr) {
			return true
		}
	}
	return false
}

// ExtractClientIP extracts the client IP from incoming gRPC metadata/peer without blindly trusting
// client-supplied X-Forwarded-For entries. It inspects X-Forwarded-For from right to left, skipping
// only configured trusted proxy CIDRs, and falls back to the gRPC peer address.
func ExtractClientIP(ctx context.Context, trustedProxies []netip.Prefix) string {
	if md, ok := metadata.FromIncomingContext(ctx); ok {
		if xffValues := md.Get("x-forwarded-for"); len(xffValues) > 0 {
			var parts []string
			for _, v := range xffValues {
				for item := range strings.SplitSeq(v, ",") {
					if trimmed := strings.TrimSpace(item); trimmed != "" {
						parts = append(parts, trimmed)
					}
				}
			}
			for _, part := range slices.Backward(parts) {
				addr, ok := parseIPOrHostPort(part)
				if !ok {
					continue
				}
				if IsTrustedProxy(addr, trustedProxies) {
					continue
				}
				return addr.String()
			}
		}
	}

	if p, ok := peer.FromContext(ctx); ok && p != nil && p.Addr != nil {
		if addr, ok := parseIPOrHostPort(p.Addr.String()); ok {
			return addr.String()
		}
		if p.Addr.Network() == "unix" {
			return "unix"
		}
	}

	return "unknown"
}

func parseIPOrHostPort(raw string) (netip.Addr, bool) {
	if addr, err := netip.ParseAddr(raw); err == nil {
		return addr.Unmap(), true
	}
	if host, _, err := net.SplitHostPort(raw); err == nil {
		if addr, err := netip.ParseAddr(host); err == nil {
			return addr.Unmap(), true
		}
	}
	return netip.Addr{}, false
}
