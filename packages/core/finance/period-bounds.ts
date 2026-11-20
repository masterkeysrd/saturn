import {
  formatMonthYear,
  getEndOfDay,
  getStartOfDay,
  getTimezoneParts,
  MS_PER_DAY,
  parseDate,
} from "../timezone"

export type FinancePeriodPreset =
  | "this_month"
  | "last_month"
  | "month"
  | "3m"
  | "6m"
  | "ytd"
  | "12m"
  | "all"
  | "custom"

export type FinancePeriodGranularity = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY"

export interface FinancePeriodValue {
  period: string
  month: string
  dateFrom: string
  dateTo: string
}

export interface FinancePeriodUpdate {
  period: FinancePeriodPreset
  month: string
  dateFrom: string
  dateTo: string
}

export interface FinancePeriodBounds {
  period: FinancePeriodPreset
  activeMonth: string
  startISO: string
  endISO: string
  ymdFrom: string
  ymdTo: string
  label: string
  recommendedGranularity: FinancePeriodGranularity
}

const VALID_PERIODS = new Set<FinancePeriodPreset>([
  "this_month",
  "last_month",
  "month",
  "3m",
  "6m",
  "ytd",
  "12m",
  "all",
  "custom",
])

export function isFinancePeriodPreset(
  value: string
): value is FinancePeriodPreset {
  return VALID_PERIODS.has(value as FinancePeriodPreset)
}

function pad2(n: number): string {
  return String(n).padStart(2, "0")
}

