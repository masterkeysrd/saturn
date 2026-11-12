import { useMemo } from "react"
import { useTimezone } from "@saturn/hooks"
import {
  getMonthMatrix,
  computeMultiDayBannerRows,
  type MonthDayCell,
} from "@saturn/core"
import type { EventOccurrence } from "@saturn/api/saturn/calendar/v1/calendar"
import { cn } from "@/lib/utils"

export interface MonthViewProps {
  currentDate: Date
  occurrences: EventOccurrence[]
  onSelectDate: (d: Date) => void
  onSelectSlot: (dateStr: string) => void
  onSelectOccurrence: (occ: EventOccurrence) => void
}

export function MonthView({
  currentDate,
  occurrences,
  onSelectDate,
  onSelectSlot,
  onSelectOccurrence,
}: MonthViewProps) {
  const tz = useTimezone()

  const currentParts = tz.parts(currentDate) || {
    year: 2026,
    month: 10,
    day: 20,
  }

  const weeks = useMemo(() => {
    return getMonthMatrix(currentParts.year, currentParts.month, {
      weekStartsOn: 0,
      timeZone: tz.timezone,
      fixedWeeks: true,
    })
  }, [currentParts.year, currentParts.month, tz.timezone])

  // Partition occurrences into all-day/multi-day vs timed single-day
  const { allDayEvents, timedEvents } = useMemo(() => {
    const allDay: EventOccurrence[] = []
    const timed: EventOccurrence[] = []

    for (const occ of occurrences) {
      if (occ.isAllDay) {
        allDay.push(occ)
      } else {
        timed.push(occ)
      }
    }

    return { allDayEvents: allDay, timedEvents: timed }
  }, [occurrences])

  const weekDayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

  return (
    <div
      data-testid="month-view-container"
      className="flex flex-1 flex-col overflow-hidden bg-background select-none"
    >
      {/* Day of Week Headers */}
      <div className="grid grid-cols-7 border-b border-border/40 bg-muted/30 text-center text-xs font-semibold text-foreground/80">
        {weekDayNames.map((dayName, idx) => (
          <div
            key={dayName}
            className={cn(
              "border-r border-border/20 py-2 last:border-r-0",
              (idx === 0 || idx === 6) && "text-muted-foreground"
            )}
          >
            {dayName}
          </div>
        ))}
      </div>

      {/* Month Weeks Grid */}
      <div className="grid flex-1 grid-rows-6 divide-y divide-border/30 overflow-y-auto">
        {weeks.map((week, wIdx) => {
          const weekDays = week.map((c) => c.dateString)

          // Multi-day banner packing for this week row
          const bannerLayout = computeMultiDayBannerRows(
            allDayEvents.map((e) => ({
              id: e.instanceId || e.eventId,
              startDate: e.startDate,
              endDate: e.endDate,
              occurrence: e,
            })),
            weekDays
          )

          return (
            <div
              key={wIdx}
              className="relative grid grid-cols-7 divide-x divide-border/20"
            >
              {/* Day column background & cell container */}
              {week.map((cell: MonthDayCell) => {
                // Find timed events for this cell
                const cellTimed = timedEvents.filter((e) => {
                  const sParts = tz.parts(e.startTime)
                  if (!sParts) return false
                  const dStr = `${String(sParts.year).padStart(4, "0")}-${String(sParts.month).padStart(2, "0")}-${String(sParts.day).padStart(2, "0")}`
                  return dStr === cell.dateString
                })

                return (
                  <div
                    key={cell.dateString}
                    data-testid={`month-cell-${cell.dateString}`}
                    onClick={(e) => {
                      if (e.target === e.currentTarget) {
                        onSelectSlot(cell.dateString)
                      }
                    }}
                    className={cn(
                      "group relative flex min-h-[90px] cursor-pointer flex-col p-1.5 transition hover:bg-muted/10",
                      !cell.isCurrentMonth &&
                        "bg-muted/15 text-muted-foreground/40",
                      cell.isWeekend && "bg-muted/5"
                    )}
                  >
                    {/* Day Number Header */}
                    <div className="pointer-events-none flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground/60 opacity-0 transition group-hover:opacity-100">
                        +
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          onSelectDate(cell.date)
                        }}
                        className={cn(
                          "pointer-events-auto flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium transition",
                          cell.isToday
                            ? "bg-primary font-bold text-primary-foreground shadow-xs"
                            : "text-foreground hover:bg-muted"
                        )}
                      >
                        {cell.day}
                      </button>
                    </div>

                    {/* Multi-day placeholder offset */}
                    {bannerLayout.totalRows > 0 && (
                      <div
                        style={{ height: `${bannerLayout.totalRows * 22}px` }}
                        className="pointer-events-none shrink-0"
                      />
                    )}

                    {/* Timed Events List */}
                    <div className="pointer-events-auto mt-1 flex flex-1 flex-col gap-1 overflow-hidden">
                      {cellTimed.slice(0, 3).map((occ) => (
                        <button
                          key={occ.instanceId || occ.eventId}
                          type="button"
                          data-testid={`event-pill-${occ.instanceId || occ.eventId}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            onSelectOccurrence(occ)
                          }}
                          className="flex w-full items-center justify-between gap-1 rounded px-1.5 py-0.5 text-left text-[11px] font-medium text-foreground transition hover:opacity-80"
                          style={{
                            backgroundColor: `${occ.color || "#3b82f6"}22`,
                            borderLeft: `3px solid ${occ.color || "#3b82f6"}`,
                          }}
                        >
                          <span className="min-w-0 flex-1 truncate font-medium">
                            {occ.title}
                          </span>
                          <span className="ml-auto shrink-0 pl-1 text-[10px] text-muted-foreground tabular-nums">
                            {tz.formatTime(occ.startTime, {
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </span>
                        </button>
                      ))}

                      {cellTimed.length > 3 && (
                        <div className="pl-1 text-[10px] font-semibold text-muted-foreground">
                          +{cellTimed.length - 3} more
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}

              {/* Multi-day all-day banners overlay across this week */}
              {bannerLayout.items.map((item) => {
                const occ = (
                  item.event as unknown as { occurrence: EventOccurrence }
                ).occurrence
                const colStart = item.startCol + 1
                const colSpan = item.spanCols

                return (
                  <button
                    key={item.id}
                    type="button"
                    data-testid={`banner-${item.id}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      onSelectOccurrence(occ)
                    }}
                    style={{
                      gridColumn: `${colStart} / span ${colSpan}`,
                      top: `${28 + item.rowIndex * 22}px`,
                      backgroundColor: occ.color || "#3b82f6",
                    }}
                    className={cn(
                      "absolute z-10 flex h-5 items-center truncate px-2 text-[11px] font-semibold text-white shadow-2xs transition hover:brightness-110",
                      item.isStart ? "ml-1 rounded-l-md" : "rounded-l-none",
                      item.isEnd ? "mr-1 rounded-r-md" : "rounded-r-none"
                    )}
                  >
                    <span className="truncate">{occ.title}</span>
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
