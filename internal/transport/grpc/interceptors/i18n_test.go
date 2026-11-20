package interceptors_test

import (
	"context"
	"testing"

	platformi18n "github.com/masterkeysrd/saturn/internal/platform/i18n"
	"github.com/masterkeysrd/saturn/internal/transport/grpc/interceptors"
	"google.golang.org/grpc"
	"google.golang.org/grpc/metadata"
)

func TestAcceptLanguageFromMetadata(t *testing.T) {
	tests := []struct {
		name string
		md   metadata.MD
		want string
	}{
		{
			name: "DirectKey",
			md:   metadata.Pairs("accept-language", "es-DO, es;q=0.9"),
			want: "es-DO, es;q=0.9",
		},
		{
			name: "GatewayKeyFallback",
			md:   metadata.Pairs("grpcgateway-accept-language", "es"),
			want: "es",
		},
		{
			name: "DirectKeyPreferredOverGateway",
			md: metadata.New(map[string]string{
				"accept-language":             "en",
				"grpcgateway-accept-language": "es",
			}),
			want: "en",
		},
		{
			name: "EmptyValuesIgnored",
			md:   metadata.Pairs("accept-language", "   "),
			want: "",
		},
		{
			name: "NoMetadata",
			md:   nil,
			want: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := context.Background()
			if tt.md != nil {
				ctx = metadata.NewIncomingContext(ctx, tt.md)
			}
			if got := interceptors.AcceptLanguageFromMetadata(ctx); got != tt.want {
				t.Errorf("AcceptLanguageFromMetadata() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestI18nInterceptor_Unary(t *testing.T) {
	tests := []struct {
		name     string
		md       metadata.MD
		wantLang string
	}{
		{
			name:     "NegotiatesSpanishFromWeightedHeader",
			md:       metadata.Pairs("accept-language", "es-DO, es;q=0.9, en-US;q=0.8"),
			wantLang: "es",
		},
		{
			name:     "NegotiatesEnglishFromHeader",
			md:       metadata.Pairs("accept-language", "en-US"),
			wantLang: "en",
		},
		{
			name:     "MissingMetadataDefaultsToEnglish",
			md:       nil,
			wantLang: "en",
		},
		{
			name:     "UnsupportedLanguageFallsBackToEnglish",
			md:       metadata.Pairs("accept-language", "de-DE, fr;q=0.5"),
			wantLang: "en",
		},
	}

	interceptor := interceptors.NewI18nInterceptor()

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := context.Background()
			if tt.md != nil {
				ctx = metadata.NewIncomingContext(ctx, tt.md)
			}

			var gotLang string
			handler := func(ctx context.Context, _ any) (any, error) {
				gotLang = platformi18n.From(ctx)
				return "ok", nil
			}

			resp, err := interceptor.UnaryServerInterceptor()(
				ctx,
				nil,
				&grpc.UnaryServerInfo{FullMethod: "/saturn.test/v1/Service/Method"},
				handler,
			)
			if err != nil {
				t.Fatalf("interceptor returned error: %v", err)
			}
			if resp != "ok" {
				t.Errorf("handler response = %v, want %q", resp, "ok")
			}
			if gotLang != tt.wantLang {
				t.Errorf("context language = %q, want %q", gotLang, tt.wantLang)
			}
		})
	}
}

type i18nStubStream struct {
	grpc.ServerStream
	ctx context.Context
}

func (s *i18nStubStream) Context() context.Context {
	return s.ctx
}

func TestI18nInterceptor_Stream(t *testing.T) {
	interceptor := interceptors.NewI18nInterceptor()

	ctx := metadata.NewIncomingContext(context.Background(), metadata.Pairs(
		"grpcgateway-accept-language", "es-DO;q=1.0, en;q=0.5",
	))
	stream := &i18nStubStream{ctx: ctx}

	var gotLang string
	handler := func(_ any, ss grpc.ServerStream) error {
		gotLang = platformi18n.From(ss.Context())
		return nil
	}

	if err := interceptor.StreamServerInterceptor()(nil, stream, &grpc.StreamServerInfo{}, handler); err != nil {
		t.Fatalf("stream interceptor returned error: %v", err)
	}
	if gotLang != "es" {
		t.Errorf("wrapped stream language = %q, want %q", gotLang, "es")
	}
}
