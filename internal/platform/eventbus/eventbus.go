package eventbus

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/db"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/id"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
)

// Message represents a generic, domain-agnostic event message payload and metadata envelope.
type Message struct {
	ID         string            `db:"id"`
	Topic      string            `db:"topic"`
	Headers    map[string]string `db:"headers"`
	Payload    []byte            `db:"payload"`
	CreateTime time.Time         `db:"create_time"`
}

// DeliveryRecord represents a worker claim for an individual subscriber delivery.
type DeliveryRecord struct {
	ID           string    `db:"id"`
	MessageID    string    `db:"message_id"`
	SubscriberID string    `db:"subscriber_id"`
	Status       string    `db:"status"`
	Attempts     int       `db:"attempts"`
	MaxAttempts  int       `db:"max_attempts"`
	LastError    string    `db:"last_error"`
	ScheduleTime time.Time `db:"schedule_time"`
	CreateTime   time.Time `db:"create_time"`
	UpdateTime   time.Time `db:"update_time"`

	Topic       string `db:"topic"`
	HeadersJSON []byte `db:"headers_json"`
	Payload     []byte `db:"payload"`
}

// Handler handles a consumed event message.
type Handler func(ctx context.Context, msg Message) error

// PublishFunc defines the signature for publishing a message.
type PublishFunc func(ctx context.Context, msg *Message) error

// ProducerMiddleware intercepts message publishing.
type ProducerMiddleware func(next PublishFunc) PublishFunc

// ConsumerMiddleware intercepts message handling.
type ConsumerMiddleware func(next Handler) Handler

type subscriberRegistration struct {
	subscriberID string
	handler      Handler
}

// Database defines the database capabilities required by eventbus Engine.
type Database interface {
	db.DB
	WithTx(ctx context.Context, fn func(ctx context.Context) error) error
}

// Engine manages publishing, storing, and delivering event bus messages.
type Engine struct {
	db                  Database
	subscribers         map[string][]subscriberRegistration
	mu                  sync.RWMutex
	workerCount         int
	notifyCh            chan struct{}
	producerMiddlewares []ProducerMiddleware
	consumerMiddlewares []ConsumerMiddleware
}

// NewEngine instantiates a new Event Bus engine.
func NewEngine(database Database) *Engine {
	return &Engine{
		db:                  database,
		subscribers:         make(map[string][]subscriberRegistration),
		workerCount:         10,
		notifyCh:            make(chan struct{}, 100),
		producerMiddlewares: make([]ProducerMiddleware, 0),
		consumerMiddlewares: make([]ConsumerMiddleware, 0),
	}
}

// WithWorkerCount sets the worker pool count.
func (e *Engine) WithWorkerCount(count int) *Engine {
	if count > 0 {
		e.workerCount = count
	}
	return e
}

// UseProducer adds a middleware to the publishing pipeline.
func (e *Engine) UseProducer(mw ProducerMiddleware) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.producerMiddlewares = append(e.producerMiddlewares, mw)
}

// UseConsumer adds a middleware to the consumer pipeline.
func (e *Engine) UseConsumer(mw ConsumerMiddleware) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.consumerMiddlewares = append(e.consumerMiddlewares, mw)
}

// Subscribe registers a subscriber callback for a specific topic.
func (e *Engine) Subscribe(topic string, subscriberID string, handler Handler) {
	e.mu.Lock()
	defer e.mu.Unlock()

	regs := e.subscribers[topic]
	for i := range regs {
		if regs[i].subscriberID == subscriberID {
			regs[i].handler = handler
			return
		}
	}
	e.subscribers[topic] = append(regs, subscriberRegistration{
		subscriberID: subscriberID,
		handler:      handler,
	})
}

// Publish stores the event message and creates per-subscriber delivery rows.
func (e *Engine) Publish(ctx context.Context, topic string, payload []byte) error {
	msg := &Message{
		Topic:   topic,
		Payload: payload,
	}

	e.mu.RLock()
	pms := append([]ProducerMiddleware(nil), e.producerMiddlewares...)
	e.mu.RUnlock()

	publish := func(ctx context.Context, m *Message) error {
		return e.rawPublish(ctx, m)
	}

	for i := len(pms) - 1; i >= 0; i-- {
		publish = pms[i](publish)
	}

	return publish(ctx, msg)
}

