package transport

import "context"

type rawEventKey struct{}
type pathParamsKey struct{}
type claimsKey struct{}

// transportContext is a context wrapper that provides utility methods for
// working with the context in the transport layer.
type transportContext struct {
	ctx context.Context
}

// WithContext returns a new transportContext with the given context.
func WithContext(ctx context.Context) *transportContext {
	return &transportContext{ctx: ctx}
}

// NewContext returns a new transportContext with a new context.
func (t *transportContext) WithPathParams(params map[string]string) *transportContext {
	t.ctx = context.WithValue(t.ctx, pathParamsKey{}, params)
	return t
}

// PathParams returns the path parameters from the context.
func (t *transportContext) PathParams() map[string]string {
	if params, ok := t.ctx.Value(pathParamsKey{}).(map[string]string); ok {
		return params
	}
	return nil
}

// PathParam returns the path parameter with the given key from the context.
func (t *transportContext) PathParam(key string) string {
	return PathParamFromCtx(t.ctx, key)
}

// WithRawEvent returns a new transportContext with the given raw event.
func (t *transportContext) WithRawEvent(event interface{}) *transportContext {
	t.ctx = context.WithValue(t.ctx, rawEventKey{}, event)
	return t
}

// RawEvent returns the raw event from the context.
func (t *transportContext) RawEvent() interface{} {
	return t.ctx.Value(rawEventKey{})
}

// WithClaims returns a new transportContext with the given claims.
func (t *transportContext) WithClaims(claims Claims) *transportContext {
	t.ctx = context.WithValue(t.ctx, claimsKey{}, claims)
	return t
}

// Claims returns the claims from the context.j
func (t *transportContext) Claims() Claims {
	if claims, ok := t.ctx.Value(claimsKey{}).(Claims); ok {
		return claims
	}
	return nil
}

// Context returns the context from the transportContext.
func (t *transportContext) Context() context.Context {
	return t.ctx
}

// PathParamFromCtx returns the path parameter with the given key from the context.
func PathParamFromCtx(ctx context.Context, key string) string {
	if params, ok := ctx.Value(pathParamsKey{}).(map[string]string); ok {
		return params[key]
	}
	return ""
}
