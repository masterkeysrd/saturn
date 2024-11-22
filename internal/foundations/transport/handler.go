package transport

import "context"

// HandlerFunc is a function that handles a request.
type HandlerFunc func(ctx context.Context, payload []byte) (any, error)

// Middleware is a function that wraps a handler.
type Middleware func(ctx context.Context, payload []byte, next HandlerFunc) (any, error)

// Handler is an interface that handles a request.
type Handler interface {
	Handle(ctx context.Context, payload []byte) (any, error)
}

// NewHandler returns a new Handler that wraps the given HandlerFunc.
func NewHandler(fn HandlerFunc) Handler {
	return simpleHandler{fn: fn}
}

// simpleHandler is a simple implementation of Handler.
type simpleHandler struct {
	fn HandlerFunc
}

// Handle calls the underlying HandlerFunc.
func (h simpleHandler) Handle(ctx context.Context, payload []byte) (any, error) {
	return h.fn(ctx, payload)
}
