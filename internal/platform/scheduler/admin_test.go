package scheduler

import (
	"context"
	"errors"
	"reflect"
	"testing"
)

func TestEngineListSchedules(t *testing.T) {
	ctx := context.Background()

	t.Run("Success", func(t *testing.T) {
		dbMock := &DatabaseMock{
			SelectFunc: func(ctx context.Context, dest any, query string, args ...any) error {
				ptr := dest.(*[]ScheduleInfo)
				*ptr = append(*ptr, ScheduleInfo{
					ID:             "sched_1",
					JobType:        "test.job",
					CronExpression: "0 0 12 * * *",
					Status:         "active",
				})
				return nil
			},
		}

		engine := NewEngine(dbMock)
		schedules, err := engine.ListSchedules(ctx)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(schedules) != 1 || schedules[0].ID != "sched_1" {
			t.Fatalf("expected 1 schedule with ID sched_1, got %v", schedules)
		}
	})

	t.Run("Database error", func(t *testing.T) {
		dbMock := &DatabaseMock{
			SelectFunc: func(ctx context.Context, dest any, query string, args ...any) error {
				return errors.New("db select error")
			},
		}

		engine := NewEngine(dbMock)
		_, err := engine.ListSchedules(ctx)
		if err == nil {
			t.Fatal("expected error, got nil")
		}
	})
}

func TestEngineListJobs(t *testing.T) {
	ctx := context.Background()

	t.Run("Without status filter", func(t *testing.T) {
		dbMock := &DatabaseMock{
			SelectFunc: func(ctx context.Context, dest any, query string, args ...any) error {
				if len(args) != 0 {
					t.Errorf("expected 0 args for unfiltered query, got %d", len(args))
				}
				ptr := dest.(*[]JobInfo)
				*ptr = append(*ptr, JobInfo{ID: "job_1", Status: "pending"})
				return nil
			},
		}

		engine := NewEngine(dbMock)
		jobs, err := engine.ListJobs(ctx, "")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(jobs) != 1 || jobs[0].ID != "job_1" {
			t.Fatalf("expected 1 job with ID job_1, got %v", jobs)
		}
	})

	t.Run("With status filter", func(t *testing.T) {
		dbMock := &DatabaseMock{
			SelectFunc: func(ctx context.Context, dest any, query string, args ...any) error {
				if len(args) != 1 || args[0] != "failed" {
					t.Errorf("expected arg 'failed', got %v", args)
				}
				ptr := dest.(*[]JobInfo)
				*ptr = append(*ptr, JobInfo{ID: "job_2", Status: "failed"})
				return nil
			},
		}

		engine := NewEngine(dbMock)
		jobs, err := engine.ListJobs(ctx, "failed")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(jobs) != 1 || jobs[0].Status != "failed" {
			t.Fatalf("expected 1 failed job, got %v", jobs)
		}
	})

	t.Run("Database error", func(t *testing.T) {
		dbMock := &DatabaseMock{
			SelectFunc: func(ctx context.Context, dest any, query string, args ...any) error {
				return errors.New("query error")
			},
		}

		engine := NewEngine(dbMock)
		_, err := engine.ListJobs(ctx, "")
		if err == nil {
			t.Fatal("expected error, got nil")
		}
	})
}

