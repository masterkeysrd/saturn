import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react"
import {
  type DateInput,
  MS_PER_HALF_DAY,
  sanitizeTimezone,
  formatDateWithTimezone,
  formatCents,
  getStartOfDay,
  getEndOfDay,
  getTimezoneParts,
  isSameDayInTimezone,
  parseDate,
} from "@saturn/core"
import { normalizeUserLocale } from "@saturn/i18n"
import { setClientLocale } from "@saturn/api"
import { configureZodLocale } from "@saturn/schemas"

export type HourCycle = "h12" | "h23"
export type WeekStartsOn = 0 | 1

export interface FormatMoneyOptions {
  showSign?: boolean
  minimumFractionDigits?: number
  maximumFractionDigits?: number
  locale?: string
}

export interface TimezoneContextValue {
  timezone: string
  locale: string
  hourCycle: HourCycle
  weekStartsOn: WeekStartsOn
}

export const TimezoneContext = createContext<TimezoneContextValue>({
  timezone: "UTC",
  locale: "en-US",
  hourCycle: "h12",
  weekStartsOn: 0,
})

export interface TimezoneProviderProps {
  timezone?: string | null
  locale?: string | null
  hourCycle?: HourCycle | null
  weekStartsOn?: WeekStartsOn | null
  children?: ReactNode
}

function sanitizeLocale(locale?: string | null): string {
  return normalizeUserLocale(locale)
}

export function formatMoneyWithLocale(
  cents: string | number | null | undefined,
  currency?: string,
  locale: string = "en-US",
  options?: FormatMoneyOptions
): string {
  const amount = formatCents(cents)
  const resolvedLocale = sanitizeLocale(options?.locale || locale)
  const minimumFractionDigits = options?.minimumFractionDigits ?? 2
  const maximumFractionDigits = options?.maximumFractionDigits ?? 2
  const signDisplay = options?.showSign ? "exceptZero" : "auto"

  if (currency) {
    try {
      return new Intl.NumberFormat(resolvedLocale, {
        style: "currency",
        currency,
        minimumFractionDigits,
        maximumFractionDigits,
        signDisplay,
      }).format(amount)
    } catch {
      const fallback = new Intl.NumberFormat(resolvedLocale, {
        style: "decimal",
        minimumFractionDigits,
        maximumFractionDigits,
        signDisplay,
      }).format(amount)
      return `${fallback} ${currency}`
    }
  }

  return new Intl.NumberFormat(resolvedLocale, {
    style: "decimal",
    minimumFractionDigits,
    maximumFractionDigits,
    signDisplay,
  }).format(amount)
}

export function TimezoneProvider({
  timezone,
  locale,
  hourCycle,
  weekStartsOn,
  children,
}: TimezoneProviderProps) {
  const value = useMemo<TimezoneContextValue>(
    () => ({
      timezone: sanitizeTimezone(timezone),
      locale: sanitizeLocale(locale),
      hourCycle: hourCycle === "h23" ? "h23" : "h12",
      weekStartsOn: weekStartsOn === 1 ? 1 : 0,
    }),
    [timezone, locale, hourCycle, weekStartsOn]
  )

  useEffect(() => {
    setClientLocale(value.locale)
    configureZodLocale(value.locale)
  }, [value.locale])

  return (
    <TimezoneContext.Provider value={value}>
      {children}
    </TimezoneContext.Provider>
  )
}

export interface TimezoneObject {
  /** The active IANA timezone identifier (e.g. "America/Santo_Domingo", "UTC"). */
  timezone: string
  /** User-scoped BCP 47 locale tag (e.g. "en-US", "de-DE"). */
  locale: string
  /** User-scoped 12h/24h time format preference. */
  hourCycle: HourCycle
  /** User-scoped calendar week start day (0 = Sunday, 1 = Monday). */
  weekStartsOn: WeekStartsOn
  /** Current date/time instant. */
  now(): Date
  /** Formats a date using localized defaults (e.g. "Oct 1, 2026"). */
  format(date: DateInput, options?: Intl.DateTimeFormatOptions): string
  /** Formats only the date portion (e.g. "10/01/2026"). */
  formatDate(date: DateInput, options?: Intl.DateTimeFormatOptions): string
  /** Formats only the time portion (e.g. "5:00 PM" or "17:00"). */
  formatTime(date: DateInput, options?: Intl.DateTimeFormatOptions): string
  /** Formats date and time (e.g. "Oct 1, 2026, 5:00 PM"). */
  formatDateTime(date: DateInput, options?: Intl.DateTimeFormatOptions): string
  /** Formats month and year (e.g. "October 2026"). */
  formatMonth(date: DateInput, options?: Intl.DateTimeFormatOptions): string
  /** Relative day description (e.g. "Today", "Yesterday", "Tomorrow", or formatted date). */
  formatRelative(date: DateInput): string
  /** Formats minor-unit cents into a deterministic locale-aware currency string. */
  formatMoney(
    cents: string | number | null | undefined,
    currency?: string,
    options?: FormatMoneyOptions
  ): string
  /** Start of local day (midnight) in this timezone as a UTC Date. */
  startOfDay(date?: DateInput): Date
  /** End of local day (23:59:59.999) in this timezone as a UTC Date. */
  endOfDay(date?: DateInput): Date
  /** Decomposed date parts (year, month, day, hour, minute, second) in this timezone. */
  parts(date?: DateInput): ReturnType<typeof getTimezoneParts>
  /** Returns true if date is "Today" in this timezone. */
  isToday(date: DateInput): boolean
  /** Returns true if date is "Yesterday" in this timezone. */
  isYesterday(date: DateInput): boolean
  /** Returns true if date is "Tomorrow" in this timezone. */
  isTomorrow(date: DateInput): boolean
}

