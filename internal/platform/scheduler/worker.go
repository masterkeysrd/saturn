package scheduler

import (
	"context"
	"fmt"
	"math/rand/v2"
	"runtime/debug"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/id"
	"github.com/masterkeysrd/saturn/internal/platform/log"
	"github.com/masterkeysrd/saturn/internal/platform/requestid"
)

// Start begins the background loops for spawning cron schedules, recovering stale jobs, and executing pending jobs.
func (e *Engine) Start(ctx context.Context) {
	workerCtx, cancel := context.WithCancel(ctx)
	e.mu.Lock()
	e.cancel = cancel
	e.jobQueue = make(chan jobInstance, 100)
	e.mu.Unlock()

	// Start the pool of concurrent workers
	for range e.workerCount {
		e.wg.Go(func() {
			e.runJobWorker(workerCtx)
		})
	}

	// Spawner loop: checks for recurrent schedules due to run (every 30 seconds)
	e.wg.Go(func() {
		e.runSpawnerLoop(workerCtx)
	})

	// Executor loop: checks for pending jobs in the queue (every 5 seconds)
	e.wg.Go(func() {
		e.runExecutorLoop(workerCtx)
	})

	// Stale recovery loop: resets jobs stuck in 'processing' beyond staleJobTimeout
	e.wg.Go(func() {
		e.runStaleRecoveryLoop(workerCtx)
	})
}

// Shutdown cancels background loops and waits for all active job workers to finish
// or until ctx expires.
func (e *Engine) Shutdown(ctx context.Context) error {
	e.mu.Lock()
	cancel := e.cancel
	e.cancel = nil
	e.mu.Unlock()

	if cancel != nil {
		cancel()
	}

	done := make(chan struct{})
	go func() {
		e.wg.Wait()
		close(done)
	}()

	select {
	case <-done:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (e *Engine) runStaleRecoveryLoop(ctx context.Context) {
	if err := e.RecoverStaleJobs(ctx); err != nil {
		log.Error(ctx, "failed initial stale scheduler job recovery", log.Err(err))
	}

	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			if err := e.RecoverStaleJobs(ctx); err != nil {
				log.Error(ctx, "failed to recover stale scheduler jobs", log.Err(err))
			}
		case <-ctx.Done():
			return
		}
	}
}

// RecoverStaleJobs resets jobs stuck in 'processing' state beyond staleJobTimeout back to 'pending'.
func (e *Engine) RecoverStaleJobs(ctx context.Context) error {
	const op errors.Op = "platform/scheduler.RecoverStaleJobs"

	timeout := e.staleJobTimeout
	if timeout <= 0 {
		timeout = 5 * time.Minute
	}
	cutoff := time.Now().UTC().Add(-timeout)

	query := `UPDATE platform.job SET status = 'pending', update_time = NOW() WHERE status = 'processing' AND update_time < $1`
	if _, err := e.db.Exec(ctx, query, cutoff); err != nil {
		return errors.E(op, err)
	}
	return nil
}

func (e *Engine) runSpawnerLoop(ctx context.Context) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			if err := e.spawnRecurrentJobs(ctx); err != nil {
				log.Error(ctx, "scheduler spawner execution error", log.Err(err))
			}
			// Prune completed jobs older than 24 hours to keep the table clean
			if _, err := e.db.Exec(ctx, `DELETE FROM platform.job WHERE status = 'completed' AND update_time < NOW() - INTERVAL '24 hours'`); err != nil {
				log.Error(ctx, "scheduler job pruning error", log.Err(err))
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
				log.Error(ctx, "scheduler executor execution error", log.Err(err))
			}
		case <-ctx.Done():
			return
		}
	}
}

func (e *Engine) runJobWorker(ctx context.Context) {
	for {
		if ctx.Err() != nil {
			e.drainJobQueue()
			return
		}
		select {
		case j, ok := <-e.jobQueue:
			if !ok {
				return
			}
			if ctx.Err() != nil {
				e.revertJobToPending(j.ID)
				e.drainJobQueue()
				return
			}
			e.executeJobInstance(ctx, j)
		case <-ctx.Done():
			e.drainJobQueue()
			return
		}
	}
}

