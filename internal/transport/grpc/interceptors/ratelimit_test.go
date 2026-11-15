package interceptors

import (
	"context"
	"net"
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/api"
	foundationauth "github.com/masterkeysrd/saturn/internal/foundation/auth"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/peer"
	"google.golang.org/grpc/status"
)

func TestExtractClientIP(t *testing.T) {
	trusted := ParseTrustedProxies([]string{"10.0.0.0/8"})

	tests := []struct {
		name string
		ctx  context.Context
		want string
	}{
		{
			name: "ignores spoofed leftmost XFF and picks rightmost untrusted IP",
			ctx: metadata.NewIncomingContext(context.Background(), metadata.Pairs(
				"x-forwarded-for", "1.2.3.4, 203.0.113.9, 10.1.2.3",
			)),
			want: "203.0.113.9",
		},
		{
			name: "picks rightmost IP when no trusted proxies configured",
			ctx: metadata.NewIncomingContext(context.Background(), metadata.Pairs(
				"x-forwarded-for", "1.2.3.4, 198.51.100.7",
			)),
			want: "198.51.100.7",
		},
		{
			name: "falls back to gRPC peer IP when XFF absent",
			ctx: peer.NewContext(context.Background(), &peer.Peer{
				Addr: &net.TCPAddr{IP: net.ParseIP("192.0.2.44"), Port: 54321},
			}),
			want: "192.0.2.44",
		},
		{
			name: "skips invalid XFF entries and returns peer",
			ctx: peer.NewContext(
				metadata.NewIncomingContext(context.Background(), metadata.Pairs("x-forwarded-for", "not-an-ip")),
				&peer.Peer{Addr: &net.TCPAddr{IP: net.ParseIP("192.0.2.55"), Port: 1234}},
			),
			want: "192.0.2.55",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := ExtractClientIP(tc.ctx, trusted)
			if got != tc.want {
				t.Errorf("ExtractClientIP() = %q, want %q", got, tc.want)
			}
		})
	}
}

func TestRateLimitInterceptor(t *testing.T) {
	origNow := timeNow
	defer func() { timeNow = origNow }()

	now := time.Date(2026, 4, 1, 12, 0, 0, 0, time.UTC)
	timeNow = func() time.Time { return now }

	rules := []api.RateLimitRule{
		{
			Selector: "*",
			Enabled:  false,
		},
		{
			Selector:          "saturn.identity.v1.Identity.LoginUser",
			Enabled:           true,
			RequestsPerMinute: 60, // 1/sec
			Burst:             2,
			KeyBy:             "ip",
		},
		{
			Selector:          "saturn.identity.v1.Identity.ChangePassword",
			Enabled:           true,
			RequestsPerMinute: 60,
			Burst:             1,
			KeyBy:             "principal",
		},
	}

	rl := NewRateLimitInterceptor(RateLimitConfig{
		Enabled: true,
		Rules:   rules,
	})
	interceptor := rl.UnaryServerInterceptor()
	handler := func(ctx context.Context, req any) (any, error) {
		return "ok", nil
	}

	ctx := metadata.NewIncomingContext(context.Background(), metadata.Pairs("x-forwarded-for", "203.0.113.10"))
	loginInfo := &grpc.UnaryServerInfo{FullMethod: "/saturn.identity.v1.Identity/LoginUser"}

	// First 2 requests succeed (burst=2)
	for i := range 2 {
		if _, err := interceptor(ctx, nil, loginInfo, handler); err != nil {
			t.Fatalf("request %d failed unexpectedly: %v", i, err)
		}
	}

	// 3rd immediate request is rate-limited
	if _, err := interceptor(ctx, nil, loginInfo, handler); status.Code(err) != codes.ResourceExhausted {
		t.Fatalf("expected ResourceExhausted on 3rd request, got %v", err)
	}

	// Unlisted authenticated method is not limited (matches "*" enabled: false)
	otherInfo := &grpc.UnaryServerInfo{FullMethod: "/saturn.finance.v1.Finance/ListBudgets"}
	if _, err := interceptor(ctx, nil, otherInfo, handler); err != nil {
		t.Fatalf("unlisted method should not be rate-limited, got %v", err)
	}

	// Advance clock by 2 seconds -> refills tokens
	now = now.Add(2 * time.Second)
	if _, err := interceptor(ctx, nil, loginInfo, handler); err != nil {
		t.Fatalf("expected request after refill to succeed, got %v", err)
	}

	// Principal-keyed endpoint isolates limits per authenticated subject regardless of IP
	changePwdInfo := &grpc.UnaryServerInfo{FullMethod: "/saturn.identity.v1.Identity/ChangePassword"}
	ctxUser1 := foundationauth.WithPrincipal(ctx, foundationauth.Principal{Subject: "usr_1"})
	ctxUser2 := foundationauth.WithPrincipal(ctx, foundationauth.Principal{Subject: "usr_2"})

	if _, err := interceptor(ctxUser1, nil, changePwdInfo, handler); err != nil {
		t.Fatalf("usr_1 first request failed: %v", err)
	}
	if _, err := interceptor(ctxUser1, nil, changePwdInfo, handler); status.Code(err) != codes.ResourceExhausted {
		t.Fatalf("expected usr_1 second request to be rate-limited, got %v", err)
	}
	if _, err := interceptor(ctxUser2, nil, changePwdInfo, handler); err != nil {
		t.Fatalf("usr_2 first request should have its own bucket, got %v", err)
	}
}
