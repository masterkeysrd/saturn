import {
  formatDateWithTimezone,
  formatLocalDateString,
  getTimezoneParts,
  parseDate,
  sanitizeTimezone,
  type DateInput,
} from "@saturn/core"
import type { EventOccurrence } from "@saturn/api/saturn/calendar/v1/calendar"

export interface CalendarDateSection {
  title: string
  dateString: string // "YYYY-MM-DD"
  isToday: boolean
  data: EventOccurrence[]
}

function extractValidDateKey(
  raw: string | undefined,
  timeZone: string
): string {
  if (!raw) return ""
  const trimmed = raw.trim()
  if (!trimmed) return ""

  const leadingYmd = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/.exec(trimmed)
  if (leadingYmd) {
    const y = Number(leadingYmd[1])
    const m = Number(leadingYmd[2])
    const d = Number(leadingYmd[3])
    const check = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
    if (
      !isNaN(check.getTime()) &&
      check.getUTCFullYear() === y &&
      check.getUTCMonth() + 1 === m &&
      check.getUTCDate() === d
    ) {
      if (trimmed.length === 10) {
        return trimmed
      }
    }
  }

  const parsed = parseDate(trimmed)
  if (parsed && !isNaN(parsed.getTime())) {
    const local = formatLocalDateString(parsed, timeZone)
    if (/^\d{4}-\d{2}-\d{2}$/.test(local)) {
      return local
    }
  }

  if (leadingYmd) {
    return `${leadingYmd[1]}-${leadingYmd[2]}-${leadingYmd[3]}`
  }

  return ""
}

/**
 * Groups occurrences chronologically by local date within the specified timezone.
 * Accurately handles timezone offsets, all-day vs timed ordering, and day boundaries.
 */
export function groupEventsByDate(
  events: EventOccurrence[],
  timeZone: string,
  locale = "en-US"
): CalendarDateSection[] {
  if (!events || events.length === 0) return []

  const tz = sanitizeTimezone(timeZone)
  const todayStr = formatLocalDateString(new Date(), tz)

  // Map to hold events by date string
  const dateMap = new Map<string, EventOccurrence[]>()

  // Helper to extract the local dateString for an occurrence
  const getDateKey = (occ: EventOccurrence): string => {
    if (occ.isAllDay && occ.startDate) {
      const fromStartDate = extractValidDateKey(occ.startDate, tz)
      if (fromStartDate) return fromStartDate
    }
    if (occ.startTime) {
      const parsed = parseDate(occ.startTime)
      if (parsed && !isNaN(parsed.getTime())) {
        const local = formatLocalDateString(parsed, tz)
        if (/^\d{4}-\d{2}-\d{2}$/.test(local)) return local
      }
      const fallback = extractValidDateKey(occ.startTime, tz)
      if (fallback) return fallback
    }
    if (occ.startDate) {
      return extractValidDateKey(occ.startDate, tz)
    }
    return ""
  }

  for (const occ of events) {
    const key = getDateKey(occ)
    if (!key) continue
    const existing = dateMap.get(key)
    if (existing) {
      existing.push(occ)
    } else {
      dateMap.set(key, [occ])
    }
  }

  // Sort keys chronologically
  const sortedKeys = Array.from(dateMap.keys()).sort((a, b) =>
    a.localeCompare(b)
  )

  const sections: CalendarDateSection[] = []
  const nowParts = getTimezoneParts(new Date(), tz)

  for (const dateKey of sortedKeys) {
    const dayEvents = dateMap.get(dateKey) || []

    // Sort events within the day: all-day first, then by startTime ascending
    dayEvents.sort((a, b) => {
      if (a.isAllDay && !b.isAllDay) return -1
      if (!a.isAllDay && b.isAllDay) return 1
      const aTime = a.startTime ? (parseDate(a.startTime)?.getTime() ?? 0) : 0
      const bTime = b.startTime ? (parseDate(b.startTime)?.getTime() ?? 0) : 0
      if (aTime !== bTime) return aTime - bTime
      return (a.instanceId || a.eventId).localeCompare(
        b.instanceId || b.eventId
      )
    })

    const [y, m, d] = dateKey.split("-").map(Number)
    const noonUtc = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
    if (isNaN(noonUtc.getTime())) continue

    const isCurrentYear = nowParts ? y === nowParts.year : true
    const titleOpts: Intl.DateTimeFormatOptions = {
      weekday: "long",
      month: "long",
      day: "numeric",
      timeZone: tz,
    }
    if (!isCurrentYear) {
      titleOpts.year = "numeric"
    }
    let rawTitle = ""
    try {
      rawTitle = new Intl.DateTimeFormat(locale, titleOpts).format(noonUtc)
    } catch {
      rawTitle = formatDateWithTimezone(noonUtc, tz, titleOpts, locale)
    }
    const title = rawTitle
      ? rawTitle.charAt(0).toUpperCase() + rawTitle.slice(1)
      : dateKey

    sections.push({
      title,
      dateString: dateKey,
      isToday: dateKey === todayStr,
      data: dayEvents,
    })
  }

  return sections
}

