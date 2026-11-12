package calendar

import (
	"context"
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

func TestServiceCalendarAccessRoleWriteRejection(t *testing.T) {
	ctx := context.Background()

	tests := []struct {
		name       string
		accessRole AccessRole
		wantErr    bool
	}{
		{
			name:       "owner allows event creation",
			accessRole: AccessRoleOwner,
			wantErr:    false,
		},
		{
			name:       "writer allows event creation",
			accessRole: AccessRoleWriter,
			wantErr:    false,
		},
		{
			name:       "reader rejects event creation",
			accessRole: AccessRoleReader,
			wantErr:    true,
		},
		{
			name:       "free_busy rejects event creation",
			accessRole: AccessRoleFreeBusy,
			wantErr:    true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			calStore := &CalendarStoreMock{}
			eventStore := &EventStoreMock{}

			cal := &Calendar{
				ID:         "cal_target",
				SpaceID:    "spc_1",
				Source:     SourceNative,
				Name:       "Calendar",
				Timezone:   "UTC",
				AccessRole: tt.accessRole,
			}
			calStore.GetByIDFunc = func(ctx context.Context, spaceID, id string) (*Calendar, error) {
				return cal, nil
			}
			eventStore.CreateFunc = func(ctx context.Context, event *Event) error {
				return nil
			}

			svc := NewService(Dependencies{
				CalendarStore: calStore,
				EventStore:    eventStore,
			})

			now := time.Now().UTC()
			later := now.Add(time.Hour)
			ev := &Event{
				SpaceID:    "spc_1",
				CalendarID: "cal_target",
				Title:      "Meeting",
				IsAllDay:   false,
				StartTime:  &now,
				EndTime:    &later,
				Timezone:   new("UTC"),
			}

			err := svc.CreateEvent(ctx, ev)
			if (err != nil) != tt.wantErr {
				t.Fatalf("CreateEvent() error = %v, wantErr = %v", err, tt.wantErr)
			}
			if tt.wantErr {
				if !errors.Is(err, errors.Permission) {
					t.Errorf("expected permission error, got %v", err)
				}
			}
		})
	}
}

func TestServiceCannotDeleteDefaultNativeCalendar(t *testing.T) {
	ctx := context.Background()
	calStore := &CalendarStoreMock{}
	eventStore := &EventStoreMock{}

	calStore.GetByIDFunc = func(ctx context.Context, spaceID, id string) (*Calendar, error) {
		return &Calendar{
			ID:              "cal_default",
			SpaceID:         "spc_1",
			Source:          SourceNative,
			Name:            "Default Calendar",
			Timezone:        "UTC",
			AccessRole:      AccessRoleOwner,
			IsDefaultNative: true,
		}, nil
	}

	svc := NewService(Dependencies{
		CalendarStore: calStore,
		EventStore:    eventStore,
	})

	err := svc.DeleteCalendar(ctx, "spc_1", "cal_default")
	if err == nil {
		t.Fatal("expected error deleting default native calendar, got nil")
	}
	if !errors.Is(err, errors.Precondition) {
		t.Errorf("expected precondition error, got %v", err)
	}
}