func TestEngineTriggerSchedule(t *testing.T) {
	ctx := context.Background()

	t.Run("Success", func(t *testing.T) {
		var execOneCalled bool
		dbMock := &DatabaseMock{
			WithTxFunc: func(ctx context.Context, fn func(ctx context.Context) error) error {
				return fn(ctx)
			},
			GetFunc: func(ctx context.Context, dest any, query string, args ...any) error {
				val := reflect.ValueOf(dest).Elem()
				val.FieldByName("JobType").SetString("backup.run")
				val.FieldByName("Payload").SetBytes([]byte("{}"))
				return nil
			},
			ExecOneFunc: func(ctx context.Context, query string, args ...any) error {
				execOneCalled = true
				if args[1] != "sched_1" || args[2] != "backup.run" {
					t.Errorf("unexpected args: %v", args)
				}
				return nil
			},
		}

		engine := NewEngine(dbMock)
		err := engine.TriggerSchedule(ctx, "sched_1")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !execOneCalled {
			t.Error("expected db.ExecOne to be called")
		}
	})

	t.Run("Schedule not found", func(t *testing.T) {
		dbMock := &DatabaseMock{
			WithTxFunc: func(ctx context.Context, fn func(ctx context.Context) error) error {
				return fn(ctx)
			},
			GetFunc: func(ctx context.Context, dest any, query string, args ...any) error {
				return errors.New("schedule not found")
			},
		}

		engine := NewEngine(dbMock)
		err := engine.TriggerSchedule(ctx, "nonexistent")
		if err == nil {
			t.Fatal("expected error, got nil")
		}
	})

	t.Run("Insert job error", func(t *testing.T) {
		dbMock := &DatabaseMock{
			WithTxFunc: func(ctx context.Context, fn func(ctx context.Context) error) error {
				return fn(ctx)
			},
			GetFunc: func(ctx context.Context, dest any, query string, args ...any) error {
				val := reflect.ValueOf(dest).Elem()
				val.FieldByName("JobType").SetString("backup.run")
				return nil
			},
			ExecOneFunc: func(ctx context.Context, query string, args ...any) error {
				return errors.New("insert failed")
			},
		}

		engine := NewEngine(dbMock)
		err := engine.TriggerSchedule(ctx, "sched_1")
		if err == nil {
			t.Fatal("expected error, got nil")
		}
	})
}

func TestEnginePauseSchedule(t *testing.T) {
	ctx := context.Background()

	t.Run("Success", func(t *testing.T) {
		var execOneCalled bool
		dbMock := &DatabaseMock{
			ExecOneFunc: func(ctx context.Context, query string, args ...any) error {
				execOneCalled = true
				if args[0] != "sched_1" {
					t.Errorf("expected schedule_id=sched_1, got %v", args[0])
				}
				return nil
			},
		}

		engine := NewEngine(dbMock)
		err := engine.PauseSchedule(ctx, "sched_1")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !execOneCalled {
			t.Error("expected db.ExecOne to be called")
		}
	})

	t.Run("Database error", func(t *testing.T) {
		dbMock := &DatabaseMock{
			ExecOneFunc: func(ctx context.Context, query string, args ...any) error {
				return errors.New("update failed")
			},
		}

		engine := NewEngine(dbMock)
		err := engine.PauseSchedule(ctx, "sched_1")
		if err == nil {
			t.Fatal("expected error, got nil")
		}
	})
}

func TestEngineResumeSchedule(t *testing.T) {
	ctx := context.Background()

	t.Run("Success", func(t *testing.T) {
		var execOneCalled bool
		dbMock := &DatabaseMock{
			WithTxFunc: func(ctx context.Context, fn func(ctx context.Context) error) error {
				return fn(ctx)
			},
			GetFunc: func(ctx context.Context, dest any, query string, args ...any) error {
				val := reflect.ValueOf(dest).Elem()
				val.FieldByName("CronExpression").SetString("0 0 12 * * *")
				return nil
			},
			ExecOneFunc: func(ctx context.Context, query string, args ...any) error {
				execOneCalled = true
				if args[1] != "sched_1" {
					t.Errorf("expected sched_1, got %v", args[1])
				}
				return nil
			},
		}

		engine := NewEngine(dbMock)
		err := engine.ResumeSchedule(ctx, "sched_1")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !execOneCalled {
			t.Error("expected db.ExecOne to be called")
		}
	})

	t.Run("Invalid cron expression", func(t *testing.T) {
		dbMock := &DatabaseMock{
			WithTxFunc: func(ctx context.Context, fn func(ctx context.Context) error) error {
				return fn(ctx)
			},
			GetFunc: func(ctx context.Context, dest any, query string, args ...any) error {
				val := reflect.ValueOf(dest).Elem()
				val.FieldByName("CronExpression").SetString("broken-cron")
				return nil
			},
		}

		engine := NewEngine(dbMock)
		err := engine.ResumeSchedule(ctx, "sched_1")
		if err == nil {
			t.Fatal("expected error for invalid cron, got nil")
		}
	})

	t.Run("Schedule not found", func(t *testing.T) {
		dbMock := &DatabaseMock{
			WithTxFunc: func(ctx context.Context, fn func(ctx context.Context) error) error {
				return fn(ctx)
			},
			GetFunc: func(ctx context.Context, dest any, query string, args ...any) error {
				return errors.New("schedule not found")
			},
		}

		engine := NewEngine(dbMock)
		err := engine.ResumeSchedule(ctx, "nonexistent")
		if err == nil {
			t.Fatal("expected error, got nil")
		}
	})
}

