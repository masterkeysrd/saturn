package storage

import (
	"database/sql"
	"time"
)

// ptrToString converts a *string to string.
func ptrToString(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

// strToPtr converts a string to *string.
func strToPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// timeToNullTime converts a time.Time to sql.NullTime.
func timeToNullTime(t time.Time) sql.NullTime {
	return sql.NullTime{Time: t, Valid: !t.IsZero()}
}

// nullTimeToTime converts a sql.NullTime to time.Time.
func nullTimeToTime(nt sql.NullTime) time.Time {
	if !nt.Valid {
		return time.Time{}
	}
	return nt.Time
}
