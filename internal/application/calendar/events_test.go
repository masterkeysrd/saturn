package calendar_test

import (
	"context"
	"testing"
	"time"

	appcalendar "github.com/masterkeysrd/saturn/internal/application/calendar"
	domaincalendar "github.com/masterkeysrd/saturn/internal/domain/calendar"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
)

type mockCalEventPublisher struct {
	published []struct {
		topic string
		event any
	}
}

func (m *mockCalEventPublisher) Publish(_ context.Context, topic string, event any) error {
	m.published = append(m.published, struct {
		topic string
		event any
	}{topic: topic, event: event})
	return nil
}

func TestCoordinator_EventEmissions(t *testing.T) {
	now := time.Now().UTC()
	ctx := auth.WithSpaceScope(context.Background(), "spc_1", "owner")

	calStore := newMockCalendarStore()
	_ = calStore.Create(ctx, &domaincalendar.Calendar{
		ID:         "cal_1",
		SpaceID:    "spc_1",
		Source:     domaincalendar.SourceNative,
		AccessRole: domaincalendar.AccessRoleOwner,
	})

	t.Run("CreateEvent emits calendar.event.created", func(t *testing.T) {
		events := &mockCalEventPublisher{}
		evStore := newMockEventStore()
		svc := domaincalendar.NewService(domaincalendar.Dependencies{
			CalendarStore: calStore,
			EventStore:    evStore,
		})
		coord := appcalendar.NewCoordinator(appcalendar.Dependencies{
			CalendarStore: calStore,
			EventStore:    evStore,
			DomainService: svc,
			Events:        events,
		})

		end := now.Add(time.Hour)
		tz := "UTC"
		created, err := coord.CreateEvent(ctx, &appcalendar.CreateEventRequest{
			Event: &domaincalendar.Event{
				CalendarID: "cal_1",
				Title:      "Payday",
				StartTime:  &now,
				EndTime:    &end,
				Timezone:   &tz,
			},
		})
		if err != nil {
			t.Fatalf("CreateEvent failed: %v", err)
		}
		if len(events.published) != 1 || events.published[0].topic != domaincalendar.TopicEventCreated {
			t.Fatalf("expected 1 %q event, got %+v", domaincalendar.TopicEventCreated, events.published)
		}
		payload, ok := events.published[0].event.(*domaincalendar.EventCreatedEvent)
		if !ok || payload.Event != created {
			t.Fatalf("unexpected payload: %+v", events.published[0].event)
		}
	})

	t.Run("UpdateEvent emits calendar.event.updated", func(t *testing.T) {
		events := &mockCalEventPublisher{}
		end := now.Add(time.Hour)
		tz := "UTC"
		evID, _ := domaincalendar.GenerateEventID()
		evStore := newMockEventStore()
		_ = evStore.Create(ctx, &domaincalendar.Event{
			ID:         evID,
			SpaceID:    "spc_1",
			CalendarID: "cal_1",
			Title:      "Old Title",
			StartTime:  &now,
			EndTime:    &end,
			Timezone:   &tz,
			Status:     domaincalendar.EventStatusConfirmed,
			Visibility: domaincalendar.VisibilityDefault,
		})
		svc := domaincalendar.NewService(domaincalendar.Dependencies{
			CalendarStore: calStore,
			EventStore:    evStore,
		})
		coord := appcalendar.NewCoordinator(appcalendar.Dependencies{
			CalendarStore: calStore,
			EventStore:    evStore,
			DomainService: svc,
			Events:        events,
		})

		updated, err := coord.UpdateEvent(ctx, &appcalendar.UpdateEventRequest{
			ID:         evID,
			Event:      &domaincalendar.Event{Title: "New Title"},
			UpdateMask: []string{"title"},
		})
		if err != nil {
			t.Fatalf("UpdateEvent failed: %v", err)
		}
		if len(events.published) != 1 || events.published[0].topic != domaincalendar.TopicEventUpdated {
			t.Fatalf("expected 1 %q event, got %+v", domaincalendar.TopicEventUpdated, events.published)
		}
		payload, ok := events.published[0].event.(*domaincalendar.EventUpdatedEvent)
		if !ok || payload.Event != updated {
			t.Fatalf("unexpected payload: %+v", events.published[0].event)
		}
	})
}
