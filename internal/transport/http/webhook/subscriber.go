package webhook

import (
	"context"
	"fmt"

	integrationv1 "github.com/masterkeysrd/saturn/apis/saturn/platform/integration/v1"
	"github.com/masterkeysrd/saturn/internal/platform/eventbus"
	"github.com/masterkeysrd/saturn/internal/platform/integration"
)

// RegisterSubscribers binds all webhook event bus subscribers.
func RegisterSubscribers(bus *eventbus.Engine, registry *integration.Registry) {
	integrationv1.SubscribeWebhookReceivedEvent(bus, "webhook_llm_processor", func(ctx context.Context, payload *integrationv1.WebhookReceivedEvent) error {
		provider, exists := registry.GetProvider(payload.Source)
		if !exists {
			return fmt.Errorf("unknown webhook provider %q", payload.Source)
		}

		headers := make(map[string][]string, len(payload.Headers))
		for k, v := range payload.Headers {
			headers[k] = []string{v}
		}

		return provider.Process(ctx, headers, payload.Body)
	})
}