func (e *Engine) drainJobQueue() {
	for {
		select {
		case j, ok := <-e.jobQueue:
			if !ok {
				return
			}
			e.revertJobToPending(j.ID)
		default:
			return
		}
	}
}

func (e *Engine) revertJobToPending(jobID string) {
	revertCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, _ = e.db.Exec(revertCtx, `UPDATE platform.job SET status = 'pending', update_time = NOW() WHERE id = $1 AND status = 'processing'`, jobID)
}

func (e *Engine) spawnRecurrentJobs(ctx context.Context) error {
	const op errors.Op = "platform/scheduler.spawnRecurrentJobs"

	return e.db.WithTx(ctx, func(txCtx context.Context) error {
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

		if err := e.db.Select(txCtx, &schedules, query); err != nil {
			return errors.E(op, err)
		}

		for _, s := range schedules {
			cronSched, err := e.cronParser.Parse(s.CronExpression)
			if err != nil {
				log.Error(txCtx, "invalid cron expression in active schedule", log.String("id", s.ID), log.String("cron", s.CronExpression), log.Err(err))
				continue
			}
			nextRun := cronSched.Next(time.Now().UTC())

			jobID, err := id.Generate("job_")
			if err != nil {
				return errors.E(op, err)
			}

			// Spawn the job instance linked to the schedule with max_attempts = 1 to prevent stampedes
			insertQuery := `INSERT INTO platform.job (id, schedule_id, job_type, payload, run_at, max_attempts, status) 
				VALUES ($1, $2, $3, $4, $5, 1, 'pending')`
			_, err = e.db.Exec(txCtx, insertQuery, jobID, s.ID, s.JobType, s.Payload, s.NextRunAt)
			if err != nil {
				return errors.E(op, err)
			}

			// Advance the schedule next_run_at time
			updateQuery := `UPDATE platform.schedule SET next_run_at = $1, update_time = NOW() WHERE id = $2`
			err = e.db.ExecOne(txCtx, updateQuery, nextRun, s.ID)
			if err != nil {
				return errors.E(op, err)
			}
		}

		return nil
	})
}

func (e *Engine) executePendingJobs(ctx context.Context) error {
	const op errors.Op = "platform/scheduler.executePendingJobs"

	var jobs []jobInstance

	// 1. Claim ready jobs (quick transaction)
	err := e.db.WithTx(ctx, func(txCtx context.Context) error {
		query := `SELECT id, job_type, payload, attempts, max_attempts 
			FROM platform.job 
			WHERE run_at <= NOW() AND status = 'pending'
			LIMIT 10 
			FOR UPDATE SKIP LOCKED`

		if err := e.db.Select(txCtx, &jobs, query); err != nil {
			return errors.E(op, err)
		}

		if len(jobs) == 0 {
			return nil
		}

		// Immediately transition jobs to 'processing' to release row locks on commit
		for _, j := range jobs {
			err := e.db.ExecOne(txCtx, `UPDATE platform.job SET status = 'processing', update_time = NOW() WHERE id = $1`, j.ID)
			if err != nil {
				return errors.E(op, err)
			}
		}

		return nil
	})
	if err != nil {
		return errors.E(op, err)
	}

	if len(jobs) == 0 {
		return nil
	}

	// 2. Dispatch jobs to the concurrent worker channel
	for _, j := range jobs {
		select {
		case e.jobQueue <- j:
			// Successfully queued
		default:
			// Queue is full (backpressure), revert job status back to pending
			// so another worker instance or poller tick can claim it later
			log.Warn(ctx, "scheduler worker queue full; reverting job to pending",
				log.String("job_id", j.ID),
				log.String("job_type", j.JobType),
			)
			_, _ = e.db.Exec(ctx, `UPDATE platform.job SET status = 'pending', update_time = NOW() WHERE id = $1`, j.ID)
		}
	}

	return nil
}

