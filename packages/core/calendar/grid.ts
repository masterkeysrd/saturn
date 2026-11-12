import {
  type DateInput,
  parseDate,
  getTimezoneParts,
  getStartOfDay,
  sanitizeTimezone,
} from "../timezone"

export interface DayBoundaries {
  startOfDay: Date
  endOfDay: Date
  nextDayStart: Date
  durationMs: number
}

/**
 * Calculates accurate UTC start, end, and duration boundaries for a given calendar day
 * in a specified IANA timezone, correctly handling 23h and 25h DST transition days.
 */
export function getDayBoundaries(
  date: DateInput,
  timeZone: string
): DayBoundaries {
  const tz = sanitizeTimezone(timeZone)

  let year: number
  let month: number
  let day: number

  if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [y, m, d] = date.split("-").map(Number)
    year = y
    month = m
    day = d
  } else {
    const parsed = parseDate(date) ?? new Date()
    const parts = getTimezoneParts(parsed, tz)
    if (!parts) {
      const d = parseDate(date) ?? new Date()
      const fallbackStart = new Date(d)
      fallbackStart.setHours(0, 0, 0, 0)
      const fallbackNext = new Date(fallbackStart.getTime() + 86_400_000)
      return {
        startOfDay: fallbackStart,
        endOfDay: new Date(fallbackNext.getTime() - 1),
        nextDayStart: fallbackNext,
        durationMs: 86_400_000,
      }
    }
    year = parts.year
    month = parts.month
    day = parts.day
  }

  // Use local noon in UTC to avoid midnight boundary ambiguity
  const currentDayNoonUtc = new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
  const startOfDay = getStartOfDay(currentDayNoonUtc, tz)

  // Find next day's local midnight across DST transitions
  const nextDayNoonUtc = new Date(Date.UTC(year, month - 1, day + 1, 12, 0, 0))
  const nextDayStart = getStartOfDay(nextDayNoonUtc, tz)
  const durationMs = nextDayStart.getTime() - startOfDay.getTime()
  const endOfDay = new Date(nextDayStart.getTime() - 1)

  return {
    startOfDay,
    endOfDay,
    nextDayStart,
    durationMs,
  }
}

export interface MonthDayCell {
  date: Date
  dateString: string // "YYYY-MM-DD"
  year: number
  month: number // 1-12
  day: number // 1-31
  dayOfWeek: number // 0 (Sunday) to 6 (Saturday)
  isCurrentMonth: boolean
  isToday: boolean
  isWeekend: boolean
}

export interface MonthMatrixOptions {
  weekStartsOn?: 0 | 1 // 0 = Sunday (default), 1 = Monday
  timeZone?: string
  fixedWeeks?: boolean // true = always 6 weeks (42 days), false = 5 or 6 weeks
}

/**
 * Formats a local date in a timezone to "YYYY-MM-DD".
 */
export function formatLocalDateString(
  date: DateInput,
  timeZone: string
): string {
  const parts = getTimezoneParts(date, timeZone)
  if (!parts) return ""
  const y = String(parts.year).padStart(4, "0")
  const m = String(parts.month).padStart(2, "0")
  const d = String(parts.day).padStart(2, "0")
  return `${y}-${m}-${d}`
}

/**
 * Generates a Month grid matrix (array of weeks) for a given year and month in an IANA timezone.
 */
