package scheduler

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/id"
)

// Start begins the background loops for spawning cron schedules and executing pending jobs.
func (e *Engine) Start(ctx context.Context) {
	// Initialize the job execution queue channel
	e.jobQueue = make(chan jobInstance, 100)

	// Start the pool of concurrent workers
	for i := 0; i < e.workerCount; i++ {
		go e.runJobWorker(ctx)
	}

	// Spawner loop: checks for recurrent schedules due to run (every 30 seconds)
	go e.runSpawnerLoop(ctx)

	// Executor loop: checks for pending jobs in the queue (every 5 seconds)
	go e.runExecutorLoop(ctx)
}

func (e *Engine) runSpawnerLoop(ctx context.Context) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			if err := e.spawnRecurrentJobs(ctx); err != nil {
				slog.Error("scheduler spawner execution error", "err", err)
			}
			// Prune completed jobs older than 24 hours to keep the table clean
			if _, err := e.db.ExecContext(ctx, `DELETE FROM platform.job WHERE status = 'completed' AND update_time < NOW() - INTERVAL '24 hours'`); err != nil {
				slog.Error("scheduler job pruning error", "err", err)
			}
		case <-ctx.Done():
			return
		}
	}
}

func (e *Engine) runExecutorLoop(ctx context.Context) {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			if err := e.executePendingJobs(ctx); err != nil {
				slog.Error("scheduler executor execution error", "err", err)
			}
		case <-ctx.Done():
			return
		}
	}
}

func (e *Engine) runJobWorker(ctx context.Context) {
	for {
		select {
		case j, ok := <-e.jobQueue:
			if !ok {
				return
			}
			e.executeJobInstance(ctx, j)
		case <-ctx.Done():
			return
		}
	}
}

func (e *Engine) spawnRecurrentJobs(ctx context.Context) error {
	tx, err := e.db.BeginTxx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Select active schedules that are due to spawn a job
	var schedules []struct {
		ID             string    `db:"id"`
		JobType        string    `db:"job_type"`
		Payload        []byte    `db:"payload"`
		CronExpression string    `db:"cron_expression"`
		NextRunAt      time.Time `db:"next_run_at"`
	}

	query := `SELECT id, job_type, payload, cron_expression, next_run_at 
		FROM platform.schedule 
		WHERE next_run_at <= NOW() AND status = 'active'
		FOR UPDATE SKIP LOCKED`

	if err := tx.SelectContext(ctx, &schedules, query); err != nil {
		return err
	}

	for _, s := range schedules {
		cronSched, err := e.cronParser.Parse(s.CronExpression)
		if err != nil {
			slog.Error("invalid cron expression in active schedule", "id", s.ID, "cron", s.CronExpression, "err", err)
			continue
		}
		nextRun := cronSched.Next(time.Now().UTC())

		jobID, err := id.Generate("job_")
		if err != nil {
			return err
		}

		// Spawn the job instance linked to the schedule
		insertQuery := `INSERT INTO platform.job (id, schedule_id, job_type, payload, run_at, status) 
			VALUES ($1, $2, $3, $4, $5, 'pending')`
		_, err = tx.ExecContext(ctx, insertQuery, jobID, s.ID, s.JobType, s.Payload, s.NextRunAt)
		if err != nil {
			return err
		}

		// Advance the schedule next_run_at time
		updateQuery := `UPDATE platform.schedule SET next_run_at = $1, update_time = NOW() WHERE id = $2`
		_, err = tx.ExecContext(ctx, updateQuery, nextRun, s.ID)
		if err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (e *Engine) executePendingJobs(ctx context.Context) error {
	// 1. Claim ready jobs (quick transaction)
	tx, err := e.db.BeginTxx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var jobs []jobInstance

	query := `SELECT id, job_type, payload, attempts, max_attempts 
		FROM platform.job 
		WHERE run_at <= NOW() AND status = 'pending'
		LIMIT 10 
		FOR UPDATE SKIP LOCKED`

	if err := tx.SelectContext(ctx, &jobs, query); err != nil {
		return err
	}

	if len(jobs) == 0 {
		return nil
	}

	// Immediately transition jobs to 'processing' to release row locks on commit
	for _, j := range jobs {
		_, err = tx.ExecContext(ctx, `UPDATE platform.job SET status = 'processing', update_time = NOW() WHERE id = $1`, j.ID)
		if err != nil {
			return err
		}
	}

	if err := tx.Commit(); err != nil {
		return err
	}

	// 2. Dispatch jobs to the concurrent worker channel
	for _, j := range jobs {
		select {
		case e.jobQueue <- j:
			// Successfully queued
		default:
			// Queue is full (backpressure), revert job status back to pending
			// so another worker instance or poller tick can claim it later
			_, _ = e.db.ExecContext(ctx, `UPDATE platform.job SET status = 'pending', update_time = NOW() WHERE id = $1`, j.ID)
		}
	}

	return nil
}

func (e *Engine) executeJobInstance(ctx context.Context, j jobInstance) {
	handler, exists := e.getHandler(j.JobType)
	if !exists {
		errMsg := fmt.Sprintf("no handler registered for job type %q", j.JobType)
		_, _ = e.db.ExecContext(ctx, `UPDATE platform.job SET status = 'failed', last_error = $1, update_time = NOW() WHERE id = $2`, errMsg, j.ID)
		return
	}

	err := handler(ctx, j.Payload)
	if err != nil {
		nextAttempt := j.Attempts + 1
		status := "pending"
		if nextAttempt >= j.MaxAttempts {
			status = "failed"
		}
		// Exponential backoff: 5m, 10m, 15m...
		backoffMinutes := nextAttempt * 5
		runAt := time.Now().Add(time.Duration(backoffMinutes) * time.Minute).UTC()

		_, _ = e.db.ExecContext(ctx, `UPDATE platform.job 
			SET status = $1, attempts = $2, run_at = $3, last_error = $4, update_time = NOW() 
			WHERE id = $5`, status, nextAttempt, runAt, err.Error(), j.ID)
	} else {
		// Success -> Transition status to 'completed'
		_, _ = e.db.ExecContext(ctx, `UPDATE platform.job SET status = 'completed', update_time = NOW() WHERE id = $1`, j.ID)
	}
}
