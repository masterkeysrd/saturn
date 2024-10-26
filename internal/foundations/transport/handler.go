package transport

import "context"

type HandlerFunc func(ctx context.Context, payload []byte) (any, error)
