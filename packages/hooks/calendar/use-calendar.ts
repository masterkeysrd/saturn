import {
  useQuery,
  type UseQueryOptions,
  useMutation,
  type UseMutationOptions,
  useQueryClient,
} from "@tanstack/react-query"
import {
  listCalendars,
  getCalendar,
  createCalendar,
  updateCalendar,
  deleteCalendar,
  ensureDefaultCalendar,
  listEvents,
  getEvent,
  createEvent,
  updateEvent,
  deleteEvent,
  respondToEvent,
  type Calendar,
  type Event,
  type EventOccurrence,
  type ListCalendarsRequest,
  type ListCalendarsResponse,
  type GetCalendarRequest,
  type CreateCalendarRequest,
  type UpdateCalendarRequest,
  type DeleteCalendarRequest,
  type EnsureDefaultCalendarRequest,
  type ListEventsRequest,
  type ListEventsResponse,
  type GetEventRequest,
  type CreateEventRequest,
  type UpdateEventRequest,
  type DeleteEventRequest,
  type RespondToEventRequest,
  type AttendeeResponseStatus,
} from "@saturn/api/saturn/calendar/v1/calendar"

export type {
  Calendar,
  Event,
  EventOccurrence,
  ListCalendarsRequest,
  ListCalendarsResponse,
  GetCalendarRequest,
  CreateCalendarRequest,
  UpdateCalendarRequest,
  DeleteCalendarRequest,
  ListEventsRequest,
  ListEventsResponse,
  GetEventRequest,
  CreateEventRequest,
  UpdateEventRequest,
  DeleteEventRequest,
  RespondToEventRequest,
  AttendeeResponseStatus,
}

export const calendarKeys = {
  all: () => ["calendar"] as const,
  lists: () => ["calendar", "list"] as const,
  calendar: (id: string) => ["calendar", "detail", id] as const,
  allEvents: () => ["calendar", "events"] as const,
  events: (
    rangeStart?: string,
    rangeEnd?: string,
    calendarIds?: string[],
    query?: string
  ) =>
    [
      "calendar",
      "events",
      {
        rangeStart,
        rangeEnd,
        calendarIds: calendarIds ? [...calendarIds].sort() : undefined,
        query,
      },
    ] as const,
  event: (id: string) => ["calendar", "event", id] as const,
}

export function useCalendars(
  options?: Omit<
    UseQueryOptions<ListCalendarsResponse, Error>,
    "queryKey" | "queryFn"
  >
) {
  return useQuery<ListCalendarsResponse, Error>({
    queryKey: calendarKeys.lists(),
    queryFn: () => listCalendars({}),
    ...options,
  })
}

export function useCalendar(
  id?: string,
  options?: Omit<UseQueryOptions<Calendar, Error>, "queryKey" | "queryFn">
) {
  return useQuery<Calendar, Error>({
    queryKey: calendarKeys.calendar(id || ""),
    queryFn: () => getCalendar(id || "", { id: id || "" }),
    enabled:
      Boolean(id) && (options?.enabled !== undefined ? options.enabled : true),
    ...options,
  })
}

export interface UseCalendarEventsOptions extends Omit<
  UseQueryOptions<ListEventsResponse, Error>,
  "queryKey" | "queryFn"
> {
  query?: string
}

export function useCalendarEvents(
  rangeStart?: string,
  rangeEnd?: string,
  calendarIds?: string[],
  options?: UseCalendarEventsOptions
) {
  const query = options?.query ?? ""
  return useQuery<ListEventsResponse, Error>({
    queryKey: calendarKeys.events(rangeStart, rangeEnd, calendarIds, query),
    queryFn: () =>
      listEvents({
        timeMin: rangeStart || "",
        timeMax: rangeEnd || "",
        calendarIds:
          calendarIds && calendarIds.length > 0 ? calendarIds : undefined,
        query,
      }),
    enabled:
      Boolean(rangeStart && rangeEnd) &&
      (options?.enabled !== undefined ? options.enabled : true),
    refetchInterval:
      options?.refetchInterval !== undefined
        ? options.refetchInterval
        : typeof globalThis !== "undefined" &&
            (
              globalThis as unknown as {
                process?: { env?: { NODE_ENV?: string } }
              }
            ).process?.env?.NODE_ENV === "test"
          ? false
          : 60_000,
    refetchOnWindowFocus: true,
    ...options,
  })
}

export function useGetEvent(
  id?: string,
  options?: Omit<UseQueryOptions<Event, Error>, "queryKey" | "queryFn">
) {
  return useQuery<Event, Error>({
    queryKey: calendarKeys.event(id || ""),
    queryFn: () => getEvent(id || "", { id: id || "" }),
    enabled:
      Boolean(id) && (options?.enabled !== undefined ? options.enabled : true),
    ...options,
  })
}

