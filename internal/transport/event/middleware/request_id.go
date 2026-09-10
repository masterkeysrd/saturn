package middleware

import (
	"context"

	"github.com/masterkeysrd/saturn/internal/platform/eventbus"
	"github.com/masterkeysrd/saturn/internal/platform/requestid"
)

// RequestIDProducer injects the request ID from context into the published message headers.
// If the context does not have a request ID, a fresh one is generated and attached to context.
func RequestIDProducer() eventbus.ProducerMiddleware {
	return func(next eventbus.PublishFunc) eventbus.PublishFunc {
		return func(ctx context.Context, msg *eventbus.Message) error {
			ctx, reqID := requestid.FromOrNew(ctx)
			if msg.Headers == nil {
				msg.Headers = make(map[string]string)
			}
			if msg.Headers["request_id"] == "" {
				msg.Headers["request_id"] = reqID
			}
			return next(ctx, msg)
		}
	}
}

// RequestIDConsumer extracts the request ID from the message headers and injects it into the execution context.
// If absent from headers, a fresh request ID is generated and injected.
func RequestIDConsumer() eventbus.ConsumerMiddleware {
	return func(next eventbus.Handler) eventbus.Handler {
		return func(ctx context.Context, msg eventbus.Message) error {
			reqID := msg.Headers["request_id"]
			if reqID == "" {
				reqID = msg.Headers[requestid.MetadataKey]
			}
			if reqID == "" {
				reqID = msg.Headers[requestid.Header]
			}

			if reqID != "" {
				ctx = requestid.With(ctx, reqID)
			} else {
				ctx, _ = requestid.FromOrNew(ctx)
			}

			return next(ctx, msg)
		}
	}
}
