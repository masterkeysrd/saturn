package interceptors

import (
	"context"
	"strings"

	platformi18n "github.com/masterkeysrd/saturn/internal/platform/i18n"
	"google.golang.org/grpc"
	"google.golang.org/grpc/metadata"
)

// gRPC metadata keys carrying the Accept-Language preference.
const (
	acceptLanguageMetadataKey        = "accept-language"
	gatewayAcceptLanguageMetadataKey = "grpcgateway-accept-language"
	contentLanguageMetadataKey       = "content-language"
	varyMetadataKey                  = "vary"
)

// I18nInterceptor negotiates the response language from the incoming
// Accept-Language preference, injects it into the request context, and
// declares the negotiated language on the response via the Content-Language
// and Vary: Accept-Language headers.
type I18nInterceptor struct{}

// NewI18nInterceptor creates a new I18nInterceptor.
func NewI18nInterceptor() *I18nInterceptor {
	return &I18nInterceptor{}
}

// UnaryServerInterceptor returns a gRPC unary interceptor that negotiates the
// locale and sets localization response headers.
func (i *I18nInterceptor) UnaryServerInterceptor() grpc.UnaryServerInterceptor {
	return func(ctx context.Context, req any, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (any, error) {
		ctx = i.intercept(ctx)
		i.setHeader(ctx)
		return handler(ctx, req)
	}
}

// StreamServerInterceptor returns a gRPC stream interceptor that negotiates
// the locale and sets localization response headers.
func (i *I18nInterceptor) StreamServerInterceptor() grpc.StreamServerInterceptor {
	return func(srv any, ss grpc.ServerStream, info *grpc.StreamServerInfo, handler grpc.StreamHandler) error {
		ctx := i.intercept(ss.Context())
		i.setHeader(ctx)
		return handler(srv, WrapServerStream(ctx, ss))
	}
}

func (i *I18nInterceptor) intercept(ctx context.Context) context.Context {
	return platformi18n.With(ctx, platformi18n.Negotiate(AcceptLanguageFromMetadata(ctx)))
}

func (i *I18nInterceptor) setHeader(ctx context.Context) {
	language := platformi18n.From(ctx)
	if language == "" {
		language = platformi18n.DefaultLanguage
	}
	_ = grpc.SetHeader(ctx, metadata.Pairs(
		contentLanguageMetadataKey, language,
		varyMetadataKey, platformi18n.AcceptLanguageHeader,
	))
}

// AcceptLanguageFromMetadata extracts the raw Accept-Language value from
// incoming gRPC metadata, preferring the direct key over the gateway-prefixed
// one.
func AcceptLanguageFromMetadata(ctx context.Context) string {
	if ctx == nil {
		return ""
	}
	md, ok := metadata.FromIncomingContext(ctx)
	if !ok {
		return ""
	}
	for _, key := range []string{acceptLanguageMetadataKey, gatewayAcceptLanguageMetadataKey} {
		for _, val := range md.Get(key) {
			if trimmed := strings.TrimSpace(val); trimmed != "" {
				return trimmed
			}
		}
	}
	return ""
}
