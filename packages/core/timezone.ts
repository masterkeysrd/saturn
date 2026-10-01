export type DateInput = Date | string | number | null | undefined

export function parseDate(date: DateInput): Date | null {
  if (date === null || date === undefined || date === "") {
    return null
  }
  const d = date instanceof Date ? date : new Date(date)
  if (isNaN(d.getTime())) {
    return null
  }
  return d
}

export function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz })
    return true
  } catch {
    return false
  }
}

export function sanitizeTimezone(tz?: string | null): string {
  if (!tz) return "UTC"
  return isValidTimezone(tz) ? tz : "UTC"
}

export interface TimezoneParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
  millisecond: number
}

export function getTimezoneParts(
  date: DateInput,
  timeZone: string
): TimezoneParts | null {
  const d = parseDate(date)
  if (!d) return null

  const tz = sanitizeTimezone(timeZone)
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })

  const parts = formatter.formatToParts(d)
  let year = 0
  let month = 0
  let day = 0
  let hour = 0
  let minute = 0
  let second = 0

  for (const part of parts) {
    switch (part.type) {
      case "year":
        year = Number(part.value)
        break
      case "month":
        month = Number(part.value)
        break
      case "day":
        day = Number(part.value)
        break
      case "hour":
        hour = Number(part.value) === 24 ? 0 : Number(part.value)
        break
      case "minute":
        minute = Number(part.value)
        break
      case "second":
        second = Number(part.value)
        break
    }
  }

  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    millisecond: d.getMilliseconds(),
  }
}

export function formatDateWithTimezone(
  date: DateInput,
  timeZone: string,
  options?: Intl.DateTimeFormatOptions,
  locale?: string
): string {
  const d = parseDate(date)
  if (!d) return ""

  const tz = sanitizeTimezone(timeZone)
  try {
    return new Intl.DateTimeFormat(locale || "en-US", {
      timeZone: tz,
      year: "numeric",
      month: "short",
      day: "numeric",
      ...options,
    }).format(d)
  } catch {
    return ""
  }
}

export function getStartOfDay(date: DateInput, timeZone: string): Date {
  const d = parseDate(date) ?? new Date()
  const tz = sanitizeTimezone(timeZone)
  const parts = getTimezoneParts(d, tz)
  if (!parts) return new Date(0)

  const utcGuess = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0, 0)
  )
  const invParts = getTimezoneParts(utcGuess, tz)
  if (!invParts) return utcGuess

  const targetAsUtc = Date.UTC(
    invParts.year,
    invParts.month - 1,
    invParts.day,
    invParts.hour,
    invParts.minute,
    invParts.second,
    0
  )
  const diff = targetAsUtc - utcGuess.getTime()

  return new Date(utcGuess.getTime() - diff)
}

export function getEndOfDay(date: DateInput, timeZone: string): Date {
  const d = parseDate(date) ?? new Date()
  const tz = sanitizeTimezone(timeZone)
  const parts = getTimezoneParts(d, tz)
  if (!parts) return new Date(d.getTime() + 86399999)

  const nextDayUtc = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + 1, 12, 0, 0, 0)
  )
  const nextStart = getStartOfDay(nextDayUtc, tz)
  return new Date(nextStart.getTime() - 1)
}

export function isSameDayInTimezone(
  d1: DateInput,
  d2: DateInput,
  timeZone: string
): boolean {
  const p1 = getTimezoneParts(d1, timeZone)
  const p2 = getTimezoneParts(d2, timeZone)
  if (!p1 || !p2) return false
  return p1.year === p2.year && p1.month === p2.month && p1.day === p2.day
}

export const COMMON_TIMEZONES: string[] = (() => {
  try {
    const list = Intl.supportedValuesOf("timeZone")
    if (!list.includes("UTC")) {
      return ["UTC", ...list]
    }
    return list
  } catch {
    return [
      "UTC",
      "America/New_York",
      "America/Chicago",
      "America/Denver",
      "America/Los_Angeles",
      "America/Santo_Domingo",
      "America/Sao_Paulo",
      "Europe/London",
      "Europe/Paris",
      "Europe/Berlin",
      "Europe/Madrid",
      "Asia/Tokyo",
      "Asia/Hong_Kong",
      "Asia/Singapore",
      "Asia/Dubai",
      "Australia/Sydney",
      "Pacific/Auckland",
    ]
  }
})()
