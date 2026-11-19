import { useState, useMemo, useEffect, useRef, useCallback } from "react"
import {
  MemoryRouter,
  useInRouterContext,
  useSearchParams,
} from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import {
  ChevronLeft,
  ChevronRight,
  PanelLeft,
  Plus,
  Receipt,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/toast"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  useTimezone,
  useCalendars,
  useCalendarEvents,
  useEnsureDefaultCalendar,
  useDeleteEvent,
  calendarKeys,
  invalidateFinanceQueries,
} from "@saturn/hooks"
import { useRegisterCopilotView } from "@saturn/hooks/ai"
import {
  formatLocalDateString,
  getWeekDays,
  getMonthMatrix,
} from "@saturn/core"
import type {
  Event,
  EventOccurrence,
  RecurrenceScope,
} from "@saturn/api/saturn/calendar/v1/calendar"
import {
  useGetSettingsQuery,
  useListRecurringTransactionsQuery,
  useListScheduledTransactionsQuery,
  type ScheduledTransaction,
} from "@saturn/api/gen/saturn/finance/v1/finance"
import { useOptionalSpacePermissions } from "@/features/space/use-space"
import { useCurrencyConversionPreview } from "@/hooks/use-currency-conversion"
import { ConfirmTransactionSheet } from "@/features/finance/components/confirm-transaction-sheet"
import { CalendarSidebar } from "./components/calendar-sidebar"
import { MonthView } from "./components/month-view"
import { WeekView } from "./components/week-view"
import { DayView } from "./components/day-view"
import { AgendaView } from "./components/agenda-view"
import { EventDialog } from "./components/event-dialog"
import { EventPreviewPopover } from "./components/event-preview-popover"
import { RecurrenceScopeDialog } from "./components/recurrence-scope-dialog"
import {
  extractOccurrenceDuplicateDraft,
  isRecurringOccurrence,
  mapScheduledToCalendarFinanceItems,
  readCalendarFinanceOverlayPref,
  writeCalendarFinanceOverlayPref,
} from "./calendar-finance"
import { cn } from "@/lib/utils"

export type CalendarViewType = "month" | "week" | "day" | "agenda"

const VALID_CALENDAR_VIEWS = new Set<string>(["month", "week", "day", "agenda"])

function CalendarSearchParamsSync({
  onApplyParams,
}: {
  onApplyParams: (params: { date?: string; view?: CalendarViewType }) => void
}) {
  const [searchParams] = useSearchParams()
  const dateParam = searchParams.get("date") ?? undefined
  const viewParam = searchParams.get("view") ?? undefined
  const lastHandledRef = useRef<string | null>(null)

  useEffect(() => {
    const validDate =
      dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : undefined
    const validView =
      viewParam && VALID_CALENDAR_VIEWS.has(viewParam)
        ? (viewParam as CalendarViewType)
        : undefined
    const key = `${validDate ?? ""}|${validView ?? ""}`
    if ((validDate || validView) && key !== lastHandledRef.current) {
      lastHandledRef.current = key
      onApplyParams({ date: validDate, view: validView })
    }
  }, [dateParam, viewParam, onApplyParams])

  return null
}

