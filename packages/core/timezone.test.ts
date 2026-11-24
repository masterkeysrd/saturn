import { describe, it, expect } from "vitest"
import {
  parseDate,
  isValidTimezone,
  sanitizeTimezone,
  getTimezoneParts,
  formatDateWithTimezone,
  formatShortDateRange,
  capitalizeCalendarToken,
  formatMonthYear,
  formatShortMonth,
  formatShortWeekday,
  getStartOfDay,
  wallTimeToUtcIso,
  getDaysDiff,
} from "./timezone"

describe("timezone utilities", () => {
  it("parses date-only strings at noon UTC to prevent off-by-one shifts", () => {
    const d = parseDate("2026-04-15")
    expect(d).not.toBeNull()
    expect(d?.toISOString()).toBe("2026-04-15T12:00:00.000Z")
    expect(parseDate("")).toBeNull()
    expect(parseDate("not-a-date")).toBeNull()
  })

  it("validates and sanitizes IANA timezones", () => {
    expect(isValidTimezone("America/New_York")).toBe(true)
    expect(isValidTimezone("Invalid/Zone")).toBe(false)
    expect(sanitizeTimezone("America/Santo_Domingo")).toBe(
      "America/Santo_Domingo"
    )
    expect(sanitizeTimezone("Invalid/Zone")).toBe("UTC")
    expect(sanitizeTimezone(null)).toBe("UTC")
  })

  it("decomposes timezone parts accurately", () => {
    const parts = getTimezoneParts(
      "2026-01-15T03:30:00.000Z",
      "America/New_York"
    )
    expect(parts).toMatchObject({
      year: 2026,
      month: 1,
      day: 14,
      hour: 22,
      minute: 30,
      second: 0,
    })
  })

  it("formats dates and computes start of day in target timezone", () => {
    expect(
      formatDateWithTimezone("2026-01-15T03:30:00.000Z", "America/New_York")
    ).toBe("Jan 14, 2026")

    const start = getStartOfDay("2026-01-15T03:30:00.000Z", "America/New_York")
    expect(start.toISOString()).toBe("2026-01-14T05:00:00.000Z")
  })

  it("converts wall-clock date/time in any IANA timezone to exact UTC ISO across DST and extreme offsets", () => {
    // Standard time (EST = UTC-5)
    expect(wallTimeToUtcIso("2026-01-15", "09:30", "America/New_York")).toBe(
      "2026-01-15T14:30:00.000Z"
    )
    // Daylight saving time after spring-forward (EDT = UTC-4)
    expect(wallTimeToUtcIso("2026-03-08", "09:00", "America/New_York")).toBe(
      "2026-03-08T13:00:00.000Z"
    )
    // Early morning right after spring-forward 02:00 -> 03:00 transition
    expect(wallTimeToUtcIso("2026-03-08", "03:00", "America/New_York")).toBe(
      "2026-03-08T07:00:00.000Z"
    )
    // Fall-back day afternoon (EST = UTC-5)
    expect(wallTimeToUtcIso("2026-11-01", "15:00", "America/New_York")).toBe(
      "2026-11-01T20:00:00.000Z"
    )
    // Positive offset (Asia/Tokyo = UTC+9)
    expect(wallTimeToUtcIso("2026-04-15", "09:00", "Asia/Tokyo")).toBe(
      "2026-04-15T00:00:00.000Z"
    )
    // Extreme positive offset (Pacific/Auckland = UTC+12 in April, UTC+13 in Jan)
    expect(wallTimeToUtcIso("2026-01-15", "09:00", "Pacific/Auckland")).toBe(
      "2026-01-14T20:00:00.000Z"
    )
  })

  it("keeps YYYY-MM-DD dates on the same calendar day in UTC+13/UTC+14 timezones", () => {
    expect(formatDateWithTimezone("2026-01-15", "Pacific/Auckland")).toBe(
      "Jan 15, 2026"
    )
    expect(formatDateWithTimezone("2026-04-15", "Pacific/Kiritimati")).toBe(
      "Apr 15, 2026"
    )
    expect(getTimezoneParts("2026-04-15", "Pacific/Kiritimati")).toMatchObject({
      year: 2026,
      month: 4,
      day: 15,
    })
    expect(
      getDaysDiff(
        "2026-04-15",
        "Pacific/Kiritimati",
        new Date("2026-04-15T01:00:00+14:00")
      )
    ).toBe(0)
  })

  it("capitalizes calendar tokens and strips trailing abbreviation dots", () => {
    expect(capitalizeCalendarToken("noviembre", "es-ES", false)).toBe(
      "Noviembre"
    )
    expect(capitalizeCalendarToken("  ene.  ", "es-ES", true)).toBe("Ene")
    expect(capitalizeCalendarToken("mié.", "es-419", true)).toBe("Mié")
    expect(capitalizeCalendarToken("", "en-US")).toBe("")
  })

  it("formats Month + Year headers without 'de' connector across Spanish and English locales", () => {
    expect(formatMonthYear("2026-11-10", "UTC", "es-ES", "long")).toBe(
      "Noviembre 2026"
    )
    expect(formatMonthYear("2026-11-10", "UTC", "es-419", "long")).toBe(
      "Noviembre 2026"
    )
    expect(formatMonthYear("2026-11-10", "UTC", "es-ES", "short")).toBe(
      "Nov 2026"
    )
    expect(formatMonthYear("2026-11-10", "UTC", "en-US", "long")).toBe(
      "November 2026"
    )

    expect(
      formatDateWithTimezone(
        "2026-11-10",
        "UTC",
        { month: "long", year: "numeric" },
        "es-ES"
      )
    ).toBe("Noviembre 2026")
    expect(
      formatDateWithTimezone(
        "2026-11-10",
        "UTC",
        { month: "long", year: "numeric" },
        "es-419"
      )
    ).toBe("Noviembre 2026")
    expect(
      formatDateWithTimezone(
        "2026-11-10",
        "UTC",
        { month: "short", year: "numeric" },
        "es-ES"
      )
    ).toBe("Nov 2026")
  })

  it("formats standalone short/long months and short weekdays with clean capitalization", () => {
    expect(formatShortMonth("2026-01-15", "UTC", "es-ES")).toBe("Ene")
    expect(formatShortMonth("2026-11-15", "UTC", "es-419")).toBe("Nov")
    expect(formatShortMonth("2026-01-15", "UTC", "en-US")).toBe("Jan")

    expect(
      formatDateWithTimezone("2026-01-15", "UTC", { month: "short" }, "es-ES")
    ).toBe("Ene")
    expect(
      formatDateWithTimezone("2026-11-15", "UTC", { month: "short" }, "es-419")
    ).toBe("Nov")
    expect(
      formatDateWithTimezone("2026-11-15", "UTC", { month: "long" }, "es-ES")
    ).toBe("Noviembre")

    // 2026-01-05 is Monday, 2026-01-04 is Sunday
    expect(formatShortWeekday("2026-01-05", "UTC", "es-ES")).toBe("Lun")
    expect(formatShortWeekday("2026-01-07", "UTC", "es-ES")).toBe("Mié")
    expect(formatShortWeekday("2026-01-04", "UTC", "es-ES")).toBe("Dom")
    expect(formatShortWeekday("2026-01-05", "UTC", "en-US")).toBe("Mon")
  })

  it("formats day + short month (+ optional year) using clean locale ordering", () => {
    expect(
      formatDateWithTimezone(
        "2026-11-10",
        "UTC",
        { day: "numeric", month: "short", year: "numeric" },
        "es-ES"
      )
    ).toBe("10 Nov 2026")
    expect(
      formatDateWithTimezone(
        "2026-11-10",
        "UTC",
        { day: "numeric", month: "short", year: "numeric" },
        "es-419"
      )
    ).toBe("10 Nov 2026")
    expect(
      formatDateWithTimezone(
        "2026-11-10",
        "UTC",
        { day: "numeric", month: "short", year: "numeric" },
        "en-US"
      )
    ).toBe("Nov 10, 2026")

    expect(
      formatDateWithTimezone(
        "2026-11-10",
        "UTC",
        { day: "numeric", month: "short" },
        "es-ES"
      )
    ).toBe("10 Nov")
    expect(
      formatDateWithTimezone(
        "2026-11-10",
        "UTC",
        { day: "numeric", month: "short" },
        "es-419"
      )
    ).toBe("10 Nov")
    expect(
      formatDateWithTimezone(
        "2026-11-10",
        "UTC",
        { day: "numeric", month: "short" },
        "en-US"
      )
    ).toBe("Nov 10")

    expect(
      formatDateWithTimezone(
        "2025-10-01",
        "UTC",
        { day: "numeric", month: "short" },
        "en-US"
      )
    ).toBe("Oct 1")
    expect(
      formatDateWithTimezone(
        "2025-10-01",
        "UTC",
        { day: "numeric", month: "short", year: "numeric" },
        "en-US"
      )
    ).toBe("Oct 1, 2025")
    expect(
      formatDateWithTimezone(
        "2025-10-01",
        "UTC",
        { day: "numeric", month: "short" },
        "es-ES"
      )
    ).toBe("1 Oct")
    expect(
      formatDateWithTimezone(
        "2025-10-01",
        "UTC",
        { day: "numeric", month: "short", year: "numeric" },
        "es-ES"
      )
    ).toBe("1 Oct 2025")
  })

  it("formats compact short date ranges across years, locales, and timezones", () => {
    const now2026 = new Date("2026-06-15T12:00:00.000Z")
    const tests = [
      {
        name: "current-year monthly range (en-US)",
        startDate: "2026-10-01",
        endDate: "2026-10-31",
        timeZone: "UTC",
        locale: "en-US",
        now: now2026,
        expected: "Oct 1 - Oct 31",
      },
      {
        name: "current-year monthly range (es-ES)",
        startDate: "2026-10-01",
        endDate: "2026-10-31",
        timeZone: "UTC",
        locale: "es-ES",
        now: now2026,
        expected: "1 Oct - 31 Oct",
      },
      {
        name: "current-year weekly range (en-US)",
        startDate: "2026-10-05",
        endDate: "2026-10-11",
        timeZone: "UTC",
        locale: "en-US",
        now: now2026,
        expected: "Oct 5 - Oct 11",
      },
      {
        name: "current-year weekly range (es-ES)",
        startDate: "2026-10-05",
        endDate: "2026-10-11",
        timeZone: "UTC",
        locale: "es-ES",
        now: now2026,
        expected: "5 Oct - 11 Oct",
      },
      {
        name: "historical same-year range (en-US)",
        startDate: "2025-10-01",
        endDate: "2025-10-31",
        timeZone: "UTC",
        locale: "en-US",
        now: now2026,
        expected: "Oct 1 - Oct 31, 2025",
      },
      {
        name: "historical same-year range (es-ES)",
        startDate: "2025-10-01",
        endDate: "2025-10-31",
        timeZone: "UTC",
        locale: "es-ES",
        now: now2026,
        expected: "1 Oct - 31 Oct 2025",
      },
      {
        name: "cross-year Dec-Jan range (en-US)",
        startDate: "2025-12-15",
        endDate: "2026-01-14",
        timeZone: "UTC",
        locale: "en-US",
        now: now2026,
        expected: "Dec 15, 2025 - Jan 14, 2026",
      },
      {
        name: "cross-year Dec-Jan range (es-ES)",
        startDate: "2025-12-15",
        endDate: "2026-01-14",
        timeZone: "UTC",
        locale: "es-ES",
        now: now2026,
        expected: "15 Dic 2025 - 14 Ene 2026",
      },
      {
        name: "non-UTC negative offset shifts year boundary into Dec 2025 - Jan 2026",
        startDate: "2026-01-01T03:30:00.000Z",
        endDate: "2026-01-31T20:00:00.000Z",
        timeZone: "America/New_York",
        locale: "en-US",
        now: now2026,
        expected: "Dec 31, 2025 - Jan 31, 2026",
      },
      {
        name: "non-UTC negative offset shifts current-year timestamps",
        startDate: "2026-10-01T03:30:00.000Z",
        endDate: "2026-11-01T03:30:00.000Z",
        timeZone: "America/New_York",
        locale: "en-US",
        now: now2026,
        expected: "Sep 30 - Oct 31",
      },
      {
        name: "non-UTC positive offset shifts dates forward",
        startDate: "2026-10-01T12:00:00.000Z",
        endDate: "2026-10-31T12:00:00.000Z",
        timeZone: "Pacific/Auckland",
        locale: "en-US",
        now: now2026,
        expected: "Oct 2 - Nov 1",
      },
      {
        name: "only startDate valid in current year",
        startDate: "2026-10-01",
        endDate: null,
        timeZone: "UTC",
        locale: "en-US",
        now: now2026,
        expected: "Oct 1",
      },
      {
        name: "only endDate valid in non-current year",
        startDate: "not-a-date",
        endDate: "2025-10-31",
        timeZone: "UTC",
        locale: "en-US",
        now: now2026,
        expected: "Oct 31, 2025",
      },
      {
        name: "neither date valid returns empty string",
        startDate: null,
        endDate: undefined,
        timeZone: "UTC",
        locale: "en-US",
        now: now2026,
        expected: "",
      },
    ]

    for (const tc of tests) {
      expect(
        formatShortDateRange(tc.startDate, tc.endDate, {
          timeZone: tc.timeZone,
          locale: tc.locale,
          now: tc.now,
        }),
        tc.name
      ).toBe(tc.expected)
    }
  })
})
