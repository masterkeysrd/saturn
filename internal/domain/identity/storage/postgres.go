package storage

import (
	"database/sql"
	"time"
)

// --- Helpers ---
func ptrToString(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

func strToPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func timeToNullTime(t time.Time) sql.NullTime {
	return sql.NullTime{Time: t, Valid: !t.IsZero()}
}

func nullTimeToTime(nt sql.NullTime) time.Time {
	if !nt.Valid {
		return time.Time{}
	}
	return nt.Time
}
