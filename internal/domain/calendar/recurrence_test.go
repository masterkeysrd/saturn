package calendar

import (
	"testing"
	"time"
)

func TestRecurrenceDSTSpringForward(t *testing.T) {
	// In America/New_York, DST spring forward happens on Sunday, March 8, 2026.
	// 9:00 AM EST (UTC-5) is 14:00 UTC.
	// 9:00 AM EDT (UTC-4) is 13:00 UTC.
	// A daily 9:00 AM meeting must remain at 9:00 AM local time across the transition.
	loc, err := time.LoadLocation("America/New_York")
	if err != nil {
		t.Fatalf("failed to load location: %v", err)
	}

	startLocal := time.Date(2026, time.March, 6, 9, 0, 0, 0, loc) // Friday before DST
	endLocal := startLocal.Add(time.Hour)

	startUTC := startLocal.UTC() // 14:00 UTC
	endUTC := endLocal.UTC()

	master := &Event{
		ID:         "cev_dst_spring",
		SpaceID:    "spc_1",
		CalendarID: "cal_1",
		Title:      "Morning Standup",
		IsAllDay:   false,
		StartTime:  &startUTC,
		EndTime:    &endUTC,
		Timezone:   new("America/New_York"),
		RRULE:      new("FREQ=DAILY;COUNT=5"),
	}

	rangeStart := time.Date(2026, time.March, 5, 0, 0, 0, 0, time.UTC)
	rangeEnd := time.Date(2026, time.March, 12, 0, 0, 0, 0, time.UTC)

	occs := ExpandOccurrences([]*Event{master}, nil, rangeStart, rangeEnd)
	if len(occs) != 5 {
		t.Fatalf("expected 5 occurrences, got %d", len(occs))
	}

	for _, occ := range occs {
		localTime := occ.StartTime.In(loc)
		if localTime.Hour() != 9 || localTime.Minute() != 0 {
			t.Errorf("expected 9:00 AM local time on %s, got %02d:%02d",
				localTime.Format("2006-01-02"), localTime.Hour(), localTime.Minute())
		}
	}

	// Verify Friday (Mar 6) is 14:00 UTC
	if occs[0].StartTime.UTC().Hour() != 14 {
		t.Errorf("Mar 6 occurrence UTC hour = %d, want 14", occs[0].StartTime.UTC().Hour())
	}
	// Verify Monday (Mar 9) is 13:00 UTC (EDT)
	if occs[3].StartTime.UTC().Hour() != 13 {
		t.Errorf("Mar 9 occurrence UTC hour = %d, want 13", occs[3].StartTime.UTC().Hour())
	}
}

func TestRecurrenceDSTFallBack(t *testing.T) {
	// In America/New_York, DST fall back happens on Sunday, Nov 1, 2026.
	// 9:00 AM EDT (UTC-4) is 13:00 UTC.
	// 9:00 AM EST (UTC-5) is 14:00 UTC.
	loc, err := time.LoadLocation("America/New_York")
	if err != nil {
		t.Fatalf("failed to load location: %v", err)
	}

	startLocal := time.Date(2026, time.October, 30, 9, 0, 0, 0, loc) // Friday before fall back
	endLocal := startLocal.Add(time.Hour)

	startUTC := startLocal.UTC() // 13:00 UTC
	endUTC := endLocal.UTC()

	master := &Event{
		ID:         "cev_dst_fall",
		SpaceID:    "spc_1",
		CalendarID: "cal_1",
		Title:      "Morning Standup",
		IsAllDay:   false,
		StartTime:  &startUTC,
		EndTime:    &endUTC,
		Timezone:   new("America/New_York"),
		RRULE:      new("FREQ=DAILY;COUNT=5"),
	}

	rangeStart := time.Date(2026, time.October, 29, 0, 0, 0, 0, time.UTC)
	rangeEnd := time.Date(2026, time.November, 5, 0, 0, 0, 0, time.UTC)

	occs := ExpandOccurrences([]*Event{master}, nil, rangeStart, rangeEnd)
	if len(occs) != 5 {
		t.Fatalf("expected 5 occurrences, got %d", len(occs))
	}

	for _, occ := range occs {
		localTime := occ.StartTime.In(loc)
		if localTime.Hour() != 9 || localTime.Minute() != 0 {
			t.Errorf("expected 9:00 AM local time on %s, got %02d:%02d",
				localTime.Format("2006-01-02"), localTime.Hour(), localTime.Minute())
		}
	}

	// Verify Oct 30 is 13:00 UTC
	if occs[0].StartTime.UTC().Hour() != 13 {
		t.Errorf("Oct 30 occurrence UTC hour = %d, want 13", occs[0].StartTime.UTC().Hour())
	}
	// Verify Nov 2 (Monday after fall back) is 14:00 UTC (EST)
	if occs[3].StartTime.UTC().Hour() != 14 {
		t.Errorf("Nov 2 occurrence UTC hour = %d, want 14", occs[3].StartTime.UTC().Hour())
	}
}

