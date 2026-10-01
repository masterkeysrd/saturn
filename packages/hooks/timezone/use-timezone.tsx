import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react"
import {
  type DateInput,
  sanitizeTimezone,
  formatDateWithTimezone,
  getStartOfDay,
  getEndOfDay,
  getTimezoneParts,
  isSameDayInTimezone,
  parseDate,
} from "@saturn/core"

export interface TimezoneContextValue {
  timezone: string
}

export const TimezoneContext = createContext<TimezoneContextValue>({
  timezone: "UTC",
})

export interface TimezoneProviderProps {
  timezone?: string | null
  children?: ReactNode
}

export function TimezoneProvider({ timezone, children }: TimezoneProviderProps) {
  const value = useMemo(
    () => ({
      timezone: sanitizeTimezone(timezone),
    }),
    [timezone]
  )

  return (
    <TimezoneContext.Provider value={value}>
      {children}
    </TimezoneContext.Provider>
  )
}

export interface TimezoneObject {
  /** The active IANA timezone identifier (e.g. "America/Santo_Domingo", "UTC"). */
  timezone: string
  /** Current date/time instant. */
  now(): Date
  /** Formats a date using localized defaults (e.g. "Oct 1, 2026"). */
  format(date: DateInput, options?: Intl.DateTimeFormatOptions): string
  /** Formats only the date portion (e.g. "10/01/2026"). */
  formatDate(date: DateInput, options?: Intl.DateTimeFormatOptions): string
  /** Formats only the time portion (e.g. "5:00 PM"). */
  formatTime(date: DateInput, options?: Intl.DateTimeFormatOptions): string
  /** Formats date and time (e.g. "Oct 1, 2026, 5:00 PM"). */
  formatDateTime(date: DateInput, options?: Intl.DateTimeFormatOptions): string
  /** Formats month and year (e.g. "October 2026"). */
  formatMonth(date: DateInput, options?: Intl.DateTimeFormatOptions): string
  /** Relative day description (e.g. "Today", "Yesterday", "Tomorrow", or formatted date). */
  formatRelative(date: DateInput): string
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

  return useMemo<TimezoneObject>(() => {
    return {
      timezone: tz,
      now() {
        return new Date()
      },
      format(date, options) {
        return formatDateWithTimezone(date, tz, {
          year: "numeric",
          month: "short",
          day: "numeric",
          ...options,
        })
      },
      formatDate(date, options) {
        return formatDateWithTimezone(date, tz, {
          year: "numeric",
          month: "numeric",
          day: "numeric",
          ...options,
        })
      },
      formatTime(date, options) {
        return formatDateWithTimezone(date, tz, {
          hour: "numeric",
          minute: "numeric",
          ...options,
        })
      },
      formatDateTime(date, options) {
        return formatDateWithTimezone(date, tz, {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "numeric",
          ...options,
        })
      },
      formatMonth(date, options) {
        return formatDateWithTimezone(date, tz, {
          year: "numeric",
          month: "long",
          ...options,
        })
      },
      formatRelative(date) {
        const d = parseDate(date)
        if (!d) return ""
        const now = new Date()
        if (isSameDayInTimezone(d, now, tz)) {
          return "Today"
        }
        const yesterday = new Date(now.getTime() - 86400000)
        if (isSameDayInTimezone(d, yesterday, tz)) {
          return "Yesterday"
        }
        const tomorrow = new Date(now.getTime() + 86400000)
        if (isSameDayInTimezone(d, tomorrow, tz)) {
          return "Tomorrow"
        }
        return formatDateWithTimezone(d, tz, {
          year: "numeric",
          month: "short",
          day: "numeric",
        })
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
        const yesterday = new Date(Date.now() - 86400000)
        return isSameDayInTimezone(date, yesterday, tz)
      },
      isTomorrow(date) {
        const tomorrow = new Date(Date.now() + 86400000)
        return isSameDayInTimezone(date, tomorrow, tz)
      },
    }
  }, [tz])
}
