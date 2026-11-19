import { useMemo } from "react"
import { ArrowDownLeft, ArrowUpRight } from "lucide-react"
import { useTimezone } from "@saturn/hooks"
import {
  getMonthMatrix,
  computeMultiDayBannerRows,
  type MonthDayCell,
} from "@saturn/core"
import type { EventOccurrence } from "@saturn/api/saturn/calendar/v1/calendar"
import type { ScheduledTransaction } from "@saturn/api/gen/saturn/finance/v1/finance"
import { MoneyAmount } from "@/components/ui/money-amount"
import type { CalendarFinanceItem } from "../calendar-finance"
import { cn } from "@/lib/utils"

export interface MonthViewProps {
  currentDate: Date
  occurrences: EventOccurrence[]
  financeItems?: CalendarFinanceItem[]
  onSelectDate: (d: Date) => void
  onSelectSlot: (dateStr: string) => void
  onSelectOccurrence: (
    occ: EventOccurrence,
    anchorEl?: HTMLElement | null
  ) => void
  onEditOccurrence?: (occ: EventOccurrence) => void
  onSelectFinanceItem?: (item: ScheduledTransaction) => void
}

export function MonthView({
  currentDate,
  occurrences,
  financeItems = [],
  onSelectDate,
  onSelectSlot,
  onSelectOccurrence,
  onEditOccurrence,
  onSelectFinanceItem,
}: MonthViewProps) {
  const tz = useTimezone()

  const currentParts = tz.parts(currentDate) || {
    year: 2026,
    month: 10,
    day: 20,
  }

  const weekStartsOn = tz.weekStartsOn ?? 0

  const weeks = useMemo(() => {
    return getMonthMatrix(currentParts.year, currentParts.month, {
      weekStartsOn,
      timeZone: tz.timezone,
      fixedWeeks: true,
    })
  }, [currentParts.year, currentParts.month, tz.timezone, weekStartsOn])

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

  const weekDayHeaders = useMemo(() => {
    const firstWeek = weeks[0]
    if (!firstWeek) {
      return [
        { label: "Sun", isWeekend: true },
        { label: "Mon", isWeekend: false },
        { label: "Tue", isWeekend: false },
        { label: "Wed", isWeekend: false },
        { label: "Thu", isWeekend: false },
        { label: "Fri", isWeekend: false },
        { label: "Sat", isWeekend: true },
      ]
    }
    const fmt = new Intl.DateTimeFormat(tz.locale || "en-US", {
      weekday: "short",
      timeZone: tz.timezone,
    })
    return firstWeek.map((cell) => {
      const noon = new Date(
        Date.UTC(cell.year, cell.month - 1, cell.day, 12, 0, 0)
      )
      return {
        label: fmt.format(noon),
        isWeekend: cell.isWeekend,
      }
    })
  }, [weeks, tz.locale, tz.timezone])

  return (
    <div
      data-testid="month-view-container"
      className="flex flex-1 flex-col overflow-hidden bg-background select-none"
    >
      {/* Day of Week Headers */}
      <div className="grid grid-cols-7 border-b border-border/40 bg-muted/30 text-center text-xs font-semibold text-foreground/80">
        {weekDayHeaders.map((day, idx) => (
          <div
            key={`${day.label}-${idx}`}
            className={cn(
              "border-r border-border/20 py-2 last:border-r-0",
              day.isWeekend && "text-muted-foreground"
            )}
          >
            {day.label}
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
                const cellFinance = financeItems.filter(
                  (f) => f.dateKey === cell.dateString
                )

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

                    {/* Finance Bills & Paydays Pills */}
                    {cellFinance.length > 0 && (
                      <div className="pointer-events-auto mt-1 flex flex-col gap-1">
                        {cellFinance.slice(0, 2).map((fin) => {
                          const isIncome = fin.type === "INCOME"
                          return (
                            <button
                              key={fin.id}
                              type="button"
                              data-testid={`finance-pill-${fin.id}`}
                              onClick={(e) => {
                                e.stopPropagation()
                                onSelectFinanceItem?.(fin.scheduledTransaction)
                              }}
                              className={cn(
                                "flex w-full items-center justify-between gap-1 rounded-md border px-1.5 py-0.5 text-left text-[11px] font-medium transition hover:brightness-95",
                                isIncome
                                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                  : "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300"
                              )}
                            >
                              <span className="flex min-w-0 flex-1 items-center gap-1">
                                {isIncome ? (
                                  <ArrowUpRight className="size-3 shrink-0" />
                                ) : (
                                  <ArrowDownLeft className="size-3 shrink-0" />
                                )}
                                <span className="truncate">{fin.title}</span>
                              </span>
                              <MoneyAmount
                                cents={fin.amountCents}
                                currency={fin.currency}
                                size="sm"
                                className="shrink-0 text-[10px]"
                              />
                            </button>
                          )
                        })}
                        {cellFinance.length > 2 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              onSelectDate(cell.date)
                            }}
                            className="pl-1 text-left text-[10px] font-medium text-muted-foreground hover:text-foreground"
                          >
                            +{cellFinance.length - 2} bills
                          </button>
                        )}
                      </div>
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
                            onSelectOccurrence(occ, e.currentTarget)
                          }}
                          onDoubleClick={(e) => {
                            e.stopPropagation()
                            onEditOccurrence?.(occ)
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
                        <button
                          type="button"
                          data-testid={`month-more-${cell.dateString}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            onSelectDate(cell.date)
                          }}
                          className="pl-1 text-left text-[10px] font-semibold text-muted-foreground hover:text-foreground hover:underline"
                        >
                          +{cellTimed.length - 3} more
                        </button>
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
                      onSelectOccurrence(occ, e.currentTarget)
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation()
                      onEditOccurrence?.(occ)
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
