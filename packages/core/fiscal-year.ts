import {
  type DateInput,
  getTimezoneParts,
  sanitizeTimezone,
  parseDate,
} from "./timezone"

export interface FiscalYearMonthOption {
  month: number
  name: string
  shortName: string
  description: string
}

export const FISCAL_YEAR_MONTHS: FiscalYearMonthOption[] = [
  {
    month: 1,
    name: "January",
    shortName: "Jan",
    description: "Calendar Year (Default)",
  },
  {
    month: 2,
    name: "February",
    shortName: "Feb",
    description: "Retail 4-5-4 Calendar",
  },
  {
    month: 3,
    name: "March",
    shortName: "Mar",
    description: "Custom Fiscal Cycle",
  },
  {
    month: 4,
    name: "April",
    shortName: "Apr",
    description: "United Kingdom, India, Japan, Canada",
  },
  {
    month: 5,
    name: "May",
    shortName: "May",
    description: "Custom Fiscal Cycle",
  },
  {
    month: 6,
    name: "June",
    shortName: "Jun",
    description: "Custom Fiscal Cycle",
  },
  {
    month: 7,
    name: "July",
    shortName: "Jul",
    description: "Australia, New Zealand, Academic",
  },
  {
    month: 8,
    name: "August",
    shortName: "Aug",
    description: "Custom Fiscal Cycle",
  },
  {
    month: 9,
    name: "September",
    shortName: "Sep",
    description: "Custom Fiscal Cycle",
  },
  {
    month: 10,
    name: "October",
    shortName: "Oct",
    description: "United States Federal",
  },
  {
    month: 11,
    name: "November",
    shortName: "Nov",
    description: "Custom Fiscal Cycle",
  },
  {
    month: 12,
    name: "December",
    shortName: "Dec",
    description: "Custom Fiscal Cycle",
  },
]

export function getFiscalMonthOption(month: number): FiscalYearMonthOption {
  const normalized = month >= 1 && month <= 12 ? month : 1
  return FISCAL_YEAR_MONTHS[normalized - 1]
}

export interface FiscalYearBounds {
  startDate: Date
  endDate: Date
  startYear: number
  endYear: number
  label: string
}

/**
 * Computes the start date, end date, and display label for a date's fiscal year
 * relative to the given timezone and starting month (1-12).
 */
export function getFiscalYearBounds(
  date: DateInput,
  timeZone: string,
  fiscalStartMonth = 1
): FiscalYearBounds {
  const d = parseDate(date) ?? new Date()
  const tz = sanitizeTimezone(timeZone)
  const parts = getTimezoneParts(d, tz)

  const startMonth =
    fiscalStartMonth >= 1 && fiscalStartMonth <= 12 ? fiscalStartMonth : 1

  let startYear = parts?.year ?? d.getUTCFullYear()
  const currentMonth = parts?.month ?? d.getUTCMonth() + 1

  if (currentMonth < startMonth) {
    startYear--
  }

  const endYear = startMonth === 1 ? startYear : startYear + 1

  // Start is startMonth 1st at 00:00:00 local time
  const startUtcGuess = new Date(
    Date.UTC(startYear, startMonth - 1, 1, 0, 0, 0, 0)
  )
  const startParts = getTimezoneParts(startUtcGuess, tz)
  let startDate = startUtcGuess
  if (startParts) {
    const targetAsUtc = Date.UTC(
      startParts.year,
      startParts.month - 1,
      startParts.day,
      startParts.hour,
      startParts.minute,
      startParts.second,
      0
    )
    const diff = targetAsUtc - startUtcGuess.getTime()
    startDate = new Date(startUtcGuess.getTime() - diff)
  }

  // End is next fiscal start minus 1 millisecond
  const nextStartUtcGuess = new Date(
    Date.UTC(startYear + 1, startMonth - 1, 1, 0, 0, 0, 0)
  )
  const nextParts = getTimezoneParts(nextStartUtcGuess, tz)
  let nextStart = nextStartUtcGuess
  if (nextParts) {
    const targetAsUtc = Date.UTC(
      nextParts.year,
      nextParts.month - 1,
      nextParts.day,
      nextParts.hour,
      nextParts.minute,
      nextParts.second,
      0
    )
    const diff = targetAsUtc - nextStartUtcGuess.getTime()
    nextStart = new Date(nextStartUtcGuess.getTime() - diff)
  }
  const endDate = new Date(nextStart.getTime() - 1)

  const label =
    startMonth === 1
      ? `FY ${startYear}`
      : `FY ${startYear}–${(endYear % 100).toString().padStart(2, "0")}`

  return {
    startDate,
    endDate,
    startYear,
    endYear,
    label,
  }
}

/**
 * Returns a human-readable display label for a fiscal year (e.g. "FY 2026-27" or "FY 2026").
 */
export function formatFiscalYear(
  date: DateInput,
  timeZone: string,
  fiscalStartMonth = 1
): string {
  return getFiscalYearBounds(date, timeZone, fiscalStartMonth).label
}
