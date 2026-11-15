import { describe, it, expect } from "vitest"
import {
  parseDate,
  isValidTimezone,
  sanitizeTimezone,
  getTimezoneParts,
  formatDateWithTimezone,
  getStartOfDay,
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
})
