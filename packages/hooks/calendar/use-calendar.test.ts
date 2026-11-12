import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, act, waitFor } from "@testing-library/react"
import { createElement, type ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  calendarKeys,
  useCalendars,
  useUpdateCalendar,
  useUpdateEvent,
  useRespondToEvent,
} from "./use-calendar"
import * as api from "@saturn/api/saturn/calendar/v1/calendar"

vi.mock("@saturn/api/saturn/calendar/v1/calendar", async () => {
  const actual = await vi.importActual<typeof api>(
    "@saturn/api/saturn/calendar/v1/calendar"
  )
  return {
    ...actual,
    listCalendars: vi.fn(),
    listEvents: vi.fn(),
    createCalendar: vi.fn(),
    updateCalendar: vi.fn(),
    deleteCalendar: vi.fn(),
    createEvent: vi.fn(),
    updateEvent: vi.fn(),
    deleteEvent: vi.fn(),
    respondToEvent: vi.fn(),
  }
})

describe("useCalendar hooks and optimistic updates", () => {
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

  describe("useCalendars", () => {
    it("fetches calendars list successfully", async () => {
      const mockCalendars: api.Calendar[] = [
        {
          id: "cal_1",
          name: "Work",
          description: "Work meetings",
          color: "#3b82f6",
          timezone: "UTC",
          isEnabled: true,
        },
      ]
      vi.mocked(api.listCalendars).mockResolvedValueOnce({
        calendars: mockCalendars,
      })

      const { result } = renderHook(() => useCalendars(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data?.calendars).toHaveLength(1)
      expect(result.current.data?.calendars[0].name).toBe("Work")
    })
  })

  describe("useUpdateCalendar optimistic update & rollback", () => {
    it("optimistically toggles isEnabled and rolls back on failure", async () => {
      const initialData: api.ListCalendarsResponse = {
        calendars: [
          {
            id: "cal_1",
            name: "Work",
            description: "",
            color: "#3b82f6",
            timezone: "UTC",
            isEnabled: true,
          },
        ],
      }

      queryClient.setQueryData(calendarKeys.lists(), initialData)

      let rejectPromise!: (err: Error) => void
      vi.mocked(api.updateCalendar).mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectPromise = reject
          })
      )

      const { result } = renderHook(() => useUpdateCalendar(), {
        wrapper: createWrapper(),
      })

      act(() => {
        result.current.mutate({
          id: "cal_1",
          calendar: { isEnabled: false },
        })
      })

      // Verify optimistic toggle while request is pending
      await waitFor(() => {
        const optimistic = queryClient.getQueryData<api.ListCalendarsResponse>(
          calendarKeys.lists()
        )
        expect(optimistic?.calendars[0].isEnabled).toBe(false)
      })

      // Reject promise to trigger rollback
      await act(async () => {
        rejectPromise(new Error("Network failed"))
      })

      await waitFor(() => expect(result.current.isError).toBe(true))

      const rolledBack = queryClient.getQueryData<api.ListCalendarsResponse>(
        calendarKeys.lists()
      )
      expect(rolledBack?.calendars[0].isEnabled).toBe(true)
    })
  })

  describe("useUpdateEvent optimistic update & rollback", () => {
    it("optimistically updates event time and rolls back on failure", async () => {
      const rangeStart = "2026-10-20T00:00:00Z"
      const rangeEnd = "2026-10-21T00:00:00Z"

      const initialEvents: api.ListEventsResponse = {
        occurrences: [
          {
            eventId: "ev_1",
            calendarId: "cal_1",
            masterId: "",
            instanceId: "ev_1_inst",
            title: "Original Meeting",
            description: "",
            location: "",
            isAllDay: false,
            startTime: "2026-10-20T10:00:00Z",
            endTime: "2026-10-20T11:00:00Z",
            startDate: "",
            endDate: "",
            timezone: "UTC",
            status: "EVENT_STATUS_CONFIRMED",
            isException: false,
            meetUrl: "",
            color: "#3b82f6",
            calendarName: "Work",
            organizer: {
              email: "org@example.com",
              displayName: "Org",
              isSelf: true,
            },
            attendees: [],
            reminders: [],
            isVirtual: false,
            sourceType: "",
          },
        ],
      }

      const key = calendarKeys.events(rangeStart, rangeEnd, undefined, "")
      queryClient.setQueryData(key, initialEvents)

      let rejectPromise!: (err: Error) => void
      vi.mocked(api.updateEvent).mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectPromise = reject
          })
      )

      const { result } = renderHook(() => useUpdateEvent(), {
        wrapper: createWrapper(),
      })

      act(() => {
        result.current.mutate({
          id: "ev_1",
          req: {
            id: "ev_1",
            event: {
              id: "ev_1",
              calendarId: "cal_1",
              title: "Moved Meeting",
              description: "",
              location: "",
              isAllDay: false,
              startTime: "2026-10-20T14:00:00Z",
              endTime: "2026-10-20T15:00:00Z",
              startDate: "",
              endDate: "",
              timezone: "UTC",
              rrule: "",
              exdates: [],
              exdatesAllDay: [],
              status: "EVENT_STATUS_CONFIRMED",
              organizer: { email: "", displayName: "", isSelf: true },
              attendees: [],
              reminders: [],
              meetUrl: "",
              sourceMailMessageId: "",
            },
            updateMask: { paths: ["start_time", "end_time", "title"] },
            recurrenceScope: "RECURRENCE_SCOPE_ALL_EVENTS",
            targetStartTime: "",
            targetStartDate: "",
          },
        })
      })

      // Verify optimistic update while pending
      await waitFor(() => {
        const optimistic = queryClient.getQueryData<api.ListEventsResponse>(key)
        expect(optimistic?.occurrences[0].title).toBe("Moved Meeting")
        expect(optimistic?.occurrences[0].startTime).toBe(
          "2026-10-20T14:00:00Z"
        )
      })

      // Reject to trigger rollback
      await act(async () => {
        rejectPromise(new Error("Update failed"))
      })

      await waitFor(() => expect(result.current.isError).toBe(true))

      const rolledBack = queryClient.getQueryData<api.ListEventsResponse>(key)
      expect(rolledBack?.occurrences[0].title).toBe("Original Meeting")
      expect(rolledBack?.occurrences[0].startTime).toBe("2026-10-20T10:00:00Z")
    })
  })

  describe("useRespondToEvent optimistic RSVP & rollback", () => {
    it("optimistically updates RSVP and rolls back on failure", async () => {
      const rangeStart = "2026-10-20T00:00:00Z"
      const rangeEnd = "2026-10-21T00:00:00Z"

      const initialEvents: api.ListEventsResponse = {
        occurrences: [
          {
            eventId: "ev_rsvp",
            calendarId: "cal_1",
            masterId: "",
            instanceId: "inst_1",
            title: "RSVP Meeting",
            description: "",
            location: "",
            isAllDay: false,
            startTime: "2026-10-20T10:00:00Z",
            endTime: "2026-10-20T11:00:00Z",
            startDate: "",
            endDate: "",
            timezone: "UTC",
            status: "EVENT_STATUS_CONFIRMED",
            isException: false,
            meetUrl: "",
            color: "#3b82f6",
            calendarName: "Work",
            organizer: {
              email: "boss@example.com",
              displayName: "Boss",
              isSelf: false,
            },
            attendees: [
              {
                email: "me@example.com",
                displayName: "Me",
                responseStatus: "ATTENDEE_RESPONSE_STATUS_NEEDS_ACTION",
                isOptional: false,
                isOrganizer: false,
              },
            ],
            reminders: [],
            isVirtual: false,
            sourceType: "",
          },
        ],
      }

      const key = calendarKeys.events(rangeStart, rangeEnd, undefined, "")
      queryClient.setQueryData(key, initialEvents)

      let rejectPromise!: (err: Error) => void
      vi.mocked(api.respondToEvent).mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectPromise = reject
          })
      )

      const { result } = renderHook(() => useRespondToEvent(), {
        wrapper: createWrapper(),
      })

      act(() => {
        result.current.mutate({
          id: "ev_rsvp",
          response: "ATTENDEE_RESPONSE_STATUS_ACCEPTED",
        })
      })

      // Check optimistic RSVP while pending
      await waitFor(() => {
        const optimistic = queryClient.getQueryData<api.ListEventsResponse>(key)
        expect(optimistic?.occurrences[0].attendees[0].responseStatus).toBe(
          "ATTENDEE_RESPONSE_STATUS_ACCEPTED"
        )
      })

      // Trigger failure and rollback
      await act(async () => {
        rejectPromise(new Error("RSVP failed"))
      })

      await waitFor(() => expect(result.current.isError).toBe(true))

      const rolledBack = queryClient.getQueryData<api.ListEventsResponse>(key)
      expect(rolledBack?.occurrences[0].attendees[0].responseStatus).toBe(
        "ATTENDEE_RESPONSE_STATUS_NEEDS_ACTION"
      )
    })
  })
})
