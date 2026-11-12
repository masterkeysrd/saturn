import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { createElement, type ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { CalendarView } from "./calendar-view"
import * as hooks from "@saturn/hooks"
import type { EventOccurrence } from "@saturn/api/saturn/calendar/v1/calendar"

const mockCalendars = [
  {
    id: "cal_work",
    name: "Work Calendar",
    description: "Main work",
    color: "#3b82f6",
    timezone: "UTC",
    isEnabled: true,
    source: "CALENDAR_SOURCE_NATIVE" as const,
  },
  {
    id: "cal_personal",
    name: "Personal",
    description: "Personal calendar",
    color: "#10b981",
    timezone: "UTC",
    isEnabled: false,
    connectedAccountId: "acc_google_1",
    source: "CALENDAR_SOURCE_EXTERNAL" as const,
  },
]

const mockConnectedAccounts = [
  {
    id: "acc_google_1",
    displayName: "Google Account",
    email: "user@gmail.com",
    provider: "google",
    color: "#10b981",
    enabledCapabilities: ["calendar"],
  },
]

const mockOccurrences: EventOccurrence[] = [
  {
    eventId: "ev_standup",
    calendarId: "cal_work",
    masterId: "",
    instanceId: "inst_standup",
    title: "Daily Standup",
    description: "Morning sync",
    location: "Zoom",
    isAllDay: false,
    startTime: "2026-10-20T09:00:00Z",
    endTime: "2026-10-20T09:30:00Z",
    startDate: "",
    endDate: "",
    timezone: "UTC",
    status: "EVENT_STATUS_CONFIRMED",
    isException: false,
    meetUrl: "https://zoom.us/j/123",
    color: "#3b82f6",
    calendarName: "Work Calendar",
    organizer: {
      email: "lead@example.com",
      displayName: "Lead",
      isSelf: false,
    },
    attendees: [
      {
        email: "user@example.com",
        displayName: "User",
        responseStatus: "ATTENDEE_RESPONSE_STATUS_ACCEPTED",
        isOptional: false,
        isOrganizer: false,
      },
    ],
    reminders: [],
    isVirtual: false,
    sourceType: "",
  },
  {
    eventId: "ev_recurring",
    calendarId: "cal_work",
    masterId: "ev_master_1",
    instanceId: "inst_recurring_1",
    title: "Team Retrospective",
    description: "Bi-weekly sprint retrospective",
    location: "Meeting Room A",
    isAllDay: false,
    startTime: "2026-10-20T14:00:00Z",
    endTime: "2026-10-20T15:00:00Z",
    startDate: "",
    endDate: "",
    timezone: "UTC",
    status: "EVENT_STATUS_CONFIRMED",
    isException: false,
    meetUrl: "",
    color: "#3b82f6",
    calendarName: "Work Calendar",
    organizer: { email: "lead@example.com", displayName: "Lead", isSelf: true },
    attendees: [],
    reminders: [],
    isVirtual: false,
    sourceType: "",
  },
  {
    eventId: "ev_conference",
    calendarId: "cal_work",
    masterId: "",
    instanceId: "inst_conf",
    title: "Saturn Summit",
    description: "Annual summit",
    location: "Convention Center",
    isAllDay: true,
    startDate: "2026-10-19",
    endDate: "2026-10-22",
    startTime: "",
    endTime: "",
    timezone: "UTC",
    status: "EVENT_STATUS_CONFIRMED",
    isException: false,
    meetUrl: "",
    color: "#8b5cf6",
    calendarName: "Work Calendar",
    organizer: { email: "org@example.com", displayName: "Org", isSelf: true },
    attendees: [],
    reminders: [],
    isVirtual: false,
    sourceType: "",
  },
]

const mutateCreateEvent = vi.fn()
const mutateUpdateEvent = vi.fn()
const mutateDeleteEvent = vi.fn()
const mutateUpdateCalendar = vi.fn()
const mutateRespond = vi.fn()

import type { DateInput } from "@saturn/core"

const mockTz = {
  timezone: "UTC",
  now: () => new Date("2026-10-20T12:00:00Z"),
  format: (_d: DateInput, opts?: Intl.DateTimeFormatOptions) => {
    if (opts?.weekday === "long") return "Tuesday"
    return "October 20, 2026"
  },
  formatDate: () => "2026-10-20",
  formatTime: (d: DateInput) => {
    const dt = new Date(d as string | number | Date)
    const h = dt.getUTCHours()
    const m = String(dt.getUTCMinutes()).padStart(2, "0")
    const period = h < 12 ? "AM" : "PM"
    const dh = h % 12 === 0 ? 12 : h % 12
    return `${dh}:${m} ${period}`
  },
  formatDateTime: () => "Oct 20, 2026, 12:00 PM",
  formatMonth: () => "October 2026",
  formatRelative: () => "today",
  startOfDay: (d?: DateInput) => {
    const dt = new Date((d || "2026-10-20T00:00:00Z") as string | number | Date)
    dt.setUTCHours(0, 0, 0, 0)
    return dt
  },
  endOfDay: (d?: DateInput) => {
    const dt = new Date(
      (d || "2026-10-20T23:59:59.999Z") as string | number | Date
    )
    dt.setUTCHours(23, 59, 59, 999)
    return dt
  },
  parts: (d?: DateInput) => {
    const dt = new Date((d || "2026-10-20T12:00:00Z") as string | number | Date)
    return {
      year: dt.getUTCFullYear(),
      month: dt.getUTCMonth() + 1,
      day: dt.getUTCDate(),
      hour: dt.getUTCHours(),
      minute: dt.getUTCMinutes(),
      second: dt.getUTCSeconds(),
      millisecond: 0,
    }
  },
  isToday: (d: DateInput) => {
    const dt = new Date(d as string | number | Date)
    return (
      dt.getUTCDate() === 20 &&
      dt.getUTCMonth() === 9 &&
      dt.getUTCFullYear() === 2026
    )
  },
  isYesterday: () => false,
  isTomorrow: () => false,
  isSameDay: (d1: DateInput, d2: DateInput) => {
    const a = new Date(d1 as string | number | Date)
    const b = new Date(d2 as string | number | Date)
    return (
      a.getUTCDate() === b.getUTCDate() &&
      a.getUTCMonth() === b.getUTCMonth() &&
      a.getUTCFullYear() === b.getUTCFullYear()
    )
  },
}

vi.mock("@saturn/hooks", async () => {
  const actual = await vi.importActual<typeof hooks>("@saturn/hooks")
  return {
    ...actual,
    useCalendars: () => ({
      data: { calendars: mockCalendars },
      isLoading: false,
    }),
    useConnectedAccounts: () => ({
      data: { accounts: mockConnectedAccounts },
      isLoading: false,
    }),
    useCalendarEvents: () => ({
      data: { occurrences: mockOccurrences },
      isLoading: false,
    }),
    useEnsureDefaultCalendar: () => ({
      mutate: vi.fn(),
      isPending: false,
      isSuccess: false,
    }),
    useCreateEvent: () => ({
      mutateAsync: mutateCreateEvent,
      isPending: false,
    }),
    useUpdateEvent: () => ({
      mutateAsync: mutateUpdateEvent,
      isPending: false,
    }),
    useDeleteEvent: () => ({
      mutateAsync: mutateDeleteEvent,
      isPending: false,
    }),
    useUpdateCalendar: () => ({
      mutate: mutateUpdateCalendar,
      mutateAsync: mutateUpdateCalendar,
      isPending: false,
    }),
    useRespondToEvent: () => ({
      mutateAsync: mutateRespond,
      isPending: false,
    }),
    useContactSuggestions: () => ({
      data: { contacts: [] },
      isLoading: false,
    }),
    useTimezone: () => mockTz,
  }
})

describe("CalendarView Component", () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
  })

  function createWrapper() {
    return function Wrapper({ children }: { children: ReactNode }) {
      return createElement(
        QueryClientProvider,
        { client: queryClient },
        children
      )
    }
  }

  it("renders Calendar view with Month view by default and displays occurrences", () => {
    render(<CalendarView />, { wrapper: createWrapper() })

    expect(screen.getByTestId("calendar-main-view")).toBeDefined()
    expect(screen.getByTestId("month-view-container")).toBeDefined()
    expect(screen.getByTestId("calendar-header-title").textContent).toContain(
      "October 2026"
    )

    // Multi-day banner for summit
    expect(screen.getByText("Saturn Summit")).toBeDefined()
    // Timed standup pill
    expect(screen.getByText("Daily Standup")).toBeDefined()
  })

  it("switches views between Month, Week, Day, and Agenda", () => {
    render(<CalendarView />, { wrapper: createWrapper() })

    // Switch to Week view
    fireEvent.click(screen.getByTestId("view-tab-week"))
    expect(screen.getByTestId("week-view-container")).toBeDefined()
    expect(screen.queryByTestId("month-view-container")).toBeNull()

    // Switch to Day view
    fireEvent.click(screen.getByTestId("view-tab-day"))
    expect(screen.getByTestId("day-view-container")).toBeDefined()

    // Switch to Agenda view
    fireEvent.click(screen.getByTestId("view-tab-agenda"))
    expect(screen.getByTestId("agenda-view-container")).toBeDefined()

    // Agenda displays event titles and times
    expect(screen.getByText("Daily Standup")).toBeDefined()
    expect(screen.getByText("Team Retrospective")).toBeDefined()
    expect(screen.getByText("Saturn Summit")).toBeDefined()
  })

  it("toggles sub-calendar visibility from sidebar", () => {
    render(<CalendarView />, { wrapper: createWrapper() })

    // Find Work Calendar checkbox toggle
    const workToggle = screen.getByTestId("calendar-toggle-cal_work")
    const checkbox = workToggle.querySelector("button, input")
    expect(checkbox).toBeDefined()

    // Toggle Work Calendar
    fireEvent.click(checkbox!)
    expect(mutateUpdateCalendar).toHaveBeenCalledWith({
      id: "cal_work",
      calendar: { isEnabled: false },
    })

    // Find Connected Account Personal calendar toggle
    const personalToggle = screen.getByTestId("calendar-toggle-cal_personal")
    const personalCheckbox = personalToggle.querySelector("button, input")
    expect(personalCheckbox).toBeDefined()

    // Toggle Personal Calendar
    fireEvent.click(personalCheckbox!)
    expect(mutateUpdateCalendar).toHaveBeenCalledWith({
      id: "cal_personal",
      calendar: { isEnabled: true },
    })
  })

  it("opens create event dialog, creates timed event, and submits", async () => {
    mutateCreateEvent.mockResolvedValueOnce({
      id: "ev_new",
      title: "New Team Architecture Review",
    })

    render(<CalendarView />, { wrapper: createWrapper() })

    // Click Create Event button in sidebar
    fireEvent.click(screen.getByTestId("create-event-btn"))

    expect(screen.getByText("Create Calendar Event")).toBeDefined()

    // Fill in event title
    const titleInput = screen.getByTestId("event-title-input")
    fireEvent.change(titleInput, {
      target: { value: "New Team Architecture Review" },
    })

    // Save event
    fireEvent.click(screen.getByTestId("save-event-btn"))

    await waitFor(() => {
      expect(mutateCreateEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.objectContaining({
            title: "New Team Architecture Review",
            isAllDay: false,
          }),
        })
      )
    })
  })

  it("creates all-day event when all-day switch is toggled", async () => {
    mutateCreateEvent.mockResolvedValueOnce({
      id: "ev_allday",
      title: "Company Offsite",
    })

    render(<CalendarView />, { wrapper: createWrapper() })

    fireEvent.click(screen.getByTestId("create-event-btn"))

    // Toggle all-day switch
    const allDaySwitch = screen.getByTestId("all-day-switch")
    fireEvent.click(allDaySwitch)

    // Fill title
    fireEvent.change(screen.getByTestId("event-title-input"), {
      target: { value: "Company Offsite" },
    })

    // Fill start and end dates
    fireEvent.change(screen.getByTestId("start-date-input"), {
      target: { value: "2026-10-25" },
    })
    fireEvent.change(screen.getByTestId("end-date-input"), {
      target: { value: "2026-10-27" },
    })

    fireEvent.click(screen.getByTestId("save-event-btn"))

    await waitFor(() => {
      expect(mutateCreateEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.objectContaining({
            title: "Company Offsite",
            isAllDay: true,
            startDate: "2026-10-25",
            endDate: "2026-10-27",
          }),
        })
      )
    })
  })

  it("prompts recurrence scope dialog when editing a recurring occurrence", async () => {
    mutateUpdateEvent.mockResolvedValueOnce({
      id: "ev_recurring",
      title: "Updated Retrospective",
    })

    render(<CalendarView />, { wrapper: createWrapper() })

    // Click on recurring event pill in Month view
    const recurringPill = screen.getByTestId("event-pill-inst_recurring_1")
    fireEvent.click(recurringPill)

    expect(screen.getByText("Edit Event")).toBeDefined()

    // Change title
    fireEvent.change(screen.getByTestId("event-title-input"), {
      target: { value: "Updated Retrospective" },
    })

    // Click Save - since it's recurring (has masterId), it opens RecurrenceScopeDialog
    fireEvent.click(screen.getByTestId("save-event-btn"))

    expect(screen.getByText("Edit Recurring Event")).toBeDefined()
    expect(screen.getByText("This event only")).toBeDefined()
    expect(screen.getByText("All events")).toBeDefined()

    // Choose "All events"
    const allEventsRadio = screen
      .getByTestId("scope-all-events")
      .querySelector("input")
    fireEvent.click(allEventsRadio!)

    // Confirm save changes
    fireEvent.click(screen.getByTestId("confirm-scope-btn"))

    await waitFor(() => {
      expect(mutateUpdateEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "ev_recurring",
          req: expect.objectContaining({
            recurrenceScope: "RECURRENCE_SCOPE_ALL_EVENTS",
            event: expect.objectContaining({
              title: "Updated Retrospective",
            }),
          }),
        })
      )
    })
  })

  it("prompts recurrence scope dialog when deleting a recurring occurrence", async () => {
    mutateDeleteEvent.mockResolvedValueOnce({})

    render(<CalendarView />, { wrapper: createWrapper() })

    const recurringPill = screen.getByTestId("event-pill-inst_recurring_1")
    fireEvent.click(recurringPill)

    // Click Delete in event dialog
    const deleteBtn = screen.getByTestId("delete-event-btn")
    fireEvent.click(deleteBtn)

    expect(screen.getByText("Delete Recurring Event")).toBeDefined()

    // Select "This event only"
    const thisEventRadio = screen
      .getByTestId("scope-this-event")
      .querySelector("input")
    fireEvent.click(thisEventRadio!)

    // Confirm Delete
    const confirmDeleteBtn = screen.getByTestId("confirm-scope-btn")
    fireEvent.click(confirmDeleteBtn)

    await waitFor(() => {
      expect(mutateDeleteEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "ev_recurring",
          req: expect.objectContaining({
            recurrenceScope: "RECURRENCE_SCOPE_THIS_EVENT",
          }),
        })
      )
    })
  })

  it("filters and selects timezone in TimezoneCombobox", async () => {
    render(<CalendarView />, { wrapper: createWrapper() })

    // Open create dialog
    fireEvent.click(screen.getByTestId("create-event-btn"))

    // Click timezone combobox trigger
    const tzTrigger = screen.getByTestId("timezone-select")
    fireEvent.click(tzTrigger)

    // Search input should be present
    const searchInput = screen.getByPlaceholderText("Search timezones...")
    expect(searchInput).toBeDefined()

    // Type "Tokyo" into search
    fireEvent.change(searchInput, { target: { value: "Tokyo" } })

    // "Asia/Tokyo" option should appear
    const tokyoOption = screen.getByTestId("timezone-option-Asia/Tokyo")
    expect(tokyoOption).toBeDefined()

    // Select "Asia/Tokyo"
    fireEvent.click(tokyoOption)

    // Verify timezone hidden input updated
    const hiddenInput = screen.getByTestId(
      "timezone-hidden-input"
    ) as HTMLInputElement
    expect(hiddenInput.value).toBe("Asia/Tokyo")
  })

  it("automatically advances end date when start date is changed to a future date", () => {
    render(<CalendarView />, { wrapper: createWrapper() })

    fireEvent.click(screen.getByTestId("create-event-btn"))

    const startInput = screen.getByTestId(
      "start-date-input"
    ) as HTMLInputElement
    const endInput = screen.getByTestId("end-date-input") as HTMLInputElement

    // Initial dates default to today (2026-10-20)
    expect(startInput.value).toBe("2026-10-20")
    expect(endInput.value).toBe("2026-10-20")

    // Set future date on Start that is after current End
    fireEvent.change(startInput, { target: { value: "2026-11-15" } })

    // End date automatically shifts forward to match/preserve interval
    expect(startInput.value).toBe("2026-11-15")
    expect(endInput.value).toBe("2026-11-15")
  })

  it("collapses and expands sidebar rail", () => {
    render(<CalendarView />, { wrapper: createWrapper() })

    expect(screen.getByTestId("create-event-btn")).toBeDefined()

    // Click sidebar collapse button
    const collapseBtn = screen.getByLabelText("Collapse sidebar")
    fireEvent.click(collapseBtn)

    // Sidebar should be collapsed
    expect(screen.queryByTestId("create-event-btn")).toBeNull()

    // Click expand button
    const expandBtn = screen.getByLabelText("Expand sidebar")
    fireEvent.click(expandBtn)

    // Sidebar should be visible again
    expect(screen.getByTestId("create-event-btn")).toBeDefined()
  })
})
