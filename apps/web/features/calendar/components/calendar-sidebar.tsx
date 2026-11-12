import { useState } from "react"
import { ChevronLeft, ChevronRight, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  useTimezone,
  useCalendars,
  useUpdateCalendar,
  useConnectedAccounts,
} from "@saturn/hooks"
import { getMonthMatrix, type MonthDayCell } from "@saturn/core"
import { cn } from "@/lib/utils"

export interface CalendarSidebarProps {
  currentDate: Date
  onSelectDate: (d: Date) => void
  onOpenCreateDialog: () => void
}

export function CalendarSidebar({
  currentDate,
  onSelectDate,
  onOpenCreateDialog,
}: CalendarSidebarProps) {
  const tz = useTimezone()
  const { data: calendarsData } = useCalendars()
  const { data: accountsData } = useConnectedAccounts()
  const updateCalendarMutation = useUpdateCalendar()

  const calendars = calendarsData?.calendars || []
  const connectedAccounts = accountsData?.accounts || []

  // Mini jumper month state
  const currentParts = tz.parts(currentDate) || {
    year: 2026,
    month: 10,
    day: 20,
  }
  const [jumperYear, setJumperYear] = useState(currentParts.year)
  const [jumperMonth, setJumperMonth] = useState(currentParts.month)

  const handlePrevMonth = () => {
    if (jumperMonth === 1) {
      setJumperMonth(12)
      setJumperYear((y) => y - 1)
    } else {
      setJumperMonth((m) => m - 1)
    }
  }

  const handleNextMonth = () => {
    if (jumperMonth === 12) {
      setJumperMonth(1)
      setJumperYear((y) => y + 1)
    } else {
      setJumperMonth((m) => m + 1)
    }
  }

  const miniMonthWeeks = getMonthMatrix(jumperYear, jumperMonth, {
    weekStartsOn: 0,
    timeZone: tz.timezone,
    fixedWeeks: false,
  })

  // Jumper month label using tz.formatMonth
  const jumperDateNoon = new Date(
    Date.UTC(jumperYear, jumperMonth - 1, 15, 12, 0, 0)
  )
  const jumperMonthLabel = tz.formatMonth(jumperDateNoon)

  const handleToggleCalendar = (id: string, currentlyEnabled: boolean) => {
    updateCalendarMutation.mutate({
      id,
      calendar: { isEnabled: !currentlyEnabled },
      updateMask: { paths: ["isEnabled"] },
    })
  }

  // Split calendars into Space (Native) vs Connected Accounts
  const nativeCalendars = calendars.filter(
    (c) => !c.connectedAccountId || c.source !== "CALENDAR_SOURCE_EXTERNAL"
  )

  const externalCalendars = calendars.filter(
    (c) => c.connectedAccountId || c.source === "CALENDAR_SOURCE_EXTERNAL"
  )

  // Format selected date string for cell comparison
  const selectedDateStr = `${String(currentParts.year).padStart(4, "0")}-${String(currentParts.month).padStart(2, "0")}-${String(currentParts.day).padStart(2, "0")}`

  return (
    <div className="flex h-full w-64 flex-col border-r border-border/40 bg-card p-3">
      {/* Create Event CTA */}
      <Button
        data-testid="create-event-btn"
        onClick={onOpenCreateDialog}
        className="w-full gap-2 shadow-xs"
        size="sm"
      >
        <Plus className="h-4 w-4" />
        <span>Create Event</span>
      </Button>

      {/* Mini Month Jumper */}
      <div className="mt-4 rounded-lg border border-border/40 bg-muted/20 p-2.5">
        <div className="flex items-center justify-between pb-2">
          <span className="text-xs font-semibold text-foreground">
            {jumperMonthLabel}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              data-testid="mini-jumper-prev"
              onClick={handlePrevMonth}
              className="rounded p-1 text-foreground/80 transition hover:bg-muted hover:text-foreground"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              data-testid="mini-jumper-next"
              onClick={handleNextMonth}
              className="rounded p-1 text-foreground/80 transition hover:bg-muted hover:text-foreground"
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Day of week headers */}
        <div className="grid grid-cols-7 text-center text-[10px] font-semibold text-foreground/70">
          <span>Su</span>
          <span>Mo</span>
          <span>Tu</span>
          <span>We</span>
          <span>Th</span>
          <span>Fr</span>
          <span>Sa</span>
        </div>

        {/* Grid cells */}
        <div className="mt-1 space-y-0.5">
          {miniMonthWeeks.map((week, wIdx) => (
            <div key={wIdx} className="grid grid-cols-7 gap-0.5">
              {week.map((cell: MonthDayCell) => {
                const isSelected = cell.dateString === selectedDateStr
                return (
                  <button
                    key={cell.dateString}
                    type="button"
                    data-testid={`mini-day-${cell.dateString}`}
                    onClick={() => onSelectDate(cell.date)}
                    className={cn(
                      "flex h-6 w-full items-center justify-center rounded text-[11px] font-medium transition",
                      cell.isCurrentMonth
                        ? "text-foreground"
                        : "text-muted-foreground/60",
                      cell.isToday &&
                        "font-bold text-primary ring-1 ring-primary/40",
                      isSelected
                        ? "bg-primary font-semibold text-primary-foreground"
                        : "hover:bg-muted"
                    )}
                  >
                    {cell.day}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Calendars lists */}
      <div className="mt-4 flex-1 space-y-5 overflow-y-auto pr-1">
        {/* Space Calendars (Native) */}
        <div>
          <div className="flex items-center justify-between pb-1.5 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            <span>Space Calendars</span>
          </div>

          <div className="space-y-1">
            {nativeCalendars.length === 0 ? (
              <div className="text-xs text-muted-foreground italic">
                No space calendars
              </div>
            ) : (
              nativeCalendars.map((cal) => (
                <label
                  key={cal.id}
                  data-testid={`calendar-toggle-${cal.id}`}
                  className="flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-xs hover:bg-muted/50"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: cal.color || "#3b82f6" }}
                    />
                    <span className="truncate font-medium text-foreground">
                      {cal.name}
                    </span>
                  </div>
                  <Checkbox
                    checked={cal.isEnabled}
                    onCheckedChange={() =>
                      handleToggleCalendar(cal.id, cal.isEnabled)
                    }
                    className="h-3.5 w-3.5"
                  />
                </label>
              ))
            )}
          </div>
        </div>

        {/* Connected Accounts Sub-Calendars */}
        <div>
          <div className="flex items-center justify-between pb-1.5 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            <span>Connected Accounts</span>
          </div>

          {connectedAccounts.length === 0 && externalCalendars.length === 0 ? (
            <div className="text-xs text-muted-foreground italic">
              No connected accounts
            </div>
          ) : (
            <div className="space-y-3">
              {connectedAccounts.map((account) => {
                const accountCals = externalCalendars.filter(
                  (c) => c.connectedAccountId === account.id
                )
                if (accountCals.length === 0) return null

                return (
                  <div key={account.id} className="space-y-1">
                    <div className="px-2 text-[11px] font-medium text-muted-foreground">
                      {account.displayName || account.email}
                    </div>
                    {accountCals.map((cal) => (
                      <label
                        key={cal.id}
                        data-testid={`calendar-toggle-${cal.id}`}
                        className="flex cursor-pointer items-center justify-between rounded-md px-2 py-1 text-xs hover:bg-muted/50"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{
                              backgroundColor:
                                cal.color || account.color || "#8b5cf6",
                            }}
                          />
                          <span className="truncate text-foreground">
                            {cal.name}
                          </span>
                        </div>
                        <Checkbox
                          checked={cal.isEnabled}
                          onCheckedChange={() =>
                            handleToggleCalendar(cal.id, cal.isEnabled)
                          }
                          className="h-3.5 w-3.5"
                        />
                      </label>
                    ))}
                  </div>
                )
              })}

              {/* Any orphaned external calendars */}
              {externalCalendars
                .filter(
                  (c) =>
                    !c.connectedAccountId ||
                    !connectedAccounts.some(
                      (a) => a.id === c.connectedAccountId
                    )
                )
                .map((cal) => (
                  <label
                    key={cal.id}
                    data-testid={`calendar-toggle-${cal.id}`}
                    className="flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-xs hover:bg-muted/50"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: cal.color || "#8b5cf6" }}
                      />
                      <span className="truncate font-medium text-foreground">
                        {cal.name}
                      </span>
                    </div>
                    <Checkbox
                      checked={cal.isEnabled}
                      onCheckedChange={() =>
                        handleToggleCalendar(cal.id, cal.isEnabled)
                      }
                      className="h-3.5 w-3.5"
                    />
                  </label>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