/**
 * Returns an array of consecutive local dates starting from startDate.
 */
export function getConsecutiveDays(
  startDate: DateInput,
  count: number,
  timeZone: string
): string[] {
  const parts = getTimezoneParts(startDate, timeZone)
  if (!parts) return []

  const result: string[] = []
  for (let i = 0; i < count; i++) {
    const dNoon = new Date(
      Date.UTC(parts.year, parts.month - 1, parts.day + i, 12, 0, 0)
    )
    const dParts = getTimezoneParts(dNoon, timeZone)
    if (dParts) {
      const y = String(dParts.year).padStart(4, "0")
      const m = String(dParts.month).padStart(2, "0")
      const d = String(dParts.day).padStart(2, "0")
      result.push(`${y}-${m}-${d}`)
    }
  }
  return result
}

/**
 * Formats a time range display string for an occurrence in the given timezone.
 */
export function formatEventTime(
  occ: EventOccurrence,
  timeZone: string,
  locale = "en-US",
  allDayLabel = "All day"
): string {
  if (occ.isAllDay) {
    return allDayLabel
  }
  if (!occ.startTime) return ""

  const tz = sanitizeTimezone(timeZone)
  const sDate = parseDate(occ.startTime)
  const eDate = occ.endTime ? parseDate(occ.endTime) : null

  if (!sDate || isNaN(sDate.getTime())) return ""

  let startFormatted = ""
  try {
    const timeFormatter = new Intl.DateTimeFormat(locale, {
      hour: "numeric",
      minute: "2-digit",
      timeZone: tz,
    })
    startFormatted = timeFormatter.format(sDate).replace(/\u202f/g, " ")
    if (!eDate || isNaN(eDate.getTime())) return startFormatted
    const endFormatted = timeFormatter.format(eDate).replace(/\u202f/g, " ")
    return `${startFormatted} – ${endFormatted}`
  } catch {
    startFormatted = formatDateWithTimezone(
      sDate,
      tz,
      { hour: "numeric", minute: "2-digit" },
      locale
    ).replace(/\u202f/g, " ")
    if (!startFormatted) return ""
    if (!eDate || isNaN(eDate.getTime())) return startFormatted
    const endFormatted = formatDateWithTimezone(
      eDate,
      tz,
      { hour: "numeric", minute: "2-digit" },
      locale
    ).replace(/\u202f/g, " ")
    return endFormatted ? `${startFormatted} – ${endFormatted}` : startFormatted
  }
}

/**
 * Matches the signed-in user (or any of their connected account emails)
 * case-insensitively against an event's attendees list.
 */