export function useCreateCalendar(
  options?: UseMutationOptions<Calendar, Error, CreateCalendarRequest>
) {
  const queryClient = useQueryClient()
  return useMutation<Calendar, Error, CreateCalendarRequest>({
    mutationFn: (req) => createCalendar(req),
    onSuccess: async (...args) => {
      await queryClient.invalidateQueries({ queryKey: calendarKeys.lists() })
      if (options?.onSuccess) {
        options.onSuccess(...args)
      }
    },
    ...options,
  })
}

export function useEnsureDefaultCalendar(
  options?: UseMutationOptions<
    Calendar,
    Error,
    EnsureDefaultCalendarRequest | undefined
  >
) {
  const queryClient = useQueryClient()
  return useMutation<Calendar, Error, EnsureDefaultCalendarRequest | undefined>(
    {
      mutationFn: (req) => ensureDefaultCalendar(req || {}),
      onSuccess: async (...args) => {
        await queryClient.invalidateQueries({ queryKey: calendarKeys.lists() })
        if (options?.onSuccess) {
          options.onSuccess(...args)
        }
      },
      ...options,
    }
  )
}

export interface UpdateCalendarVariables {
  id: string
  calendar: Partial<Calendar> & { id?: string }
  updateMask?: { paths?: string[] }
}

export function useUpdateCalendar(
  options?: UseMutationOptions<
    Calendar,
    Error,
    UpdateCalendarVariables,
    { previousCalendars?: ListCalendarsResponse }
  >
) {
  const queryClient = useQueryClient()

  return useMutation<
    Calendar,
    Error,
    UpdateCalendarVariables,
    { previousCalendars?: ListCalendarsResponse }
  >({
    mutationFn: async ({ id, calendar, updateMask }) => {
      const fullCalendar = calendar as Calendar
      return updateCalendar(id, {
        id,
        calendar: fullCalendar,
        updateMask: updateMask || { paths: Object.keys(calendar) },
      })
    },
    onMutate: async ({ id, calendar }) => {
      await queryClient.cancelQueries({ queryKey: calendarKeys.lists() })
      const previousCalendars = queryClient.getQueryData<ListCalendarsResponse>(
        calendarKeys.lists()
      )

      if (previousCalendars) {
        queryClient.setQueryData<ListCalendarsResponse>(calendarKeys.lists(), {
          ...previousCalendars,
          calendars: previousCalendars.calendars.map((c) =>
            c.id === id ? ({ ...c, ...calendar } as Calendar) : c
          ),
        })
      }

      return { previousCalendars }
    },
    onError: (err, variables, context, mutation) => {
      if (context?.previousCalendars) {
        queryClient.setQueryData(
          calendarKeys.lists(),
          context.previousCalendars
        )
      }
      options?.onError?.(err, variables, context, mutation)
    },
    onSettled: async (...args) => {
      await queryClient.invalidateQueries({ queryKey: calendarKeys.lists() })
      await queryClient.invalidateQueries({
        queryKey: calendarKeys.allEvents(),
      })
      if (options?.onSettled) {
        options.onSettled(...args)
      }
    },
    ...options,
  })
}

export function useDeleteCalendar(
  options?: UseMutationOptions<
    Record<string, never>,
    Error,
    { id: string; req?: DeleteCalendarRequest }
  >
) {
  const queryClient = useQueryClient()
  return useMutation<
    Record<string, never>,
    Error,
    { id: string; req?: DeleteCalendarRequest }
  >({
    mutationFn: ({ id, req }) => deleteCalendar(id, req || { id }),
    onSuccess: async (...args) => {
      await queryClient.invalidateQueries({ queryKey: calendarKeys.lists() })
      await queryClient.invalidateQueries({
        queryKey: calendarKeys.allEvents(),
      })
      if (options?.onSuccess) {
        options.onSuccess(...args)
      }
    },
    ...options,
  })
}

export function useCreateEvent(
  options?: UseMutationOptions<Event, Error, CreateEventRequest>
) {
  const queryClient = useQueryClient()
  return useMutation<Event, Error, CreateEventRequest>({
    mutationFn: (req) => createEvent(req),
    onSuccess: async (...args) => {
      await queryClient.invalidateQueries({
        queryKey: calendarKeys.allEvents(),
      })
      if (options?.onSuccess) {
        options.onSuccess(...args)
      }
    },
    ...options,
  })
}

export interface UpdateEventVariables {
  id: string
  req: UpdateEventRequest
}

