import { useState, useMemo, useEffect } from "react"
import { ChevronLeft, ChevronRight, PanelLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  useTimezone,
  useCalendars,
  useCalendarEvents,
  useEnsureDefaultCalendar,
} from "@saturn/hooks"
import {
  formatLocalDateString,
  getWeekDays,
  getMonthMatrix,
} from "@saturn/core"
import type { EventOccurrence } from "@saturn/api/saturn/calendar/v1/calendar"
import { CalendarSidebar } from "./components/calendar-sidebar"
import { MonthView } from "./components/month-view"
import { WeekView } from "./components/week-view"
import { DayView } from "./components/day-view"
import { AgendaView } from "./components/agenda-view"
import { EventDialog } from "./components/event-dialog"
import { cn } from "@/lib/utils"

export type CalendarViewType = "month" | "week" | "day" | "agenda"

export function CalendarView() {
  const tz = useTimezone()
  const { data: calendarsData } = useCalendars()
  const calendars = useMemo(
    () => calendarsData?.calendars || [],
    [calendarsData]
  )

  const ensureDefaultMutation = useEnsureDefaultCalendar()

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
  const [selectedOccurrence, setSelectedOccurrence] = useState<
    EventOccurrence | undefined
  >()

  // Active calendars filter
  const enabledCalendarIds = useMemo(() => {
    return calendars.filter((c) => c.isEnabled).map((c) => c.id)
  }, [calendars])

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
    enabledCalendarIds
  )
  const occurrences = eventsData?.occurrences || []

  // Navigation handlers
  const handleToday = () => {
    setCurrentDate(tz.now())
  }

  const handlePrev = () => {
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
  }

  const handleNext = () => {
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
  }

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
  const handleSelectSlot = (dateStr: string, timeStr?: string) => {
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
    setSelectedOccurrence(undefined)
    setEventDialogOpen(true)
  }

  const handleSelectOccurrence = (occ: EventOccurrence) => {
    setSelectedOccurrence(occ)
    setDialogInitialDate(undefined)
    setDialogInitialStartTime(undefined)
    setDialogInitialEndTime(undefined)
    setEventDialogOpen(true)
  }

  const handleOpenNewEvent = () => {
    setSelectedOccurrence(undefined)
    const p = tz.parts(currentDate) || { year: 2026, month: 10, day: 20 }
    setDialogInitialDate(
      `${String(p.year).padStart(4, "0")}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`
    )
    setDialogInitialStartTime("09:00")
    setDialogInitialEndTime("10:00")
    setEventDialogOpen(true)
  }

  return (
    <div
      data-testid="calendar-main-view"
      className="flex h-full w-full overflow-hidden bg-background"
    >
      {/* Sidebar Rail */}
      {sidebarOpen && (
        <CalendarSidebar
          currentDate={currentDate}
          onSelectDate={setCurrentDate}
          onOpenCreateDialog={handleOpenNewEvent}
        />
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

          {/* Right: View Switcher */}
          <div className="flex shrink-0 items-center gap-2">
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
          </div>
        </div>

        {/* View Component Body */}
        <div className="relative flex flex-1 flex-col overflow-hidden">
          {activeView === "month" && (
            <MonthView
              currentDate={currentDate}
              occurrences={occurrences}
              onSelectDate={(d) => {
                setCurrentDate(d)
                setActiveView("day")
              }}
              onSelectSlot={handleSelectSlot}
              onSelectOccurrence={handleSelectOccurrence}
            />
          )}

          {activeView === "week" && (
            <WeekView
              currentDate={currentDate}
              occurrences={occurrences}
              onSelectDate={(d) => {
                setCurrentDate(d)
                setActiveView("day")
              }}
              onSelectSlot={handleSelectSlot}
              onSelectOccurrence={handleSelectOccurrence}
            />
          )}

          {activeView === "day" && (
            <DayView
              currentDate={currentDate}
              occurrences={occurrences}
              onSelectSlot={handleSelectSlot}
              onSelectOccurrence={handleSelectOccurrence}
            />
          )}

          {activeView === "agenda" && (
            <AgendaView
              currentDate={currentDate}
              occurrences={occurrences}
              onSelectOccurrence={handleSelectOccurrence}
              onOpenCreateDialog={handleOpenNewEvent}
            />
          )}
        </div>
      </div>

      {/* Event Create / Edit Dialog */}
      <EventDialog
        key={
          eventDialogOpen
            ? selectedOccurrence
              ? selectedOccurrence.instanceId || selectedOccurrence.eventId
              : `new-${dialogInitialDate}-${dialogInitialStartTime}`
            : "closed"
        }
        open={eventDialogOpen}
        onClose={() => setEventDialogOpen(false)}
        initialDate={dialogInitialDate}
        initialStartTime={dialogInitialStartTime}
        initialEndTime={dialogInitialEndTime}
        initialValues={
          selectedOccurrence ? { occurrence: selectedOccurrence } : undefined
        }
      />
    </div>
  )
}
export default CalendarView
