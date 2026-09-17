package scheduler

import (
	"context"
	"database/sql"
	"errors"
	"math"
	"testing"
	"time"
)

func TestEngineRegisterAndGetHandler(t *testing.T) {
	engine := NewEngine(nil)

	called := false
	handler := func(ctx context.Context, payload []byte) error {
		called = true
		return nil
	}

	engine.Register("test.job", handler)

	h, exists := engine.getHandler("test.job")
	if !exists {
		t.Fatal("expected handler to exist")
	}

	err := h(context.Background(), nil)
	if err != nil {
		t.Fatalf("unexpected error calling handler: %v", err)
	}

	if !called {
		t.Error("expected handler to have been called")
	}

	_, exists = engine.getHandler("nonexistent.job")
	if exists {
		t.Error("expected nonexistent handler to not exist")
	}
}

func TestEngineCronParsing(t *testing.T) {
	engine := NewEngine(nil)

	// Valid cron expression: every 5 seconds
	cronExpr := "*/5 * * * * *"
	schedule, err := engine.cronParser.Parse(cronExpr)
	if err != nil {
		t.Fatalf("unexpected error parsing valid cron: %v", err)
	}

	now := time.Date(2026, 7, 20, 12, 0, 0, 0, time.UTC)
	next := schedule.Next(now)

	expectedNext := time.Date(2026, 7, 20, 12, 0, 5, 0, time.UTC)
	if !next.Equal(expectedNext) {
		t.Errorf("expected next run to be %v, got %v", expectedNext, next)
	}

	// Invalid cron expression
	_, err = engine.cronParser.Parse("invalid expression")
	if err == nil {
		t.Error("expected error parsing invalid cron expression")
	}
}

func TestEngineWithWorkerCount(t *testing.T) {
	engine := NewEngine(nil)
	if engine.workerCount != 5 {
		t.Errorf("default worker count = %d, want 5", engine.workerCount)
	}

	engine.WithWorkerCount(10)
	if engine.workerCount != 10 {
		t.Errorf("updated worker count = %d, want 10", engine.workerCount)
	}

	// Non-positive count should be ignored
	engine.WithWorkerCount(0)
	if engine.workerCount != 10 {
		t.Errorf("worker count = %d after WithWorkerCount(0), want 10", engine.workerCount)
	}
}

func TestEngineEnqueue(t *testing.T) {
	ctx := context.Background()

	t.Run("Success with default MaxAttempts", func(t *testing.T) {
		var capturedMaxAttempts int
		dbMock := &DatabaseMock{
			ExecFunc: func(ctx context.Context, query string, args ...any) (sql.Result, error) {
				capturedMaxAttempts = args[4].(int)
				return nil, nil
			},
		}

		engine := NewEngine(dbMock)
		err := engine.Enqueue(ctx, Job{
			JobType: "backup.run",
			RunAt:   time.Now(),
			Payload: map[string]string{"type": "daily"},
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if capturedMaxAttempts != 5 {
			t.Errorf("expected default max_attempts=5, got %d", capturedMaxAttempts)
		}
	})

	t.Run("Success with custom MaxAttempts", func(t *testing.T) {
		var capturedMaxAttempts int
		dbMock := &DatabaseMock{
			ExecFunc: func(ctx context.Context, query string, args ...any) (sql.Result, error) {
				capturedMaxAttempts = args[4].(int)
				return nil, nil
			},
		}

		engine := NewEngine(dbMock)
		err := engine.Enqueue(ctx, Job{
			JobType:     "backup.run",
			RunAt:       time.Now(),
			Payload:     "simple payload",
			MaxAttempts: 3,
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if capturedMaxAttempts != 3 {
			t.Errorf("expected custom max_attempts=3, got %d", capturedMaxAttempts)
		}
	})

	t.Run("Invalid payload JSON marshal", func(t *testing.T) {
		engine := NewEngine(nil)
		err := engine.Enqueue(ctx, Job{
			JobType: "invalid.job",
			RunAt:   time.Now(),
			Payload: math.NaN(),
		})
		if err == nil {
			t.Fatal("expected error for unmarshalable payload, got nil")
		}
	})

	t.Run("Database error", func(t *testing.T) {
		dbMock := &DatabaseMock{
			ExecFunc: func(ctx context.Context, query string, args ...any) (sql.Result, error) {
				return nil, errors.New("db connection failure")
			},
		}

		engine := NewEngine(dbMock)
		err := engine.Enqueue(ctx, Job{
			JobType: "backup.run",
			RunAt:   time.Now(),
			Payload: "payload",
		})
		if err == nil {
			t.Fatal("expected error from database Exec, got nil")
		}
	})
}

func TestEngineRegisterSchedule(t *testing.T) {
	ctx := context.Background()

	t.Run("Success", func(t *testing.T) {
		var execCalled bool
		dbMock := &DatabaseMock{
			ExecFunc: func(ctx context.Context, query string, args ...any) (sql.Result, error) {
				execCalled = true
				if args[0] != "sched_1" || args[1] != "finance.sync" {
					t.Errorf("unexpected args: %v", args)
				}
				return nil, nil
			},
		}

		engine := NewEngine(dbMock)
		err := engine.RegisterSchedule(ctx, Schedule{
			ID:             "sched_1",
			JobType:        "finance.sync",
			CronExpression: "0 0 12 * * *",
			Payload:        map[string]string{"scope": "all"},
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !execCalled {
			t.Error("expected db.Exec to be called")
		}
	})

	t.Run("Invalid cron expression", func(t *testing.T) {
		engine := NewEngine(nil)
		err := engine.RegisterSchedule(ctx, Schedule{
			ID:             "sched_1",
			JobType:        "finance.sync",
			CronExpression: "not a valid cron",
			Payload:        nil,
		})
		if err == nil {
			t.Fatal("expected error for invalid cron, got nil")
		}
	})

	t.Run("Invalid payload JSON marshal", func(t *testing.T) {
		engine := NewEngine(nil)
		err := engine.RegisterSchedule(ctx, Schedule{
			ID:             "sched_1",
			JobType:        "finance.sync",
			CronExpression: "0 0 12 * * *",
			Payload:        math.NaN(),
		})
		if err == nil {
			t.Fatal("expected error for unmarshalable payload, got nil")
		}
	})

	t.Run("Database error", func(t *testing.T) {
		dbMock := &DatabaseMock{
			ExecFunc: func(ctx context.Context, query string, args ...any) (sql.Result, error) {
				return nil, errors.New("db write failed")
			},
		}

		engine := NewEngine(dbMock)
		err := engine.RegisterSchedule(ctx, Schedule{
			ID:             "sched_1",
			JobType:        "finance.sync",
			CronExpression: "0 0 12 * * *",
			Payload:        nil,
		})
		if err == nil {
			t.Fatal("expected error from database Exec, got nil")
		}
	})
}
