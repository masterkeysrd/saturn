export type DateInput = Date | string | number | null | undefined

export const MS_PER_SECOND = 1000
export const SECONDS_PER_MINUTE = 60
export const MINUTES_PER_HOUR = 60
export const HOURS_PER_DAY = 24
export const MS_PER_HOUR = MINUTES_PER_HOUR * SECONDS_PER_MINUTE * MS_PER_SECOND
export const MS_PER_DAY = HOURS_PER_DAY * MS_PER_HOUR
export const MS_PER_HALF_DAY = MS_PER_DAY / 2

const NOON_UTC_HOUR = 12
const MIDNIGHT_ROLLOVER_HOUR = 24
const END_OF_DAY_OFFSET_MS = MS_PER_DAY - 1

const formatterCache = new Map<string, Intl.DateTimeFormat>()

function getCachedFormatter(
  locale: string,
  timeZone: string,
  options: Intl.DateTimeFormatOptions
): Intl.DateTimeFormat {
  const optionEntries = Object.entries(options)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
  const key = `${locale}|${timeZone}|${JSON.stringify(optionEntries)}`
  let formatter = formatterCache.get(key)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, {
      timeZone,
      ...options,
    })
    formatterCache.set(key, formatter)
  }
  return formatter
}

export function parseDate(date: DateInput, timeZone?: string): Date | null {
  if (date === null || date === undefined || date === "") {
    return null
  }
  if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    if (timeZone) {
      const iso = wallTimeToUtcIso(date, "12:00", timeZone)
      if (iso) {
        const zoned = new Date(iso)
        if (!isNaN(zoned.getTime())) {
          return zoned
        }
      }
    }
    const [y, m, d] = date.split("-").map(Number)
    return new Date(Date.UTC(y, m - 1, d, NOON_UTC_HOUR, 0, 0))
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
  const tz = sanitizeTimezone(timeZone)
  const d = parseDate(date, tz)
  if (!d) return null

  const formatter = getCachedFormatter("en-US", tz, {
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
        hour =
          Number(part.value) === MIDNIGHT_ROLLOVER_HOUR ? 0 : Number(part.value)
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

export function wallTimeToUtcIso(
  dateStr: string,
  timeStr: string,
  timeZone: string
): string {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim())
  const timeMatch = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(timeStr.trim())
  if (!dateMatch || !timeMatch) {
    const fallback = new Date(`${dateStr}T${timeStr}`)
    return isNaN(fallback.getTime()) ? "" : fallback.toISOString()
  }

  const year = Number(dateMatch[1])
  const month = Number(dateMatch[2])
  const day = Number(dateMatch[3])
  const hour = Number(timeMatch[1])
  const minute = Number(timeMatch[2])
  const second = timeMatch[3] ? Number(timeMatch[3]) : 0

  const tz = sanitizeTimezone(timeZone)
  const utcGuess = new Date(
    Date.UTC(year, month - 1, day, hour, minute, second, 0)
  )
  const invParts = getTimezoneParts(utcGuess, tz)
  if (!invParts) return utcGuess.toISOString()

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
  let result = new Date(utcGuess.getTime() - diff)

  const checkParts = getTimezoneParts(result, tz)
  if (checkParts) {
    const checkAsUtc = Date.UTC(
      checkParts.year,
      checkParts.month - 1,
      checkParts.day,
      checkParts.hour,
      checkParts.minute,
      checkParts.second,
      0
    )
    const desiredAsUtc = Date.UTC(year, month - 1, day, hour, minute, second, 0)
    const correction = desiredAsUtc - checkAsUtc
    if (correction !== 0) {
      result = new Date(result.getTime() + correction)
    }
  }

  return result.toISOString()
}

export function formatDateWithTimezone(
  date: DateInput,
  timeZone: string,
  options?: Intl.DateTimeFormatOptions,
  locale?: string
): string {
  const tz = sanitizeTimezone(timeZone)
  const d = parseDate(date, tz)
  if (!d) return ""

  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
  }
  try {
    return getCachedFormatter(
      locale || "en-US",
      tz,
      options || defaultOptions
    ).format(d)
  } catch {
    return ""
  }
}

export function getStartOfDay(date: DateInput, timeZone: string): Date {
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
    const d = parseDate(date) ?? new Date()
    const parts = getTimezoneParts(d, tz)
    if (!parts) return new Date(0)
    year = parts.year
    month = parts.month
    day = parts.day
  }

  const utcGuess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0))
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
    const d = parseDate(date) ?? new Date()
    const parts = getTimezoneParts(d, tz)
    if (!parts) return new Date(d.getTime() + END_OF_DAY_OFFSET_MS)
    year = parts.year
    month = parts.month
    day = parts.day
  }

  const nextDayNoonUtc = new Date(
    Date.UTC(year, month - 1, day + 1, NOON_UTC_HOUR, 0, 0, 0)
  )
  const nextStart = getStartOfDay(nextDayNoonUtc, tz)
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

export function getDaysDiff(
  date: DateInput,
  timeZone: string = "UTC",
  now: Date = new Date()
): number | null {
  const target = parseDate(date, timeZone)
  if (!target) return null
  const startToday = getStartOfDay(now, timeZone)
  const startTarget = getStartOfDay(target, timeZone)
  const diffTime = startTarget.getTime() - startToday.getTime()
  return Math.round(diffTime / MS_PER_DAY)
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
