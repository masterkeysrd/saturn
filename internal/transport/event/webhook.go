package event

import (
	"context"
	"fmt"
	"time"

	integrationv1 "github.com/masterkeysrd/saturn/apis/saturn/platform/integration/v1"
	"github.com/masterkeysrd/saturn/internal/platform/eventbus"
	"github.com/masterkeysrd/saturn/internal/platform/integration"
	"github.com/masterkeysrd/saturn/internal/platform/log"
)

// RegisterWebhookSubscribers binds all webhook event bus subscribers with structured lifecycle logging.
func RegisterWebhookSubscribers(bus *eventbus.Engine, registry *integration.Registry) {
	integrationv1.SubscribeWebhookReceivedEvent(bus, "webhook_llm_processor", func(ctx context.Context, payload *integrationv1.WebhookReceivedEvent) error {
		provider, exists := registry.GetProvider(payload.Source)
		if !exists {
			log.Warn(ctx, "webhook subscriber encountered unknown provider",
				log.String("source", payload.Source),
				log.String("space_id", payload.SpaceId),
			)
			return fmt.Errorf("unknown webhook provider %q", payload.Source)
		}

		headers := make(map[string][]string, len(payload.Headers))
		for k, v := range payload.Headers {
			headers[k] = []string{v}
		}

		startTime := time.Now()
		log.Info(ctx, "processing webhook event",
			log.String("source", payload.Source),
			log.String("space_id", payload.SpaceId),
			log.Int("body_bytes", len(payload.Body)),
		)

		err := provider.Process(ctx, headers, payload.Body)
		duration := time.Since(startTime)

		if err != nil {
			log.Error(ctx, "webhook event processing failed",
				log.String("source", payload.Source),
				log.String("space_id", payload.SpaceId),
				log.Duration("duration", duration),
				log.Int64("latency_ms", duration.Milliseconds()),
				log.Err(err),
			)
			return err
		}

		log.Info(ctx, "webhook event processing completed successfully",
			log.String("source", payload.Source),
			log.String("space_id", payload.SpaceId),
			log.Duration("duration", duration),
			log.Int64("latency_ms", duration.Milliseconds()),
		)

		return nil
	})
}
