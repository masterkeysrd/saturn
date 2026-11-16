package scheduler

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"testing"

	"github.com/masterkeysrd/saturn/internal/platform/scheduler"
)

type stubRetentionCoord struct {
	called bool
	err    error
}

func (s *stubRetentionCoord) PurgeExpiredRuns(_ context.Context) error {
	s.called = true
	return s.err
}

type stubSchedulerDB struct {
	lastQuery string
	lastArgs  []any
	execErr   error
}

func (s *stubSchedulerDB) Get(_ context.Context, _ any, _ string, _ ...any) error { return nil }
func (s *stubSchedulerDB) Select(_ context.Context, _ any, _ string, _ ...any) error {
	return nil
}
func (s *stubSchedulerDB) Exec(_ context.Context, query string, args ...any) (sql.Result, error) {
	s.lastQuery = query
	s.lastArgs = args
	return nil, s.execErr
}
func (s *stubSchedulerDB) ExecOne(_ context.Context, _ string, _ ...any) error { return nil }
func (s *stubSchedulerDB) Rebind(q string) string                              { return q }
func (s *stubSchedulerDB) WithTx(ctx context.Context, fn func(context.Context) error) error {
	return fn(ctx)
}

func TestAIJobsAndSchedules(t *testing.T) {
	db := &stubSchedulerDB{}
	engine := scheduler.NewEngine(db)
	coord := &stubRetentionCoord{}

	RegisterAIJobs(engine, coord)
	if err := RegisterAISchedules(context.Background(), engine); err != nil {
		t.Fatalf("RegisterAISchedules() error = %v", err)
	}

	if !strings.Contains(db.lastQuery, "platform.schedule") {
		t.Fatalf("expected schedule insert query, got %q", db.lastQuery)
	}
	if len(db.lastArgs) < 4 || db.lastArgs[0] != ScheduleIDPurgeExpiredRuns || db.lastArgs[1] != JobTypeAIPurgeExpiredRuns || db.lastArgs[3] != "0 0 3 * * *" {
		t.Fatalf("unexpected schedule args: %+v", db.lastArgs)
	}

	db.execErr = errors.New("db error")
	if err := RegisterAISchedules(context.Background(), engine); err == nil {
		t.Fatalf("expected RegisterAISchedules to return DB error")
	}
}