func TestEngineRetryJob(t *testing.T) {
	ctx := context.Background()

	t.Run("Success", func(t *testing.T) {
		var execOneCalled bool
		dbMock := &DatabaseMock{
			ExecOneFunc: func(ctx context.Context, query string, args ...any) error {
				execOneCalled = true
				if args[0] != "job_retry" {
					t.Errorf("expected job_retry, got %v", args[0])
				}
				return nil
			},
		}

		engine := NewEngine(dbMock)
		err := engine.RetryJob(ctx, "job_retry")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !execOneCalled {
			t.Error("expected db.ExecOne to be called")
		}
	})

	t.Run("Database error", func(t *testing.T) {
		dbMock := &DatabaseMock{
			ExecOneFunc: func(ctx context.Context, query string, args ...any) error {
				return errors.New("retry failed")
			},
		}

		engine := NewEngine(dbMock)
		err := engine.RetryJob(ctx, "job_retry")
		if err == nil {
			t.Fatal("expected error, got nil")
		}
	})
}

func TestEngineDeleteJob(t *testing.T) {
	ctx := context.Background()

	t.Run("Success", func(t *testing.T) {
		var execOneCalled bool
		dbMock := &DatabaseMock{
			ExecOneFunc: func(ctx context.Context, query string, args ...any) error {
				execOneCalled = true
				if args[0] != "job_del" {
					t.Errorf("expected job_del, got %v", args[0])
				}
				return nil
			},
		}

		engine := NewEngine(dbMock)
		err := engine.DeleteJob(ctx, "job_del")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !execOneCalled {
			t.Error("expected db.ExecOne to be called")
		}
	})

	t.Run("Database error", func(t *testing.T) {
		dbMock := &DatabaseMock{
			ExecOneFunc: func(ctx context.Context, query string, args ...any) error {
				return errors.New("delete failed")
			},
		}

		engine := NewEngine(dbMock)
		err := engine.DeleteJob(ctx, "job_del")
		if err == nil {
			t.Fatal("expected error, got nil")
		}
	})
}

func TestEngineQueueAndWorkers(t *testing.T) {
	ctx := context.Background()

	t.Run("GetWorkerCount", func(t *testing.T) {
		engine := NewEngine(nil).WithWorkerCount(8)
		if engine.GetWorkerCount() != 8 {
			t.Errorf("worker count = %d, want 8", engine.GetWorkerCount())
		}
	})

	t.Run("GetQueueSize success", func(t *testing.T) {
		dbMock := &DatabaseMock{
			GetFunc: func(ctx context.Context, dest any, query string, args ...any) error {
				val := dest.(*int)
				*val = 42
				return nil
			},
		}

		engine := NewEngine(dbMock)
		count, err := engine.GetQueueSize(ctx)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if count != 42 {
			t.Errorf("queue size = %d, want 42", count)
		}
	})

	t.Run("GetQueueSize database error", func(t *testing.T) {
		dbMock := &DatabaseMock{
			GetFunc: func(ctx context.Context, dest any, query string, args ...any) error {
				return errors.New("count failed")
			},
		}

		engine := NewEngine(dbMock)
		_, err := engine.GetQueueSize(ctx)
		if err == nil {
			t.Fatal("expected error, got nil")
		}
	})
}
