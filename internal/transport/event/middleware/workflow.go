package middleware

import (
	"context"
	"strconv"
	"strings"

	"github.com/masterkeysrd/saturn/internal/platform/eventbus"
)

const (
	// HeaderWorkflowChain tracks the comma-separated flow IDs that produced an event.
	HeaderWorkflowChain = "x-workflow-chain"
	// HeaderWorkflowHop tracks the integer workflow dispatch depth to prevent infinite recursion.
	HeaderWorkflowHop = "x-workflow-hop"
	// MaxWorkflowHop caps transitive event-to-workflow triggers.
	MaxWorkflowHop = 3
)

type workflowChainKey struct{}
type workflowHopKey struct{}

// WithWorkflowChain stores the active workflow trigger chain on ctx.
func WithWorkflowChain(ctx context.Context, chain []string) context.Context {
	return context.WithValue(ctx, workflowChainKey{}, append([]string(nil), chain...))
}

// WorkflowChainFromContext retrieves the active workflow trigger chain from ctx.
func WorkflowChainFromContext(ctx context.Context) []string {
	if ctx == nil {
		return nil
	}
	v, _ := ctx.Value(workflowChainKey{}).([]string)
	return append([]string(nil), v...)
}

// WithWorkflowHop stores the current workflow recursion hop count on ctx.
func WithWorkflowHop(ctx context.Context, hop int) context.Context {
	return context.WithValue(ctx, workflowHopKey{}, hop)
}

// WorkflowHopFromContext retrieves the current workflow recursion hop count from ctx.
func WorkflowHopFromContext(ctx context.Context) int {
	if ctx == nil {
		return 0
	}
	v, _ := ctx.Value(workflowHopKey{}).(int)
	return v
}

// WorkflowChainProducer injects x-workflow-chain and x-workflow-hop headers onto outbound eventbus messages.
func WorkflowChainProducer() eventbus.ProducerMiddleware {
	return func(next eventbus.PublishFunc) eventbus.PublishFunc {
		return func(ctx context.Context, msg *eventbus.Message) error {
			if msg.Headers == nil {
				msg.Headers = make(map[string]string)
			}
			if chain := WorkflowChainFromContext(ctx); len(chain) > 0 && msg.Headers[HeaderWorkflowChain] == "" {
				msg.Headers[HeaderWorkflowChain] = strings.Join(chain, ",")
			}
			if hop := WorkflowHopFromContext(ctx); hop > 0 && msg.Headers[HeaderWorkflowHop] == "" {
				msg.Headers[HeaderWorkflowHop] = strconv.Itoa(hop)
			}
			return next(ctx, msg)
		}
	}
}

// WorkflowChainConsumer unpacks x-workflow-chain and x-workflow-hop headers into the worker context.
func WorkflowChainConsumer() eventbus.ConsumerMiddleware {
	return func(next eventbus.Handler) eventbus.Handler {
		return func(ctx context.Context, msg eventbus.Message) error {
			if rawChain := strings.TrimSpace(msg.Headers[HeaderWorkflowChain]); rawChain != "" {
				var chain []string
				for part := range strings.SplitSeq(rawChain, ",") {
					if trimmed := strings.TrimSpace(part); trimmed != "" {
						chain = append(chain, trimmed)
					}
				}
				if len(chain) > 0 {
					ctx = WithWorkflowChain(ctx, chain)
				}
			}
			if rawHop := strings.TrimSpace(msg.Headers[HeaderWorkflowHop]); rawHop != "" {
				if hop, err := strconv.Atoi(rawHop); err == nil && hop > 0 {
					ctx = WithWorkflowHop(ctx, hop)
				}
			}
			return next(ctx, msg)
		}
	}
}
