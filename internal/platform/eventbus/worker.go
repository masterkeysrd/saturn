package eventbus

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"runtime/debug"
	"time"
)

// Start starts worker pool goroutines and background polling loop.
func (e *Engine) Start(ctx context.Context) {
	for i := 0; i < e.workerCount; i++ {
		go e.workerLoop(ctx)
	}
	go e.pollerLoop(ctx)
}

func (e *Engine) pollerLoop(ctx context.Context) {
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	staleTicker := time.NewTicker(1 * time.Minute)
	defer staleTicker.Stop()

	purgeTicker := time.NewTicker(1 * time.Hour)
	defer purgeTicker.Stop()

	// Initial stale delivery check and retention purge
	if err := e.RecoverStaleDeliveries(ctx); err != nil {
		slog.Error("failed initial stale delivery recovery", "err", err)
	}
	if err := e.PurgeOldMessages(ctx, 30*24*time.Hour); err != nil {
		slog.Error("failed initial message retention purge", "err", err)
	}

	for {
		select {
		case <-ticker.C:
			e.triggerNotify()
		case <-staleTicker.C:
			if err := e.RecoverStaleDeliveries(ctx); err != nil {
				slog.Error("failed to recover stale deliveries", "err", err)
			}
		case <-purgeTicker.C:
			if err := e.PurgeOldMessages(ctx, 30*24*time.Hour); err != nil {
				slog.Error("failed message retention purge", "err", err)
			}
		case <-ctx.Done():
			return
		}
	}
}

// RecoverStaleDeliveries resets deliveries stuck in 'processing' state for longer than 30 minutes back to 'pending'.
func (e *Engine) RecoverStaleDeliveries(ctx context.Context) error {
	query := `UPDATE platform.message_deliveries 
		SET status = 'pending', schedule_time = NOW(), update_time = NOW() 
		WHERE status = 'processing' AND update_time < NOW() - INTERVAL '30 minutes'`
	_, err := e.db.ExecContext(ctx, query)
	if err != nil {
		return fmt.Errorf("recover stale deliveries: %w", err)
	}
	return nil
}

// PurgeOldMessages deletes completed or failed deliveries and orphaned messages older than retention window.
func (e *Engine) PurgeOldMessages(ctx context.Context, retentionWindow time.Duration) error {
	days := int(retentionWindow.Hours() / 24)
	if days <= 0 {
		days = 30
	}

	// 1. Delete completed or failed deliveries older than retention window
	delQuery := fmt.Sprintf(`DELETE FROM platform.message_deliveries 
		WHERE status IN ('completed', 'failed') AND update_time < NOW() - INTERVAL '%d days'`, days)
	if _, err := e.db.ExecContext(ctx, delQuery); err != nil {
		return fmt.Errorf("purge old deliveries: %w", err)
	}

	// 2. Delete parent messages that no longer have any active or retained delivery records
	msgQuery := fmt.Sprintf(`DELETE FROM platform.messages m
		WHERE NOT EXISTS (SELECT 1 FROM platform.message_deliveries d WHERE d.message_id = m.id)
		  AND m.create_time < NOW() - INTERVAL '%d days'`, days)
	if _, err := e.db.ExecContext(ctx, msgQuery); err != nil {
		return fmt.Errorf("purge unreferenced messages: %w", err)
	}

	return nil
}

func (e *Engine) triggerNotify() {
	select {
	case e.notifyCh <- struct{}{}:
	default:
	}
}

func (e *Engine) workerLoop(ctx context.Context) {
	for {
		select {
		case <-e.notifyCh:
			e.processAvailableDeliveries(ctx)
		case <-ctx.Done():
			return
		}
	}
}

func (e *Engine) processAvailableDeliveries(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		claimed, err := e.claimAndExecuteNextDelivery(ctx)
		if err != nil {
			slog.Error("eventbus delivery execution error", "err", err)
			return
		}
		if !claimed {
			// No more ready deliveries found
			return
		}
	}
}

