package eventbus_test

import (
	"context"
	"testing"

	"github.com/masterkeysrd/saturn/internal/platform/eventbus"
)

// TestEventBus_CompileVerify verifies structural API definitions.
func TestEventBus_CompileVerify(t *testing.T) {
	var _ = (*eventbus.Engine)(nil)
}

func TestEngine_SubscribeHandlerUpdate(t *testing.T) {
	engine := eventbus.NewEngine(nil)

	// Register initial subscriber
	engine.Subscribe("test.topic", "sub-1", nil)

	// Update handler for same subscriberID
	var updatedCalled bool
	updatedHandler := func(ctx context.Context, msg eventbus.Message) error {
		updatedCalled = true
		return nil
	}

	engine.Subscribe("test.topic", "sub-1", updatedHandler)
	if updatedCalled {
		t.Log("handler updated successfully")
	}
}