func TestServiceUpdateRecurringEventScopes(t *testing.T) {
	ctx := context.Background()
	now := time.Date(2026, 4, 1, 10, 0, 0, 0, time.UTC)
	later := now.Add(time.Hour)

	master := &Event{
		ID:         "cev_master",
		SpaceID:    "spc_1",
		CalendarID: "cal_1",
		Title:      "Sprint Planning",
		IsAllDay:   false,
		StartTime:  &now,
		EndTime:    &later,
		Timezone:   new("UTC"),
		RRULE:      new("FREQ=WEEKLY;INTERVAL=1"),
		Version:    1,
	}

	t.Run("THIS_EVENT scope creates new exception event", func(t *testing.T) {
		calStore := &CalendarStoreMock{}
		eventStore := &EventStoreMock{}

		calStore.GetByIDFunc = func(ctx context.Context, spaceID, id string) (*Calendar, error) {
			return &Calendar{
				ID:         "cal_1",
				SpaceID:    "spc_1",
				AccessRole: AccessRoleOwner,
				Timezone:   "UTC",
			}, nil
		}
		eventStore.GetByIDFunc = func(ctx context.Context, spaceID, id string) (*Event, error) {
			return master, nil
		}
		eventStore.ListExceptionsByMasterIDFunc = func(ctx context.Context, spaceID, masterID string) ([]*Event, error) {
			return nil, nil
		}

		var createdExc *Event
		eventStore.CreateFunc = func(ctx context.Context, event *Event) error {
			createdExc = event
			return nil
		}

		svc := NewService(Dependencies{
			CalendarStore: calStore,
			EventStore:    eventStore,
		})

		occTime := time.Date(2026, 4, 8, 10, 0, 0, 0, time.UTC)
		newTitle := "Sprint Planning — Rescheduled"
		incoming := &Event{Title: newTitle}

		exc, err := svc.UpdateRecurringEvent(ctx, UpdateRecurringEventParams{
			SpaceID:             "spc_1",
			EventID:             "cev_master",
			Scope:               RecurrenceEditScopeThisEvent,
			Incoming:            incoming,
			Mask:                []string{"title"},
			OccurrenceStartTime: &occTime,
		})

		if err != nil {
			t.Fatalf("UpdateRecurringEvent failed: %v", err)
		}
		if exc.Title != newTitle {
			t.Errorf("expected title %s, got %s", newTitle, exc.Title)
		}
		if exc.RecurringMasterID == nil || *exc.RecurringMasterID != "cev_master" {
			t.Errorf("expected RecurringMasterID cev_master, got %v", exc.RecurringMasterID)
		}
		if createdExc == nil {
			t.Fatal("expected exception event to be saved in EventStore")
		}
	})

	t.Run("THIS_AND_FOLLOWING scope truncates master and creates second master", func(t *testing.T) {
		calStore := &CalendarStoreMock{}
		eventStore := &EventStoreMock{}

		calStore.GetByIDFunc = func(ctx context.Context, spaceID, id string) (*Calendar, error) {
			return &Calendar{
				ID:         "cal_1",
				SpaceID:    "spc_1",
				AccessRole: AccessRoleOwner,
				Timezone:   "UTC",
			}, nil
		}

		masterCopy := *master
		eventStore.GetByIDFunc = func(ctx context.Context, spaceID, id string) (*Event, error) {
			return &masterCopy, nil
		}

		var updatedMaster *Event
		eventStore.UpdateFunc = func(ctx context.Context, event *Event) error {
			updatedMaster = event
			return nil
		}

		var createdMaster *Event
		eventStore.CreateFunc = func(ctx context.Context, event *Event) error {
			createdMaster = event
			return nil
		}

		svc := NewService(Dependencies{
			CalendarStore: calStore,
			EventStore:    eventStore,
		})

		splitTime := time.Date(2026, 4, 15, 10, 0, 0, 0, time.UTC)
		newTitle := "Sprint Planning V2"
		incoming := &Event{Title: newTitle}

		newMaster, err := svc.UpdateRecurringEvent(ctx, UpdateRecurringEventParams{
			SpaceID:             "spc_1",
			EventID:             "cev_master",
			Scope:               RecurrenceEditScopeThisAndFollowing,
			Incoming:            incoming,
			Mask:                []string{"title"},
			OccurrenceStartTime: &splitTime,
		})

		if err != nil {
			t.Fatalf("UpdateRecurringEvent failed: %v", err)
		}
		if newMaster.Title != newTitle {
			t.Errorf("new master title = %s, want %s", newMaster.Title, newTitle)
		}
		if updatedMaster == nil || updatedMaster.RRULE == nil || !containsUntil(*updatedMaster.RRULE) {
			t.Errorf("original master RRULE should have UNTIL set, got %v", updatedMaster)
		}
		if createdMaster == nil {
			t.Fatal("expected new master to be created in store")
		}
	})
}

func containsUntil(rrule string) bool {
	return len(rrule) > 0 && (rrule != "" && (rrule[:5] == "UNTIL" || rrule[len(rrule)-5:] == "UNTIL" || len(rrule) > 10))
}