export function formatYmd(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`
}

export function formatYm(year: number, month: number): string {
  return `${year}-${pad2(month)}`
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function shiftYearMonth(
  year: number,
  month: number,
  deltaMonths: number
): { year: number; month: number } {
  const d = new Date(Date.UTC(year, month - 1 + deltaMonths, 15, 12, 0, 0))
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
  }
}

export function parseYm(ym: string): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(ym.trim())
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  if (month < 1 || month > 12) return null
  return { year, month }
}

function matchCalendarMonth(
  dateFrom: string,
  dateTo: string
): { year: number; month: number } | null {
  const mStart = /^(\d{4})-(\d{2})-01$/.exec(dateFrom.trim())
  const mEnd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateTo.trim())
  if (!mStart || !mEnd) return null
  const y1 = Number(mStart[1])
  const mo1 = Number(mStart[2])
  const y2 = Number(mEnd[1])
  const mo2 = Number(mEnd[2])
  const d2 = Number(mEnd[3])
  if (y1 !== y2 || mo1 !== mo2 || mo1 < 1 || mo1 > 12) return null
  if (d2 !== daysInMonth(y1, mo1)) return null
  return { year: y1, month: mo1 }
}

function formatMonthYearLabel(
  year: number,
  month: number,
  locale: string
): string {
  return formatMonthYear(
    new Date(Date.UTC(year, month - 1, 15, 12, 0, 0)),
    "UTC",
    locale,
    "long"
  )
}

export function toYmdInTimezone(date: Date, timeZone: string): string {
  const parts = getTimezoneParts(date, timeZone)
  if (!parts) return ""
  return formatYmd(parts.year, parts.month, parts.day)
}

export function resolveFinancePeriodBounds(
  value: FinancePeriodValue,
  now: Date,
  timeZone: string,
  locale: string
): FinancePeriodBounds {
  const parts = getTimezoneParts(now, timeZone)
  const nowYear = parts?.year ?? now.getUTCFullYear()
  const nowMonth = parts?.month ?? now.getUTCMonth() + 1
  const nowDay = parts?.day ?? now.getUTCDate()
  const todayYmd = formatYmd(nowYear, nowMonth, nowDay)
  const currentMonthYm = formatYm(nowYear, nowMonth)

  let effectivePeriod: FinancePeriodPreset = isFinancePeriodPreset(value.period)
    ? value.period
    : "this_month"
  let effectiveMonth = value.month

  if (effectivePeriod === "this_month" && (value.dateFrom || value.dateTo)) {
    const matched = matchCalendarMonth(value.dateFrom, value.dateTo)
    if (matched) {
      const matchedYm = formatYm(matched.year, matched.month)
      if (matchedYm === currentMonthYm) {
        effectivePeriod = "this_month"
      } else {
        effectivePeriod = "month"
        effectiveMonth = matchedYm
      }
    } else {
      effectivePeriod = "custom"
    }
  }

  if (effectivePeriod === "month" && !parseYm(effectiveMonth)) {
    effectivePeriod = "this_month"
  }

  let ymdFrom = ""
  let ymdTo = ""
  let activeMonth = ""
  let label = ""
  let recommendedGranularity: FinancePeriodGranularity = "MONTHLY"

  switch (effectivePeriod) {
    case "this_month": {
      const lastDay = daysInMonth(nowYear, nowMonth)
      ymdFrom = formatYmd(nowYear, nowMonth, 1)
      ymdTo = formatYmd(nowYear, nowMonth, lastDay)
      activeMonth = currentMonthYm
      label = formatMonthYearLabel(nowYear, nowMonth, locale)
      recommendedGranularity = "DAILY"
      break
    }
    case "last_month": {
      const prev = shiftYearMonth(nowYear, nowMonth, -1)
      const lastDay = daysInMonth(prev.year, prev.month)
      ymdFrom = formatYmd(prev.year, prev.month, 1)
      ymdTo = formatYmd(prev.year, prev.month, lastDay)
      activeMonth = formatYm(prev.year, prev.month)
      label = formatMonthYearLabel(prev.year, prev.month, locale)
      recommendedGranularity = "DAILY"
      break
    }
    case "month": {
      const parsed = parseYm(effectiveMonth)!
      const lastDay = daysInMonth(parsed.year, parsed.month)
      ymdFrom = formatYmd(parsed.year, parsed.month, 1)
      ymdTo = formatYmd(parsed.year, parsed.month, lastDay)
      activeMonth = formatYm(parsed.year, parsed.month)
      label = formatMonthYearLabel(parsed.year, parsed.month, locale)
      recommendedGranularity = "DAILY"
      break
    }
    case "3m": {
      const start = shiftYearMonth(nowYear, nowMonth, -2)
      ymdFrom = formatYmd(start.year, start.month, 1)
      ymdTo = todayYmd
      label = "Last 3 Months"
      recommendedGranularity = "WEEKLY"
      break
    }
    case "6m": {
      const start = shiftYearMonth(nowYear, nowMonth, -5)
      ymdFrom = formatYmd(start.year, start.month, 1)
      ymdTo = todayYmd
      label = "Last 6 Months"
      recommendedGranularity = "MONTHLY"
      break
    }
    case "ytd": {
      ymdFrom = formatYmd(nowYear, 1, 1)
      ymdTo = todayYmd
      label = "Year to Date"
      recommendedGranularity = "MONTHLY"
      break
    }
    case "12m": {
      const start = shiftYearMonth(nowYear, nowMonth, -11)
      ymdFrom = formatYmd(start.year, start.month, 1)
      ymdTo = todayYmd
      label = "Last 12 Months"
      recommendedGranularity = "MONTHLY"
      break
    }
    case "all": {
      ymdFrom = ""
      ymdTo = ""
      label = "All Time"
      recommendedGranularity = "MONTHLY"
      break
    }
    case "custom": {
      ymdFrom = value.dateFrom || ""
      ymdTo = value.dateTo || ""
      if (ymdFrom && ymdTo) {
        label = `${ymdFrom} – ${ymdTo}`
      } else if (ymdFrom) {
        label = `From ${ymdFrom}`
      } else if (ymdTo) {
        label = `Until ${ymdTo}`
      } else {
        label = "Custom Range"
      }

      if (ymdFrom && ymdTo) {
        const s = parseDate(ymdFrom, timeZone)
        const e = parseDate(ymdTo, timeZone)
        if (s && e) {
          const days = Math.max(
            1,
            Math.round((e.getTime() - s.getTime()) / MS_PER_DAY)
          )
          recommendedGranularity =
            days <= 31
              ? "DAILY"
              : days <= 120
                ? "WEEKLY"
                : days <= 730
                  ? "MONTHLY"
                  : "YEARLY"
        }
      }
      break
    }
  }

  const startISO = ymdFrom ? getStartOfDay(ymdFrom, timeZone).toISOString() : ""
  const endISO = ymdTo ? getEndOfDay(ymdTo, timeZone).toISOString() : ""

  return {
    period: effectivePeriod,
    activeMonth,
    startISO,
    endISO,
    ymdFrom,
    ymdTo,
    label,
    recommendedGranularity,
  }
}