func (e *Engine) executeJobInstance(ctx context.Context, j jobInstance) {
	ctx, _ = requestid.FromOrNew(ctx)
	start := time.Now()

	defer func() {
		if r := recover(); r != nil {
			log.Error(ctx, "panic recovered during scheduler job execution",
				log.String("job_id", j.ID),
				log.String("job_type", j.JobType),
				log.Any("panic", r),
				log.String("stack", string(debug.Stack())),
			)
			nextAttempt := j.Attempts + 1
			status := "pending"
			if nextAttempt >= j.MaxAttempts {
				status = "failed"
			}
			backoffMinutes := nextAttempt * 5
			runAt := time.Now().Add(time.Duration(backoffMinutes) * time.Minute).UTC()
			panicErr := fmt.Sprintf("panic: %v", r)
			updateCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			_, _ = e.db.Exec(updateCtx, `UPDATE platform.job 
				SET status = $1, attempts = $2, run_at = $3, last_error = $4, update_time = NOW() 
				WHERE id = $5`, status, nextAttempt, runAt, panicErr, j.ID)
			cancel()
		}
	}()

	handler, exists := e.getHandler(j.JobType)
	if !exists {
		errMsg := fmt.Sprintf("no handler registered for job type %q", j.JobType)
		log.Error(ctx, "no handler registered for scheduler job",
			log.String("job_id", j.ID),
			log.String("job_type", j.JobType),
		)
		updateCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		_, _ = e.db.Exec(updateCtx, `UPDATE platform.job SET status = 'failed', last_error = $1, update_time = NOW() WHERE id = $2`, errMsg, j.ID)
		cancel()
		return
	}

	err := handler(ctx, j.Payload)
	if err != nil {
		nextAttempt := j.Attempts + 1
		status := "pending"

		// Terminal error classification: non-retryable errors fail immediately
		// rather than creating redundant retry stampedes.
		isTerminal := errors.Is(err, errors.Invalid) ||
			errors.Is(err, errors.Permission) ||
			errors.Is(err, errors.NotExist)

		if isTerminal || nextAttempt >= j.MaxAttempts {
			status = "failed"
		}

		// Backoff with randomized jitter (±25%) to prevent thundering herd stampedes
		baseMinutes := float64(nextAttempt * 5)
		jitterFactor := 0.75 + rand.Float64()*0.5
		jitterDuration := time.Duration(baseMinutes * jitterFactor * float64(time.Minute))
		runAt := time.Now().Add(jitterDuration).UTC()

		if status == "failed" {
			reason := "max attempts reached"
			if isTerminal {
				reason = "non-retryable terminal error"
			}
			log.Error(ctx, "scheduler job failed permanently ("+reason+")",
				log.String("job_id", j.ID),
				log.String("job_type", j.JobType),
				log.Int("attempts", nextAttempt),
				log.Int("max_attempts", j.MaxAttempts),
				log.Bool("terminal", isTerminal),
				log.Duration("duration", time.Since(start)),
				log.Err(err),
			)
		} else {
			log.Warn(ctx, "scheduler job failed; scheduled retry with jitter",
				log.String("job_id", j.ID),
				log.String("job_type", j.JobType),
				log.Int("attempt", nextAttempt),
				log.Int("max_attempts", j.MaxAttempts),
				log.Time("next_run_at", runAt),
				log.Duration("duration", time.Since(start)),
				log.Err(err),
			)
		}

		updateCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		_, _ = e.db.Exec(updateCtx, `UPDATE platform.job 
			SET status = $1, attempts = $2, run_at = $3, last_error = $4, update_time = NOW() 
			WHERE id = $5`, status, nextAttempt, runAt, err.Error(), j.ID)
		cancel()
	} else {
		// Success -> Transition status to 'completed'
		log.Info(ctx, "scheduler job completed successfully",
			log.String("job_id", j.ID),
			log.String("job_type", j.JobType),
			log.Duration("duration", time.Since(start)),
		)
		updateCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		_, _ = e.db.Exec(updateCtx, `UPDATE platform.job SET status = 'completed', update_time = NOW() WHERE id = $1`, j.ID)
		cancel()
	}
}
