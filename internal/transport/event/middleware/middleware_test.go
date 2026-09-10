package middleware_test

import (
	"context"
	"testing"

	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/eventbus"
	"github.com/masterkeysrd/saturn/internal/platform/requestid"
	"github.com/masterkeysrd/saturn/internal/transport/event/middleware"
)

func TestRequestIDMiddleware_ProducerAndConsumer(t *testing.T) {
	// 1. Test Producer with preset request_id in context
	presetReqID := "req_preset_producer_123"
	ctx := requestid.With(context.Background(), presetReqID)
	msg := &eventbus.Message{
		Topic:   "test.topic",
		Payload: []byte("payload"),
	}

	producerMW := middleware.RequestIDProducer()
	var capturedMsg *eventbus.Message
	err := producerMW(func(ctx context.Context, m *eventbus.Message) error {
		capturedMsg = m
		return nil
	})(ctx, msg)

	if err != nil {
		t.Fatalf("unexpected producer middleware error: %v", err)
	}
	if capturedMsg.Headers["request_id"] != presetReqID {
		t.Fatalf("expected header request_id %q, got %q", presetReqID, capturedMsg.Headers["request_id"])
	}

	// 2. Test Producer without preset request_id in context -> should generate one
	emptyCtx := context.Background()
	msg2 := &eventbus.Message{Topic: "test.topic2"}
	err = producerMW(func(ctx context.Context, m *eventbus.Message) error {
		capturedMsg = m
		return nil
	})(emptyCtx, msg2)

	if err != nil {
		t.Fatalf("unexpected producer middleware error: %v", err)
	}
	generatedReqID := capturedMsg.Headers["request_id"]
	if generatedReqID == "" || len(generatedReqID) < 5 || generatedReqID[:4] != "req_" {
		t.Fatalf("expected generated request_id with prefix 'req_', got %q", generatedReqID)
	}

	// 3. Test Consumer unpacking existing request_id from headers
	consumerMW := middleware.RequestIDConsumer()
	receivedMsg := eventbus.Message{
		Headers: map[string]string{"request_id": "req_consumer_test_789"},
	}

	var consumerReceivedReqID string
	err = consumerMW(func(ctx context.Context, m eventbus.Message) error {
		consumerReceivedReqID = requestid.From(ctx)
		return nil
	})(context.Background(), receivedMsg)

	if err != nil {
		t.Fatalf("unexpected consumer middleware error: %v", err)
	}
	if consumerReceivedReqID != "req_consumer_test_789" {
		t.Fatalf("expected consumer to unpack %q, got %q", "req_consumer_test_789", consumerReceivedReqID)
	}

	// 4. Test Consumer with missing headers -> should generate fresh req_ ID
	msgMissingHeaders := eventbus.Message{
		Headers: map[string]string{},
	}
	err = consumerMW(func(ctx context.Context, m eventbus.Message) error {
		consumerReceivedReqID = requestid.From(ctx)
		return nil
	})(context.Background(), msgMissingHeaders)

	if err != nil {
		t.Fatalf("unexpected consumer middleware error: %v", err)
	}
	if consumerReceivedReqID == "" || len(consumerReceivedReqID) < 5 || consumerReceivedReqID[:4] != "req_" {
		t.Fatalf("expected fresh request_id on missing header, got %q", consumerReceivedReqID)
	}
}

func TestSpaceIDMiddleware_ProducerAndConsumer(t *testing.T) {
	// 1. Test SpaceID Producer
	spaceID := "space_test_456"
	ctx := auth.WithSpaceID(context.Background(), spaceID)
	msg := &eventbus.Message{Topic: "space.test"}

	producerMW := middleware.SpaceIDProducer()
	var capturedMsg *eventbus.Message
	err := producerMW(func(ctx context.Context, m *eventbus.Message) error {
		capturedMsg = m
		return nil
	})(ctx, msg)

	if err != nil {
		t.Fatalf("unexpected producer error: %v", err)
	}
	if capturedMsg.Headers["space_id"] != spaceID {
		t.Fatalf("expected header space_id %q, got %q", spaceID, capturedMsg.Headers["space_id"])
	}

	// 2. Test SpaceID Consumer
	consumerMW := middleware.SpaceIDConsumer()
	receivedMsg := eventbus.Message{
		Headers: map[string]string{"space_id": spaceID},
	}

	var consumerReceivedSpaceID string
	err = consumerMW(func(ctx context.Context, m eventbus.Message) error {
		val, ok := auth.SpaceIDFromContext(ctx)
		if ok {
			consumerReceivedSpaceID = val
		}
		return nil
	})(context.Background(), receivedMsg)

	if err != nil {
		t.Fatalf("unexpected consumer error: %v", err)
	}
	if consumerReceivedSpaceID != spaceID {
		t.Fatalf("expected consumer to extract space_id %q, got %q", spaceID, consumerReceivedSpaceID)
	}
}
