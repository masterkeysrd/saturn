package storage

import (
	"context"
	"database/sql"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/calendar"
	"github.com/masterkeysrd/saturn/internal/platform/connector"
)

// RegisterCapabilityCleaner registers the calendar cleanup handler for disabled connected accounts.
func RegisterCapabilityCleaner(store calendar.CalendarStore) {
	connector.RegisterCleaner(connector.CapabilityCalendar, func(ctx context.Context, spaceID, accountID string) error {
		return store.DeleteByConnectedAccount(ctx, spaceID, accountID)
	})
}

func strToNullString(s *string) sql.NullString {
	if s == nil || *s == "" {
		return sql.NullString{Valid: false}
	}
	return sql.NullString{String: *s, Valid: true}
}

func nullStringToStrPtr(ns sql.NullString) *string {
	if !ns.Valid {
		return nil
	}
	return &ns.String
}

func timeToNullTime(t *time.Time) sql.NullTime {
	if t == nil || t.IsZero() {
		return sql.NullTime{Valid: false}
	}
	return sql.NullTime{Time: *t, Valid: true}
}

func nullTimeToTimePtr(nt sql.NullTime) *time.Time {
	if !nt.Valid {
		return nil
	}
	return &nt.Time
}