func TestRecurrenceLeapYearFeb29(t *testing.T) {
	// A yearly event starting Feb 29, 2024 (leap year)
	master := &Event{
		ID:         "cev_leap",
		SpaceID:    "spc_1",
		CalendarID: "cal_1",
		Title:      "Leap Day Celebration",
		IsAllDay:   true,
		StartDate:  new("2024-02-29"),
		EndDate:    new("2024-03-01"),
		RRULE:      new("FREQ=YEARLY;COUNT=3"),
	}

	rangeStart := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)
	rangeEnd := time.Date(2027, 1, 1, 0, 0, 0, 0, time.UTC)

	occs := ExpandOccurrences([]*Event{master}, nil, rangeStart, rangeEnd)
	if len(occs) != 3 {
		t.Fatalf("expected 3 occurrences, got %d", len(occs))
	}

	if *occs[0].StartDate != "2024-02-29" {
		t.Errorf("occurrence 0 = %s, want 2024-02-29", *occs[0].StartDate)
	}
	if *occs[1].StartDate != "2025-02-28" {
		t.Errorf("occurrence 1 = %s, want 2025-02-28", *occs[1].StartDate)
	}
	if *occs[2].StartDate != "2026-02-28" {
		t.Errorf("occurrence 2 = %s, want 2026-02-28", *occs[2].StartDate)
	}
}

func TestRecurrenceCountAndUntil(t *testing.T) {
	startTime := time.Date(2026, 5, 1, 10, 0, 0, 0, time.UTC)
	endTime := startTime.Add(time.Hour)

	// COUNT = 3
	mCount := &Event{
		ID:         "cev_count",
		SpaceID:    "spc_1",
		CalendarID: "cal_1",
		Title:      "Weekly Sync",
		IsAllDay:   false,
		StartTime:  &startTime,
		EndTime:    &endTime,
		Timezone:   new("UTC"),
		RRULE:      new("FREQ=WEEKLY;COUNT=3"),
	}

	rangeStart := time.Date(2026, 4, 1, 0, 0, 0, 0, time.UTC)
	rangeEnd := time.Date(2026, 12, 31, 0, 0, 0, 0, time.UTC)

	occsCount := ExpandOccurrences([]*Event{mCount}, nil, rangeStart, rangeEnd)
	if len(occsCount) != 3 {
		t.Errorf("expected 3 occurrences for COUNT=3, got %d", len(occsCount))
	}

	// UNTIL = 20260515T235959Z (3 occurrences: May 1, May 8, May 15)
	mUntil := &Event{
		ID:         "cev_until",
		SpaceID:    "spc_1",
		CalendarID: "cal_1",
		Title:      "Weekly Sync",
		IsAllDay:   false,
		StartTime:  &startTime,
		EndTime:    &endTime,
		Timezone:   new("UTC"),
		RRULE:      new("FREQ=WEEKLY;UNTIL=20260515T235959Z"),
	}

	occsUntil := ExpandOccurrences([]*Event{mUntil}, nil, rangeStart, rangeEnd)
	if len(occsUntil) != 3 {
		t.Errorf("expected 3 occurrences for UNTIL, got %d", len(occsUntil))
	}
}

