package platform_test

import (
	"fmt"
	"testing"
	"time"

	schedulerv1 "github.com/masterkeysrd/saturn/apis/saturn/platform/scheduler/v1"
	"github.com/masterkeysrd/saturn/internal/platform/scheduler"
	"github.com/masterkeysrd/saturn/tests/driver"
)

func TestSchedulerStatus(t *testing.T) {
	d := driver.New(t, testEnv)

	status, err := d.Platform().GetSchedulerStatus(t)
	if err != nil {
		t.Fatalf("failed to get scheduler status: %v", err)
	}

	if status.GetWorkerCount() <= 0 {
		t.Errorf("worker count = %d, want > 0", status.GetWorkerCount())
	}
	if status.GetQueueSize() < 0 {
		t.Errorf("queue size = %d, want >= 0", status.GetQueueSize())
	}
}

func TestScheduleLifecycleAndTrigger(t *testing.T) {
	d := driver.New(t, testEnv)

	scheduleID := fmt.Sprintf("sched_%d", time.Now().UnixNano())
	jobType := "platform.test_job"
	cronExpr := "0 0 12 * * *"

	// 1. Register a schedule in the engine
	err := d.Env().Scheduler().RegisterSchedule(t.Context(), scheduler.Schedule{
		ID:             scheduleID,
		JobType:        jobType,
		CronExpression: cronExpr,
		Payload:        map[string]string{"env": "test"},
	})
	if err != nil {
		t.Fatalf("failed to register schedule: %v", err)
	}

	// 2. List schedules and find the registered schedule
	resp, err := d.Platform().ListSchedules(t)
	if err != nil {
		t.Fatalf("failed to list schedules: %v", err)
	}

	var found *schedulerv1.ScheduleInfo
	for _, s := range resp.GetSchedules() {
		if s.GetId() == scheduleID {
			found = s
			break
		}
	}
	if found == nil {
		t.Fatalf("schedule %s not found in list", scheduleID)
	}
	if found.GetJobType() != jobType {
		t.Errorf("job_type = %s, want %s", found.GetJobType(), jobType)
	}
	if found.GetCronExpression() != cronExpr {
		t.Errorf("cron_expression = %s, want %s", found.GetCronExpression(), cronExpr)
	}
	if found.GetStatus() != "active" {
		t.Errorf("status = %s, want active", found.GetStatus())
	}

	// 3. Pause schedule
	if err := d.Platform().PauseSchedule(t, scheduleID); err != nil {
		t.Fatalf("failed to pause schedule: %v", err)
	}

	resp, err = d.Platform().ListSchedules(t)
	if err != nil {
		t.Fatalf("failed to list schedules after pause: %v", err)
	}
	found = nil
	for _, s := range resp.GetSchedules() {
		if s.GetId() == scheduleID {
			found = s
			break
		}
	}
	if found == nil || found.GetStatus() != "paused" {
		t.Fatalf("expected schedule %s to be paused, got: %+v", scheduleID, found)
	}

	// 4. Resume schedule
	if err := d.Platform().ResumeSchedule(t, scheduleID); err != nil {
		t.Fatalf("failed to resume schedule: %v", err)
	}

	resp, err = d.Platform().ListSchedules(t)
	if err != nil {
		t.Fatalf("failed to list schedules after resume: %v", err)
	}
	found = nil
	for _, s := range resp.GetSchedules() {
		if s.GetId() == scheduleID {
			found = s
			break
		}
	}
	if found == nil || found.GetStatus() != "active" {
		t.Fatalf("expected schedule %s to be active, got: %+v", scheduleID, found)
	}

	// 5. Trigger schedule immediately
	if err := d.Platform().TriggerSchedule(t, scheduleID); err != nil {
		t.Fatalf("failed to trigger schedule: %v", err)
	}

	// 6. Verify triggered job is present in jobs queue
	jobsResp, err := d.Platform().ListJobs(t, &schedulerv1.ListJobsRequest{})
	if err != nil {
		t.Fatalf("failed to list jobs: %v", err)
	}

	var triggeredJob *schedulerv1.JobInfo
	for _, j := range jobsResp.GetJobs() {
		if j.GetScheduleId() == scheduleID {
			triggeredJob = j
			break
		}
	}
	if triggeredJob == nil {
		t.Fatalf("no job found triggered from schedule %s", scheduleID)
	}
	if triggeredJob.GetJobType() != jobType {
		t.Errorf("job_type = %s, want %s", triggeredJob.GetJobType(), jobType)
	}
}

func TestJobRetryAndDelete(t *testing.T) {
	d := driver.New(t, testEnv)

	jobID := fmt.Sprintf("job_%d", time.Now().UnixNano())

	// 1. Insert a failed job directly in the database
	_, err := d.Env().DB.ExecContext(t.Context(), `
		INSERT INTO platform.job (id, job_type, payload, run_at, status, attempts, max_attempts, last_error, create_time, update_time)
		VALUES ($1, 'platform.failed_job', '{}', NOW(), 'failed', 5, 5, 'fatal crash', NOW(), NOW())
	`, jobID)
	if err != nil {
		t.Fatalf("failed to seed failed job: %v", err)
	}

	// 2. Verify job appears in ListJobs filtered by status 'failed'
	failedJobs, err := d.Platform().ListJobs(t, &schedulerv1.ListJobsRequest{Status: "failed"})
	if err != nil {
		t.Fatalf("failed to list failed jobs: %v", err)
	}
	var found *schedulerv1.JobInfo
	for _, j := range failedJobs.GetJobs() {
		if j.GetId() == jobID {
			found = j
			break
		}
	}
	if found == nil {
		t.Fatalf("failed job %s not found in list", jobID)
	}
	if found.GetLastError() != "fatal crash" {
		t.Errorf("last_error = %s, want fatal crash", found.GetLastError())
	}

	// 3. Retry the job
	if err := d.Platform().RetryJob(t, jobID); err != nil {
		t.Fatalf("failed to retry job: %v", err)
	}

	// Verify status transitioned from failed to pending with 0 attempts
	var status string
	var attempts int
	err = d.Env().DB.QueryRowContext(t.Context(), `SELECT status, attempts FROM platform.job WHERE id = $1`, jobID).Scan(&status, &attempts)
	if err != nil {
		t.Fatalf("failed to query retried job: %v", err)
	}
	if status != "pending" && status != "processing" {
		t.Errorf("retried job status = %s, want pending or processing", status)
	}
	if attempts != 0 {
		t.Errorf("retried job attempts = %d, want 0", attempts)
	}

	// 4. Delete the job
	if err := d.Platform().DeleteJob(t, jobID); err != nil {
		t.Fatalf("failed to delete job: %v", err)
	}

	// Verify job is removed from queue
	allJobs, err := d.Platform().ListJobs(t, &schedulerv1.ListJobsRequest{})
	if err != nil {
		t.Fatalf("failed to list jobs after delete: %v", err)
	}
	for _, j := range allJobs.GetJobs() {
		if j.GetId() == jobID {
			t.Errorf("job %s still exists after deletion", jobID)
		}
	}
}