func (e *Engine) rawPublish(ctx context.Context, msg *Message) error {
	const op errors.Op = "platform/eventbus.rawPublish"

	if msg.Headers == nil {
		msg.Headers = make(map[string]string)
	}

	msgID, err := id.Generate("msg_")
	if err != nil {
		return errors.E(op, fmt.Errorf("generate message ID: %w", err))
	}
	msg.ID = msgID
	msg.CreateTime = time.Now().UTC()

	headersBytes, err := json.Marshal(msg.Headers)
	if err != nil {
		return errors.E(op, fmt.Errorf("marshal headers: %w", err))
	}

	e.mu.RLock()
	subscribers := append([]subscriberRegistration(nil), e.subscribers[msg.Topic]...)
	e.mu.RUnlock()

	err = e.db.WithTx(ctx, func(txCtx context.Context) error {
		insertMsgQuery := `INSERT INTO platform.messages (id, topic, headers, payload, create_time)
			VALUES ($1, $2, $3, $4, $5)`
		if _, err := e.db.Exec(txCtx, insertMsgQuery, msg.ID, msg.Topic, headersBytes, msg.Payload, msg.CreateTime); err != nil {
			return errors.E(op, fmt.Errorf("insert message: %w", err))
		}

		for _, sub := range subscribers {
			delID, err := id.Generate("del_")
			if err != nil {
				return errors.E(op, fmt.Errorf("generate delivery ID: %w", err))
			}

			insertDelQuery := `INSERT INTO platform.message_deliveries 
				(id, message_id, subscriber_id, status, max_attempts, schedule_time, create_time, update_time)
				VALUES ($1, $2, $3, 'pending', 5, NOW(), NOW(), NOW())`
			if _, err := e.db.Exec(txCtx, insertDelQuery, delID, msg.ID, sub.subscriberID); err != nil {
				return errors.E(op, fmt.Errorf("insert message delivery: %w", err))
			}
		}

		return nil
	})
	if err != nil {
		return errors.E(op, err)
	}

	select {
	case e.notifyCh <- struct{}{}:
	default:
	}

	return nil
}

// HeaderContextInjector creates a generic producer middleware that extracts a string metadata key from context into message headers.
func HeaderContextInjector(headerKey string, extractFn func(ctx context.Context) (string, bool)) ProducerMiddleware {
	return func(next PublishFunc) PublishFunc {
		return func(ctx context.Context, msg *Message) error {
			if msg.Headers == nil {
				msg.Headers = make(map[string]string)
			}
			if val, ok := extractFn(ctx); ok && val != "" && msg.Headers[headerKey] == "" {
				msg.Headers[headerKey] = val
			}
			return next(ctx, msg)
		}
	}
}

// HeaderContextUnpacker creates a generic consumer middleware that unpacks a header value back into worker execution context.
func HeaderContextUnpacker(headerKey string, injectFn func(ctx context.Context, val string) context.Context) ConsumerMiddleware {
	return func(next Handler) Handler {
		return func(ctx context.Context, msg Message) error {
			if val, ok := msg.Headers[headerKey]; ok && val != "" {
				ctx = injectFn(ctx, val)
			}
			return next(ctx, msg)
		}
	}
}

// TopicMetrics represents status counts for a single topic queue.
type TopicMetrics struct {
	Topic      string `json:"topic"`
	Pending    int64  `json:"pending"`
	Processing int64  `json:"processing"`
	Completed  int64  `json:"completed"`
	Failed     int64  `json:"failed"`
	Total      int64  `json:"total"`
}

// QueueMetrics represents aggregate queue status counts across all topics and broken down per topic.
type QueueMetrics struct {
	TotalPending    int64          `json:"total_pending"`
	TotalProcessing int64          `json:"total_processing"`
	TotalCompleted  int64          `json:"total_completed"`
	TotalFailed     int64          `json:"total_failed"`
	TotalDeliveries int64          `json:"total_deliveries"`
	Topics          []TopicMetrics `json:"topics"`
}

// ListDeliveriesFilter contains query filters and cursor pagination for querying message deliveries.
type ListDeliveriesFilter struct {
	Topic        string `json:"topic"`
	Status       string `json:"status"`
	SubscriberID string `json:"subscriber_id"`
	PageSize     int    `json:"page_size"`
	PageToken    string `json:"page_token"`
}

