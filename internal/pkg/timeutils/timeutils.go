package timeutils

import "time"

// MonthStartEnd returns the first and last day of the month for the given time.
// The returned times are at midnight in the same location as t.
func MonthStartEnd(t time.Time) (time.Time, time.Time) {
	first := time.Date(t.Year(), t.Month(), 1, 0, 0, 0, 0, t.Location())
	last := first.AddDate(0, 1, -1)
	return first, last
}
