import { describe, it, expect } from "vitest"
import {
  getMonthMatrix,
  getWeekDays,
  getHourSlots,
  getDayBoundaries,
} from "./grid"

describe("getMonthMatrix", () => {
  it("aligns month grid with Sunday as start of week", () => {
    // October 2026: Oct 1 is Thursday (dayOfWeek = 4)
    const weeks = getMonthMatrix(2026, 10, {
      weekStartsOn: 0,
      timeZone: "UTC",
      fixedWeeks: false,
    })

    // Week 1 should start on Sunday Sep 27
    expect(weeks.length).toBeGreaterThanOrEqual(5)
    const firstWeek = weeks[0]
    expect(firstWeek).toHaveLength(7)
    expect(firstWeek[0].dateString).toBe("2026-09-27")
    expect(firstWeek[0].dayOfWeek).toBe(0) // Sunday
    expect(firstWeek[0].isCurrentMonth).toBe(false)

    // Oct 1 should be Thursday (index 4 in first week)
    expect(firstWeek[4].dateString).toBe("2026-10-01")
    expect(firstWeek[4].dayOfWeek).toBe(4) // Thursday
    expect(firstWeek[4].isCurrentMonth).toBe(true)

    // Check last day of October
    const allCells = weeks.flat()
    const oct31 = allCells.find((c) => c.dateString === "2026-10-31")
    expect(oct31).toBeDefined()
    expect(oct31?.dayOfWeek).toBe(6) // Saturday
    expect(oct31?.isCurrentMonth).toBe(true)
  })

  it("aligns month grid with Monday as start of week", () => {
    // October 2026: Oct 1 is Thursday
    const weeks = getMonthMatrix(2026, 10, {
      weekStartsOn: 1,
      timeZone: "UTC",
      fixedWeeks: false,
    })

    const firstWeek = weeks[0]
    expect(firstWeek).toHaveLength(7)
    // Week starts on Monday Sep 28
    expect(firstWeek[0].dateString).toBe("2026-09-28")
    expect(firstWeek[0].dayOfWeek).toBe(1) // Monday

    // Oct 1 is Thursday (index 3 when starting on Monday)
    expect(firstWeek[3].dateString).toBe("2026-10-01")
    expect(firstWeek[3].dayOfWeek).toBe(4)
  })

  it("produces fixed 6-week matrix when fixedWeeks is true", () => {
    const weeks = getMonthMatrix(2026, 2, {
      // Feb 2026 has 28 days
      fixedWeeks: true,
      timeZone: "UTC",
    })
    expect(weeks).toHaveLength(6)
    weeks.forEach((w) => expect(w).toHaveLength(7))
  })
})

describe("getWeekDays", () => {
  it("returns 7 consecutive days starting on weekStartsOn", () => {
    const days = getWeekDays("2026-10-21", {
      weekStartsOn: 0,
      timeZone: "UTC",
    })

    expect(days).toHaveLength(7)
    // Oct 21 2026 is Wednesday. Preceding Sunday is Oct 18.
    expect(days[0].dateString).toBe("2026-10-18")
    expect(days[0].dayOfWeek).toBe(0)
    expect(days[3].dateString).toBe("2026-10-21")
    expect(days[3].dayOfWeek).toBe(3)
    expect(days[6].dateString).toBe("2026-10-24")
    expect(days[6].dayOfWeek).toBe(6)
  })
})

describe("getHourSlots", () => {
  it("generates 24 hourly slots with AM/PM labels", () => {
    const slots = getHourSlots()
    expect(slots).toHaveLength(24)
    expect(slots[0].timeString).toBe("00:00")
    expect(slots[0].label).toBe("12 AM")
    expect(slots[12].timeString).toBe("12:00")
    expect(slots[12].label).toBe("12 PM")
    expect(slots[23].timeString).toBe("23:00")
    expect(slots[23].label).toBe("11 PM")
  })
})

describe("getDayBoundaries & DST day slot boundaries", () => {
  it("calculates exact 24-hour day duration on standard days", () => {
    const bounds = getDayBoundaries("2026-10-20", "America/New_York")
    expect(bounds.durationMs).toBe(24 * 3600 * 1000)
    expect(bounds.nextDayStart.getTime() - bounds.startOfDay.getTime()).toBe(
      24 * 3600 * 1000
    )
  })

  it("calculates 23-hour duration on Spring forward DST transition day", () => {
    // In America/New_York, 2026-03-08 is spring forward (2:00 AM becomes 3:00 AM)
    const bounds = getDayBoundaries("2026-03-08", "America/New_York")
    expect(bounds.durationMs).toBe(23 * 3600 * 1000)
  })

  it("calculates 25-hour duration on Fall back DST transition day", () => {
    // In America/New_York, 2026-11-01 is fall back (2:00 AM becomes 1:00 AM)
    const bounds = getDayBoundaries("2026-11-01", "America/New_York")
    expect(bounds.durationMs).toBe(25 * 3600 * 1000)
  })
})
