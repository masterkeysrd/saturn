import { describe, it, expect } from "vitest"
import { computeTimedEventLayout, computeMultiDayBannerRows } from "./layout"

describe("computeTimedEventLayout", () => {
  const timeZone = "UTC"
  const targetDay = "2026-10-20"

  it("handles non-overlapping events with 100% width", () => {
    const events = [
      {
        id: "ev1",
        startTime: "2026-10-20T09:00:00Z",
        endTime: "2026-10-20T10:00:00Z",
      },
      {
        id: "ev2",
        startTime: "2026-10-20T11:00:00Z",
        endTime: "2026-10-20T12:00:00Z",
      },
    ]

    const layout = computeTimedEventLayout(events, targetDay, timeZone)

    expect(layout).toHaveLength(2)
    expect(layout[0].id).toBe("ev1")
    expect(layout[0].widthPct).toBe(100)
    expect(layout[0].leftPct).toBe(0)
    expect(layout[0].zIndex).toBe(1)

    expect(layout[1].id).toBe("ev2")
    expect(layout[1].widthPct).toBe(100)
    expect(layout[1].leftPct).toBe(0)
    expect(layout[1].zIndex).toBe(1)
  })

  it("handles 2-way overlap with 50% width columns", () => {
    const events = [
      {
        id: "ev1",
        startTime: "2026-10-20T10:00:00Z",
        endTime: "2026-10-20T11:00:00Z",
      },
      {
        id: "ev2",
        startTime: "2026-10-20T10:30:00Z",
        endTime: "2026-10-20T11:30:00Z",
      },
    ]

    const layout = computeTimedEventLayout(events, targetDay, timeZone)

    expect(layout).toHaveLength(2)
    expect(layout[0].widthPct).toBe(50)
    expect(layout[0].leftPct).toBe(0)

    expect(layout[1].widthPct).toBe(50)
    expect(layout[1].leftPct).toBe(50)
  })

  it("handles 3-way transitive overlaps with 33.3% columns", () => {
    const events = [
      {
        id: "ev1",
        startTime: "2026-10-20T10:00:00Z",
        endTime: "2026-10-20T12:00:00Z",
      },
      {
        id: "ev2",
        startTime: "2026-10-20T10:30:00Z",
        endTime: "2026-10-20T12:30:00Z",
      },
      {
        id: "ev3",
        startTime: "2026-10-20T11:00:00Z",
        endTime: "2026-10-20T13:00:00Z",
      },
    ]

    const layout = computeTimedEventLayout(events, targetDay, timeZone)

    expect(layout).toHaveLength(3)
    layout.forEach((item) => {
      expect(item.widthPct).toBeCloseTo(33.333, 1)
    })
    expect(layout[0].leftPct).toBe(0)
    expect(layout[1].leftPct).toBeCloseTo(33.333, 1)
    expect(layout[2].leftPct).toBeCloseTo(66.667, 1)
  })

  it("handles nested short event inside a 4-hour block", () => {
    const events = [
      {
        id: "ev_long",
        startTime: "2026-10-20T09:00:00Z",
        endTime: "2026-10-20T13:00:00Z", // 4 hours
      },
      {
        id: "ev_short",
        startTime: "2026-10-20T10:00:00Z",
        endTime: "2026-10-20T10:30:00Z", // 30 mins
      },
    ]

    const layout = computeTimedEventLayout(events, targetDay, timeZone)

    expect(layout).toHaveLength(2)
    const longEvent = layout.find((e) => e.id === "ev_long")!
    const shortEvent = layout.find((e) => e.id === "ev_short")!

    expect(longEvent.widthPct).toBe(50)
    expect(longEvent.leftPct).toBe(0)
    // 9 AM is 9/24 = 37.5%
    expect(longEvent.topPct).toBeCloseTo(37.5, 2)
    // 4 hours is 4/24 = 16.667%
    expect(longEvent.heightPct).toBeCloseTo(16.667, 2)

    expect(shortEvent.widthPct).toBe(50)
    expect(shortEvent.leftPct).toBe(50)
    // 10 AM is 10/24 = 41.667%
    expect(shortEvent.topPct).toBeCloseTo(41.667, 2)
    // 30 min is 0.5/24 = 2.083%
    expect(shortEvent.heightPct).toBeCloseTo(2.083, 2)
  })

  it("handles cross-midnight clamping correctly", () => {
    // Event spanning from 22:00 on Oct 20 to 02:00 on Oct 21
    const event = {
      id: "ev_cross",
      startTime: "2026-10-20T22:00:00Z",
      endTime: "2026-10-21T02:00:00Z",
    }

    // On Oct 20 (Day 1)
    const layoutDay1 = computeTimedEventLayout([event], "2026-10-20", timeZone)
    expect(layoutDay1).toHaveLength(1)
    // 22:00 is 22/24 = 91.667%
    expect(layoutDay1[0].topPct).toBeCloseTo(91.667, 2)
    // 2 hours until midnight is 2/24 = 8.333%
    expect(layoutDay1[0].heightPct).toBeCloseTo(8.333, 2)

    // On Oct 21 (Day 2)
    const layoutDay2 = computeTimedEventLayout([event], "2026-10-21", timeZone)
    expect(layoutDay2).toHaveLength(1)
    // Clamped start is 00:00 -> top 0%
    expect(layoutDay2[0].topPct).toBe(0)
    // 2 hours from midnight to 02:00 is 2/24 = 8.333%
    expect(layoutDay2[0].heightPct).toBeCloseTo(8.333, 2)

    // On Oct 22 (no intersection)
    const layoutDay3 = computeTimedEventLayout([event], "2026-10-22", timeZone)
    expect(layoutDay3).toHaveLength(0)
  })
})

describe("computeMultiDayBannerRows", () => {
  const rangeDays = [
    "2026-10-18",
    "2026-10-19",
    "2026-10-20",
    "2026-10-21",
    "2026-10-22",
    "2026-10-23",
    "2026-10-24",
  ]

  it("packs multi-day all-day banners into collision-free rows", () => {
    const events = [
      {
        id: "banner1",
        startDate: "2026-10-19",
        endDate: "2026-10-22", // Oct 19, 20, 21 (3 days)
      },
      {
        id: "banner2",
        startDate: "2026-10-20",
        endDate: "2026-10-23", // Oct 20, 21, 22 (3 days) - overlaps with banner1
      },
      {
        id: "banner3",
        startDate: "2026-10-22",
        endDate: "2026-10-25", // Oct 22, 23, 24 - can share row with banner1!
      },
    ]

    const result = computeMultiDayBannerRows(events, rangeDays)

    expect(result.totalRows).toBe(2)
    expect(result.items).toHaveLength(3)

    const b1 = result.items.find((i) => i.id === "banner1")!
    const b2 = result.items.find((i) => i.id === "banner2")!
    const b3 = result.items.find((i) => i.id === "banner3")!

    expect(b1.startCol).toBe(1) // Oct 19 is index 1
    expect(b1.spanCols).toBe(3) // Oct 19, 20, 21
    expect(b1.rowIndex).toBe(0)
    expect(b1.isStart).toBe(true)
    expect(b1.isEnd).toBe(true)

    expect(b2.startCol).toBe(2) // Oct 20
    expect(b2.spanCols).toBe(3) // Oct 20, 21, 22
    expect(b2.rowIndex).toBe(1) // Row 1 because Oct 20-21 collides with banner1

    expect(b3.startCol).toBe(4) // Oct 22
    expect(b3.spanCols).toBe(3) // Oct 22, 23, 24
    expect(b3.rowIndex).toBe(0) // Row 0 is free starting from Oct 22!
  })
})
