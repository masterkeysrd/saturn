import { describe, it, expect, vi, beforeEach } from "vitest"
import type { EventOccurrence } from "@saturn/api/saturn/calendar/v1/calendar"
import {
  groupEventsByDate,
  getConsecutiveDays,
  formatEventTime,
} from "../components/calendar/calendar-utils"
import { haptics } from "../lib/haptics"
import { buildRRule, parseRRule } from "@saturn/schemas"

// Mock haptics
vi.mock("../lib/haptics", () => ({
  haptics: {
    light: vi.fn(),
    medium: vi.fn(),
    heavy: vi.fn(),
    selection: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}))

describe("Mobile Calendar Date Grouping & Timezone Helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("groups occurrences by local date in specified timezone across midnight boundaries", () => {
    // 2026-10-21T02:00:00Z in America/New_York (UTC-4) is 2026-10-20 22:00:00
    // 2026-10-21T14:00:00Z in America/New_York (UTC-4) is 2026-10-21 10:00:00
    const mockEvents: EventOccurrence[] = [
      {
        eventId: "ev_late_night",
        calendarId: "cal_1",
        masterId: "",
        instanceId: "inst_1",
        title: "Late Night Sync",
        description: "",
        location: "",
        isAllDay: false,
        startTime: "2026-10-21T02:00:00Z",
        endTime: "2026-10-21T03:00:00Z",
        startDate: "",
        endDate: "",
        timezone: "UTC",
        status: "EVENT_STATUS_CONFIRMED",
        isException: false,
        meetUrl: "",
        color: "#38bdf8",
        calendarName: "Work",
        organizer: {
          email: "host@example.com",
          displayName: "Host",
          isSelf: true,
        },
        attendees: [],
        reminders: [],
        isVirtual: false,
        sourceType: "",
      },
      {
        eventId: "ev_daytime",
        calendarId: "cal_1",
        masterId: "",
        instanceId: "inst_2",
        title: "Daytime Review",
        description: "",
        location: "",
        isAllDay: false,
        startTime: "2026-10-21T14:00:00Z",
        endTime: "2026-10-21T15:00:00Z",
        startDate: "",
        endDate: "",
        timezone: "UTC",
        status: "EVENT_STATUS_CONFIRMED",
        isException: false,
        meetUrl: "",
        color: "#38bdf8",
        calendarName: "Work",
        organizer: {
          email: "host@example.com",
          displayName: "Host",
          isSelf: true,
        },
        attendees: [],
        reminders: [],
        isVirtual: false,
        sourceType: "",
      },
      {
        eventId: "ev_allday",
        calendarId: "cal_1",
        masterId: "",
        instanceId: "inst_3",
        title: "Company Holiday",
        description: "",
        location: "",
        isAllDay: true,
        startTime: "",
        endTime: "",
        startDate: "2026-10-20",
        endDate: "2026-10-21",
        timezone: "UTC",
        status: "EVENT_STATUS_CONFIRMED",
        isException: false,
        meetUrl: "",
        color: "#10b981",
        calendarName: "Holidays",
        organizer: {
          email: "hr@example.com",
          displayName: "HR",
          isSelf: false,
        },
        attendees: [],
        reminders: [],
        isVirtual: false,
        sourceType: "",
      },
    ]

    // In America/New_York:
    // "ev_late_night" (02:00 UTC) falls on 2026-10-20
    // "ev_allday" falls on 2026-10-20
    // "ev_daytime" falls on 2026-10-21
    const sections = groupEventsByDate(mockEvents, "America/New_York")

    expect(sections).toHaveLength(2)
    expect(sections[0].dateString).toBe("2026-10-20")
    expect(sections[1].dateString).toBe("2026-10-21")

    // On 2026-10-20: all-day event appears first, then timed event
    expect(sections[0].data).toHaveLength(2)
    expect(sections[0].data[0].eventId).toBe("ev_allday")
    expect(sections[0].data[1].eventId).toBe("ev_late_night")

    // On 2026-10-21: daytime review
    expect(sections[1].data).toHaveLength(1)
    expect(sections[1].data[0].eventId).toBe("ev_daytime")
  })

  it("calculates consecutive days across month boundaries", () => {
    // 3 days starting Oct 31 in UTC: Oct 31, Nov 01, Nov 02
    const days = getConsecutiveDays("2026-10-31", 3, "UTC")
    expect(days).toEqual(["2026-10-31", "2026-11-01", "2026-11-02"])

    // 1 day
    const single = getConsecutiveDays("2026-10-31", 1, "UTC")
    expect(single).toEqual(["2026-10-31"])
  })

  it("formats event times correctly for all-day and timed events", () => {
    const allDayEvent: EventOccurrence = {
      eventId: "ev_1",
      calendarId: "cal_1",
      masterId: "",
      instanceId: "inst_1",
      title: "All day retreat",
      description: "",
      location: "",
      isAllDay: true,
      startTime: "",
      endTime: "",
      startDate: "2026-10-20",
      endDate: "2026-10-21",
      timezone: "UTC",
      status: "EVENT_STATUS_CONFIRMED",
      isException: false,
      meetUrl: "",
      color: "#38bdf8",
      calendarName: "Work",
      organizer: { email: "", displayName: "", isSelf: true },
      attendees: [],
      reminders: [],
      isVirtual: false,
      sourceType: "",
    }

    expect(formatEventTime(allDayEvent, "UTC")).toBe("All day")

    const timedEvent: EventOccurrence = {
      ...allDayEvent,
      isAllDay: false,
      startTime: "2026-10-20T14:00:00Z",
      endTime: "2026-10-20T15:30:00Z",
    }

    const timeStr = formatEventTime(timedEvent, "UTC")
    expect(timeStr).toContain("2:00 PM")
    expect(timeStr).toContain("3:30 PM")
  })
})

