package scheduler

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/jmoiron/sqlx"
	"github.com/masterkeysrd/saturn/internal/platform/id"
	"github.com/robfig/cron/v3"
)

// Handler defines the callback function signature for a job type.
type Handler func(ctx context.Context, payload []byte) error

// Job represents a single execution task options to be queued.
type Job struct {
	JobType     string
	RunAt       time.Time
	Payload     interface{}
	MaxAttempts int // Optional: defaults to 5 if not set
}

// Schedule represents a recurring cron job trigger template.
type Schedule struct {
	ID             string
	JobType        string
	CronExpression string
	Payload        any
}

// Scheduler provides a system-wide interface for enqueuing one-off jobs and registering schedules.
type Scheduler interface {
	Enqueue(ctx context.Context, job Job) error
	RegisterSchedule(ctx context.Context, s Schedule) error
}

// jobInstance represents the database record of a job to be processed.
type jobInstance struct {
	ID          string `db:"id"`
	JobType     string `db:"job_type"`
	Payload     []byte `db:"payload"`
	Attempts    int    `db:"attempts"`
	MaxAttempts int    `db:"max_attempts"`
}

// Engine implements the Scheduler interface and manages background polling and job execution.
type Engine struct {
	db          *sqlx.DB
	handlers    map[string]Handler
	mu          sync.RWMutex
	cronParser  cron.Parser
	workerCount int
	jobQueue    chan jobInstance
}

// NewEngine instantiates a new scheduler Engine.
func NewEngine(db *sqlx.DB) *Engine {
	return &Engine{
		db:       db,
		handlers: make(map[string]Handler),
		cronParser: cron.NewParser(
			cron.Second | cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow | cron.Descriptor,
		),
		workerCount: 5, // Default to 5 workers
	}
}

// WithWorkerCount overrides the default worker pool size.
func (e *Engine) WithWorkerCount(count int) *Engine {
	if count > 0 {
		e.workerCount = count
	}
	return e
}

// Register registers a job callback handler for a given jobType.
func (e *Engine) Register(jobType string, handler Handler) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.handlers[jobType] = handler
}

// Enqueue inserts a one-off deferred job instance in the queue.
func (e *Engine) Enqueue(ctx context.Context, job Job) error {
	payloadBytes, err := json.Marshal(job.Payload)
	if err != nil {
		return fmt.Errorf("marshal job payload: %w", err)
	}

	jobID, err := id.Generate("job_")
	if err != nil {
		return fmt.Errorf("generate job ID: %w", err)
	}

	maxAttempts := job.MaxAttempts
	if maxAttempts <= 0 {
		maxAttempts = 5
	}

	query := `INSERT INTO platform.job (id, job_type, payload, run_at, max_attempts) VALUES ($1, $2, $3, $4, $5)`
	_, err = e.db.ExecContext(ctx, query, jobID, job.JobType, payloadBytes, job.RunAt.UTC(), maxAttempts)
	if err != nil {
		return fmt.Errorf("insert job: %w", err)
	}

	return nil
}

// RegisterSchedule registers or updates a recurrent job schedule.
func (e *Engine) RegisterSchedule(ctx context.Context, s Schedule) error {
	schedule, err := e.cronParser.Parse(s.CronExpression)
	if err != nil {
		return fmt.Errorf("invalid cron expression %q: %w", s.CronExpression, err)
	}

	payloadBytes, err := json.Marshal(s.Payload)
	if err != nil {
		return fmt.Errorf("marshal schedule payload: %w", err)
	}

	// Calculate the first execution time
	nextRunAt := schedule.Next(time.Now().UTC())

	query := `INSERT INTO platform.schedule (id, job_type, payload, cron_expression, next_run_at, status)
		VALUES ($1, $2, $3, $4, $5, 'active')
		ON CONFLICT (id) DO UPDATE SET
			job_type = EXCLUDED.job_type,
			payload = EXCLUDED.payload,
			cron_expression = EXCLUDED.cron_expression,
			next_run_at = EXCLUDED.next_run_at,
			status = 'active',
			update_time = NOW()`

	_, err = e.db.ExecContext(ctx, query, s.ID, s.JobType, payloadBytes, s.CronExpression, nextRunAt)
	if err != nil {
		return fmt.Errorf("register schedule: %w", err)
	}

	return nil
}

// getHandler retrieves a handler in a thread-safe way.
func (e *Engine) getHandler(jobType string) (Handler, bool) {
	e.mu.RLock()
	defer e.mu.RUnlock()
	h, exists := e.handlers[jobType]
	return h, exists
}
