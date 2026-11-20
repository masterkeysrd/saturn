import { describe, expect, it } from "vitest"
import { resolveFinancePeriodBounds, shiftYearMonth } from "./period-bounds"

describe("resolveFinancePeriodBounds", () => {
  const now = new Date("2026-04-16T15:30:00Z")

  it("defaults to This Month in the workspace timezone with inclusive day boundaries", () => {
    const bounds = resolveFinancePeriodBounds(
      { period: "this_month", month: "", dateFrom: "", dateTo: "" },
      now,
      "America/New_York",
      "en-US"
    )

    expect(bounds.period).toBe("this_month")
    expect(bounds.activeMonth).toBe("2026-04")
    expect(bounds.label).toBe("April 2026")
    expect(bounds.ymdFrom).toBe("2026-04-01")
    expect(bounds.ymdTo).toBe("2026-04-30")
    expect(bounds.startISO).toBe("2026-04-01T04:00:00.000Z")
    expect(bounds.endISO).toBe("2026-05-01T03:59:59.999Z")
    expect(bounds.recommendedGranularity).toBe("DAILY")
  })

  it("steps across year boundaries and resolves explicit YYYY-MM months", () => {
    const prev = shiftYearMonth(2026, 1, -1)
    expect(prev).toEqual({ year: 2025, month: 12 })

    const bounds = resolveFinancePeriodBounds(
      { period: "month", month: "2025-12", dateFrom: "", dateTo: "" },
      now,
      "UTC",
      "en-US"
    )
    expect(bounds.label).toBe("December 2025")
    expect(bounds.startISO).toBe("2025-12-01T00:00:00.000Z")
    expect(bounds.endISO).toBe("2025-12-31T23:59:59.999Z")
  })

  it("recognizes full-month drilldown dateFrom/dateTo params and leaves All Time unbounded", () => {
    const drilldown = resolveFinancePeriodBounds(
      {
        period: "this_month",
        month: "",
        dateFrom: "2026-02-01",
        dateTo: "2026-02-28",
      },
      now,
      "UTC",
      "en-US"
    )
    expect(drilldown.period).toBe("month")
    expect(drilldown.activeMonth).toBe("2026-02")
    expect(drilldown.label).toBe("February 2026")

    const allTime = resolveFinancePeriodBounds(
      { period: "all", month: "", dateFrom: "", dateTo: "" },
      now,
      "UTC",
      "en-US"
    )
    expect(allTime.startISO).toBe("")
    expect(allTime.endISO).toBe("")
    expect(allTime.label).toBe("All Time")
  })

  it("formats Spanish month labels with capitalized month and no 'de' connector", () => {
    const bounds = resolveFinancePeriodBounds(
      { period: "month", month: "2026-11", dateFrom: "", dateTo: "" },
      now,
      "UTC",
      "es-ES"
    )
    expect(bounds.label).toBe("Noviembre 2026")
  })
})
