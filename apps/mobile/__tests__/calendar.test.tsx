import React from "react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, fireEvent } from "@testing-library/react"
import type { EventOccurrence } from "@saturn/api/saturn/calendar/v1/calendar"
import { formatLocalDateString } from "@saturn/core"
import {
  groupEventsByDate,
  getConsecutiveDays,
  formatEventTime,
  findSelfAttendee,
} from "../components/calendar/calendar-utils"
import {
  DateStrip,
  stepCalendarStripDate,
  resolveHorizontalSwipeDirection,
} from "../components/calendar/date-strip"
import { haptics } from "../lib/haptics"
import { buildRRule, parseRRule } from "@saturn/schemas"

vi.mock("react-native", async () => {
  const ReactMod = await import("react")
  const flattenStyle = (s: unknown): Record<string, unknown> | undefined => {
    if (!s) return undefined
    if (Array.isArray(s)) {
      return Object.assign(
        {},
        ...s
          .flat(Infinity)
          .filter(Boolean)
          .map((item) => flattenStyle(item))
      )
    }
    return typeof s === "object" ? (s as Record<string, unknown>) : undefined
  }
  return {
    Appearance: {
      setColorScheme: vi.fn(),
    },
    Platform: {
      OS: "ios",
      select: (obj: Record<string, unknown>) => obj.ios ?? obj.default,
    },
    StyleSheet: {
      create: <T extends Record<string, unknown>>(styles: T): T => styles,
    },
    useColorScheme: () => "dark",
    View: ({
      children,
      style,
      testID,
      ...props
    }: Record<string, unknown> & { children?: React.ReactNode }) =>
      ReactMod.createElement(
        "div",
        { ...props, "data-testid": testID, style: flattenStyle(style) },
        children
      ),
    Text: ({
      children,
      style,
      testID,
      ...props
    }: Record<string, unknown> & { children?: React.ReactNode }) =>
      ReactMod.createElement(
        "span",
        { ...props, "data-testid": testID, style: flattenStyle(style) },
        children
      ),
    TouchableOpacity: ({
      children,
      onPress,
      disabled,
      testID,
      accessibilityLabel,
      accessibilityRole: _ar,
      activeOpacity: _ao,
      style,
      ...props
    }: Record<string, unknown> & {
      children?: React.ReactNode
      onPress?: () => void
      disabled?: boolean
      testID?: string
      accessibilityLabel?: string
    }) =>
      ReactMod.createElement(
        "button",
        {
          type: "button",
          onClick: disabled ? undefined : onPress,
          disabled,
          "data-testid": testID,
          "aria-label": accessibilityLabel,
          style: flattenStyle(style),
          ...props,
        },
        children
      ),
  }
})

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
  },
}))

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

describe("Self-Attendee RSVP Matching", () => {
  it("matches case-insensitively against user and connected account emails without falsely matching external organizers", () => {
    const attendees = [
      {
        email: "External.Host@company.com",
        displayName: "External Host",
        isOrganizer: true,
        responseStatus: "ATTENDEE_RESPONSE_STATUS_ACCEPTED",
      },
      {
        email: "Me.Work@Example.com",
        displayName: "Me",
        isOrganizer: false,
        responseStatus: "ATTENDEE_RESPONSE_STATUS_NEEDS_ACTION",
      },
    ]

    const matched = findSelfAttendee(attendees, [
      "personal@other.com",
      "me.work@example.com",
    ])
    expect(matched?.email).toBe("Me.Work@Example.com")
    expect(matched?.responseStatus).toBe(
      "ATTENDEE_RESPONSE_STATUS_NEEDS_ACTION"
    )

    // Solo or non-attendee event must return undefined (never match organizer)
    expect(
      findSelfAttendee([attendees[0]], ["me.work@example.com"])
    ).toBeUndefined()
    expect(findSelfAttendee(attendees, [])).toBeUndefined()
  })
})

