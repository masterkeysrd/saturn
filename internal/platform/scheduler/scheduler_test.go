package scheduler

import (
	"context"
	"database/sql"
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/requestid"
)

type mockDB struct{}

func (m *mockDB) Get(ctx context.Context, dest any, query string, args ...any) error    { return nil }
func (m *mockDB) Select(ctx context.Context, dest any, query string, args ...any) error { return nil }
func (m *mockDB) Exec(ctx context.Context, query string, args ...any) (sql.Result, error) {
	return nil, nil
}
func (m *mockDB) ExecOne(ctx context.Context, query string, args ...any) error { return nil }
func (m *mockDB) Rebind(query string) string                                   { return query }
func (m *mockDB) WithTx(ctx context.Context, fn func(ctx context.Context) error) error {
	return fn(ctx)
}

var _ Database = (*mockDB)(nil)

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

	// Valid cron expression: every minute
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

func TestEngineExecuteJobInstance_RequestID(t *testing.T) {
	engine := NewEngine(&mockDB{})

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
