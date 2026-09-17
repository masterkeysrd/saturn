package scheduler

import (
	"context"
	"database/sql"
	"errors"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/requestid"
)

func TestEngineExecuteJobInstance_RequestID(t *testing.T) {
	dbMock := &DatabaseMock{
		ExecFunc: func(ctx context.Context, query string, args ...any) (sql.Result, error) {
			return nil, nil
		},
	}
	engine := NewEngine(dbMock)

	var receivedReqID string
	engine.Register("test.request_id_job", func(ctx context.Context, payload []byte) error {
		receivedReqID = requestid.From(ctx)
		return nil
	})

	job := jobInstance{
		ID:          "job_12345",
		JobType:     "test.request_id_job",
		Payload:     []byte("test"),
		Attempts:    0,
		MaxAttempts: 5,
	}

	// 1. Calling executeJobInstance without request_id on ctx -> generates fresh req_ ID
	engine.executeJobInstance(context.Background(), job)

	if receivedReqID == "" {
		t.Fatal("expected request_id to be injected into context, got empty string")
	}
	if len(receivedReqID) < 5 || receivedReqID[:4] != "req_" {
		t.Fatalf("expected request_id with prefix 'req_', got %q", receivedReqID)
	}

	// 2. Calling executeJobInstance with existing request_id on ctx -> preserves it via FromOrNew
	existingReqID := "req_existing_correlation_id"
	ctxWithExisting := requestid.With(context.Background(), existingReqID)
	engine.executeJobInstance(ctxWithExisting, job)

	if receivedReqID != existingReqID {
		t.Fatalf("expected existing request_id %q to be preserved, got %q", existingReqID, receivedReqID)
	}
}

func TestEngineExecuteJobInstance_Success(t *testing.T) {
	var capturedQuery string
	var capturedArgs []any
	dbMock := &DatabaseMock{
		ExecFunc: func(ctx context.Context, query string, args ...any) (sql.Result, error) {
			capturedQuery = query
			capturedArgs = args
			return nil, nil
		},
	}
	engine := NewEngine(dbMock)
	engine.Register("success.job", func(ctx context.Context, payload []byte) error {
		return nil
	})

	job := jobInstance{
		ID:          "job_success",
		JobType:     "success.job",
		Attempts:    0,
		MaxAttempts: 3,
	}

	engine.executeJobInstance(context.Background(), job)

	if !strings.Contains(capturedQuery, "status = 'completed'") {
		t.Errorf("expected status 'completed' in query, got %q", capturedQuery)
	}
	if len(capturedArgs) != 1 || capturedArgs[0] != "job_success" {
		t.Errorf("unexpected args: %v", capturedArgs)
	}
}

func TestEngineExecuteJobInstance_FailureRetry(t *testing.T) {
	var capturedStatus string
	var capturedAttempts int
	var capturedError string

	dbMock := &DatabaseMock{
		ExecFunc: func(ctx context.Context, query string, args ...any) (sql.Result, error) {
			capturedStatus = args[0].(string)
			capturedAttempts = args[1].(int)
			capturedError = args[3].(string)
			return nil, nil
		},
	}
	engine := NewEngine(dbMock)
	engine.Register("failing.job", func(ctx context.Context, payload []byte) error {
		return errors.New("transient error")
	})

	job := jobInstance{
		ID:          "job_retry",
		JobType:     "failing.job",
		Attempts:    1,
		MaxAttempts: 5,
	}

	engine.executeJobInstance(context.Background(), job)

	if capturedStatus != "pending" {
		t.Errorf("expected status 'pending' for retry, got %q", capturedStatus)
	}
	if capturedAttempts != 2 {
		t.Errorf("expected attempts=2, got %d", capturedAttempts)
	}
	if capturedError != "transient error" {
		t.Errorf("expected error 'transient error', got %q", capturedError)
	}
}

