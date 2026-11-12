package calendar

import (
	"testing"
	"time"
)

func TestEventValidationInvariants(t *testing.T) {
	validID, err := GenerateEventID()
	if err != nil {
		t.Fatalf("failed to generate event ID: %v", err)
	}

	now := time.Now().UTC()
	plusOneHour := now.Add(time.Hour)
	minusOneHour := now.Add(-time.Hour)

	tests := []struct {
		name    string
		event   *Event
		wantErr bool
	}{
		{
			name: "valid timed event",
			event: &Event{
				ID:         validID,
				SpaceID:    "spc_1",
				CalendarID: "cal_1",
				Title:      "Team Sync",
				IsAllDay:   false,
				StartTime:  &now,
				EndTime:    &plusOneHour,
				Timezone:   new("America/New_York"),
			},
			wantErr: false,
		},
		{
			name: "invalid timed event: end before start",
			event: &Event{
				ID:         "cev_bad1",
				SpaceID:    "spc_1",
				CalendarID: "cal_1",
				Title:      "Team Sync",
				IsAllDay:   false,
				StartTime:  &now,
				EndTime:    &minusOneHour,
				Timezone:   new("America/New_York"),
			},
			wantErr: true,
		},
		{
			name: "invalid timed event: missing timezone",
			event: &Event{
				ID:         "cev_bad2",
				SpaceID:    "spc_1",
				CalendarID: "cal_1",
				Title:      "Team Sync",
				IsAllDay:   false,
				StartTime:  &now,
				EndTime:    &plusOneHour,
				Timezone:   nil,
			},
			wantErr: true,
		},
		{
			name: "invalid timed event: start_date populated",
			event: &Event{
				ID:         "cev_bad3",
				SpaceID:    "spc_1",
				CalendarID: "cal_1",
				Title:      "Team Sync",
				IsAllDay:   false,
				StartTime:  &now,
				EndTime:    &plusOneHour,
				Timezone:   new("UTC"),
				StartDate:  new("2026-03-10"),
			},
			wantErr: true,
		},
		{
			name: "valid all-day event",
			event: &Event{
				ID:         validID,
				SpaceID:    "spc_1",
				CalendarID: "cal_1",
				Title:      "Offsite Meeting",
				IsAllDay:   true,
				StartDate:  new("2026-06-15"),
				EndDate:    new("2026-06-16"),
			},
			wantErr: false,
		},
		{
			name: "invalid all-day event: start_time populated",
			event: &Event{
				ID:         "cev_bad_allday1",
				SpaceID:    "spc_1",
				CalendarID: "cal_1",
				Title:      "Offsite Meeting",
				IsAllDay:   true,
				StartDate:  new("2026-06-15"),
				EndDate:    new("2026-06-16"),
				StartTime:  &now,
			},
			wantErr: true,
		},
		{
			name: "invalid all-day event: end_date not after start_date",
			event: &Event{
				ID:         "cev_bad_allday2",
				SpaceID:    "spc_1",
				CalendarID: "cal_1",
				Title:      "Offsite Meeting",
				IsAllDay:   true,
				StartDate:  new("2026-06-15"),
				EndDate:    new("2026-06-15"),
			},
			wantErr: true,
		},
		{
			name: "invalid all-day event: invalid date format",
			event: &Event{
				ID:         "cev_bad_allday3",
				SpaceID:    "spc_1",
				CalendarID: "cal_1",
				Title:      "Offsite Meeting",
				IsAllDay:   true,
				StartDate:  new("15-06-2026"),
				EndDate:    new("16-06-2026"),
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.event.Validate()
			if (err != nil) != tt.wantErr {
				t.Fatalf("Validate() error = %v, wantErr = %v", err, tt.wantErr)
			}
		})
	}
}

func TestEventJSONHelpers(t *testing.T) {
	validID, _ := GenerateEventID()
	ev := &Event{
		ID:         validID,
		SpaceID:    "spc_1",
		CalendarID: "cal_1",
		Title:      "Demo",
		IsAllDay:   true,
		StartDate:  new("2026-07-01"),
		EndDate:    new("2026-07-02"),
	}

	// Attendees
	attendees := []Attendee{
		{Email: "alice@example.com", DisplayName: "Alice", ResponseStatus: "accepted"},
		{Email: "bob@example.com", Optional: true},
	}
	if err := ev.SetAttendees(attendees); err != nil {
		t.Fatalf("SetAttendees failed: %v", err)
	}
	gotAttendees, err := ev.Attendees()
	if err != nil {
		t.Fatalf("Attendees() failed: %v", err)
	}
	if len(gotAttendees) != 2 || gotAttendees[0].Email != "alice@example.com" {
		t.Errorf("unexpected attendees: %+v", gotAttendees)
	}

	// Organizer
	org := &Organizer{Email: "organizer@example.com", DisplayName: "Host", Self: true}
	if err := ev.SetOrganizer(org); err != nil {
		t.Fatalf("SetOrganizer failed: %v", err)
	}
	gotOrg, err := ev.Organizer()
	if err != nil {
		t.Fatalf("Organizer() failed: %v", err)
	}
	if gotOrg == nil || gotOrg.Email != "organizer@example.com" {
		t.Errorf("unexpected organizer: %+v", gotOrg)
	}

	// Reminders
	reminders := []Reminder{
		{Method: "popup", Minutes: 10},
		{Method: "email", Minutes: 60},
	}
	if err := ev.SetReminders(reminders); err != nil {
		t.Fatalf("SetReminders failed: %v", err)
	}
	gotReminders, err := ev.Reminders()
	if err != nil {
		t.Fatalf("Reminders() failed: %v", err)
	}
	if len(gotReminders) != 2 || gotReminders[1].Minutes != 60 {
		t.Errorf("unexpected reminders: %+v", gotReminders)
	}
}