export function useUpdateEvent(
  options?: UseMutationOptions<
    Event,
    Error,
    UpdateEventVariables,
    {
      previousQueries?: Array<
        [readonly unknown[], ListEventsResponse | undefined]
      >
    }
  >
) {
  const queryClient = useQueryClient()

  return useMutation<
    Event,
    Error,
    UpdateEventVariables,
    {
      previousQueries?: Array<
        [readonly unknown[], ListEventsResponse | undefined]
      >
    }
  >({
    mutationFn: ({ id, req }) => updateEvent(id, req),
    onMutate: async ({ id, req }) => {
      await queryClient.cancelQueries({ queryKey: calendarKeys.allEvents() })
      const matchingQueries = queryClient.getQueriesData<ListEventsResponse>({
        queryKey: calendarKeys.allEvents(),
      })
      const previousQueries: Array<
        [readonly unknown[], ListEventsResponse | undefined]
      > = matchingQueries.map(([key, data]) => [key, data])

      for (const [key, data] of matchingQueries) {
        if (!data) continue
        queryClient.setQueryData<ListEventsResponse>(key, {
          ...data,
          occurrences: data.occurrences.map((occ) => {
            if (occ.eventId === id || occ.masterId === id) {
              return {
                ...occ,
                title: req.event.title ?? occ.title,
                description: req.event.description ?? occ.description,
                location: req.event.location ?? occ.location,
                startTime: req.event.startTime || occ.startTime,
                endTime: req.event.endTime || occ.endTime,
                startDate: req.event.startDate || occ.startDate,
                endDate: req.event.endDate || occ.endDate,
                isAllDay:
                  req.event.isAllDay !== undefined
                    ? req.event.isAllDay
                    : occ.isAllDay,
              }
            }
            return occ
          }),
        })
      }

      return { previousQueries }
    },
    onError: (err, variables, context, mutation) => {
      if (context?.previousQueries) {
        for (const [key, data] of context.previousQueries) {
          queryClient.setQueryData(key, data)
        }
      }
      options?.onError?.(err, variables, context, mutation)
    },
    onSettled: async (...args) => {
      await queryClient.invalidateQueries({
        queryKey: calendarKeys.allEvents(),
      })
      if (options?.onSettled) {
        options.onSettled(...args)
      }
    },
    ...options,
  })
}

export interface DeleteEventVariables {
  id: string
  req?: Partial<DeleteEventRequest>
}

export function useDeleteEvent(
  options?: UseMutationOptions<
    Record<string, never>,
    Error,
    DeleteEventVariables
  >
) {
  const queryClient = useQueryClient()
  return useMutation<Record<string, never>, Error, DeleteEventVariables>({
    mutationFn: ({ id, req }) =>
      deleteEvent(id, {
        id,
        recurrenceScope: req?.recurrenceScope ?? "RECURRENCE_SCOPE_ALL_EVENTS",
        targetStartTime: req?.targetStartTime ?? "",
        targetStartDate: req?.targetStartDate ?? "",
      }),
    onSuccess: async (...args) => {
      await queryClient.invalidateQueries({
        queryKey: calendarKeys.allEvents(),
      })
      if (options?.onSuccess) {
        options.onSuccess(...args)
      }
    },
    ...options,
  })
}

export interface RespondToEventVariables {
  id: string
  response: AttendeeResponseStatus
}

export function useRespondToEvent(
  options?: UseMutationOptions<
    Event,
    Error,
    RespondToEventVariables,
    {
      previousQueries?: Array<
        [readonly unknown[], ListEventsResponse | undefined]
      >
    }
  >
) {
  const queryClient = useQueryClient()

  return useMutation<
    Event,
    Error,
    RespondToEventVariables,
    {
      previousQueries?: Array<
        [readonly unknown[], ListEventsResponse | undefined]
      >
    }
  >({
    mutationFn: ({ id, response }) =>
      respondToEvent(id, {
        id,
        response,
      }),
    onMutate: async ({ id, response }) => {
      await queryClient.cancelQueries({ queryKey: calendarKeys.allEvents() })
      const matchingQueries = queryClient.getQueriesData<ListEventsResponse>({
        queryKey: calendarKeys.allEvents(),
      })
      const previousQueries: Array<
        [readonly unknown[], ListEventsResponse | undefined]
      > = matchingQueries.map(([key, data]) => [key, data])

      for (const [key, data] of matchingQueries) {
        if (!data) continue
        queryClient.setQueryData<ListEventsResponse>(key, {
          ...data,
          occurrences: data.occurrences.map((occ) => {
            if (occ.eventId === id || occ.masterId === id) {
              const attendees = occ.attendees.map((att) =>
                att.isOrganizer || att.email
                  ? { ...att, responseStatus: response }
                  : att
              )
              return { ...occ, attendees }
            }
            return occ
          }),
        })
      }

      return { previousQueries }
    },
    onError: (err, variables, context, mutation) => {
      if (context?.previousQueries) {
        for (const [key, data] of context.previousQueries) {
          queryClient.setQueryData(key, data)
        }
      }
      options?.onError?.(err, variables, context, mutation)
    },
    onSettled: async (...args) => {
      await queryClient.invalidateQueries({
        queryKey: calendarKeys.allEvents(),
      })
      if (options?.onSettled) {
        options.onSettled(...args)
      }
    },
    ...options,
  })
}