func TestEngineExecuteJobInstance_FailureMaxAttempts(t *testing.T) {
	var capturedStatus string
	var capturedAttempts int

	dbMock := &DatabaseMock{
		ExecFunc: func(ctx context.Context, query string, args ...any) (sql.Result, error) {
			capturedStatus = args[0].(string)
			capturedAttempts = args[1].(int)
			return nil, nil
		},
	}
	engine := NewEngine(dbMock)
	engine.Register("failing.job", func(ctx context.Context, payload []byte) error {
		return errors.New("fatal error")
	})

	job := jobInstance{
		ID:          "job_max_attempts",
		JobType:     "failing.job",
		Attempts:    2,
		MaxAttempts: 3,
	}

	engine.executeJobInstance(context.Background(), job)

	if capturedStatus != "failed" {
		t.Errorf("expected status 'failed' when max attempts reached, got %q", capturedStatus)
	}
	if capturedAttempts != 3 {
		t.Errorf("expected attempts=3, got %d", capturedAttempts)
	}
}

func TestEngineExecuteJobInstance_Panic(t *testing.T) {
	t.Run("Panic with retries remaining", func(t *testing.T) {
		var capturedStatus string
		var capturedError string

		dbMock := &DatabaseMock{
			ExecFunc: func(ctx context.Context, query string, args ...any) (sql.Result, error) {
				capturedStatus = args[0].(string)
				capturedError = args[3].(string)
				return nil, nil
			},
		}
		engine := NewEngine(dbMock)
		engine.Register("panic.job", func(ctx context.Context, payload []byte) error {
			panic("unexpected runtime panic")
		})

		job := jobInstance{
			ID:          "job_panic",
			JobType:     "panic.job",
			Attempts:    0,
			MaxAttempts: 3,
		}

		engine.executeJobInstance(context.Background(), job)

		if capturedStatus != "pending" {
			t.Errorf("expected status 'pending', got %q", capturedStatus)
		}
		if !strings.Contains(capturedError, "unexpected runtime panic") {
			t.Errorf("expected panic message in last_error, got %q", capturedError)
		}
	})

	t.Run("Panic with max attempts reached", func(t *testing.T) {
		var capturedStatus string
		dbMock := &DatabaseMock{
			ExecFunc: func(ctx context.Context, query string, args ...any) (sql.Result, error) {
				capturedStatus = args[0].(string)
				return nil, nil
			},
		}
		engine := NewEngine(dbMock)
		engine.Register("panic.job", func(ctx context.Context, payload []byte) error {
			panic("fatal panic")
		})

		job := jobInstance{
			ID:          "job_panic_fatal",
			JobType:     "panic.job",
			Attempts:    2,
			MaxAttempts: 3,
		}

		engine.executeJobInstance(context.Background(), job)

		if capturedStatus != "failed" {
			t.Errorf("expected status 'failed', got %q", capturedStatus)
		}
	})
}

func TestEngineExecuteJobInstance_NoHandler(t *testing.T) {
	var capturedStatus string
	var capturedError string
	dbMock := &DatabaseMock{
		ExecFunc: func(ctx context.Context, query string, args ...any) (sql.Result, error) {
			capturedError = args[0].(string)
			return nil, nil
		},
	}
	engine := NewEngine(dbMock)

	job := jobInstance{
		ID:      "job_no_handler",
		JobType: "unregistered.job",
	}

	engine.executeJobInstance(context.Background(), job)

	_ = capturedStatus
	if !strings.Contains(capturedError, "no handler registered for job type") {
		t.Errorf("expected missing handler error, got %q", capturedError)
	}
}

