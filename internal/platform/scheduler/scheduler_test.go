package scheduler

import (
	"context"
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
