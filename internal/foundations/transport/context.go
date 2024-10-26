package transport

import "context"

type pathParamsKey struct{}

func WithPathParams(ctx context.Context, params map[string]string) context.Context {
	return context.WithValue(ctx, pathParamsKey{}, params)
}

func PathParams(ctx context.Context) map[string]string {
	if params, ok := ctx.Value(pathParamsKey{}).(map[string]string); ok {
		return params
	}
	return nil
}

func PathParam(ctx context.Context, key string) string {
	if params, ok := ctx.Value(pathParamsKey{}).(map[string]string); ok {
		return params[key]
	}
	return ""
}
