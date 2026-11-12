package calendar

import "github.com/masterkeysrd/saturn/internal/platform/errors"

// Error codes for the calendar domain.
const (
	ErrCalendarNotFound    errors.Code = "CALENDAR_NOT_FOUND"
	ErrEventNotFound       errors.Code = "EVENT_NOT_FOUND"
	ErrReadOnlyCalendar    errors.Code = "READ_ONLY_CALENDAR"
	ErrInvalidEventTime    errors.Code = "INVALID_EVENT_TIME"
	ErrInvalidRecurrence   errors.Code = "INVALID_RECURRENCE"
	ErrCannotDeleteDefault errors.Code = "CANNOT_DELETE_DEFAULT_CALENDAR"
)
