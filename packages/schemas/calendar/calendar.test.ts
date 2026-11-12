import { describe, it, expect } from "vitest"
import {
  CalendarFormSchema,
  EventFormSchema,
  buildRRule,
  parseRRule,
} from "./index"

describe("CalendarFormSchema", () => {
  it("validates valid calendar creation values", () => {
    const valid = {
      name: "Engineering Sync",
      description: "Team calendars",
      color: "#22c55e",
      timezone: "America/New_York",
      isEnabled: true,
    }
    const res = CalendarFormSchema.safeParse(valid)
    expect(res.success).toBe(true)
    if (res.success) {
      expect(res.data.name).toBe("Engineering Sync")
      expect(res.data.color).toBe("#22c55e")
    }
  })

  it("rejects empty calendar name", () => {
    const invalid = {
      name: "",
      color: "#3b82f6",
      timezone: "UTC",
    }
    const res = CalendarFormSchema.safeParse(invalid)
    expect(res.success).toBe(false)
  })

  it("rejects invalid hex color", () => {
    const invalid = {
      name: "Test",
      color: "not-a-color",
      timezone: "UTC",
    }
    const res = CalendarFormSchema.safeParse(invalid)
    expect(res.success).toBe(false)
  })

  it("rejects invalid timezone", () => {
    const invalid = {
      name: "Test",
      color: "#3b82f6",
      timezone: "Invalid/Timezone_Name",
    }
    const res = CalendarFormSchema.safeParse(invalid)
    expect(res.success).toBe(false)
  })
})

describe("EventFormSchema", () => {
  it("validates valid timed event", () => {
    const valid = {
      calendarId: "cal_123",
      title: "Sprint Planning",
      isAllDay: false,
      startTime: "2026-10-20T10:00:00Z",
      endTime: "2026-10-20T11:00:00Z",
      timezone: "America/New_York",
      attendees: [
        {
          email: "alex@example.com",
          displayName: "Alex Developer",
        },
      ],
    }
    const res = EventFormSchema.safeParse(valid)
    expect(res.success).toBe(true)
  })

  it("rejects timed event where end < start", () => {
    const invalid = {
      calendarId: "cal_123",
      title: "Broken Meeting",
      isAllDay: false,
      startTime: "2026-10-20T14:00:00Z",
      endTime: "2026-10-20T13:00:00Z", // end before start!
      timezone: "UTC",
    }
    const res = EventFormSchema.safeParse(invalid)
    expect(res.success).toBe(false)
    if (!res.success) {
      const issues = res.error.issues
      expect(issues.some((i) => i.path.includes("endTime"))).toBe(true)
    }
  })

  it("rejects all-day event where end < start", () => {
    const invalid = {
      calendarId: "cal_123",
      title: "Broken Conference",
      isAllDay: true,
      startDate: "2026-10-25",
      endDate: "2026-10-20", // end before start!
      timezone: "UTC",
    }
    const res = EventFormSchema.safeParse(invalid)
    expect(res.success).toBe(false)
    if (!res.success) {
      const issues = res.error.issues
      expect(issues.some((i) => i.path.includes("endDate"))).toBe(true)
    }
  })

  it("rejects invalid attendee email address", () => {
    const invalid = {
      calendarId: "cal_123",
      title: "Team Meeting",
      isAllDay: false,
      startTime: "2026-10-20T10:00:00Z",
      endTime: "2026-10-20T11:00:00Z",
      attendees: [
        {
          email: "not-an-email",
        },
      ],
    }
    const res = EventFormSchema.safeParse(invalid)
    expect(res.success).toBe(false)
    if (!res.success) {
      const issues = res.error.issues
      expect(
        issues.some(
          (i) => i.path.includes("attendees") && i.path.includes("email")
        )
      ).toBe(true)
    }
  })

  it("validates event with optional sourceMailMessageId", () => {
    const valid = {
      calendarId: "cal_123",
      title: "Flight from email",
      isAllDay: false,
      startTime: "2026-10-20T10:00:00Z",
      endTime: "2026-10-20T11:00:00Z",
      sourceMailMessageId: "msg_987654",
    }
    const res = EventFormSchema.safeParse(valid)
    expect(res.success).toBe(true)
    if (res.success) {
      expect(res.data.sourceMailMessageId).toBe("msg_987654")
    }
  })
})

describe("Recurrence Presets and RRULE helpers", () => {
  it("builds daily, weekly, monthly, and yearly RRULEs", () => {
    expect(buildRRule("none")).toBe("")
    expect(buildRRule("daily")).toBe("FREQ=DAILY")
    expect(buildRRule("weekly")).toBe("FREQ=WEEKLY")
    expect(buildRRule("monthly")).toBe("FREQ=MONTHLY")
    expect(buildRRule("yearly")).toBe("FREQ=YEARLY")
  })

  it("builds custom RRULE with interval and byDay", () => {
    const rrule = buildRRule("custom", {
      freq: "WEEKLY",
      interval: 2,
      byDay: ["MO", "WE", "FR"],
    })
    expect(rrule).toBe("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR")
  })

  it("parses RRULE back to structured recurrence options", () => {
    const parsedWeekly = parseRRule("FREQ=WEEKLY")
    expect(parsedWeekly.preset).toBe("weekly")
    expect(parsedWeekly.freq).toBe("WEEKLY")

    const parsedCustom = parseRRule("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR")
    expect(parsedCustom.preset).toBe("custom")
    expect(parsedCustom.freq).toBe("WEEKLY")
    expect(parsedCustom.interval).toBe(2)
    expect(parsedCustom.byDay).toEqual(["MO", "WE", "FR"])
  })
})