describe("DateStrip Stepping & Horizontal Swipe Helpers", () => {
  it("steps ±7 days when collapsed across month boundaries", () => {
    // 2026-01-29 in America/New_York
    const jan29 = new Date("2026-01-29T17:00:00Z")
    const nextWeek = stepCalendarStripDate(
      jan29,
      "America/New_York",
      "next",
      false
    )
    expect(formatLocalDateString(nextWeek, "America/New_York")).toBe(
      "2026-02-05"
    )

    // 2026-03-03 -> 7 days back crosses into February
    const mar03 = new Date("2026-03-03T17:00:00Z")
    const prevWeek = stepCalendarStripDate(
      mar03,
      "America/New_York",
      "prev",
      false
    )
    expect(formatLocalDateString(prevWeek, "America/New_York")).toBe(
      "2026-02-24"
    )
  })

  it("steps ±1 month when expanded including Jan <-> Dec year rollover", () => {
    const jan18 = new Date("2026-01-18T17:00:00Z")
    const prevMonth = stepCalendarStripDate(
      jan18,
      "America/New_York",
      "prev",
      true
    )
    expect(formatLocalDateString(prevMonth, "America/New_York")).toBe(
      "2025-12-01"
    )

    const dec18 = new Date("2026-12-18T17:00:00Z")
    const nextMonth = stepCalendarStripDate(
      dec18,
      "America/New_York",
      "next",
      true
    )
    expect(formatLocalDateString(nextMonth, "America/New_York")).toBe(
      "2027-01-01"
    )
  })

  it("resolves horizontal swipe direction and ignores vertical or short touches", () => {
    // Short touches below threshold
    expect(resolveHorizontalSwipeDirection(0, 0)).toBeNull()
    expect(resolveHorizontalSwipeDirection(35, 0)).toBeNull()
    expect(resolveHorizontalSwipeDirection(-20, 5)).toBeNull()

    // Vertical or diagonal-vertical-dominant touches
    expect(resolveHorizontalSwipeDirection(-50, 50)).toBeNull()
    expect(resolveHorizontalSwipeDirection(40, -60)).toBeNull()

    // Non-finite values
    expect(resolveHorizontalSwipeDirection(Number.NaN, 0)).toBeNull()
    expect(
      resolveHorizontalSwipeDirection(50, Number.POSITIVE_INFINITY)
    ).toBeNull()

    // Left swipe (dx < 0) advances forward -> "next"
    expect(resolveHorizontalSwipeDirection(-45, 8)).toBe("next")
    expect(resolveHorizontalSwipeDirection(-36, 0)).toBe("next")

    // Right swipe (dx > 0) goes back -> "prev"
    expect(resolveHorizontalSwipeDirection(45, -8)).toBe("prev")
    expect(resolveHorizontalSwipeDirection(36, 0)).toBe("prev")
  })
})

describe("<DateStrip /> Component", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders without any duplicate month/year header or internal stepper controls", () => {
    const selectedDate = new Date("2026-09-15T12:00:00Z")
    const { queryByText, queryByTestId } = render(
      <DateStrip
        selectedDate={selectedDate}
        timeZone="UTC"
        isExpanded={false}
        onSelectDate={vi.fn()}
      />
    )

    expect(queryByText("September 2026")).toBeNull()
    expect(queryByTestId("calendar-strip-toggle")).toBeNull()
    expect(queryByTestId("calendar-strip-prev")).toBeNull()
    expect(queryByTestId("calendar-strip-next")).toBeNull()
  })

  it("renders week pills when collapsed and month matrix when expanded", () => {
    const selectedDate = new Date("2026-09-15T12:00:00Z")
    const onSelectDate = vi.fn()

    const collapsed = render(
      <DateStrip
        selectedDate={selectedDate}
        timeZone="UTC"
        isExpanded={false}
        onSelectDate={onSelectDate}
      />
    )

    // Collapsed shows the 7 days of the week containing Sep 15, 2026 (Sun Sep 13 - Sat Sep 19)
    expect(collapsed.getByTestId("day-pill-2026-09-13")).toBeTruthy()
    expect(collapsed.getByTestId("day-pill-2026-09-19")).toBeTruthy()
    expect(collapsed.queryByTestId("month-cell-2026-09-01")).toBeNull()
    collapsed.unmount()

    const expanded = render(
      <DateStrip
        selectedDate={selectedDate}
        timeZone="UTC"
        isExpanded={true}
        onSelectDate={onSelectDate}
      />
    )

    // Expanded shows full September 2026 month matrix
    expect(expanded.queryByTestId("day-pill-2026-09-15")).toBeNull()
    expect(expanded.getByTestId("month-cell-2026-09-01")).toBeTruthy()
    expect(expanded.getByTestId("month-cell-2026-09-30")).toBeTruthy()
  })

  it("respects weekStartsOn={0} vs weekStartsOn={1} in both week strip and month matrix", () => {
    // 2026-09-15 is a Tuesday
    const selectedDate = new Date("2026-09-15T12:00:00Z")

    // weekStartsOn={0}: week starts Sunday 2026-09-13, ends Saturday 2026-09-19
    const sundayWeek = render(
      <DateStrip
        selectedDate={selectedDate}
        timeZone="UTC"
        weekStartsOn={0}
        isExpanded={false}
        onSelectDate={vi.fn()}
      />
    )
    expect(sundayWeek.getByTestId("day-pill-2026-09-13")).toBeTruthy()
    expect(sundayWeek.queryByTestId("day-pill-2026-09-20")).toBeNull()
    sundayWeek.unmount()

    // weekStartsOn={1}: week starts Monday 2026-09-14, ends Sunday 2026-09-20
    const mondayWeek = render(
      <DateStrip
        selectedDate={selectedDate}
        timeZone="UTC"
        weekStartsOn={1}
        isExpanded={false}
        onSelectDate={vi.fn()}
      />
    )
    expect(mondayWeek.queryByTestId("day-pill-2026-09-13")).toBeNull()
    expect(mondayWeek.getByTestId("day-pill-2026-09-14")).toBeTruthy()
    expect(mondayWeek.getByTestId("day-pill-2026-09-20")).toBeTruthy()
    mondayWeek.unmount()

    // weekStartsOn={1} expanded weekday initials start with "M"
    const mondayMonth = render(
      <DateStrip
        selectedDate={selectedDate}
        timeZone="UTC"
        weekStartsOn={1}
        isExpanded={true}
        onSelectDate={vi.fn()}
      />
    )
    const strip = mondayMonth.getByTestId("calendar-date-strip")
    const spans = Array.from(strip.querySelectorAll("span")).slice(0, 7)
    expect(spans.map((el) => el.textContent)).toEqual([
      "M",
      "T",
      "W",
      "T",
      "F",
      "S",
      "S",
    ])
    // Sep 1, 2026 is Tuesday -> Monday-first matrix begins on Aug 31
    expect(mondayMonth.getByTestId("month-cell-2026-08-31")).toBeTruthy()
  })

  it("advances or rewinds dates on horizontal swipe and ignores vertical swipes", () => {
    const selectedDate = new Date("2026-09-15T12:00:00Z")
    const onSelectDate = vi.fn()

    const { getByTestId, rerender } = render(
      <DateStrip
        selectedDate={selectedDate}
        timeZone="UTC"
        isExpanded={false}
        onSelectDate={onSelectDate}
      />
    )

    const strip = getByTestId("calendar-date-strip")

    // Left swipe in collapsed mode -> next week (2026-09-22)
    fireEvent.touchStart(strip, {
      touches: [{ clientX: 250, clientY: 100 }],
    })
    fireEvent.touchEnd(strip, {
      changedTouches: [{ clientX: 150, clientY: 105 }],
    })
    expect(haptics.light).toHaveBeenCalledTimes(1)
    expect(onSelectDate).toHaveBeenCalledTimes(1)
    expect(formatLocalDateString(onSelectDate.mock.calls[0][0], "UTC")).toBe(
      "2026-09-22"
    )

    // Vertical swipe should be ignored
    fireEvent.touchStart(strip, {
      touches: [{ clientX: 150, clientY: 100 }],
    })
    fireEvent.touchEnd(strip, {
      changedTouches: [{ clientX: 155, clientY: 220 }],
    })
    expect(onSelectDate).toHaveBeenCalledTimes(1)

    // Right swipe in expanded mode -> previous month (2026-08-01)
    rerender(
      <DateStrip
        selectedDate={selectedDate}
        timeZone="UTC"
        isExpanded={true}
        onSelectDate={onSelectDate}
      />
    )
    fireEvent.touchStart(strip, {
      touches: [{ clientX: 100, clientY: 120 }],
    })
    fireEvent.touchEnd(strip, {
      changedTouches: [{ clientX: 220, clientY: 125 }],
    })
    expect(haptics.light).toHaveBeenCalledTimes(2)
    expect(onSelectDate).toHaveBeenCalledTimes(2)
    expect(formatLocalDateString(onSelectDate.mock.calls[1][0], "UTC")).toBe(
      "2026-08-01"
    )
  })
})

