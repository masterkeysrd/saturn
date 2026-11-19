import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { createElement, type ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router-dom"
import { CalendarView } from "./calendar-view"
import * as hooks from "@saturn/hooks"
import type { EventOccurrence } from "@saturn/api/saturn/calendar/v1/calendar"
import * as financeApi from "@saturn/api/gen/saturn/finance/v1/finance"

vi.mock("@/features/space/use-space", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/space/use-space")
  >("@/features/space/use-space")
  return {
    ...actual,
    useOptionalSpacePermissions: () => ({
      spaceId: "sp_1",
      spaceRole: "owner",
      isWritable: true,
      canManageSpace: true,
    }),
  }
})

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
const mutateInitiateOAuth = vi.fn()
const mockUseCalendarEvents = vi.fn()
const mockUseCalendars = vi.fn()
const mockUseConnectedAccounts = vi.fn()
const mockUseGetEvent = vi.fn()

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
    useCalendars: () => mockUseCalendars(),
    useConnectedAccounts: () => mockUseConnectedAccounts(),
    useInitiateOAuth: () => ({
      mutateAsync: mutateInitiateOAuth,
      isPending: false,
    }),
    useCalendarEvents: (...args: unknown[]) => mockUseCalendarEvents(...args),
    useGetEvent: (...args: unknown[]) => mockUseGetEvent(...args),
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
    localStorage.clear()
    mockUseCalendars.mockReturnValue({
      data: { calendars: mockCalendars },
      isLoading: false,
    })
    mockUseConnectedAccounts.mockReturnValue({
      data: { accounts: mockConnectedAccounts },
      isLoading: false,
    })
    mutateInitiateOAuth.mockResolvedValue({ authUrl: "" })
    mockUseCalendarEvents.mockReturnValue({
      data: { occurrences: mockOccurrences },
      isLoading: false,
    })
    mockUseGetEvent.mockReturnValue({
      data: undefined,
      isLoading: false,
    })
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
    expect(mutateUpdateCalendar).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "cal_work",
        calendar: { isEnabled: false },
      })
    )

    // Find Connected Account Personal calendar toggle
    const personalToggle = screen.getByTestId("calendar-toggle-cal_personal")
    const personalCheckbox = personalToggle.querySelector("button, input")
    expect(personalCheckbox).toBeDefined()

    // Toggle Personal Calendar
    fireEvent.click(personalCheckbox!)
    expect(mutateUpdateCalendar).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "cal_personal",
        calendar: { isEnabled: true },
      })
    )
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

  it("opens anchored event preview popover on click with Join Meeting, location, attendees, and Edit handoff", () => {
    render(<CalendarView />, { wrapper: createWrapper() })

    fireEvent.click(screen.getByTestId("event-pill-inst_standup"))

    const preview = screen.getByTestId("event-preview-popover")
    expect(preview).toBeDefined()
    expect(screen.queryByText("Edit Event")).toBeNull()
    expect(preview.textContent).toContain("Daily Standup")
    expect(preview.textContent).toContain("9:00 AM – 9:30 AM")
    expect(preview.textContent).toContain("Zoom")
    expect(preview.textContent).toContain("Morning sync")
    expect(preview.textContent).toContain("Accepted")

    const joinLink = screen.getByRole("link", { name: /Join Meeting/i })
    expect(joinLink.getAttribute("href")).toBe("https://zoom.us/j/123")

    fireEvent.click(screen.getByTestId("preview-edit-event-btn"))
    expect(screen.getByText("Edit Event")).toBeDefined()
    expect(screen.queryByTestId("event-preview-popover")).toBeNull()
  })

  it("prompts recurrence scope dialog when editing a recurring occurrence", async () => {
    mutateUpdateEvent.mockResolvedValueOnce({
      id: "ev_recurring",
      title: "Updated Retrospective",
    })

    render(<CalendarView />, { wrapper: createWrapper() })

    // Click on recurring event pill in Month view -> opens preview -> click Edit
    const recurringPill = screen.getByTestId("event-pill-inst_recurring_1")
    fireEvent.click(recurringPill)
    fireEvent.click(screen.getByTestId("preview-edit-event-btn"))

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
    fireEvent.click(screen.getByTestId("preview-edit-event-btn"))

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

  it("serializes event times in the selected IANA timezone and preserves master custom RRULE on ALL_EVENTS while omitting rrule on THIS_EVENT", async () => {
    mockUseGetEvent.mockReturnValue({
      data: {
        id: "ev_master_1",
        rrule: "RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR",
      },
      isLoading: false,
    })
    mutateUpdateEvent.mockResolvedValue({ id: "ev_recurring" })

    render(<CalendarView />, { wrapper: createWrapper() })

    // Open recurring occurrence via preview -> Edit
    fireEvent.click(screen.getByTestId("event-pill-inst_recurring_1"))
    fireEvent.click(screen.getByTestId("preview-edit-event-btn"))
    expect(screen.getByText("Edit Event")).toBeDefined()

    // Select America/New_York timezone (EDT = UTC-4 in Oct)
    fireEvent.click(screen.getByTestId("timezone-select"))
    fireEvent.change(screen.getByPlaceholderText("Search timezones..."), {
      target: { value: "New_York" },
    })
    fireEvent.click(screen.getByTestId("timezone-option-America/New_York"))

    // Save -> THIS_EVENT omits rrule from updateMask.paths
    fireEvent.click(screen.getByTestId("save-event-btn"))
    const thisRadio = screen
      .getByTestId("scope-this-event")
      .querySelector("input")
    fireEvent.click(thisRadio!)
    fireEvent.click(screen.getByTestId("confirm-scope-btn"))

    await waitFor(() => {
      expect(mutateUpdateEvent).toHaveBeenCalledTimes(1)
    })
    const firstCall = mutateUpdateEvent.mock.calls[0][0]
    expect(firstCall.req.updateMask.paths).not.toContain("rrule")
    // 14:00 in America/New_York on 2026-10-20 (EDT = UTC-4) -> 18:00:00.000Z
    expect(firstCall.req.event.startTime).toBe("2026-10-20T18:00:00.000Z")

    // Reopen and save as ALL_EVENTS -> preserves custom RRULE
    fireEvent.click(screen.getByTestId("event-pill-inst_recurring_1"))
    fireEvent.click(screen.getByTestId("preview-edit-event-btn"))
    fireEvent.click(screen.getByTestId("save-event-btn"))
    const allRadio = screen
      .getByTestId("scope-all-events")
      .querySelector("input")
    fireEvent.click(allRadio!)
    fireEvent.click(screen.getByTestId("confirm-scope-btn"))

    await waitFor(() => {
      expect(mutateUpdateEvent).toHaveBeenCalledTimes(2)
    })
    const secondCall = mutateUpdateEvent.mock.calls[1][0]
    expect(secondCall.req.updateMask.paths).toContain("rrule")
    expect(secondCall.req.event.rrule).toBe("RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR")
  })

  it("disables events query and shows zero events when all calendars are unchecked, and navigates to Day view on +N more", () => {
    mockUseCalendars.mockReturnValue({
      data: {
        calendars: mockCalendars.map((c) => ({ ...c, isEnabled: false })),
      },
      isLoading: false,
    })

    render(<CalendarView />, { wrapper: createWrapper() })

    expect(mockUseCalendarEvents).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      [],
      expect.objectContaining({ enabled: false, hasLoadedCalendars: true })
    )
    expect(screen.queryByText("Daily Standup")).toBeNull()

    // Now test +N more button navigates to Day view
    mockUseCalendars.mockReturnValue({
      data: { calendars: mockCalendars },
      isLoading: false,
    })
    const manyOccurrences = [1, 2, 3, 4].map((idx) => ({
      ...mockOccurrences[0],
      eventId: `ev_m_${idx}`,
      instanceId: `inst_m_${idx}`,
      title: `Event ${idx}`,
    }))
    mockUseCalendarEvents.mockReturnValue({
      data: { occurrences: manyOccurrences },
      isLoading: false,
    })

    render(<CalendarView />, { wrapper: createWrapper() })
    fireEvent.click(screen.getByTestId("month-more-2026-10-20"))
    expect(screen.getByTestId("day-view-container")).toBeDefined()
  })

  it("focuses target date and view from URL search params", async () => {
    render(
      <MemoryRouter
        initialEntries={["/space/sp_1/calendar?date=2026-10-20&view=day"]}
      >
        <CalendarView />
      </MemoryRouter>,
      { wrapper: createWrapper() }
    )

    await waitFor(() => {
      expect(screen.getByTestId("day-view-container")).toBeDefined()
    })
  })

  it("keeps + New Event toolbar CTA accessible when CalendarSidebar is collapsed", () => {
    render(<CalendarView />, { wrapper: createWrapper() })

    // Collapse sidebar
    fireEvent.click(screen.getByLabelText("Collapse sidebar"))
    expect(screen.queryByTestId("create-event-btn")).toBeNull()

    // Toolbar + New Event button is visible and opens Create Calendar Event dialog
    const toolbarNewBtn = screen.getByTestId("calendar-toolbar-new-event-btn")
    expect(toolbarNewBtn).toBeDefined()
    fireEvent.click(toolbarNewBtn)

    expect(screen.getByText("Create Calendar Event")).toBeDefined()
  })

  it("supports keyboard shortcuts (d/w/m/a/t/n) and ignores them while typing in inputs", () => {
    render(<CalendarView />, { wrapper: createWrapper() })

    // 'd' -> Day view
    fireEvent.keyDown(window, { key: "d" })
    expect(screen.getByTestId("day-view-container")).toBeDefined()

    // 'w' -> Week view
    fireEvent.keyDown(window, { key: "w" })
    expect(screen.getByTestId("week-view-container")).toBeDefined()

    // 'a' -> Agenda view
    fireEvent.keyDown(window, { key: "a" })
    expect(screen.getByTestId("agenda-view-container")).toBeDefined()

    // 'm' -> Month view
    fireEvent.keyDown(window, { key: "m" })
    expect(screen.getByTestId("month-view-container")).toBeDefined()

    // ArrowRight navigates forward, 't' jumps back to Today
    fireEvent.keyDown(window, { key: "ArrowRight" })
    fireEvent.keyDown(window, { key: "t" })
    expect(screen.getByTestId("calendar-header-title").textContent).toContain(
      "October 2026"
    )

    // 'n' opens Create Calendar Event dialog
    fireEvent.keyDown(window, { key: "n" })
    expect(screen.getByText("Create Calendar Event")).toBeDefined()

    // While inside dialog input, pressing 'd' must NOT switch away or close
    const titleInput = screen.getByTestId("event-title-input")
    fireEvent.keyDown(titleInput, { key: "d" })
    expect(screen.getByTestId("month-view-container")).toBeDefined()
  })

  it("opens EventDialog in edit mode on double-click and on 'e' while preview popover is open", () => {
    render(<CalendarView />, { wrapper: createWrapper() })

    // Double-click event pill jumps straight into Edit Event dialog
    fireEvent.doubleClick(screen.getByTestId("event-pill-inst_standup"))
    expect(screen.queryByTestId("event-preview-popover")).toBeNull()
    expect(screen.getByText("Edit Event")).toBeDefined()
    expect(
      (screen.getByTestId("event-title-input") as HTMLInputElement).value
    ).toBe("Daily Standup")

    // Close dialog
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))

    // Single click opens preview, pressing 'e' opens Edit Event dialog
    fireEvent.click(screen.getByTestId("event-pill-inst_standup"))
    expect(screen.getByTestId("event-preview-popover")).toBeDefined()
    fireEvent.keyDown(window, { key: "e" })
    expect(screen.queryByTestId("event-preview-popover")).toBeNull()
    expect(screen.getByText("Edit Event")).toBeDefined()
  })

  it("duplicates and deletes events from EventPreviewPopover quick actions", async () => {
    mutateCreateEvent.mockResolvedValueOnce({ id: "ev_dup" })
    mutateDeleteEvent.mockResolvedValueOnce({})

    render(<CalendarView />, { wrapper: createWrapper() })

    // Open preview -> click Duplicate -> opens Create Calendar Event pre-filled
    fireEvent.click(screen.getByTestId("event-pill-inst_standup"))
    fireEvent.click(screen.getByTestId("preview-duplicate-event-btn"))

    expect(screen.getByText("Create Calendar Event")).toBeDefined()
    expect(
      (screen.getByTestId("event-title-input") as HTMLInputElement).value
    ).toBe("Daily Standup")

    fireEvent.click(screen.getByTestId("save-event-btn"))
    await waitFor(() => {
      expect(mutateCreateEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.objectContaining({
            title: "Daily Standup",
            location: "Zoom",
            description: "Morning sync",
            meetUrl: "https://zoom.us/j/123",
            isAllDay: false,
          }),
        })
      )
    })

    // Open preview on non-recurring event -> click Delete -> AlertDialog confirmation -> deletes
    fireEvent.click(screen.getByTestId("event-pill-inst_standup"))
    fireEvent.click(screen.getByTestId("preview-delete-event-btn"))
    expect(screen.getByText("Delete Event")).toBeDefined()

    fireEvent.click(screen.getByTestId("confirm-delete-event-btn"))
    await waitFor(() => {
      expect(mutateDeleteEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "ev_standup",
        })
      )
    })
  })

  it("toggles Scheduled Bills & Paydays overlay and renders scheduled transactions across views", () => {
    vi.spyOn(financeApi, "useListScheduledTransactionsQuery").mockReturnValue({
      data: {
        scheduledTransactions: [
          {
            id: "sch_aws",
            sourceType: "RECURRENT_TRANSACTION",
            sourceId: "rec_aws",
            amount: "4250",
            currency: "USD",
            dueDate: "2026-10-20T12:00:00Z",
            status: "PENDING",
            metadata: { description: "AWS Cloud" },
            type: "EXPENSE",
          },
          {
            id: "sch_payday",
            sourceType: "RECURRENT_TRANSACTION",
            sourceId: "rec_payday",
            amount: "250000",
            currency: "USD",
            dueDate: "2026-10-20T12:00:00Z",
            status: "PENDING",
            metadata: { description: "Client Retainer" },
            type: "INCOME",
          },
        ],
        nextPageToken: "",
      },
      refetch: vi.fn(),
    } as unknown as ReturnType<
      typeof financeApi.useListScheduledTransactionsQuery
    >)
    vi.spyOn(financeApi, "useListRecurringTransactionsQuery").mockReturnValue({
      data: {
        recurringTransactions: [],
        nextPageToken: "",
      },
      refetch: vi.fn(),
    } as unknown as ReturnType<
      typeof financeApi.useListRecurringTransactionsQuery
    >)
    vi.spyOn(financeApi, "useGetSettingsQuery").mockReturnValue({
      data: { baseCurrency: "USD" },
    } as unknown as ReturnType<typeof financeApi.useGetSettingsQuery>)
    vi.spyOn(financeApi, "useListExchangeRatesQuery").mockReturnValue({
      data: { exchangeRates: [] },
    } as unknown as ReturnType<typeof financeApi.useListExchangeRatesQuery>)

    render(<CalendarView />, { wrapper: createWrapper() })

    // Initially off
    expect(screen.queryByTestId("finance-pill-sch_aws")).toBeNull()

    // Toggle Bills overlay from toolbar
    fireEvent.click(screen.getByTestId("calendar-finance-overlay-btn"))
    expect(localStorage.getItem("saturn:calendar-finance-overlay")).toBe("true")

    expect(screen.getByTestId("finance-pill-sch_aws")).toBeDefined()
    expect(screen.getByTestId("finance-pill-sch_aws").textContent).toContain(
      "AWS Cloud"
    )
    expect(screen.getByTestId("finance-pill-sch_payday").textContent).toContain(
      "Client Retainer"
    )

    // Switch to Agenda view and verify scheduled bills/paydays render there too
    fireEvent.click(screen.getByTestId("view-tab-agenda"))
    expect(screen.getByTestId("agenda-finance-sch_aws")).toBeDefined()
    expect(screen.getByTestId("agenda-finance-sch_payday")).toBeDefined()
  })

  it("renders Apple Calendar style warning icon on reauth_required account in CalendarSidebar and triggers OAuth reconnect", async () => {
    mockUseConnectedAccounts.mockReturnValue({
      data: {
        accounts: [
          {
            ...mockConnectedAccounts[0],
            status: "reauth_required",
          },
        ],
      },
      isLoading: false,
    })
    mutateInitiateOAuth.mockResolvedValue({
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth?cal=1",
    })

    const originalLocation = window.location
    const assignMock = vi.fn()
    Object.defineProperty(window, "location", {
      value: {
        ...originalLocation,
        href: "http://localhost:3000/calendar",
        assign: assignMock,
      },
      writable: true,
    })

    try {
      render(<CalendarView />, { wrapper: createWrapper() })

      const warningBtn = screen.getByTestId(
        "calendar-reauth-warning-acc_google_1"
      )
      expect(warningBtn).toBeDefined()
      fireEvent.click(warningBtn)

      await waitFor(() => {
        expect(mutateInitiateOAuth).toHaveBeenCalledWith({
          provider: "google",
          returnUrl: "http://localhost:3000/calendar",
          capabilities: ["calendar"],
          connectedAccountId: "acc_google_1",
        })
        expect(assignMock).toHaveBeenCalledWith(
          "https://accounts.google.com/o/oauth2/v2/auth?cal=1"
        )
      })
    } finally {
      Object.defineProperty(window, "location", {
        value: originalLocation,
        writable: true,
      })
    }
  })
})
