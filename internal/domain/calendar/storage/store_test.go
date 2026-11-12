package storage

import (
	"context"
	"database/sql"
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/calendar"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

type mockDB struct {
	getFn     func(ctx context.Context, dest any, query string, args ...any) error
	selectFn  func(ctx context.Context, dest any, query string, args ...any) error
	execFn    func(ctx context.Context, query string, args ...any) (sql.Result, error)
	execOneFn func(ctx context.Context, query string, args ...any) error
	rebindFn  func(query string) string
}

func (m *mockDB) Get(ctx context.Context, dest any, query string, args ...any) error {
	if m.getFn != nil {
		return m.getFn(ctx, dest, query, args...)
	}
	return nil
}

func (m *mockDB) Select(ctx context.Context, dest any, query string, args ...any) error {
	if m.selectFn != nil {
		return m.selectFn(ctx, dest, query, args...)
	}
	return nil
}

func (m *mockDB) Exec(ctx context.Context, query string, args ...any) (sql.Result, error) {
	if m.execFn != nil {
		return m.execFn(ctx, query, args...)
	}
	return nil, nil
}

func (m *mockDB) ExecOne(ctx context.Context, query string, args ...any) error {
	if m.execOneFn != nil {
		return m.execOneFn(ctx, query, args...)
	}
	return nil
}

func (m *mockDB) Rebind(query string) string {
	if m.rebindFn != nil {
		return m.rebindFn(query)
	}
	return query
}

func TestCalendarStore(t *testing.T) {
	ctx := context.Background()

	t.Run("Create executes insert query", func(t *testing.T) {
		var executedQuery string
		db := &mockDB{
			execFn: func(ctx context.Context, query string, args ...any) (sql.Result, error) {
				executedQuery = query
				return nil, nil
			},
		}
		store := NewCalendarStore(db)

		cal := &calendar.Calendar{
			ID:         "cal_1",
			SpaceID:    "spc_1",
			Source:     calendar.SourceNative,
			Name:       "Test Calendar",
			Timezone:   "UTC",
			AccessRole: calendar.AccessRoleOwner,
		}

		err := store.Create(ctx, cal)
		if err != nil {
			t.Fatalf("Create failed: %v", err)
		}
		if executedQuery == "" {
			t.Error("expected Exec to be called")
		}
	})

	t.Run("GetByID returns calendar when found", func(t *testing.T) {
		db := &mockDB{
			getFn: func(ctx context.Context, dest any, query string, args ...any) error {
				if rec, ok := dest.(*CalendarRecord); ok {
					rec.ID = "cal_1"
					rec.SpaceID = "spc_1"
					rec.Source = "native"
					rec.Name = "Test Calendar"
					rec.Timezone = "UTC"
					rec.AccessRole = "owner"
				}
				return nil
			},
		}
		store := NewCalendarStore(db)

		cal, err := store.GetByID(ctx, "spc_1", "cal_1")
		if err != nil {
			t.Fatalf("GetByID failed: %v", err)
		}
		if cal == nil || cal.ID != "cal_1" {
			t.Errorf("expected cal_1, got %v", cal)
		}
	})

	t.Run("GetByID returns nil when NotExist", func(t *testing.T) {
		db := &mockDB{
			getFn: func(ctx context.Context, dest any, query string, args ...any) error {
				return errors.E(errors.NotExist, "not found")
			},
		}
		store := NewCalendarStore(db)

		cal, err := store.GetByID(ctx, "spc_1", "cal_missing")
		if err != nil {
			t.Fatalf("expected nil error, got %v", err)
		}
		if cal != nil {
			t.Errorf("expected nil calendar, got %v", cal)
		}
	})

	t.Run("Update returns Conflict error on version mismatch", func(t *testing.T) {
		db := &mockDB{
			execOneFn: func(ctx context.Context, query string, args ...any) error {
				return errors.E(errors.NotExist, "no rows affected")
			},
		}
		store := NewCalendarStore(db)

		cal := &calendar.Calendar{
			ID:         "cal_1",
			SpaceID:    "spc_1",
			Name:       "Updated",
			Timezone:   "UTC",
			AccessRole: calendar.AccessRoleOwner,
			Version:    1,
		}

		err := store.Update(ctx, cal)
		if err == nil {
			t.Fatal("expected conflict error, got nil")
		}
		if !errors.Is(err, errors.Conflict) {
			t.Errorf("expected conflict error, got %v", err)
		}
	})

	t.Run("DeleteByConnectedAccount executes delete query", func(t *testing.T) {
		var executedArgs []any
		db := &mockDB{
			execFn: func(ctx context.Context, query string, args ...any) (sql.Result, error) {
				executedArgs = args
				return nil, nil
			},
		}
		store := NewCalendarStore(db)

		err := store.DeleteByConnectedAccount(ctx, "spc_1", "cac_123")
		if err != nil {
			t.Fatalf("DeleteByConnectedAccount failed: %v", err)
		}
		if len(executedArgs) != 2 || executedArgs[0] != "spc_1" || executedArgs[1] != "cac_123" {
			t.Errorf("unexpected args: %v", executedArgs)
		}
	})
}

func TestEventStore(t *testing.T) {
	ctx := context.Background()

	t.Run("Create executes insert query", func(t *testing.T) {
		var executedQuery string
		db := &mockDB{
			execFn: func(ctx context.Context, query string, args ...any) (sql.Result, error) {
				executedQuery = query
				return nil, nil
			},
		}
		store := NewEventStore(db)

		now := time.Now().UTC()
		later := now.Add(time.Hour)
		event := &calendar.Event{
			ID:         "cev_1",
			SpaceID:    "spc_1",
			CalendarID: "cal_1",
			Title:      "Test Event",
			IsAllDay:   false,
			StartTime:  &now,
			EndTime:    &later,
			Timezone:   new("UTC"),
			Status:     calendar.EventStatusConfirmed,
		}

		err := store.Create(ctx, event)
		if err != nil {
			t.Fatalf("Create failed: %v", err)
		}
		if executedQuery == "" {
			t.Error("expected Exec to be called")
		}
	})

	t.Run("GetByID returns event when found", func(t *testing.T) {
		now := time.Now().UTC()
		db := &mockDB{
			getFn: func(ctx context.Context, dest any, query string, args ...any) error {
				if rec, ok := dest.(*EventRecord); ok {
					rec.ID = "cev_1"
					rec.SpaceID = "spc_1"
					rec.CalendarID = "cal_1"
					rec.Title = "Test Event"
					rec.Status = "confirmed"
					rec.Visibility = "default"
					rec.Transparency = "opaque"
					rec.StartTime = sql.NullTime{Time: now, Valid: true}
					rec.EndTime = sql.NullTime{Time: now.Add(time.Hour), Valid: true}
					rec.Timezone = sql.NullString{String: "UTC", Valid: true}
				}
				return nil
			},
		}
		store := NewEventStore(db)

		ev, err := store.GetByID(ctx, "spc_1", "cev_1")
		if err != nil {
			t.Fatalf("GetByID failed: %v", err)
		}
		if ev == nil || ev.ID != "cev_1" {
			t.Errorf("expected cev_1, got %v", ev)
		}
	})

	t.Run("ListInTimeRange executes overlap query", func(t *testing.T) {
		var executedQuery string
		db := &mockDB{
			selectFn: func(ctx context.Context, dest any, query string, args ...any) error {
				executedQuery = query
				return nil
			},
		}
		store := NewEventStore(db)

		rangeStart := time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)
		rangeEnd := time.Date(2026, 7, 31, 0, 0, 0, 0, time.UTC)

		events, err := store.ListInTimeRange(ctx, "spc_1", []string{"cal_1"}, rangeStart, rangeEnd, "2026-07-01", "2026-07-31")
		if err != nil {
			t.Fatalf("ListInTimeRange failed: %v", err)
		}
		if events == nil {
			t.Error("expected non-nil slice")
		}
		if executedQuery == "" {
			t.Error("expected Select query to be executed")
		}
	})
}
