package eventbus

import (
	"context"
	"fmt"
	"sync"

	"google.golang.org/protobuf/proto"
)

// EventPublisher publishes pure domain events through an outbound converter edge onto the event bus.
type EventPublisher interface {
	Publish(ctx context.Context, topic string, event any) error
}

// ConverterFunc converts a domain event struct into a wire protobuf message.
type ConverterFunc func(ctx context.Context, event any) (proto.Message, error)

// ConverterRegistry maps eventbus topics to domain-to-proto converter functions.
type ConverterRegistry struct {
	mu         sync.RWMutex
	converters map[string]ConverterFunc
}

// NewConverterRegistry initializes an empty ConverterRegistry.
func NewConverterRegistry() *ConverterRegistry {
	return &ConverterRegistry{
		converters: make(map[string]ConverterFunc),
	}
}

// Register binds a strongly-typed domain-to-proto converter to a topic.
func (r *ConverterRegistry) Register[E any, P proto.Message](topic string, fn func(E) (P, error)) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.converters[topic] = func(_ context.Context, event any) (proto.Message, error) {
		typed, ok := event.(E)
		if !ok {
			return nil, fmt.Errorf("event for topic %q has unexpected type %T", topic, event)
		}
		return fn(typed)
	}
}

// Convert converts a domain event using the converter registered for topic.
func (r *ConverterRegistry) Convert(ctx context.Context, topic string, event any) (proto.Message, error) {
	r.mu.RLock()
	fn, ok := r.converters[topic]
	r.mu.RUnlock()
	if !ok {
		return nil, fmt.Errorf("no event converter registered for topic %q", topic)
	}
	return fn(ctx, event)
}

// NoopPublisher is a no-op EventPublisher for unit tests that do not assert event emissions.
type NoopPublisher struct{}

// Publish satisfies EventPublisher without emitting any events.
func (NoopPublisher) Publish(context.Context, string, any) error {
	return nil
}

// EdgePublisher implements EventPublisher by converting domain events and publishing to Engine.
type EdgePublisher struct {
	engine     *Engine
	converters *ConverterRegistry
}

// NewEdgePublisher creates an EdgePublisher bridging domain events onto eventbus.Engine.
func NewEdgePublisher(engine *Engine, converters *ConverterRegistry) *EdgePublisher {
	return &EdgePublisher{
		engine:     engine,
		converters: converters,
	}
}

// Publish converts event and publishes it to topic within the caller's active transaction/context.
func (p *EdgePublisher) Publish(ctx context.Context, topic string, event any) error {
	if p == nil || p.engine == nil || p.converters == nil {
		return nil
	}
	msg, err := p.converters.Convert(ctx, topic, event)
	if err != nil {
		return err
	}
	return p.engine.PublishProto(ctx, topic, msg)
}