func TestRecurrenceExdatesAndExceptions(t *testing.T) {
	startTime := time.Date(2026, 6, 1, 15, 0, 0, 0, time.UTC) // Monday
	endTime := startTime.Add(time.Hour)

	// June 1 (Mon), June 8 (Mon), June 15 (Mon), June 22 (Mon)
	exdateJune8 := "20260608T150000Z"
	master := &Event{
		ID:         "cev_master",
		SpaceID:    "spc_1",
		CalendarID: "cal_1",
		Title:      "Design Review",
		IsAllDay:   false,
		StartTime:  &startTime,
		EndTime:    &endTime,
		Timezone:   new("UTC"),
		RRULE:      new("FREQ=WEEKLY;COUNT=4"),
		EXDates:    []string{exdateJune8},
	}

	// Exception for June 15: modified title and shifted by 2 hours
	origJune15 := time.Date(2026, 6, 15, 15, 0, 0, 0, time.UTC)
	modStart := time.Date(2026, 6, 15, 17, 0, 0, 0, time.UTC)
	modEnd := modStart.Add(time.Hour)
	excJune15 := &Event{
		ID:                "cev_exc_june15",
		SpaceID:           "spc_1",
		CalendarID:        "cal_1",
		RecurringMasterID: new("cev_master"),
		Title:             "Special Design Review",
		IsAllDay:          false,
		StartTime:         &modStart,
		EndTime:           &modEnd,
		Timezone:          new("UTC"),
		OriginalStartTime: &origJune15,
		Status:            EventStatusConfirmed,
	}

	// Cancelled exception for June 22
	origJune22 := time.Date(2026, 6, 22, 15, 0, 0, 0, time.UTC)
	excJune22 := &Event{
		ID:                "cev_exc_june22",
		SpaceID:           "spc_1",
		CalendarID:        "cal_1",
		RecurringMasterID: new("cev_master"),
		Title:             "Design Review",
		IsAllDay:          false,
		StartTime:         &origJune22,
		EndTime:           &origJune22,
		Timezone:          new("UTC"),
		OriginalStartTime: &origJune22,
		Status:            EventStatusCancelled,
	}

	rangeStart := time.Date(2026, 5, 30, 0, 0, 0, 0, time.UTC)
	rangeEnd := time.Date(2026, 6, 30, 0, 0, 0, 0, time.UTC)

	occs := ExpandOccurrences(
		[]*Event{master},
		[]*Event{excJune15, excJune22},
		rangeStart,
		rangeEnd,
	)

	// Expected:
	// - June 1: master occurrence
	// - June 8: suppressed by EXDATE
	// - June 15: substituted by excJune15 ("Special Design Review" at 17:00)
	// - June 22: suppressed because excJune22 is cancelled
	if len(occs) != 2 {
		t.Fatalf("expected 2 occurrences, got %d", len(occs))
	}

	if occs[0].Title != "Design Review" || occs[0].StartTime.UTC().Day() != 1 {
		t.Errorf("occurrence 0 mismatch: title=%s, day=%d", occs[0].Title, occs[0].StartTime.UTC().Day())
	}
	if occs[1].Title != "Special Design Review" || occs[1].StartTime.UTC().Hour() != 17 || !occs[1].IsException {
		t.Errorf("occurrence 1 mismatch: title=%s, hour=%d, isExc=%v",
			occs[1].Title, occs[1].StartTime.UTC().Hour(), occs[1].IsException)
	}
}