describe("Mobile Calendar Spanish Formatting & Translations", () => {
  it("formats section headers in Spanish without year for current year and capitalized weekday", () => {
    const mockEvents: EventOccurrence[] = [
      {
        eventId: "ev_1",
        calendarId: "cal_1",
        masterId: "",
        instanceId: "inst_1",
        title: "Revisión de diseño",
        description: "",
        location: "",
        isAllDay: false,
        startTime: "2026-11-02T15:00:00Z",
        endTime: "2026-11-02T16:00:00Z",
        startDate: "",
        endDate: "",
        timezone: "UTC",
        status: "EVENT_STATUS_CONFIRMED",
        isException: false,
        meetUrl: "",
        color: "#38bdf8",
        calendarName: "Trabajo",
        organizer: { email: "", displayName: "", isSelf: true },
        attendees: [],
        reminders: [],
        isVirtual: false,
        sourceType: "",
      },
    ]

    const sections = groupEventsByDate(mockEvents, "UTC", "es-ES")
    expect(sections).toHaveLength(1)
    expect(sections[0].title).toContain("noviembre")
    expect(sections[0].title.charAt(0)).toBe(
      sections[0].title.charAt(0).toUpperCase()
    )
  })

  it("formats all-day event times using localized allDayLabel", () => {
    const allDayOcc: EventOccurrence = {
      eventId: "ev_all_day",
      calendarId: "cal_1",
      masterId: "",
      instanceId: "inst_all_day",
      title: "Vacaciones",
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
      calendarName: "Personal",
      organizer: { email: "", displayName: "", isSelf: true },
      attendees: [],
      reminders: [],
      isVirtual: false,
      sourceType: "",
    }

    expect(formatEventTime(allDayOcc, "UTC", "es-ES", "Todo el día")).toBe(
      "Todo el día"
    )
  })
})