export function findSelfAttendee<T extends { email?: string | null }>(
  attendees: T[] | undefined,
  selfEmails: (string | null | undefined)[]
): T | undefined {
  if (!attendees || attendees.length === 0) return undefined
  const normalizedSet = new Set(
    selfEmails
      .map((e) => (e ?? "").trim().toLowerCase())
      .filter((e) => e.length > 0)
  )
  if (normalizedSet.size === 0) return undefined
  return attendees.find((a) =>
    normalizedSet.has((a.email ?? "").trim().toLowerCase())
  )
}

export function toInclusiveCalendarEndDate(
  endDateStr: string,
  startDateStr: string
): string {
  if (
    !endDateStr ||
    endDateStr <= startDateStr ||
    !/^\d{4}-\d{2}-\d{2}$/.test(endDateStr)
  ) {
    return startDateStr
  }
  const [y, m, d] = endDateStr.split("-").map(Number)
  const prev = new Date(Date.UTC(y, m - 1, d - 1, 12, 0, 0))
  const py = String(prev.getUTCFullYear()).padStart(4, "0")
  const pm = String(prev.getUTCMonth() + 1).padStart(2, "0")
  const pd = String(prev.getUTCDate()).padStart(2, "0")
  return `${py}-${pm}-${pd}`
}

export type DuplicateEventRouteParams = {
  calendarId: string
  initialTitle: string
  initialDescription: string
  initialLocation: string
  initialIsAllDay: "true" | "false"
  initialDate: string
  initialEndDate: string
  initialStartTime: string
  initialEndTime: string
  initialTimezone: string
  initialMeetUrl: string
  initialAttendees?: string
}

export function buildDuplicateEventParams(
  occ: EventOccurrence,
  fallbackTimeZone: string,
  fallbackDate: Date = new Date()
): DuplicateEventRouteParams {
  const targetTz = occ.timezone || fallbackTimeZone
  const fallbackDateStr = formatLocalDateString(fallbackDate, targetTz)

  let initialDate = fallbackDateStr
  let initialEndDate = fallbackDateStr
  let initialStartTime = "09:00"
  let initialEndTime = "10:00"

  if (occ.isAllDay) {
    initialDate = occ.startDate || fallbackDateStr
    initialEndDate = toInclusiveCalendarEndDate(
      occ.endDate || initialDate,
      initialDate
    )
  } else {
    const startParsed = occ.startTime ? parseDate(occ.startTime) : null
    const endParsed = occ.endTime ? parseDate(occ.endTime) : null

    if (startParsed) {
      initialDate = formatLocalDateString(startParsed, targetTz)
      const sParts = getTimezoneParts(startParsed, targetTz)
      if (sParts) {
        initialStartTime = `${String(sParts.hour).padStart(2, "0")}:${String(sParts.minute).padStart(2, "0")}`
      }
    }

    if (endParsed) {
      initialEndDate = formatLocalDateString(endParsed, targetTz)
      const eParts = getTimezoneParts(endParsed, targetTz)
      if (eParts) {
        initialEndTime = `${String(eParts.hour).padStart(2, "0")}:${String(eParts.minute).padStart(2, "0")}`
      }
    } else {
      initialEndDate = initialDate
    }
  }

  const serializedAttendees =
    occ.attendees && occ.attendees.length > 0
      ? JSON.stringify(
          occ.attendees.map((a) => ({
            email: a.email,
            displayName: a.displayName,
            isOptional: a.isOptional,
          }))
        )
      : undefined

  return {
    calendarId: occ.calendarId || "",
    initialTitle: occ.title || "",
    initialDescription: occ.description || "",
    initialLocation: occ.location || "",
    initialIsAllDay: occ.isAllDay ? "true" : "false",
    initialDate,
    initialEndDate,
    initialStartTime,
    initialEndTime,
    initialTimezone: targetTz,
    initialMeetUrl: occ.meetUrl || "",
    ...(serializedAttendees ? { initialAttendees: serializedAttendees } : {}),
  }
}