func TestEngineSpawnRecurrentJobs(t *testing.T) {
	ctx := context.Background()

	t.Run("Success with valid and invalid cron", func(t *testing.T) {
		var insertExecCalled bool
		var updateExecOneCalled bool

		dbMock := &DatabaseMock{
			WithTxFunc: func(ctx context.Context, fn func(ctx context.Context) error) error {
				return fn(ctx)
			},
			SelectFunc: func(ctx context.Context, dest any, query string, args ...any) error {
				val := reflect.ValueOf(dest).Elem()
				sliceType := val.Type().Elem()

				// Item 1: valid cron
				item1 := reflect.New(sliceType).Elem()
				item1.FieldByName("ID").SetString("sched_1")
				item1.FieldByName("JobType").SetString("test.job")
				item1.FieldByName("Payload").SetBytes([]byte("{}"))
				item1.FieldByName("CronExpression").SetString("0 0 12 * * *")
				item1.FieldByName("NextRunAt").Set(reflect.ValueOf(time.Now().UTC()))

				// Item 2: invalid cron
				item2 := reflect.New(sliceType).Elem()
				item2.FieldByName("ID").SetString("sched_bad")
				item2.FieldByName("JobType").SetString("test.job")
				item2.FieldByName("Payload").SetBytes([]byte("{}"))
				item2.FieldByName("CronExpression").SetString("invalid-cron")
				item2.FieldByName("NextRunAt").Set(reflect.ValueOf(time.Now().UTC()))

				val.Set(reflect.Append(val, item1, item2))
				return nil
			},
			ExecFunc: func(ctx context.Context, query string, args ...any) (sql.Result, error) {
				insertExecCalled = true
				if args[1] != "sched_1" {
					t.Errorf("expected schedule_id=sched_1, got %v", args[1])
				}
				return nil, nil
			},
			ExecOneFunc: func(ctx context.Context, query string, args ...any) error {
				updateExecOneCalled = true
				if args[1] != "sched_1" {
					t.Errorf("expected update for sched_1, got %v", args[1])
				}
				return nil
			},
		}

		engine := NewEngine(dbMock)
		err := engine.spawnRecurrentJobs(ctx)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !insertExecCalled {
			t.Error("expected db.Exec to be called for valid schedule")
		}
		if !updateExecOneCalled {
			t.Error("expected db.ExecOne to be called to advance schedule next_run_at")
		}
	})

	t.Run("Select error", func(t *testing.T) {
		dbMock := &DatabaseMock{
			WithTxFunc: func(ctx context.Context, fn func(ctx context.Context) error) error {
				return fn(ctx)
			},
			SelectFunc: func(ctx context.Context, dest any, query string, args ...any) error {
				return errors.New("select failed")
			},
		}

		engine := NewEngine(dbMock)
		err := engine.spawnRecurrentJobs(ctx)
		if err == nil {
			t.Fatal("expected error, got nil")
		}
	})

	t.Run("Exec error", func(t *testing.T) {
		dbMock := &DatabaseMock{
			WithTxFunc: func(ctx context.Context, fn func(ctx context.Context) error) error {
				return fn(ctx)
			},
			SelectFunc: func(ctx context.Context, dest any, query string, args ...any) error {
				val := reflect.ValueOf(dest).Elem()
				sliceType := val.Type().Elem()
				item := reflect.New(sliceType).Elem()
				item.FieldByName("ID").SetString("sched_1")
				item.FieldByName("JobType").SetString("test.job")
				item.FieldByName("CronExpression").SetString("0 0 12 * * *")
				val.Set(reflect.Append(val, item))
				return nil
			},
			ExecFunc: func(ctx context.Context, query string, args ...any) (sql.Result, error) {
				return nil, errors.New("insert job failed")
			},
		}

		engine := NewEngine(dbMock)
		err := engine.spawnRecurrentJobs(ctx)
		if err == nil {
			t.Fatal("expected error, got nil")
		}
	})

	t.Run("ExecOne error", func(t *testing.T) {
		dbMock := &DatabaseMock{
			WithTxFunc: func(ctx context.Context, fn func(ctx context.Context) error) error {
				return fn(ctx)
			},
			SelectFunc: func(ctx context.Context, dest any, query string, args ...any) error {
				val := reflect.ValueOf(dest).Elem()
				sliceType := val.Type().Elem()
				item := reflect.New(sliceType).Elem()
				item.FieldByName("ID").SetString("sched_1")
				item.FieldByName("JobType").SetString("test.job")
				item.FieldByName("CronExpression").SetString("0 0 12 * * *")
				val.Set(reflect.Append(val, item))
				return nil
			},
			ExecFunc: func(ctx context.Context, query string, args ...any) (sql.Result, error) {
				return nil, nil
			},
			ExecOneFunc: func(ctx context.Context, query string, args ...any) error {
				return errors.New("update schedule failed")
			},
		}

		engine := NewEngine(dbMock)
		err := engine.spawnRecurrentJobs(ctx)
		if err == nil {
			t.Fatal("expected error, got nil")
		}
	})
}