export function useTimezone(overrideTimezone?: string | null): TimezoneObject {
  const context = useContext(TimezoneContext)
  const tz = sanitizeTimezone(overrideTimezone || context?.timezone)
  const locale = sanitizeLocale(context?.locale)
  const hourCycle: HourCycle = context?.hourCycle === "h23" ? "h23" : "h12"
  const weekStartsOn: WeekStartsOn = context?.weekStartsOn === 1 ? 1 : 0

  return useMemo<TimezoneObject>(() => {
    const withTimeFormat = (
      defaults: Intl.DateTimeFormatOptions,
      options?: Intl.DateTimeFormatOptions
    ): Intl.DateTimeFormatOptions => {
      const merged = { ...defaults, ...options }
      if (merged.hour12 === undefined && merged.hourCycle === undefined) {
        merged.hourCycle = hourCycle
      }
      return merged
    }

    return {
      timezone: tz,
      locale,
      hourCycle,
      weekStartsOn,
      now() {
        return new Date()
      },
      format(date, options) {
        return formatDateWithTimezone(
          date,
          tz,
          {
            year: "numeric",
            month: "short",
            day: "numeric",
            ...options,
          },
          locale
        )
      },
      formatDate(date, options) {
        return formatDateWithTimezone(
          date,
          tz,
          {
            year: "numeric",
            month: "numeric",
            day: "numeric",
            ...options,
          },
          locale
        )
      },
      formatTime(date, options) {
        return formatDateWithTimezone(
          date,
          tz,
          withTimeFormat(
            {
              hour: "numeric",
              minute: "numeric",
            },
            options
          ),
          locale
        )
      },
      formatDateTime(date, options) {
        return formatDateWithTimezone(
          date,
          tz,
          withTimeFormat(
            {
              year: "numeric",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "numeric",
            },
            options
          ),
          locale
        )
      },
      formatMonth(date, options) {
        const formatted = formatDateWithTimezone(
          date,
          tz,
          {
            year: "numeric",
            month: "long",
            ...options,
          },
          locale
        )
        if (!formatted) return ""
        const cleaned = formatted.replace(/\s+de\s+/i, " ")
        return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
      },
      formatRelative(date) {
        const d = parseDate(date, tz)
        if (!d) return ""
        const now = new Date()
        if (isSameDayInTimezone(d, now, tz)) {
          return "Today"
        }
        const yesterdayAnchor = new Date(
          getStartOfDay(now, tz).getTime() - MS_PER_HALF_DAY
        )
        if (isSameDayInTimezone(d, yesterdayAnchor, tz)) {
          return "Yesterday"
        }
        const tomorrowAnchor = new Date(
          getEndOfDay(now, tz).getTime() + MS_PER_HALF_DAY
        )
        if (isSameDayInTimezone(d, tomorrowAnchor, tz)) {
          return "Tomorrow"
        }
        return formatDateWithTimezone(
          d,
          tz,
          {
            year: "numeric",
            month: "short",
            day: "numeric",
          },
          locale
        )
      },
      formatMoney(cents, currency, options) {
        return formatMoneyWithLocale(cents, currency, locale, options)
      },
      startOfDay(date) {
        return getStartOfDay(date, tz)
      },
      endOfDay(date) {
        return getEndOfDay(date, tz)
      },
      parts(date) {
        return getTimezoneParts(date ?? new Date(), tz)
      },
      isToday(date) {
        return isSameDayInTimezone(date, new Date(), tz)
      },
      isYesterday(date) {
        const yesterdayAnchor = new Date(
          getStartOfDay(new Date(), tz).getTime() - MS_PER_HALF_DAY
        )
        return isSameDayInTimezone(date, yesterdayAnchor, tz)
      },
      isTomorrow(date) {
        const tomorrowAnchor = new Date(
          getEndOfDay(new Date(), tz).getTime() + MS_PER_HALF_DAY
        )
        return isSameDayInTimezone(date, tomorrowAnchor, tz)
      },
    }
  }, [tz, locale, hourCycle, weekStartsOn])
}
