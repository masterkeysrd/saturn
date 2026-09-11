package platform_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	messagev1 "github.com/masterkeysrd/saturn/apis/saturn/platform/message/v1"
	"github.com/masterkeysrd/saturn/internal/platform/eventbus"
	"github.com/masterkeysrd/saturn/internal/platform/requestid"
	"github.com/masterkeysrd/saturn/tests/driver"
)

func TestEventBusQueueMetrics(t *testing.T) {
	d := driver.New(t, testEnv)

	metrics, err := d.Platform().GetQueueMetrics(t)
	if err != nil {
		t.Fatalf("failed to get queue metrics: %v", err)
	}

	if metrics.GetTotalDeliveries() < 0 {
		t.Errorf("total deliveries = %d, want >= 0", metrics.GetTotalDeliveries())
	}
}

func TestEventBusPublishAndDelivery(t *testing.T) {
	d := driver.New(t, testEnv)

	nano := time.Now().UnixNano()
	topic := fmt.Sprintf("test.event.%d", nano)
	subscriberID := fmt.Sprintf("sub_%d", nano)
	testPayload := `{"greeting":"hello_eventbus"}`

	received := make(chan string, 1)
	d.Env().EventBus().Subscribe(topic, subscriberID, func(ctx context.Context, msg eventbus.Message) error {
		select {
		case received <- string(msg.Payload):
		default:
		}
		return nil
	})

	// Publish event via driver
	if err := d.Platform().PublishEvent(t, topic, []byte(testPayload)); err != nil {
		t.Fatalf("failed to publish event: %v", err)
	}

	// Await consumption by worker pool
	select {
	case payload := <-received:
		if payload != testPayload {
			t.Errorf("received payload = %s, want %s", payload, testPayload)
		}
	case <-time.After(5 * time.Second):
		t.Fatalf("timed out waiting for event consumption")
	}

	// Verify delivery is recorded as completed via MessageAdmin API
	delivs, err := d.Platform().ListDeliveries(t, &messagev1.ListDeliveriesRequest{
		Topic: topic,
	})
	if err != nil {
		t.Fatalf("failed to list deliveries: %v", err)
	}

	var found *messagev1.DeliveryInfo
	for _, dl := range delivs.GetDeliveries() {
		if dl.GetSubscriberId() == subscriberID {
			found = dl
			break
		}
	}
	if found == nil {
		t.Fatalf("delivery record for subscriber %s not found", subscriberID)
	}
	if found.GetStatus() != "completed" {
		t.Errorf("delivery status = %s, want completed", found.GetStatus())
	}

	// Verify topic metrics reflect completed delivery
	metrics, err := d.Platform().GetQueueMetrics(t)
	if err != nil {
		t.Fatalf("failed to get queue metrics: %v", err)
	}
	var topicFound bool
	for _, tm := range metrics.GetTopics() {
		if tm.GetTopic() == topic {
			topicFound = true
			if tm.GetCompleted() < 1 {
				t.Errorf("topic %s completed count = %d, want >= 1", topic, tm.GetCompleted())
			}
			break
		}
	}
	if !topicFound {
		t.Errorf("topic %s not found in queue metrics topics", topic)
	}
}

func TestEventBusContextPropagation(t *testing.T) {
	d := driver.New(t, testEnv)

	nano := time.Now().UnixNano()
	topic := fmt.Sprintf("test.reqid.%d", nano)
	customReqID := fmt.Sprintf("req_test_%d", nano)

	capturedReqID := make(chan string, 1)
	d.Env().EventBus().Subscribe(topic, "reqid_subscriber", func(ctx context.Context, msg eventbus.Message) error {
		select {
		case capturedReqID <- requestid.From(ctx):
		default:
		}
		return nil
	})

	ctxWithReqID := requestid.With(t.Context(), customReqID)
	if err := d.Env().EventBus().Publish(ctxWithReqID, topic, []byte(`{"hello":"reqid"}`)); err != nil {
		t.Fatalf("failed to publish with context: %v", err)
	}

	select {
	case reqID := <-capturedReqID:
		if reqID != customReqID {
			t.Errorf("propagated request_id = %s, want %s", reqID, customReqID)
		}
	case <-time.After(5 * time.Second):
		t.Fatalf("timed out waiting for handler with propagated context")
	}
}

func TestEventBusRetryDelivery(t *testing.T) {
	d := driver.New(t, testEnv)

	nano := time.Now().UnixNano()
	msgID := fmt.Sprintf("msg_%d", nano)
	delID := fmt.Sprintf("del_%d", nano)
	topic := fmt.Sprintf("test.retry.%d", nano)
	subID := fmt.Sprintf("sub_retry_%d", nano)

	// 1. Seed a message and a failed delivery
	_, err := d.Env().DB.ExecContext(t.Context(), `
		INSERT INTO platform.messages (id, topic, headers, payload, create_time)
		VALUES ($1, $2, '{}', '{}', NOW())
	`, msgID, topic)
	if err != nil {
		t.Fatalf("failed to insert message: %v", err)
	}

	_, err = d.Env().DB.ExecContext(t.Context(), `
		INSERT INTO platform.message_deliveries 
			(id, message_id, subscriber_id, status, attempts, max_attempts, last_error, schedule_time, create_time, update_time)
		VALUES ($1, $2, $3, 'failed', 5, 5, 'network timeout', NOW(), NOW(), NOW())
	`, delID, msgID, subID)
	if err != nil {
		t.Fatalf("failed to insert message delivery: %v", err)
	}

	// 2. Query failed deliveries via API
	resp, err := d.Platform().ListDeliveries(t, &messagev1.ListDeliveriesRequest{
		Topic:  topic,
		Status: "failed",
	})
	if err != nil {
		t.Fatalf("failed to list deliveries: %v", err)
	}
	var found *messagev1.DeliveryInfo
	for _, dl := range resp.GetDeliveries() {
		if dl.GetId() == delID {
			found = dl
			break
		}
	}
	if found == nil {
		t.Fatalf("failed delivery %s not found in list", delID)
	}
	if found.GetLastError() != "network timeout" {
		t.Errorf("last_error = %s, want network timeout", found.GetLastError())
	}

	// 3. Retry delivery
	if err := d.Platform().RetryDelivery(t, delID); err != nil {
		t.Fatalf("failed to retry delivery: %v", err)
	}

	// 4. Verify delivery status changed to pending with 0 attempts
	var status string
	var attempts int
	err = d.Env().DB.QueryRowContext(t.Context(), `SELECT status, attempts FROM platform.message_deliveries WHERE id = $1`, delID).Scan(&status, &attempts)
	if err != nil {
		t.Fatalf("failed to query delivery: %v", err)
	}
	if status != "pending" && status != "processing" {
		t.Errorf("retried delivery status = %s, want pending or processing", status)
	}
	if attempts != 0 {
		t.Errorf("retried delivery attempts = %d, want 0", attempts)
	}
}