func TestEngineExecutePendingJobs(t *testing.T) {
	ctx := context.Background()

	t.Run("Empty jobs returns nil", func(t *testing.T) {
		dbMock := &DatabaseMock{
			WithTxFunc: func(ctx context.Context, fn func(ctx context.Context) error) error {
				return fn(ctx)
			},
			SelectFunc: func(ctx context.Context, dest any, query string, args ...any) error {
				return nil
			},
		}

		engine := NewEngine(dbMock)
		err := engine.executePendingJobs(ctx)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("Claim and dispatch to queue successfully", func(t *testing.T) {
		var execOneCalled bool
		dbMock := &DatabaseMock{
			WithTxFunc: func(ctx context.Context, fn func(ctx context.Context) error) error {
				return fn(ctx)
			},
			SelectFunc: func(ctx context.Context, dest any, query string, args ...any) error {
				ptr := dest.(*[]jobInstance)
				*ptr = append(*ptr, jobInstance{
					ID:      "job_pending_1",
					JobType: "test.job",
				})
				return nil
			},
			ExecOneFunc: func(ctx context.Context, query string, args ...any) error {
				execOneCalled = true
				return nil
			},
		}

		engine := NewEngine(dbMock)
		engine.jobQueue = make(chan jobInstance, 10)

		err := engine.executePendingJobs(ctx)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !execOneCalled {
			t.Error("expected db.ExecOne to transition job to processing")
		}
		if len(engine.jobQueue) != 1 {
			t.Fatalf("expected 1 job in queue, got %d", len(engine.jobQueue))
		}
	})

	t.Run("Queue full backpressure reverts status to pending", func(t *testing.T) {
		var revertedToPending bool
		dbMock := &DatabaseMock{
			WithTxFunc: func(ctx context.Context, fn func(ctx context.Context) error) error {
				return fn(ctx)
			},
			SelectFunc: func(ctx context.Context, dest any, query string, args ...any) error {
				ptr := dest.(*[]jobInstance)
				*ptr = append(*ptr, jobInstance{
					ID:      "job_backpressure",
					JobType: "test.job",
				})
				return nil
			},
			ExecOneFunc: func(ctx context.Context, query string, args ...any) error {
				return nil
			},
			ExecFunc: func(ctx context.Context, query string, args ...any) (sql.Result, error) {
				if strings.Contains(query, "status = 'pending'") && args[0] == "job_backpressure" {
					revertedToPending = true
				}
				return nil, nil
			},
		}

		engine := NewEngine(dbMock)
		// Zero-capacity queue ensures select default branch is taken immediately
		engine.jobQueue = make(chan jobInstance)

		err := engine.executePendingJobs(ctx)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !revertedToPending {
			t.Error("expected job to be reverted to pending on full queue")
		}
	})

	t.Run("Select error", func(t *testing.T) {
		dbMock := &DatabaseMock{
			WithTxFunc: func(ctx context.Context, fn func(ctx context.Context) error) error {
				return fn(ctx)
			},
			SelectFunc: func(ctx context.Context, dest any, query string, args ...any) error {
				return errors.New("select failed")
			},
		}

		engine := NewEngine(dbMock)
		err := engine.executePendingJobs(ctx)
		if err == nil {
			t.Fatal("expected error, got nil")
		}
	})

	t.Run("ExecOne error transitioning to processing", func(t *testing.T) {
		dbMock := &DatabaseMock{
			WithTxFunc: func(ctx context.Context, fn func(ctx context.Context) error) error {
				return fn(ctx)
			},
			SelectFunc: func(ctx context.Context, dest any, query string, args ...any) error {
				ptr := dest.(*[]jobInstance)
				*ptr = append(*ptr, jobInstance{ID: "job_err"})
				return nil
			},
			ExecOneFunc: func(ctx context.Context, query string, args ...any) error {
				return errors.New("exec error")
			},
		}

		engine := NewEngine(dbMock)
		err := engine.executePendingJobs(ctx)
		if err == nil {
			t.Fatal("expected error, got nil")
		}
	})
}

func TestEngineStartAndShutdown(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	dbMock := &DatabaseMock{
		ExecFunc: func(ctx context.Context, query string, args ...any) (sql.Result, error) {
			return nil, nil
		},
	}
	engine := NewEngine(dbMock)
	engine.WithWorkerCount(2)
	engine.Start(ctx)

	// Cancel context to stop loops and workers
	cancel()
	time.Sleep(20 * time.Millisecond)
}