func (e *Engine) claimAndExecuteNextDelivery(ctx context.Context) (bool, error) {
	tx, err := e.db.BeginTxx(ctx, nil)
	if err != nil {
		return false, fmt.Errorf("begin claim tx: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	var record DeliveryRecord

	query := `SELECT 
		d.id, d.message_id, d.subscriber_id, d.status, d.attempts, d.max_attempts,
		m.topic, m.headers AS headers_json, m.payload
		FROM platform.message_deliveries d
		JOIN platform.messages m ON d.message_id = m.id
		WHERE d.schedule_time <= NOW() AND d.status IN ('pending', 'failed')
		ORDER BY d.schedule_time ASC
		LIMIT 1
		FOR UPDATE OF d SKIP LOCKED`

	err = tx.GetContext(ctx, &record, query)
	if err != nil {
		// sql.ErrNoRows means no work is pending right now
		return false, nil
	}

	// Update delivery status to processing
	_, err = tx.ExecContext(ctx, `UPDATE platform.message_deliveries SET status = 'processing', update_time = NOW() WHERE id = $1`, record.ID)
	if err != nil {
		return false, fmt.Errorf("update delivery status to processing: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return false, fmt.Errorf("commit claim tx: %w", err)
	}

	// Execute delivery in background worker thread
	e.executeDelivery(ctx, record)
	return true, nil
}

func (e *Engine) executeDelivery(ctx context.Context, record DeliveryRecord) {
	headers := make(map[string]string)
	if len(record.HeadersJSON) > 0 {
		_ = json.Unmarshal(record.HeadersJSON, &headers)
	}

	msg := Message{
		ID:         record.MessageID,
		Topic:      record.Topic,
		Headers:    headers,
		Payload:    record.Payload,
		CreateTime: record.CreateTime,
	}

	e.mu.RLock()
	var handler Handler
	for _, sub := range e.subscribers[record.Topic] {
		if sub.subscriberID == record.SubscriberID {
			handler = sub.handler
			break
		}
	}
	cms := append([]ConsumerMiddleware(nil), e.consumerMiddlewares...)
	e.mu.RUnlock()

	if handler == nil {
		errMsg := fmt.Sprintf("no handler registered for subscriber %q on topic %q", record.SubscriberID, record.Topic)
		_, _ = e.db.ExecContext(ctx, `UPDATE platform.message_deliveries SET status = 'failed', last_error = $1, update_time = NOW() WHERE id = $2`, errMsg, record.ID)
		return
	}

	// Build consumer middleware chain
	chainedHandler := handler
	for i := len(cms) - 1; i >= 0; i-- {
		chainedHandler = cms[i](chainedHandler)
	}

	execErr := func() (err error) {
		defer func() {
			if r := recover(); r != nil {
				err = fmt.Errorf("panic recovered during delivery execution: %v\nstack: %s", r, string(debug.Stack()))
			}
		}()
		return chainedHandler(ctx, msg)
	}()

	if execErr != nil {
		slog.Error("eventbus subscriber delivery execution failed", "subscriber_id", record.SubscriberID, "topic", record.Topic, "message_id", record.MessageID, "err", execErr)
		nextAttempt := record.Attempts + 1
		status := "pending"
		if nextAttempt >= record.MaxAttempts {
			status = "failed"
		}

		// Exponential backoff retry calculation: 1m, 2m, 4m, 8m...
		backoffMinutes := 1 << (nextAttempt - 1)
		scheduleTime := time.Now().Add(time.Duration(backoffMinutes) * time.Minute).UTC()

		_, _ = e.db.ExecContext(ctx, `UPDATE platform.message_deliveries 
			SET status = $1, attempts = $2, schedule_time = $3, last_error = $4, update_time = NOW() 
			WHERE id = $5`, status, nextAttempt, scheduleTime, execErr.Error(), record.ID)
	} else {
		// Mark completed
		_, _ = e.db.ExecContext(ctx, `UPDATE platform.message_deliveries 
			SET status = 'completed', update_time = NOW() WHERE id = $1`, record.ID)
	}
}