// GetMetrics returns aggregated queue metrics grouped by status and topic.
func (e *Engine) GetMetrics(ctx context.Context) (*QueueMetrics, error) {
	const op errors.Op = "platform/eventbus.GetMetrics"

	query := `SELECT 
		m.topic,
		d.status,
		COUNT(*) as count
		FROM platform.message_deliveries d
		JOIN platform.messages m ON d.message_id = m.id
		GROUP BY m.topic, d.status`

	var rows []struct {
		Topic  string `db:"topic"`
		Status string `db:"status"`
		Count  int64  `db:"count"`
	}

	if err := e.db.Select(ctx, &rows, query); err != nil {
		return nil, errors.E(op, err)
	}

	topicMap := make(map[string]*TopicMetrics)
	metrics := &QueueMetrics{
		Topics: make([]TopicMetrics, 0),
	}

	for _, r := range rows {
		tm, ok := topicMap[r.Topic]
		if !ok {
			tm = &TopicMetrics{Topic: r.Topic}
			topicMap[r.Topic] = tm
		}

		tm.Total += r.Count
		metrics.TotalDeliveries += r.Count

		switch r.Status {
		case "pending":
			tm.Pending += r.Count
			metrics.TotalPending += r.Count
		case "processing":
			tm.Processing += r.Count
			metrics.TotalProcessing += r.Count
		case "completed":
			tm.Completed += r.Count
			metrics.TotalCompleted += r.Count
		case "failed":
			tm.Failed += r.Count
			metrics.TotalFailed += r.Count
		}
	}

	for _, tm := range topicMap {
		metrics.Topics = append(metrics.Topics, *tm)
	}

	return metrics, nil
}

// ListDeliveries retrieves a page of delivery records using cursor-based keyset pagination.
func (e *Engine) ListDeliveries(ctx context.Context, filter ListDeliveriesFilter) (*paging.Page[*DeliveryRecord], error) {
	const op errors.Op = "platform/eventbus.ListDeliveries"

	pageSize := filter.PageSize
	if pageSize <= 0 {
		pageSize = 20
	}
	if pageSize > 100 {
		pageSize = 100
	}

	cursor, err := paging.Decode(filter.PageToken)
	if err != nil {
		return nil, errors.E(op, errors.Invalid, fmt.Errorf("invalid page token: %w", err))
	}

	query := `SELECT 
		d.id, d.message_id, d.subscriber_id, d.status, d.attempts, d.max_attempts, 
		COALESCE(d.last_error, '') as last_error, d.schedule_time, d.create_time, d.update_time,
		m.topic, m.headers AS headers_json, m.payload
		FROM platform.message_deliveries d
		JOIN platform.messages m ON d.message_id = m.id
		WHERE 1=1`

	args := make([]any, 0)
	argIdx := 1

	if filter.Topic != "" {
		query += fmt.Sprintf(" AND m.topic = $%d", argIdx)
		args = append(args, filter.Topic)
		argIdx++
	}

	if filter.Status != "" {
		query += fmt.Sprintf(" AND d.status = $%d", argIdx)
		args = append(args, filter.Status)
		argIdx++
	}

	if filter.SubscriberID != "" {
		query += fmt.Sprintf(" AND d.subscriber_id = $%d", argIdx)
		args = append(args, filter.SubscriberID)
		argIdx++
	}

	if cursor != nil {
		cursorTime, err := time.Parse(time.RFC3339Nano, cursor.SortValue)
		if err == nil {
			query += fmt.Sprintf(" AND (d.create_time, d.id) < ($%d, $%d)", argIdx, argIdx+1)
			args = append(args, cursorTime, cursor.ID)
			argIdx += 2
		}
	}

	query += fmt.Sprintf(" ORDER BY d.create_time DESC, d.id DESC LIMIT $%d", argIdx)
	args = append(args, pageSize+1)

	var records []*DeliveryRecord
	err = e.db.Select(ctx, &records, query, args...)
	if err != nil {
		return nil, errors.E(op, err)
	}

	return paging.NewPage(records, pageSize, func(item *DeliveryRecord) paging.Cursor {
		return paging.Cursor{
			SortValue: item.CreateTime.Format(time.RFC3339Nano),
			ID:        item.ID,
		}
	}), nil
}

// RetryDelivery resets a failed or stuck message delivery back to 'pending' state so a worker can re-process it.
func (e *Engine) RetryDelivery(ctx context.Context, deliveryID string) error {
	const op errors.Op = "platform/eventbus.RetryDelivery"

	query := `UPDATE platform.message_deliveries 
		SET status = 'pending', schedule_time = NOW(), update_time = NOW() 
		WHERE id = $1`
	err := e.db.ExecOne(ctx, query, deliveryID)
	if err != nil {
		return errors.E(op, err)
	}

	e.triggerNotify()
	return nil
}
