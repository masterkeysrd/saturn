package middleware

import (
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/eventbus"
)

// SpaceIDProducer extracts space_id from the context and sets it as an event header.
func SpaceIDProducer() eventbus.ProducerMiddleware {
	return eventbus.HeaderContextInjector("space_id", auth.SpaceIDFromContext)
}

// SpaceIDConsumer extracts space_id from event headers and injects it into context.
func SpaceIDConsumer() eventbus.ConsumerMiddleware {
	return eventbus.HeaderContextUnpacker("space_id", auth.WithSpaceID)
}
