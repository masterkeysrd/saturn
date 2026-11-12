import {
  formatLocalDateString,
  getTimezoneParts,
  parseDate,
  type DateInput,
} from "@saturn/core"
import type { EventOccurrence } from "@saturn/api/saturn/calendar/v1/calendar"

export interface CalendarDateSection {
  title: string
  dateString: string // "YYYY-MM-DD"
  isToday: boolean
  data: EventOccurrence[]
}

/**
 * Groups occurrences chronologically by local date within the specified timezone.
 * Accurately handles timezone offsets, all-day vs timed ordering, and day boundaries.
 */
export function groupEventsByDate(
  events: EventOccurrence[],
  timeZone: string
): CalendarDateSection[] {
  if (!events || events.length === 0) return []

  const todayStr = formatLocalDateString(new Date(), timeZone)

  // Map to hold events by date string
  const dateMap = new Map<string, EventOccurrence[]>()

  // Helper to extract the local dateString for an occurrence
  const getDateKey = (occ: EventOccurrence): string => {
    if (occ.isAllDay && occ.startDate) {
      return occ.startDate
    }
    if (occ.startTime) {
      const parsed = parseDate(occ.startTime)
      if (parsed) {
        const local = formatLocalDateString(parsed, timeZone)
        if (local) return local
      }
      return occ.startTime.slice(0, 10)
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

  const formatter = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone,
  })

  for (const dateKey of sortedKeys) {
    const dayEvents = dateMap.get(dateKey) || []

    // Sort events within the day: all-day first, then by startTime ascending
    dayEvents.sort((a, b) => {
      if (a.isAllDay && !b.isAllDay) return -1
      if (!a.isAllDay && b.isAllDay) return 1
      const aTime = a.startTime ? new Date(a.startTime).getTime() : 0
      const bTime = b.startTime ? new Date(b.startTime).getTime() : 0
      if (aTime !== bTime) return aTime - bTime
      return (a.instanceId || a.eventId).localeCompare(
        b.instanceId || b.eventId
      )
    })

    const [y, m, d] = dateKey.split("-").map(Number)
    const noonUtc = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
    const title = formatter.format(noonUtc)

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
  timeZone: string
): string {
  if (occ.isAllDay) {
    return "All day"
  }
  if (!occ.startTime) return ""

  const timeFormatter = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  })

  const sDate = parseDate(occ.startTime)
  const eDate = occ.endTime ? parseDate(occ.endTime) : null

  if (!sDate) return ""

  const startFormatted = timeFormatter.format(sDate)
  if (!eDate) return startFormatted

  const endFormatted = timeFormatter.format(eDate)
  return `${startFormatted} – ${endFormatted}`
}
