package transport

import "context"

type HandlerFunc func(ctx context.Context, payload []byte) (any, error)

type Handler interface {
	Handle(ctx context.Context, payload []byte) (any, error)
}

func NewHandler(fn HandlerFunc) Handler {
	return simpleHandler{fn: fn}
}

type simpleHandler struct {
	fn HandlerFunc
}

func (h simpleHandler) Handle(ctx context.Context, payload []byte) (any, error) {
	return h.fn(ctx, payload)
}