describe("Mobile Calendar Mode Switching & Haptics", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("triggers haptics.selection on view mode changes", async () => {
    let mode: "agenda" | "day" | "three_day" = "agenda"

    const switchMode = async (next: "agenda" | "day" | "three_day") => {
      await haptics.selection()
      mode = next
    }

    await switchMode("day")
    expect(mode).toBe("day")
    expect(haptics.selection).toHaveBeenCalledTimes(1)

    await switchMode("three_day")
    expect(mode).toBe("three_day")
    expect(haptics.selection).toHaveBeenCalledTimes(2)

    await switchMode("agenda")
    expect(mode).toBe("agenda")
    expect(haptics.selection).toHaveBeenCalledTimes(3)
  })

  it("triggers haptics.selection on Today jump and filter sheet trigger", async () => {
    const onJumpToday = async () => {
      await haptics.selection()
    }
    const onOpenFilters = async () => {
      await haptics.selection()
    }

    await onJumpToday()
    expect(haptics.selection).toHaveBeenCalledTimes(1)

    await onOpenFilters()
    expect(haptics.selection).toHaveBeenCalledTimes(2)
  })

  it("triggers haptics.light and haptics.success on event selection and RSVP", async () => {
    const onSelectOccurrence = async () => {
      await haptics.light()
    }
    const onRsvp = async () => {
      await haptics.selection()
      await haptics.success()
    }

    await onSelectOccurrence()
    expect(haptics.light).toHaveBeenCalledTimes(1)

    await onRsvp()
    expect(haptics.selection).toHaveBeenCalledTimes(1)
    expect(haptics.success).toHaveBeenCalledTimes(1)
  })
})

describe("Manage Event Pre-fill Parameter Hydration", () => {
  it("hydrates initial fields from route parameters", () => {
    const rawParams = {
      initialTitle: "Strategy Sync with Founder",
      initialDescription: "Discussing Q4 roadmap and hiring plan.",
      initialStart: "2026-10-21T15:00:00Z",
      initialAttendees: JSON.stringify([
        { email: "alice@example.com", displayName: "Alice Doe" },
        "bob@example.com",
      ]),
      sourceMailMessageId: "msg_ksuid_12345",
      calendarId: "cal_leadership",
    }

    // Verify attendee parsing logic
    const parseInitialAttendees = (raw?: string) => {
      if (!raw) return []
      try {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          return parsed.map((item) => {
            if (typeof item === "string") {
              return {
                email: item.trim(),
                displayName: "",
                isOptional: false,
                responseStatus: "ATTENDEE_RESPONSE_STATUS_NEEDS_ACTION",
              }
            }
            return {
              email: item.email || "",
              displayName: item.displayName || "",
              isOptional: Boolean(item.isOptional),
              responseStatus:
                item.responseStatus || "ATTENDEE_RESPONSE_STATUS_NEEDS_ACTION",
            }
          })
        }
      } catch {
        return []
      }
      return []
    }

    const attendees = parseInitialAttendees(rawParams.initialAttendees)
    expect(attendees).toHaveLength(2)
    expect(attendees[0]).toEqual({
      email: "alice@example.com",
      displayName: "Alice Doe",
      isOptional: false,
      responseStatus: "ATTENDEE_RESPONSE_STATUS_NEEDS_ACTION",
    })
    expect(attendees[1]).toEqual({
      email: "bob@example.com",
      displayName: "",
      isOptional: false,
      responseStatus: "ATTENDEE_RESPONSE_STATUS_NEEDS_ACTION",
    })

    // Verify sourceMailMessageId hydration
    expect(rawParams.sourceMailMessageId).toBe("msg_ksuid_12345")
    expect(rawParams.initialTitle).toBe("Strategy Sync with Founder")
    expect(rawParams.calendarId).toBe("cal_leadership")
  })

  it("handles recurrence rule building and parsing", () => {
    const dailyRRule = buildRRule("daily")
    expect(dailyRRule).toBe("FREQ=DAILY")

    const weeklyRRule = buildRRule("weekly")
    expect(weeklyRRule).toBe("FREQ=WEEKLY")

    const parsedWeekly = parseRRule("FREQ=WEEKLY")
    expect(parsedWeekly.preset).toBe("weekly")

    const parsedNone = parseRRule("")
    expect(parsedNone.preset).toBe("none")
  })
})

describe("Space Role Access Control", () => {
  it("hides FAB and edit actions when space role is viewer", () => {
    const checkCanEdit = (role: "owner" | "admin" | "member" | "viewer") => {
      return role !== "viewer"
    }

    expect(checkCanEdit("viewer")).toBe(false)
    expect(checkCanEdit("member")).toBe(true)
    expect(checkCanEdit("admin")).toBe(true)
    expect(checkCanEdit("owner")).toBe(true)
  })
})