export function getMonthMatrix(
  year: number,
  month: number, // 1-12
  options?: MonthMatrixOptions
): MonthDayCell[][] {
  const tz = sanitizeTimezone(options?.timeZone)
  const weekStartsOn = options?.weekStartsOn ?? 0
  const fixedWeeks = options?.fixedWeeks ?? true

  const nowParts = getTimezoneParts(new Date(), tz)
  const todayString = nowParts
    ? `${String(nowParts.year).padStart(4, "0")}-${String(nowParts.month).padStart(2, "0")}-${String(nowParts.day).padStart(2, "0")}`
    : ""

  // First day of target month at local noon to avoid DST edge anomalies
  const firstOfMonthNoon = new Date(Date.UTC(year, month - 1, 1, 12, 0, 0))
  const firstParts = getTimezoneParts(firstOfMonthNoon, tz)!
  const firstDayOfWeek = new Date(
    Date.UTC(firstParts.year, firstParts.month - 1, firstParts.day, 12, 0, 0)
  ).getUTCDay()

  // Calculate days before the 1st of month to align with weekStartsOn
  let leadingDays = (firstDayOfWeek - weekStartsOn + 7) % 7

  // Days in target month
  const daysInMonth = new Date(Date.UTC(year, month, 0, 12, 0, 0)).getUTCDate()

  // Total cells to display
  let totalDays = leadingDays + daysInMonth
  if (fixedWeeks) {
    totalDays = 42
  } else {
    const remainder = totalDays % 7
    if (remainder !== 0) {
      totalDays += 7 - remainder
    }
  }

  const cells: MonthDayCell[] = []

  for (let i = 0; i < totalDays; i++) {
    const dayOffset = i - leadingDays + 1
    const cellNoon = new Date(Date.UTC(year, month - 1, dayOffset, 12, 0, 0))
    const cellParts = getTimezoneParts(cellNoon, tz)!
    const dateString = `${String(cellParts.year).padStart(4, "0")}-${String(cellParts.month).padStart(2, "0")}-${String(cellParts.day).padStart(2, "0")}`
    const cellDate = getStartOfDay(cellNoon, tz)
    const dayOfWeek = cellNoon.getUTCDay()

    cells.push({
      date: cellDate,
      dateString,
      year: cellParts.year,
      month: cellParts.month,
      day: cellParts.day,
      dayOfWeek,
      isCurrentMonth: cellParts.year === year && cellParts.month === month,
      isToday: dateString === todayString,
      isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
    })
  }

  // Split into weeks of 7 days
  const weeks: MonthDayCell[][] = []
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7))
  }

  return weeks
}

export interface WeekDayHeader {
  date: Date
  dateString: string
  dayOfWeek: number
  dayName: string
  dayNumber: number
  isToday: boolean
}

/**
 * Returns the 7 days of the week containing targetDate aligned to weekStartsOn in an IANA timezone.
 */
export function getWeekDays(
  targetDate: DateInput,
  options?: { weekStartsOn?: 0 | 1; timeZone?: string; locale?: string }
): WeekDayHeader[] {
  const tz = sanitizeTimezone(options?.timeZone)
  const weekStartsOn = options?.weekStartsOn ?? 0
  const locale = options?.locale ?? "en-US"

  const parts = getTimezoneParts(targetDate, tz)
  if (!parts) return []

  const noon = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0)
  )
  const dayOfWeek = noon.getUTCDay()
  const offsetToStart = (dayOfWeek - weekStartsOn + 7) % 7

  const nowParts = getTimezoneParts(new Date(), tz)
  const todayString = nowParts
    ? `${String(nowParts.year).padStart(4, "0")}-${String(nowParts.month).padStart(2, "0")}-${String(nowParts.day).padStart(2, "0")}`
    : ""

  const dayFormatter = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    timeZone: tz,
  })

  const days: WeekDayHeader[] = []
  for (let i = 0; i < 7; i++) {
    const dayIndex = i - offsetToStart
    const dNoon = new Date(
      Date.UTC(parts.year, parts.month - 1, parts.day + dayIndex, 12, 0, 0)
    )
    const dParts = getTimezoneParts(dNoon, tz)!
    const dateString = `${String(dParts.year).padStart(4, "0")}-${String(dParts.month).padStart(2, "0")}-${String(dParts.day).padStart(2, "0")}`
    const cellDate = getStartOfDay(dNoon, tz)

    days.push({
      date: cellDate,
      dateString,
      dayOfWeek: dNoon.getUTCDay(),
      dayName: dayFormatter.format(dNoon),
      dayNumber: dParts.day,
      isToday: dateString === todayString,
    })
  }

  return days
}

export interface HourSlot {
  hour: number // 0-23
  minute: number // 0-59
  timeString: string // "00:00", "01:00"
  label: string // "12 AM", "1 AM", ...
}

/**
 * Generates hour slots for time grids (00:00 to 24:00).
 */
export function getHourSlots(options?: {
  startHour?: number
  endHour?: number
  stepMinutes?: number
}): HourSlot[] {
  const startHour = options?.startHour ?? 0
  const endHour = options?.endHour ?? 24
  const stepMinutes = options?.stepMinutes ?? 60

  const slots: HourSlot[] = []

  for (let h = startHour; h < endHour; h++) {
    for (let m = 0; m < 60; m += stepMinutes) {
      const timeString = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
      const period = h < 12 ? "AM" : "PM"
      const displayHour = h % 12 === 0 ? 12 : h % 12
      const label =
        m === 0
          ? `${displayHour} ${period}`
          : `${displayHour}:${String(m).padStart(2, "0")} ${period}`

      slots.push({
        hour: h,
        minute: m,
        timeString,
        label,
      })
    }
  }

  return slots
}
