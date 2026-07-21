package scheduler

import (
	"context"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/id"
)

// ScheduleInfo represents a row in the platform.schedule database table.
type ScheduleInfo struct {
	ID             string    `db:"id"`
	JobType        string    `db:"job_type"`
	Payload        string    `db:"payload"`
	CronExpression string    `db:"cron_expression"`
	NextRunAt      time.Time `db:"next_run_at"`
	Status         string    `db:"status"`
	CreateTime     time.Time `db:"create_time"`
	UpdateTime     time.Time `db:"update_time"`
}

// JobInfo represents a row in the platform.job database table.
type JobInfo struct {
	ID          string    `db:"id"`
	ScheduleID  *string   `db:"schedule_id"`
	JobType     string    `db:"job_type"`
	Payload     string    `db:"payload"`
	RunAt       time.Time `db:"run_at"`
	Status      string    `db:"status"`
	Attempts    int       `db:"attempts"`
	MaxAttempts int       `db:"max_attempts"`
	LastError   *string   `db:"last_error"`
	CreateTime  time.Time `db:"create_time"`
	UpdateTime  time.Time `db:"update_time"`
}

// ListSchedules retrieves all cron schedules.
func (e *Engine) ListSchedules(ctx context.Context) ([]ScheduleInfo, error) {
	var schedules []ScheduleInfo
	query := `SELECT id, job_type, payload::text as payload, cron_expression, next_run_at, status, create_time, update_time 
		FROM platform.schedule ORDER BY create_time DESC`
	err := e.db.SelectContext(ctx, &schedules, query)
	return schedules, err
}

// ListJobs retrieves all queued jobs, optionally filtered by status.
func (e *Engine) ListJobs(ctx context.Context, status string) ([]JobInfo, error) {
	var jobs []JobInfo
	var err error
	if status != "" {
		query := `SELECT id, schedule_id, job_type, payload::text as payload, run_at, status, attempts, max_attempts, last_error, create_time, update_time 
			FROM platform.job WHERE status = $1 ORDER BY run_at ASC`
		err = e.db.SelectContext(ctx, &jobs, query, status)
	} else {
		query := `SELECT id, schedule_id, job_type, payload::text as payload, run_at, status, attempts, max_attempts, last_error, create_time, update_time 
			FROM platform.job ORDER BY run_at ASC`
		err = e.db.SelectContext(ctx, &jobs, query)
	}
	return jobs, err
}

// TriggerSchedule immediately spawns an execution job instance for the given schedule.
func (e *Engine) TriggerSchedule(ctx context.Context, scheduleID string) error {
	tx, err := e.db.BeginTxx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var s struct {
		JobType string `db:"job_type"`
		Payload []byte `db:"payload"`
	}
	query := `SELECT job_type, payload FROM platform.schedule WHERE id = $1`
	if err := tx.GetContext(ctx, &s, query, scheduleID); err != nil {
		return err
	}

	jobID, err := id.Generate("job_")
	if err != nil {
		return err
	}

	insertQuery := `INSERT INTO platform.job (id, schedule_id, job_type, payload, run_at, status) 
		VALUES ($1, $2, $3, $4, NOW(), 'pending')`
	_, err = tx.ExecContext(ctx, insertQuery, jobID, scheduleID, s.JobType, s.Payload)
	if err != nil {
		return err
	}

	return tx.Commit()
}

// PauseSchedule temporarily disables the cron template from spawning new jobs.
func (e *Engine) PauseSchedule(ctx context.Context, scheduleID string) error {
	query := `UPDATE platform.schedule SET status = 'paused', update_time = NOW() WHERE id = $1`
	_, err := e.db.ExecContext(ctx, query, scheduleID)
	return err
}

// ResumeSchedule enables a paused schedule template and computes its next run time.
func (e *Engine) ResumeSchedule(ctx context.Context, scheduleID string) error {
	tx, err := e.db.BeginTxx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var s struct {
		CronExpression string `db:"cron_expression"`
	}
	query := `SELECT cron_expression FROM platform.schedule WHERE id = $1`
	if err := tx.GetContext(ctx, &s, query, scheduleID); err != nil {
		return err
	}

	cronSched, err := e.cronParser.Parse(s.CronExpression)
	if err != nil {
		return err
	}
	nextRun := cronSched.Next(time.Now().UTC())

	updateQuery := `UPDATE platform.schedule SET status = 'active', next_run_at = $1, update_time = NOW() WHERE id = $2`
	_, err = tx.ExecContext(ctx, updateQuery, nextRun, scheduleID)
	if err != nil {
		return err
	}

	return tx.Commit()
}

// RetryJob resets attempts, clears errors, and triggers a failed job to execute immediately.
func (e *Engine) RetryJob(ctx context.Context, jobID string) error {
	query := `UPDATE platform.job 
		SET status = 'pending', attempts = 0, run_at = NOW(), last_error = NULL, update_time = NOW() 
		WHERE id = $1`
	_, err := e.db.ExecContext(ctx, query, jobID)
	return err
}

// DeleteJob cancels/kills a job instance by removing it from the queue.
func (e *Engine) DeleteJob(ctx context.Context, jobID string) error {
	query := `DELETE FROM platform.job WHERE id = $1`
	_, err := e.db.ExecContext(ctx, query, jobID)
	return err
}

// GetWorkerCount returns the configured number of workers.
func (e *Engine) GetWorkerCount() int {
	return e.workerCount
}

// GetQueueSize returns the total count of jobs currently in the queue.
func (e *Engine) GetQueueSize(ctx context.Context) (int, error) {
	var count int
	query := `SELECT COUNT(*) FROM platform.job`
	err := e.db.GetContext(ctx, &count, query)
	return count, err
}