export function CalendarView() {
  const inRouter = useInRouterContext()
  const queryClient = useQueryClient()
  const tz = useTimezone()
  const { spaceId, isWritable } = useOptionalSpacePermissions()
  const { data: calendarsData } = useCalendars()
  const calendars = useMemo(
    () => calendarsData?.calendars || [],
    [calendarsData]
  )

  const ensureDefaultMutation = useEnsureDefaultCalendar()
  const deleteEventMutation = useDeleteEvent()

  // Ensure default native calendar exists if workspace has none
  useEffect(() => {
    if (
      calendarsData &&
      calendarsData.calendars.length === 0 &&
      !ensureDefaultMutation.isPending &&
      !ensureDefaultMutation.isSuccess
    ) {
      ensureDefaultMutation.mutate({})
    }
  }, [calendarsData, ensureDefaultMutation])

  // Active view state
  const [activeView, setActiveView] = useState<CalendarViewType>("month")
  // Active focal date
  const [currentDate, setCurrentDate] = useState<Date>(() => tz.now())
  // Sidebar rail visibility
  const [sidebarOpen, setSidebarOpen] = useState(true)
  // Scheduled Bills & Paydays overlay toggle
  const [showFinanceOverlay, setShowFinanceOverlay] = useState<boolean>(() =>
    readCalendarFinanceOverlayPref()
  )

  const handleToggleFinanceOverlay = useCallback(() => {
    setShowFinanceOverlay((prev) => {
      const next = !prev
      writeCalendarFinanceOverlayPref(next)
      return next
    })
  }, [])

  // Event Dialog state
  const [eventDialogOpen, setEventDialogOpen] = useState(false)
  const [dialogInitialDate, setDialogInitialDate] = useState<
    string | undefined
  >()
  const [dialogInitialStartTime, setDialogInitialStartTime] = useState<
    string | undefined
  >()
  const [dialogInitialEndTime, setDialogInitialEndTime] = useState<
    string | undefined
  >()
  const [dialogInitialCalendarId, setDialogInitialCalendarId] = useState<
    string | undefined
  >()
  const [dialogInitialValues, setDialogInitialValues] = useState<
    Partial<Event> | undefined
  >()
  const [dialogKeyCounter, setDialogKeyCounter] = useState(0)
  const [selectedOccurrence, setSelectedOccurrence] = useState<
    EventOccurrence | undefined
  >()
  const [previewOccurrence, setPreviewOccurrence] =
    useState<EventOccurrence | null>(null)
  const [previewAnchor, setPreviewAnchor] = useState<HTMLElement | null>(null)

  // Quick delete from preview state
  const [deleteTargetOccurrence, setDeleteTargetOccurrence] =
    useState<EventOccurrence | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteScopeDialogOpen, setDeleteScopeDialogOpen] = useState(false)

  // Finance scheduled confirmation sheet state
  const [selectedScheduledTxn, setSelectedScheduledTxn] =
    useState<ScheduledTransaction | null>(null)
  const [confirmSheetOpen, setConfirmSheetOpen] = useState(false)

  // Active calendars filter
  const enabledCalendarIds = useMemo(() => {
    return calendars.filter((c) => c.isEnabled).map((c) => c.id)
  }, [calendars])

  const focalDateStr = formatLocalDateString(currentDate, tz.timezone)

  useRegisterCopilotView({
    viewId: "calendar.schedule",
    title: `Calendar (${activeView} · ${focalDateStr})`,
    suggestions: [
      `What's on my schedule around ${focalDateStr}?`,
      "Find open focus blocks on my calendar this week",
      "Check for any overlapping meetings or busy days",
    ],
  })

  const allCalendarsDisabled =
    Boolean(calendarsData) &&
    calendars.length > 0 &&
    enabledCalendarIds.length === 0

  // Compute query viewport boundary based on active view and currentDate
  const { rangeStart, rangeEnd } = useMemo(() => {
    const tzName = tz.timezone
    const dateStr = formatLocalDateString(currentDate, tzName)
    const [y, m] = dateStr.split("-").map(Number)

    if (activeView === "month") {
      const weeks = getMonthMatrix(y, m, {
        weekStartsOn: 0,
        timeZone: tzName,
        fixedWeeks: true,
      })
      const firstDay = weeks[0][0].dateString
      const lastWeek = weeks[weeks.length - 1]
      const lastDay = lastWeek[lastWeek.length - 1].dateString

      const start = tz.startOfDay(firstDay).toISOString()
      const end = new Date(tz.endOfDay(lastDay).getTime() + 1000).toISOString()
      return { rangeStart: start, rangeEnd: end }
    }

    if (activeView === "week") {
      const days = getWeekDays(currentDate, {
        weekStartsOn: 0,
        timeZone: tzName,
      })
      const firstDay = days[0].dateString
      const lastDay = days[days.length - 1].dateString

      const start = tz.startOfDay(firstDay).toISOString()
      const end = new Date(tz.endOfDay(lastDay).getTime() + 1000).toISOString()
      return { rangeStart: start, rangeEnd: end }
    }

    if (activeView === "day") {
      const start = tz.startOfDay(currentDate).toISOString()
      const end = new Date(
        tz.endOfDay(currentDate).getTime() + 1000
      ).toISOString()
      return { rangeStart: start, rangeEnd: end }
    }

    // Agenda: 30 days window from current day
    const start = tz.startOfDay(currentDate).toISOString()
    const end = new Date(
      tz.startOfDay(currentDate).getTime() + 30 * 86_400_000
    ).toISOString()
    return { rangeStart: start, rangeEnd: end }
  }, [activeView, currentDate, tz])

  // Fetch occurrences
  const { data: eventsData } = useCalendarEvents(
    rangeStart,
    rangeEnd,
    enabledCalendarIds,
    {
      enabled: !allCalendarsDisabled,
      hasLoadedCalendars: Boolean(calendarsData),
    }
  )
  const occurrences = allCalendarsDisabled ? [] : eventsData?.occurrences || []

  // Scheduled Bills & Paydays overlay queries
  const financeOverlayEnabled = showFinanceOverlay && Boolean(spaceId)
  const { data: scheduledData, refetch: refetchScheduled } =
    useListScheduledTransactionsQuery(
      {
        status: "PENDING",
        startDate: rangeStart,
        endDate: rangeEnd,
        pageSize: 100,
        pageToken: "",
        view: "FULL",
      },
      {
        enabled: financeOverlayEnabled,
        retry: false,
      }
    )
  const { data: recurringData, refetch: refetchRecurring } =
    useListRecurringTransactionsQuery(
      {
        status: "STATUS_UNSPECIFIED",
        pageSize: 100,
        pageToken: "",
      },
      {
        enabled: financeOverlayEnabled,
        retry: false,
      }
    )
  const { data: financeSettings } = useGetSettingsQuery(
    {},
    {
      enabled: financeOverlayEnabled,
      retry: false,
    }
  )
  const { getConversionPreview } = useCurrencyConversionPreview({
    spaceId,
    enabled: Boolean(financeOverlayEnabled && financeSettings),
    baseCurrency: financeSettings?.baseCurrency || "USD",
  })

  const financeItems = useMemo(() => {
    if (!financeOverlayEnabled) return []
    return mapScheduledToCalendarFinanceItems(
      scheduledData?.scheduledTransactions || [],
      recurringData?.recurringTransactions || [],
      tz.timezone
    )
  }, [
    financeOverlayEnabled,
    scheduledData?.scheduledTransactions,
    recurringData?.recurringTransactions,
    tz.timezone,
  ])

  const handleSelectFinanceItem = useCallback(
    (item: ScheduledTransaction) => {
      if (!isWritable) return
      setPreviewOccurrence(null)
      setPreviewAnchor(null)
      setSelectedScheduledTxn(item)
      setConfirmSheetOpen(true)
    },
    [isWritable]
  )

  // Navigation handlers
  const handleToday = useCallback(() => {
    setCurrentDate(tz.now())
  }, [tz])

  const handlePrev = useCallback(() => {
    const p = tz.parts(currentDate) || { year: 2026, month: 10, day: 20 }

    if (activeView === "month") {
      const prevMonth = p.month === 1 ? 12 : p.month - 1
      const prevYear = p.month === 1 ? p.year - 1 : p.year
      setCurrentDate(new Date(Date.UTC(prevYear, prevMonth - 1, 15, 12, 0, 0)))
    } else if (activeView === "week") {
      setCurrentDate(new Date(currentDate.getTime() - 7 * 86_400_000))
    } else {
      setCurrentDate(new Date(currentDate.getTime() - 86_400_000))
    }
  }, [activeView, currentDate, tz])

  const handleNext = useCallback(() => {
    const p = tz.parts(currentDate) || { year: 2026, month: 10, day: 20 }

    if (activeView === "month") {
      const nextMonth = p.month === 12 ? 1 : p.month + 1
      const nextYear = p.month === 12 ? p.year + 1 : p.year
      setCurrentDate(new Date(Date.UTC(nextYear, nextMonth - 1, 15, 12, 0, 0)))
    } else if (activeView === "week") {
      setCurrentDate(new Date(currentDate.getTime() + 7 * 86_400_000))
    } else {
      setCurrentDate(new Date(currentDate.getTime() + 86_400_000))
    }
  }, [activeView, currentDate, tz])

  // Header title label
  const headerTitle = useMemo(() => {
    if (activeView === "month") {
      return tz.formatMonth(currentDate)
    }

    if (activeView === "week") {
      const days = getWeekDays(currentDate, {
        weekStartsOn: 0,
        timeZone: tz.timezone,
      })
      const first = days[0].date
      const last = days[6].date
      return `${tz.format(first, { month: "short", day: "numeric" })} – ${tz.format(last, { month: "short", day: "numeric", year: "numeric" })}`
    }

    if (activeView === "day") {
      return tz.format(currentDate, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    }

    return tz.formatMonth(currentDate)
  }, [activeView, currentDate, tz])

  // Open create event dialog from slot click
  const handleSelectSlot = useCallback((dateStr: string, timeStr?: string) => {
    setPreviewOccurrence(null)
    setPreviewAnchor(null)
    setDialogInitialDate(dateStr)
    if (timeStr) {
      setDialogInitialStartTime(timeStr)
      const [h, m] = timeStr.split(":").map(Number)
      const nextH = Math.min(23, h + 1)
      setDialogInitialEndTime(
        `${String(nextH).padStart(2, "0")}:${String(m).padStart(2, "0")}`
      )
    } else {
      setDialogInitialStartTime("09:00")
      setDialogInitialEndTime("10:00")
    }
    setDialogInitialCalendarId(undefined)
    setDialogInitialValues(undefined)
    setSelectedOccurrence(undefined)
    setDialogKeyCounter((c) => c + 1)
    setEventDialogOpen(true)
  }, [])

  const handleSelectOccurrence = useCallback(
    (occ: EventOccurrence, anchorEl?: HTMLElement | null) => {
      setPreviewOccurrence(occ)
      setPreviewAnchor(anchorEl ?? null)
    },
    []
  )

  const handleEditFromPreview = useCallback((occ: EventOccurrence) => {
    setPreviewOccurrence(null)
    setPreviewAnchor(null)
    setSelectedOccurrence(occ)
    setDialogInitialDate(undefined)
    setDialogInitialStartTime(undefined)
    setDialogInitialEndTime(undefined)
    setDialogInitialCalendarId(undefined)
    setDialogInitialValues(undefined)
    setDialogKeyCounter((c) => c + 1)
    setEventDialogOpen(true)
  }, [])

  const handleDuplicateFromPreview = useCallback(
    (occ: EventOccurrence) => {
      const draft = extractOccurrenceDuplicateDraft(occ, tz.timezone)
      setPreviewOccurrence(null)
      setPreviewAnchor(null)
      setSelectedOccurrence(undefined)
      setDialogInitialCalendarId(draft.calendarId || undefined)
      setDialogInitialDate(draft.startDate || undefined)
      setDialogInitialStartTime(draft.startTime)
      setDialogInitialEndTime(draft.endTime)
      setDialogInitialValues({
        title: draft.title,
        description: draft.description,
        location: draft.location,
        isAllDay: draft.isAllDay,
        startDate: draft.startDate,
        endDate: draft.endDate,
        timezone: draft.timezone,
        meetUrl: draft.meetUrl,
      })
      setDialogKeyCounter((c) => c + 1)
      setEventDialogOpen(true)
    },
    [tz.timezone]
  )

  const handleDeleteFromPreview = useCallback((occ: EventOccurrence) => {
    setPreviewOccurrence(null)
    setPreviewAnchor(null)
    setDeleteTargetOccurrence(occ)
    if (isRecurringOccurrence(occ)) {
      setDeleteScopeDialogOpen(true)
    } else {
      setDeleteConfirmOpen(true)
    }
  }, [])

  const executeQuickDelete = useCallback(
    async (occ: EventOccurrence, scope?: RecurrenceScope) => {
      try {
        await deleteEventMutation.mutateAsync({
          id: occ.eventId,
          req: {
            recurrenceScope: scope || "RECURRENCE_SCOPE_ALL_EVENTS",
            targetStartTime: occ.startTime || "",
            targetStartDate: occ.startDate || "",
          },
        })
        await queryClient.invalidateQueries({
          queryKey: calendarKeys.allEvents(),
        })
        toast.add({ title: "Event deleted", type: "success" })
      } catch (err) {
        toast.add({
          title: "Failed to delete event",
          description: err instanceof Error ? err.message : "An error occurred",
          type: "error",
        })
      } finally {
        setDeleteConfirmOpen(false)
        setDeleteScopeDialogOpen(false)
        setDeleteTargetOccurrence(null)
      }
    },
    [deleteEventMutation, queryClient]
  )

  const handleOpenNewEvent = useCallback(() => {
    setPreviewOccurrence(null)
    setPreviewAnchor(null)
    setSelectedOccurrence(undefined)
    setDialogInitialCalendarId(undefined)
    setDialogInitialValues(undefined)
    const p = tz.parts(currentDate) || { year: 2026, month: 10, day: 20 }
    setDialogInitialDate(
      `${String(p.year).padStart(4, "0")}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`
    )
    setDialogInitialStartTime("09:00")
    setDialogInitialEndTime("10:00")
    setDialogKeyCounter((c) => c + 1)
    setEventDialogOpen(true)
  }, [currentDate, tz])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return

      const target = e.target as HTMLElement | null
      if (target) {
        const tag = target.tagName
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          target.isContentEditable ||
          (typeof target.closest === "function" &&
            target.closest("[role='combobox']"))
        ) {
          return
        }
      }

      if (
        eventDialogOpen ||
        deleteConfirmOpen ||
        deleteScopeDialogOpen ||
        confirmSheetOpen
      ) {
        return
      }
      if (
        typeof document !== "undefined" &&
        document.querySelector(
          '[role="dialog"]:not([data-testid="event-preview-popover"]):not([data-slot="toast"]), [role="alertdialog"]'
        )
      ) {
        return
      }

      const key = e.key
      if (previewOccurrence) {
        if (key === "e" || key === "E") {
          e.preventDefault()
          handleEditFromPreview(previewOccurrence)
          return
        }
        if (key === "Escape") {
          e.preventDefault()
          setPreviewOccurrence(null)
          setPreviewAnchor(null)
          return
        }
      }

      switch (key) {
        case "t":
        case "T":
          e.preventDefault()
          handleToday()
          break
        case "d":
        case "D":
          e.preventDefault()
          setActiveView("day")
          break
        case "w":
        case "W":
          e.preventDefault()
          setActiveView("week")
          break
        case "m":
        case "M":
          e.preventDefault()
          setActiveView("month")
          break
        case "a":
        case "A":
          e.preventDefault()
          setActiveView("agenda")
          break
        case "c":
        case "C":
        case "n":
        case "N":
          e.preventDefault()
          handleOpenNewEvent()
          break
        case "ArrowLeft":
          if (!previewOccurrence) {
            e.preventDefault()
            handlePrev()
          }
          break
        case "ArrowRight":
          if (!previewOccurrence) {
            e.preventDefault()
            handleNext()
          }
          break
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [
    eventDialogOpen,
    deleteConfirmOpen,
    deleteScopeDialogOpen,
    confirmSheetOpen,
    previewOccurrence,
    handleEditFromPreview,
    handleToday,
    handleOpenNewEvent,
    handlePrev,
    handleNext,
  ])

  return (
    <div
      data-testid="calendar-main-view"
      className="flex h-full w-full overflow-hidden bg-background"
    >
      {inRouter && (
        <CalendarSearchParamsSync
          onApplyParams={({ date, view }) => {
            if (date) {
              setCurrentDate(tz.startOfDay(date))
            }
            if (view) {
              setActiveView(view)
            }
          }}
        />
      )}
      {/* Sidebar Rail */}
      {sidebarOpen && (
        <div className="hidden h-full md:flex">
          <CalendarSidebar
            currentDate={currentDate}
            onSelectDate={setCurrentDate}
            onOpenCreateDialog={handleOpenNewEvent}
            showFinanceOverlay={showFinanceOverlay}
            onToggleFinanceOverlay={handleToggleFinanceOverlay}
          />
        </div>
      )}

      {/* Main View Area */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Top Control Header */}
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border/40 bg-card/60 px-3 backdrop-blur sm:px-4">
          {/* Left: Navigation and Date Title */}
          <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden sm:gap-2.5">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setSidebarOpen((prev) => !prev)}
              className="h-8 w-8 shrink-0 text-foreground/80 hover:text-foreground"
              title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
              aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            >
              <PanelLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              data-testid="calendar-today-btn"
              onClick={handleToday}
              className="h-8 shrink-0 px-2.5 text-xs font-medium"
            >
              Today
            </Button>
            <div className="flex shrink-0 items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon-sm"
                data-testid="calendar-prev-btn"
                onClick={handlePrev}
                className="h-8 w-8 cursor-pointer rounded-full text-foreground hover:bg-muted"
                aria-label="Previous"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                data-testid="calendar-next-btn"
                onClick={handleNext}
                className="h-8 w-8 cursor-pointer rounded-full text-foreground hover:bg-muted"
                aria-label="Next"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <h2
              data-testid="calendar-header-title"
              className="min-w-0 truncate text-sm font-semibold tracking-tight text-foreground sm:text-base md:text-lg"
              title={headerTitle}
            >
              {headerTitle}
            </h2>
          </div>

          {/* Right: Overlays, View Switcher & New Event CTA */}
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant={showFinanceOverlay ? "secondary" : "outline"}
              size="sm"
              data-testid="calendar-finance-overlay-btn"
              aria-pressed={showFinanceOverlay}
              onClick={handleToggleFinanceOverlay}
              className={cn(
                "h-8 shrink-0 gap-1.5 px-2.5 text-xs font-medium",
                showFinanceOverlay &&
                  "border-primary/40 bg-primary/10 text-primary hover:bg-primary/15"
              )}
              title="Toggle Scheduled Bills & Paydays"
            >
              <Receipt className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Bills</span>
            </Button>

            <div
              data-testid="calendar-view-switcher"
              className="flex items-center rounded-lg border border-border/60 bg-muted/30 p-0.5 text-xs font-medium"
            >
              <button
                type="button"
                data-testid="view-tab-month"
                onClick={() => setActiveView("month")}
                className={cn(
                  "rounded-md px-3 py-1.5 transition",
                  activeView === "month"
                    ? "bg-background font-semibold text-foreground shadow-2xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Month
              </button>
              <button
                type="button"
                data-testid="view-tab-week"
                onClick={() => setActiveView("week")}
                className={cn(
                  "rounded-md px-3 py-1.5 transition",
                  activeView === "week"
                    ? "bg-background font-semibold text-foreground shadow-2xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Week
              </button>
              <button
                type="button"
                data-testid="view-tab-day"
                onClick={() => setActiveView("day")}
                className={cn(
                  "rounded-md px-3 py-1.5 transition",
                  activeView === "day"
                    ? "bg-background font-semibold text-foreground shadow-2xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Day
              </button>
              <button
                type="button"
                data-testid="view-tab-agenda"
                onClick={() => setActiveView("agenda")}
                className={cn(
                  "rounded-md px-3 py-1.5 transition",
                  activeView === "agenda"
                    ? "bg-background font-semibold text-foreground shadow-2xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Agenda
              </button>
            </div>

            <Button
              type="button"
              size="sm"
              data-testid="calendar-toolbar-new-event-btn"
              onClick={handleOpenNewEvent}
              className={cn(
                "h-8 shrink-0 gap-1.5 px-2.5 text-xs font-medium",
                sidebarOpen && "md:hidden"
              )}
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New Event</span>
            </Button>
          </div>
        </div>

        {/* View Component Body */}
        <div className="relative flex flex-1 flex-col overflow-hidden">
          {activeView === "month" && (
            <MonthView
              currentDate={currentDate}
              occurrences={occurrences}
              financeItems={financeItems}
              onSelectDate={(d) => {
                setCurrentDate(d)
                setActiveView("day")
              }}
              onSelectSlot={handleSelectSlot}
              onSelectOccurrence={handleSelectOccurrence}
              onEditOccurrence={handleEditFromPreview}
              onSelectFinanceItem={handleSelectFinanceItem}
            />
          )}

          {activeView === "week" && (
            <WeekView
              currentDate={currentDate}
              occurrences={occurrences}
              financeItems={financeItems}
              onSelectDate={(d) => {
                setCurrentDate(d)
                setActiveView("day")
              }}
              onSelectSlot={handleSelectSlot}
              onSelectOccurrence={handleSelectOccurrence}
              onEditOccurrence={handleEditFromPreview}
              onSelectFinanceItem={handleSelectFinanceItem}
            />
          )}

          {activeView === "day" && (
            <DayView
              currentDate={currentDate}
              occurrences={occurrences}
              financeItems={financeItems}
              onSelectSlot={handleSelectSlot}
              onSelectOccurrence={handleSelectOccurrence}
              onEditOccurrence={handleEditFromPreview}
              onSelectFinanceItem={handleSelectFinanceItem}
            />
          )}

          {activeView === "agenda" && (
            <AgendaView
              currentDate={currentDate}
              occurrences={occurrences}
              financeItems={financeItems}
              onSelectOccurrence={handleSelectOccurrence}
              onEditOccurrence={handleEditFromPreview}
              onSelectFinanceItem={handleSelectFinanceItem}
              onOpenCreateDialog={handleOpenNewEvent}
            />
          )}
        </div>
      </div>

      {/* Event Preview Popover */}
      <EventPreviewPopover
        occurrence={previewOccurrence}
        anchorEl={previewAnchor}
        onOpenChange={(open) => {
          if (!open) {
            setPreviewOccurrence(null)
            setPreviewAnchor(null)
          }
        }}
        onEdit={handleEditFromPreview}
        onDuplicate={handleDuplicateFromPreview}
        onDelete={handleDeleteFromPreview}
      />

      {/* Event Create / Edit Dialog */}
      <EventDialog
        key={
          eventDialogOpen
            ? selectedOccurrence
              ? `edit-${selectedOccurrence.instanceId || selectedOccurrence.eventId}-${dialogKeyCounter}`
              : `new-${dialogInitialDate}-${dialogInitialStartTime}-${dialogKeyCounter}`
            : "closed"
        }
        open={eventDialogOpen}
        onClose={() => setEventDialogOpen(false)}
        initialDate={dialogInitialDate}
        initialStartTime={dialogInitialStartTime}
        initialEndTime={dialogInitialEndTime}
        initialCalendarId={dialogInitialCalendarId}
        initialValues={
          selectedOccurrence
            ? { occurrence: selectedOccurrence }
            : dialogInitialValues
        }
      />

      {/* Quick Delete Non-Recurring Confirmation */}
      <AlertDialog
        open={deleteConfirmOpen}
        onOpenChange={(open) => {
          setDeleteConfirmOpen(open)
          if (!open) setDeleteTargetOccurrence(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Event</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-semibold text-foreground">
                {deleteTargetOccurrence?.title || "this event"}
              </span>
              ? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              data-testid="confirm-delete-event-btn"
              onClick={() => {
                if (deleteTargetOccurrence) {
                  void executeQuickDelete(deleteTargetOccurrence)
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Quick Delete Recurring Event Scope Dialog */}
      <RecurrenceScopeDialog
        open={deleteScopeDialogOpen}
        action="delete"
        onClose={() => {
          setDeleteScopeDialogOpen(false)
          setDeleteTargetOccurrence(null)
        }}
        onConfirm={(scope) => {
          if (deleteTargetOccurrence) {
            void executeQuickDelete(deleteTargetOccurrence, scope)
          }
        }}
      />

      {/* Confirm Scheduled Bill / Payday Sheet */}
      {confirmSheetOpen &&
        selectedScheduledTxn &&
        (inRouter ? (
          <ConfirmTransactionSheet
            open={confirmSheetOpen}
            onOpenChange={(open) => {
              setConfirmSheetOpen(open)
              if (!open) setSelectedScheduledTxn(null)
            }}
            transaction={selectedScheduledTxn}
            refetchTransactions={() => {
              invalidateFinanceQueries(queryClient)
              void refetchScheduled()
              void refetchRecurring()
            }}
            getConversionPreview={getConversionPreview}
          />
        ) : (
          <MemoryRouter>
            <ConfirmTransactionSheet
              open={confirmSheetOpen}
              onOpenChange={(open) => {
                setConfirmSheetOpen(open)
                if (!open) setSelectedScheduledTxn(null)
              }}
              transaction={selectedScheduledTxn}
              refetchTransactions={() => {
                invalidateFinanceQueries(queryClient)
                void refetchScheduled()
                void refetchRecurring()
              }}
              getConversionPreview={getConversionPreview}
            />
          </MemoryRouter>
        ))}
    </div>
  )
}
export default CalendarView
