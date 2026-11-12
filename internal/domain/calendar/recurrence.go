package calendar

import (
	"fmt"
	"slices"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

// EventOccurrence represents a concrete expanded occurrence of a timed or all-day event in a viewport.
type EventOccurrence struct {
	EventID           string            `json:"event_id"`
	MasterID          *string           `json:"master_id,omitempty"`
	CalendarID        string            `json:"calendar_id"`
	Title             string            `json:"title"`
	Description       *string           `json:"description,omitempty"`
	Location          *string           `json:"location,omitempty"`
	Status            EventStatus       `json:"status"`
	Visibility        EventVisibility   `json:"visibility"`
	Transparency      EventTransparency `json:"transparency"`
	IsAllDay          bool              `json:"is_all_day"`
	StartTime         *time.Time        `json:"start_time,omitempty"`
	EndTime           *time.Time        `json:"end_time,omitempty"`
	Timezone          *string           `json:"timezone,omitempty"`
	StartDate         *string           `json:"start_date,omitempty"` // YYYY-MM-DD
	EndDate           *string           `json:"end_date,omitempty"`   // YYYY-MM-DD (exclusive)
	OriginalStartTime *time.Time        `json:"original_start_time,omitempty"`
	OriginalStartDate *string           `json:"original_start_date,omitempty"`
	IsException       bool              `json:"is_exception"`
}

// Frequency represents the recurrence cycle.
type Frequency string

const (
	FreqDaily   Frequency = "DAILY"
	FreqWeekly  Frequency = "WEEKLY"
	FreqMonthly Frequency = "MONTHLY"
	FreqYearly  Frequency = "YEARLY"
)

// WeekdayNum represents a weekday with an optional ordinal position (e.g. 1MO for 1st Monday, -1SU for last Sunday, 0 for every Monday).
type WeekdayNum struct {
	Day time.Weekday
	Ord int // 0 = all, 1 = 1st, 2 = 2nd, -1 = last, etc.
}

// RecurrenceRule encapsulates parsed RFC 5545 RRULE parameters.
type RecurrenceRule struct {
	Freq       Frequency
	Interval   int
	Count      *int
	Until      *time.Time
	UntilDate  *string // YYYY-MM-DD for all-day events
	ByDay      []WeekdayNum
	ByMonthDay []int
	ByMonth    []int
	BySetPos   []int
}

// ParseRRULE parses an RFC 5545 RRULE string into a RecurrenceRule struct.
func ParseRRULE(rruleStr string) (*RecurrenceRule, error) {
	rruleStr = strings.TrimSpace(rruleStr)
	if strings.HasPrefix(strings.ToUpper(rruleStr), "RRULE:") {
		rruleStr = rruleStr[6:]
	}

	parts := strings.Split(rruleStr, ";")
	r := &RecurrenceRule{
		Interval: 1,
	}

	for _, part := range parts {
		kv := strings.SplitN(part, "=", 2)
		if len(kv) != 2 {
			continue
		}
		key := strings.ToUpper(strings.TrimSpace(kv[0]))
		val := strings.TrimSpace(kv[1])

		switch key {
		case "FREQ":
			freq := Frequency(strings.ToUpper(val))
			switch freq {
			case FreqDaily, FreqWeekly, FreqMonthly, FreqYearly:
				r.Freq = freq
			default:
				return nil, errors.E(errors.Invalid, "unsupported RRULE FREQ: %s", val)
			}
		case "INTERVAL":
			n, err := strconv.Atoi(val)
			if err != nil || n <= 0 {
				return nil, errors.E(errors.Invalid, "invalid RRULE INTERVAL: %s", val)
			}
			r.Interval = n
		case "COUNT":
			n, err := strconv.Atoi(val)
			if err != nil || n < 0 {
				return nil, errors.E(errors.Invalid, "invalid RRULE COUNT: %s", val)
			}
			r.Count = &n
		case "UNTIL":
			// Can be UTC timestamp (e.g. 20261231T235959Z or 2026-12-31T23:59:59Z) or date (20261231 or 2026-12-31)
			t, err := parseFlexTime(val)
			if err == nil {
				r.Until = &t
			} else {
				// Treat as date
				dStr := normalizeDateString(val)
				if dStr != "" {
					r.UntilDate = &dStr
					dTime, err := time.Parse(time.DateOnly, dStr)
					if err == nil {
						endOfDay := dTime.Add(24*time.Hour - time.Nanosecond)
						r.Until = &endOfDay
					}
				}
			}
		case "BYDAY":
			dayTokens := strings.Split(val, ",")
			for _, dt := range dayTokens {
				wn, err := parseWeekdayNum(dt)
				if err != nil {
					return nil, err
				}
				r.ByDay = append(r.ByDay, wn)
			}
		case "BYMONTHDAY":
			nums := strings.Split(val, ",")
			for _, ns := range nums {
				n, err := strconv.Atoi(strings.TrimSpace(ns))
				if err != nil || n == 0 || n < -31 || n > 31 {
					return nil, errors.E(errors.Invalid, "invalid BYMONTHDAY: %s", ns)
				}
				r.ByMonthDay = append(r.ByMonthDay, n)
			}
		case "BYMONTH":
			nums := strings.Split(val, ",")
			for _, ns := range nums {
				n, err := strconv.Atoi(strings.TrimSpace(ns))
				if err != nil || n < 1 || n > 12 {
					return nil, errors.E(errors.Invalid, "invalid BYMONTH: %s", ns)
				}
				r.ByMonth = append(r.ByMonth, n)
			}
		case "BYSETPOS":
			nums := strings.Split(val, ",")
			for _, ns := range nums {
				n, err := strconv.Atoi(strings.TrimSpace(ns))
				if err != nil || n == 0 {
					return nil, errors.E(errors.Invalid, "invalid BYSETPOS: %s", ns)
				}
				r.BySetPos = append(r.BySetPos, n)
			}
		}
	}

	if r.Freq == "" {
		return nil, errors.E(errors.Invalid, "RRULE missing required FREQ property")
	}

	return r, nil
}

func parseWeekdayNum(s string) (WeekdayNum, error) {
	s = strings.ToUpper(strings.TrimSpace(s))
	if len(s) < 2 {
		return WeekdayNum{}, errors.E(errors.Invalid, "invalid BYDAY: %s", s)
	}

	dayStr := s[len(s)-2:]
	ordStr := s[:len(s)-2]

	var day time.Weekday
	switch dayStr {
	case "SU":
		day = time.Sunday
	case "MO":
		day = time.Monday
	case "TU":
		day = time.Tuesday
	case "WE":
		day = time.Wednesday
	case "TH":
		day = time.Thursday
	case "FR":
		day = time.Friday
	case "SA":
		day = time.Saturday
	default:
		return WeekdayNum{}, errors.E(errors.Invalid, "invalid weekday in BYDAY: %s", dayStr)
	}

	ord := 0
	if ordStr != "" {
		var err error
		ord, err = strconv.Atoi(ordStr)
		if err != nil {
			return WeekdayNum{}, errors.E(errors.Invalid, "invalid ordinal in BYDAY: %s", ordStr)
		}
	}

	return WeekdayNum{Day: day, Ord: ord}, nil
}

func parseFlexTime(s string) (time.Time, error) {
	formats := []string{
		"20060102T150405Z",
		"20060102T150405",
		time.RFC3339,
		"2006-01-02T15:04:05Z",
		"2006-01-02T15:04:05",
	}
	for _, f := range formats {
		if t, err := time.Parse(f, s); err == nil {
			return t.UTC(), nil
		}
	}
	return time.Time{}, fmt.Errorf("unable to parse time: %s", s)
}

func normalizeDateString(s string) string {
	s = strings.TrimSpace(s)
	if len(s) == 8 && !strings.Contains(s, "-") {
		// YYYYMMDD -> YYYY-MM-DD
		return s[:4] + "-" + s[4:6] + "-" + s[6:]
	}
	if len(s) == 10 && strings.Count(s, "-") == 2 {
		return s
	}
	return ""
}

// ExpandOccurrences expands recurring master events and merges exceptions within the viewport [rangeStart, rangeEnd].
func ExpandOccurrences(
	masters []*Event,
	exceptions []*Event,
	rangeStart time.Time,
	rangeEnd time.Time,
) []*EventOccurrence {
	// Index exceptions by master ID
	exceptionsByMaster := make(map[string][]*Event)
	for _, exc := range exceptions {
		if exc.RecurringMasterID != nil && *exc.RecurringMasterID != "" {
			exceptionsByMaster[*exc.RecurringMasterID] = append(exceptionsByMaster[*exc.RecurringMasterID], exc)
		}
	}

	var occurrences []*EventOccurrence

	for _, master := range masters {
		masterExceptions := exceptionsByMaster[master.ID]

		if master.RRULE == nil || strings.TrimSpace(*master.RRULE) == "" {
			// Non-recurring single event
			occ := singleOccurrenceFromEvent(master)
			if occurrenceOverlaps(occ, rangeStart, rangeEnd) {
				occurrences = append(occurrences, occ)
			}
			continue
		}

		// Recurring master event
		rule, err := ParseRRULE(*master.RRULE)
		if err != nil {
			// Fallback: emit single instance if invalid rule
			occ := singleOccurrenceFromEvent(master)
			if occurrenceOverlaps(occ, rangeStart, rangeEnd) {
				occurrences = append(occurrences, occ)
			}
			continue
		}

		if master.IsAllDay {
			expanded := expandAllDay(master, rule, masterExceptions, rangeStart, rangeEnd)
			occurrences = append(occurrences, expanded...)
		} else {
			expanded := expandTimed(master, rule, masterExceptions, rangeStart, rangeEnd)
			occurrences = append(occurrences, expanded...)
		}
	}

	// Sort chronologically
	sortOccurrences(occurrences)

	return occurrences
}

func singleOccurrenceFromEvent(e *Event) *EventOccurrence {
	return &EventOccurrence{
		EventID:           e.ID,
		MasterID:          e.RecurringMasterID,
		CalendarID:        e.CalendarID,
		Title:             e.Title,
		Description:       e.Description,
		Location:          e.Location,
		Status:            e.Status,
		Visibility:        e.Visibility,
		Transparency:      e.Transparency,
		IsAllDay:          e.IsAllDay,
		StartTime:         e.StartTime,
		EndTime:           e.EndTime,
		Timezone:          e.Timezone,
		StartDate:         e.StartDate,
		EndDate:           e.EndDate,
		OriginalStartTime: e.OriginalStartTime,
		OriginalStartDate: e.OriginalStartDate,
		IsException:       e.RecurringMasterID != nil,
	}
}

func occurrenceOverlaps(occ *EventOccurrence, rangeStart, rangeEnd time.Time) bool {
	if occ.IsAllDay {
		if occ.StartDate == nil || occ.EndDate == nil {
			return false
		}
		rangeStartDate := rangeStart.UTC().Format(time.DateOnly)
		rangeEndDate := rangeEnd.UTC().Format(time.DateOnly)
		return *occ.StartDate < rangeEndDate && *occ.EndDate > rangeStartDate
	}

	if occ.StartTime == nil || occ.EndTime == nil {
		return false
	}
	return occ.StartTime.Before(rangeEnd) && occ.EndTime.After(rangeStart)
}

func expandTimed(
	master *Event,
	rule *RecurrenceRule,
	exceptions []*Event,
	rangeStart time.Time,
	rangeEnd time.Time,
) []*EventOccurrence {
	if master.StartTime == nil || master.EndTime == nil {
		return nil
	}

	tzName := "UTC"
	if master.Timezone != nil && *master.Timezone != "" {
		tzName = *master.Timezone
	}
	loc, err := time.LoadLocation(tzName)
	if err != nil {
		loc = time.UTC
	}

	duration := master.EndTime.Sub(*master.StartTime)
	localStart := master.StartTime.In(loc)
	hour, min, sec := localStart.Hour(), localStart.Minute(), localStart.Second()

	// Track applied exception IDs so unapplied ones (e.g. rescheduled into viewport) can be added
	appliedExceptions := make(map[string]bool)

	var result []*EventOccurrence
	count := 0
	cur := localStart

	// Limit maximum iterations to prevent infinite loops on pathological rules
	const maxIterations = 2000
	iterations := 0

	for iterations < maxIterations {
		iterations++

		// Check COUNT
		if rule.Count != nil && count >= *rule.Count {
			break
		}

		// Check UNTIL (evaluated in UTC)
		if rule.Until != nil && cur.UTC().After(*rule.Until) {
			break
		}

		// Stop if cur is well beyond rangeEnd (only if no COUNT is active that might terminate earlier)
		if rule.Count == nil && cur.After(rangeEnd.In(loc).Add(24*time.Hour)) {
			break
		}

		// Generate occurrences for this cycle step
		candidates := getCandidatesForStep(cur, rule, loc, hour, min, sec)

		for _, cand := range candidates {
			if cand.Before(localStart) {
				continue
			}

			if rule.Count != nil && count >= *rule.Count {
				break
			}
			if rule.Until != nil && cand.UTC().After(*rule.Until) {
				break
			}

			count++

			candUTC := cand.UTC()
			candEndUTC := candUTC.Add(duration)

			// Check EXDATES
			if isEXDateTimed(candUTC, master.EXDates) {
				continue
			}

			// Check matching exception
			var matchingExc *Event
			for _, exc := range exceptions {
				if exc.OriginalStartTime != nil && exc.OriginalStartTime.UTC().Equal(candUTC) {
					matchingExc = exc
					appliedExceptions[exc.ID] = true
					break
				}
			}

			if matchingExc != nil {
				// Substituted by exception
				if matchingExc.Status != EventStatusCancelled {
					occ := singleOccurrenceFromEvent(matchingExc)
					occ.MasterID = &master.ID
					occ.IsException = true
					if occurrenceOverlaps(occ, rangeStart, rangeEnd) {
						result = append(result, occ)
					}
				}
				continue
			}

			// Standard occurrence
			occ := &EventOccurrence{
				EventID:           fmt.Sprintf("%s_%s", master.ID, candUTC.Format("20060102T150405Z")),
				MasterID:          &master.ID,
				CalendarID:        master.CalendarID,
				Title:             master.Title,
				Description:       master.Description,
				Location:          master.Location,
				Status:            master.Status,
				Visibility:        master.Visibility,
				Transparency:      master.Transparency,
				IsAllDay:          false,
				StartTime:         &candUTC,
				EndTime:           &candEndUTC,
				Timezone:          master.Timezone,
				OriginalStartTime: &candUTC,
				IsException:       false,
			}

			if occurrenceOverlaps(occ, rangeStart, rangeEnd) {
				result = append(result, occ)
			}
		}

		cur = advanceStep(cur, rule, loc, hour, min, sec)
	}

	// Add any unapplied exceptions that were rescheduled into the viewport
	for _, exc := range exceptions {
		if !appliedExceptions[exc.ID] && exc.Status != EventStatusCancelled {
			occ := singleOccurrenceFromEvent(exc)
			occ.MasterID = &master.ID
			occ.IsException = true
			if occurrenceOverlaps(occ, rangeStart, rangeEnd) {
				result = append(result, occ)
			}
		}
	}

	return result
}

func expandAllDay(
	master *Event,
	rule *RecurrenceRule,
	exceptions []*Event,
	rangeStart time.Time,
	rangeEnd time.Time,
) []*EventOccurrence {
	if master.StartDate == nil || master.EndDate == nil {
		return nil
	}

	startD, err := time.Parse(time.DateOnly, *master.StartDate)
	if err != nil {
		return nil
	}
	endD, err := time.Parse(time.DateOnly, *master.EndDate)
	if err != nil {
		return nil
	}
	dayDuration := endD.Sub(startD)

	appliedExceptions := make(map[string]bool)
	var result []*EventOccurrence

	count := 0
	cur := startD

	const maxIterations = 2000
	iterations := 0

	for iterations < maxIterations {
		iterations++

		if rule.Count != nil && count >= *rule.Count {
			break
		}
		if rule.Until != nil && cur.After(*rule.Until) {
			break
		}
		if rule.Count == nil && cur.After(rangeEnd.Add(48*time.Hour)) {
			break
		}

		candidates := getCandidatesForStep(cur, rule, time.UTC, 0, 0, 0)

		for _, cand := range candidates {
			if cand.Before(startD) {
				continue
			}

			if rule.Count != nil && count >= *rule.Count {
				break
			}
			if rule.Until != nil && cand.After(*rule.Until) {
				break
			}

			count++

			dateStr := cand.Format(time.DateOnly)
			endDateStr := cand.Add(dayDuration).Format(time.DateOnly)

			if slices.Contains(master.EXDatesAllDay, dateStr) {
				continue
			}

			var matchingExc *Event
			for _, exc := range exceptions {
				if exc.OriginalStartDate != nil && *exc.OriginalStartDate == dateStr {
					matchingExc = exc
					appliedExceptions[exc.ID] = true
					break
				}
			}

			if matchingExc != nil {
				if matchingExc.Status != EventStatusCancelled {
					occ := singleOccurrenceFromEvent(matchingExc)
					occ.MasterID = &master.ID
					occ.IsException = true
					if occurrenceOverlaps(occ, rangeStart, rangeEnd) {
						result = append(result, occ)
					}
				}
				continue
			}

			occ := &EventOccurrence{
				EventID:           fmt.Sprintf("%s_%s", master.ID, dateStr),
				MasterID:          &master.ID,
				CalendarID:        master.CalendarID,
				Title:             master.Title,
				Description:       master.Description,
				Location:          master.Location,
				Status:            master.Status,
				Visibility:        master.Visibility,
				Transparency:      master.Transparency,
				IsAllDay:          true,
				StartDate:         &dateStr,
				EndDate:           &endDateStr,
				OriginalStartDate: &dateStr,
				IsException:       false,
			}

			if occurrenceOverlaps(occ, rangeStart, rangeEnd) {
				result = append(result, occ)
			}
		}

		cur = advanceStep(cur, rule, time.UTC, 0, 0, 0)
	}

	for _, exc := range exceptions {
		if !appliedExceptions[exc.ID] && exc.Status != EventStatusCancelled {
			occ := singleOccurrenceFromEvent(exc)
			occ.MasterID = &master.ID
			occ.IsException = true
			if occurrenceOverlaps(occ, rangeStart, rangeEnd) {
				result = append(result, occ)
			}
		}
	}

	return result
}

func getCandidatesForStep(
	cur time.Time,
	rule *RecurrenceRule,
	loc *time.Location,
	hour, min, sec int,
) []time.Time {
	switch rule.Freq {
	case FreqDaily:
		return []time.Time{cur}

	case FreqWeekly:
		if len(rule.ByDay) == 0 {
			return []time.Time{cur}
		}

		// Find the start of the week (Sunday or Monday, RFC5545 WKST default Monday)
		// Stepping through days of the current week matching BYDAY
		var candidates []time.Time
		weekStart := startOfWeek(cur, time.Monday)

		for i := range 7 {
			dayTime := weekStart.AddDate(0, 0, i)
			dayTime = time.Date(dayTime.Year(), dayTime.Month(), dayTime.Day(), hour, min, sec, 0, loc)

			for _, bd := range rule.ByDay {
				if dayTime.Weekday() == bd.Day {
					candidates = append(candidates, dayTime)
				}
			}
		}

		sort.Slice(candidates, func(i, j int) bool {
			return candidates[i].Before(candidates[j])
		})
		return candidates

	case FreqMonthly:
		if len(rule.ByDay) > 0 {
			var candidates []time.Time
			daysInMonth := daysIn(cur.Month(), cur.Year())

			for day := 1; day <= daysInMonth; day++ {
				t := time.Date(cur.Year(), cur.Month(), day, hour, min, sec, 0, loc)
				for _, bd := range rule.ByDay {
					if t.Weekday() == bd.Day {
						if bd.Ord == 0 {
							candidates = append(candidates, t)
						} else if bd.Ord > 0 && ordinalOfWeekday(t) == bd.Ord {
							candidates = append(candidates, t)
						} else if bd.Ord < 0 && reverseOrdinalOfWeekday(t) == bd.Ord {
							candidates = append(candidates, t)
						}
					}
				}
			}

			if len(rule.BySetPos) > 0 {
				candidates = filterBySetPos(candidates, rule.BySetPos)
			}
			return candidates
		}

		if len(rule.ByMonthDay) > 0 {
			var candidates []time.Time
			daysInMonth := daysIn(cur.Month(), cur.Year())

			for _, md := range rule.ByMonthDay {
				actualDay := md
				if md < 0 {
					actualDay = daysInMonth + md + 1
				}
				if actualDay >= 1 && actualDay <= daysInMonth {
					candidates = append(candidates, time.Date(cur.Year(), cur.Month(), actualDay, hour, min, sec, 0, loc))
				}
			}
			sort.Slice(candidates, func(i, j int) bool {
				return candidates[i].Before(candidates[j])
			})
			return candidates
		}

		return []time.Time{cur}

	case FreqYearly:
		if len(rule.ByMonth) > 0 {
			var candidates []time.Time
			for _, m := range rule.ByMonth {
				month := time.Month(m)
				day := cur.Day()
				maxDays := daysIn(month, cur.Year())
				if day > maxDays {
					day = maxDays
				}
				candidates = append(candidates, time.Date(cur.Year(), month, day, hour, min, sec, 0, loc))
			}
			return candidates
		}

		return []time.Time{cur}

	default:
		return []time.Time{cur}
	}
}

func advanceStep(cur time.Time, rule *RecurrenceRule, loc *time.Location, hour, min, sec int) time.Time {
	interval := max(rule.Interval, 1)

	switch rule.Freq {
	case FreqDaily:
		next := cur.AddDate(0, 0, interval)
		return time.Date(next.Year(), next.Month(), next.Day(), hour, min, sec, 0, loc)

	case FreqWeekly:
		next := cur.AddDate(0, 0, 7*interval)
		return time.Date(next.Year(), next.Month(), next.Day(), hour, min, sec, 0, loc)

	case FreqMonthly:
		nextYear := cur.Year()
		nextMonth := int(cur.Month()) + interval
		for nextMonth > 12 {
			nextYear++
			nextMonth -= 12
		}
		targetMonth := time.Month(nextMonth)
		day := cur.Day()
		maxDays := daysIn(targetMonth, nextYear)
		if day > maxDays {
			day = maxDays
		}
		return time.Date(nextYear, targetMonth, day, hour, min, sec, 0, loc)

	case FreqYearly:
		nextYear := cur.Year() + interval
		day := cur.Day()
		maxDays := daysIn(cur.Month(), nextYear)
		if day > maxDays {
			day = maxDays // Handles Feb 29 leap years smoothly
		}
		return time.Date(nextYear, cur.Month(), day, hour, min, sec, 0, loc)

	default:
		return cur.AddDate(0, 0, interval)
	}
}

func startOfWeek(t time.Time, wkst time.Weekday) time.Time {
	offset := int(t.Weekday() - wkst)
	if offset < 0 {
		offset += 7
	}
	return t.AddDate(0, 0, -offset)
}

func ordinalOfWeekday(t time.Time) int {
	return ((t.Day() - 1) / 7) + 1
}

func reverseOrdinalOfWeekday(t time.Time) int {
	daysInMonth := daysIn(t.Month(), t.Year())
	remaining := daysInMonth - t.Day()
	return -((remaining / 7) + 1)
}

func daysIn(m time.Month, year int) int {
	return time.Date(year, m+1, 0, 0, 0, 0, 0, time.UTC).Day()
}

func filterBySetPos(candidates []time.Time, bySetPos []int) []time.Time {
	if len(candidates) == 0 {
		return candidates
	}
	var filtered []time.Time
	for _, pos := range bySetPos {
		if pos > 0 && pos <= len(candidates) {
			filtered = append(filtered, candidates[pos-1])
		} else if pos < 0 && len(candidates)+pos >= 0 {
			filtered = append(filtered, candidates[len(candidates)+pos])
		}
	}
	sort.Slice(filtered, func(i, j int) bool {
		return filtered[i].Before(filtered[j])
	})
	return filtered
}

func isEXDateTimed(t time.Time, exdates []string) bool {
	if len(exdates) == 0 {
		return false
	}
	tUTC := t.UTC()
	for _, ex := range exdates {
		exParsed, err := parseFlexTime(ex)
		if err == nil && exParsed.Equal(tUTC) {
			return true
		}
	}
	return false
}

func sortOccurrences(occurrences []*EventOccurrence) {
	sort.Slice(occurrences, func(i, j int) bool {
		oi, oj := occurrences[i], occurrences[j]

		var ti, tj time.Time
		if oi.IsAllDay {
			if oi.StartDate != nil {
				ti, _ = time.Parse(time.DateOnly, *oi.StartDate)
			}
		} else if oi.StartTime != nil {
			ti = *oi.StartTime
		}

		if oj.IsAllDay {
			if oj.StartDate != nil {
				tj, _ = time.Parse(time.DateOnly, *oj.StartDate)
			}
		} else if oj.StartTime != nil {
			tj = *oj.StartTime
		}

		if !ti.Equal(tj) {
			return ti.Before(tj)
		}

		return oi.EventID < oj.EventID
	})
}
