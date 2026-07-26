package storage

import (
	"database/sql"
	"time"

	"github.com/doug-martin/goqu/v9"
)

var pgDialect = goqu.Dialect("postgres")

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
