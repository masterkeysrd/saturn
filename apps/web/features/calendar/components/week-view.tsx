import { useMemo, useRef, useEffect } from "react"
import { useI18n, useTimezone } from "@saturn/hooks"
import {
  formatLocalDateString,
  getWeekDays,
  getHourSlots,
  computeTimedEventLayout,
  computeMultiDayBannerRows,
  type WeekDayHeader,
} from "@saturn/core"
import type { EventOccurrence } from "@saturn/api/saturn/calendar/v1/calendar"
import type { ScheduledTransaction } from "@saturn/api/gen/saturn/finance/v1/finance"
import { MoneyAmount } from "@/components/ui/money-amount"
import type { CalendarFinanceItem } from "../calendar-finance"
import { cn } from "@/lib/utils"
import { Video, MapPin, ArrowDownLeft, ArrowUpRight } from "lucide-react"

export interface WeekViewProps {
  currentDate: Date
  resetSeq?: number
  occurrences: EventOccurrence[]
  financeItems?: CalendarFinanceItem[]
  onSelectDate: (d: Date) => void
  onSelectSlot: (dateStr: string, timeStr: string) => void
  onSelectOccurrence: (
    occ: EventOccurrence,
    anchorEl?: HTMLElement | null
  ) => void
  onEditOccurrence?: (occ: EventOccurrence) => void
  onSelectFinanceItem?: (item: ScheduledTransaction) => void
}

export function WeekView({
  currentDate,
  resetSeq = 0,
  occurrences,
  financeItems = [],
  onSelectDate,
  onSelectSlot,
  onSelectOccurrence,
  onEditOccurrence,
  onSelectFinanceItem,
}: WeekViewProps) {
  const tz = useTimezone()
  const { t } = useI18n()
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const timedGridRef = useRef<HTMLDivElement>(null)

  const weekDays = useMemo(() => {
    return getWeekDays(currentDate, {
      weekStartsOn: tz.weekStartsOn ?? 0,
      timeZone: tz.timezone,
      locale: tz.locale || "en-US",
    })
  }, [currentDate, tz.timezone, tz.weekStartsOn, tz.locale])

  const hourSlots = useMemo(() => getHourSlots(), [])

  // Partition all-day vs timed
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

  // Multi-day banner rows for all-day header section
  const bannerLayout = useMemo(() => {
    return computeMultiDayBannerRows(
      allDayEvents.map((e) => ({
        id: e.instanceId || e.eventId,
        startDate: e.startDate,
        endDate: e.endDate,
        occurrence: e,
      })),
      weekDays.map((d) => d.dateString)
    )
  }, [allDayEvents, weekDays])

  // Current time position in workspace timezone
  const nowParts = tz.parts(tz.now())
  const currentMinutes = nowParts ? nowParts.hour * 60 + nowParts.minute : 0
  const currentTimeTopPct = Number(((currentMinutes / 1440) * 100).toFixed(3))

  const todayDateStr = formatLocalDateString(tz.now(), tz.timezone)

  // Auto-scroll to 8:00 AM on initial mount and when clicking Today
  useEffect(() => {
    if (scrollContainerRef.current && timedGridRef.current) {
      // 8 AM out of 24 hours = 1/3 of timed grid height
      const targetScroll = (timedGridRef.current.offsetHeight * 8) / 24 - 40
      scrollContainerRef.current.scrollTop = Math.max(0, targetScroll)
    }
  }, [resetSeq])

  return (
    <div
      data-testid="week-view-container"
      className="flex flex-1 flex-col overflow-hidden bg-background select-none"
    >
      {/* Unified Scrollable Viewport (Sticky Header + Timed Grid share exact width) */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
        {/* Sticky Header: Day columns & All-day banner section */}
        <div className="sticky top-0 z-30 border-b border-border/50 bg-background/95 backdrop-blur">
          <div className="grid grid-cols-[72px_minmax(0,1fr)]">
            {/* Timezone label */}
            <div className="flex items-end justify-center border-r border-border/30 pb-2 text-[10px] font-medium text-muted-foreground">
              {tz.timezone.split("/").pop()?.replace(/_/g, " ")}
            </div>

            {/* 7 Day Headers */}
            <div className="grid min-w-0 grid-cols-7 divide-x divide-border/20">
              {weekDays.map((day: WeekDayHeader) => {
                const isPastDay = Boolean(
                  todayDateStr && day.dateString < todayDateStr && !day.isToday
                )
                return (
                  <div
                    key={day.dateString}
                    className={cn(
                      "flex min-w-0 cursor-pointer flex-col items-center py-2 transition hover:bg-muted/30",
                      day.isToday && "bg-primary/5"
                    )}
                    onClick={() => onSelectDate(day.date)}
                  >
                    <span className="text-[11px] font-medium text-muted-foreground">
                      {day.dayName
                        ? day.dayName.charAt(0).toUpperCase() +
                          day.dayName.slice(1)
                        : ""}
                    </span>
                    <span
                      className={cn(
                        "mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold transition",
                        day.isToday
                          ? "bg-primary text-primary-foreground shadow-xs"
                          : isPastDay
                            ? "text-muted-foreground/75"
                            : "text-foreground"
                      )}
                    >
                      {day.dayNumber}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* All-Day Events & Scheduled Finance Section */}
          {(bannerLayout.totalRows > 0 ||
            weekDays.some((d) =>
              financeItems.some((f) => f.dateKey === d.dateString)
            )) && (
            <div className="grid grid-cols-[72px_minmax(0,1fr)] border-t border-border/30">
              <div className="flex items-center justify-center border-r border-border/30 text-[10px] font-medium text-muted-foreground">
                {t("calendar.allDay")}
              </div>
              <div className="flex min-w-0 flex-col">
                {bannerLayout.totalRows > 0 && (
                  <div
                    className="relative grid min-w-0 grid-cols-7 divide-x divide-border/20"
                    style={{ height: `${bannerLayout.totalRows * 24 + 4}px` }}
                  >
                    {weekDays.map((day) => (
                      <div key={day.dateString} className="h-full min-w-0" />
                    ))}

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
                          onClick={(e) =>
                            onSelectOccurrence(occ, e.currentTarget)
                          }
                          onDoubleClick={(e) => {
                            e.stopPropagation()
                            onEditOccurrence?.(occ)
                          }}
                          style={{
                            gridColumn: `${colStart} / span ${colSpan}`,
                            top: `${2 + item.rowIndex * 24}px`,
                            backgroundColor: occ.color || "#3b82f6",
                          }}
                          className={cn(
                            "absolute inset-x-0 z-10 flex h-5 items-center truncate px-2 text-[11px] font-semibold text-white shadow-2xs transition hover:brightness-110",
                            item.isStart
                              ? "ml-1 rounded-l-md"
                              : "rounded-l-none",
                            item.isEnd ? "mr-1 rounded-r-md" : "rounded-r-none"
                          )}
                        >
                          <span className="truncate">
                            {occ.title || t("calendar.noTitle")}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}

                {weekDays.some((d) =>
                  financeItems.some((f) => f.dateKey === d.dateString)
                ) && (
                  <div className="grid min-w-0 grid-cols-7 divide-x divide-border/20 border-t border-border/20 py-1">
                    {weekDays.map((day) => {
                      const dayFin = financeItems.filter(
                        (f) => f.dateKey === day.dateString
                      )
                      return (
                        <div
                          key={day.dateString}
                          className="flex min-w-0 flex-col gap-1 px-1"
                        >
                          {dayFin.map((fin) => {
                            const isIncome = fin.type === "INCOME"
                            return (
                              <button
                                key={fin.id}
                                type="button"
                                data-testid={`finance-pill-${fin.id}`}
                                onClick={() =>
                                  onSelectFinanceItem?.(
                                    fin.scheduledTransaction
                                  )
                                }
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
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Timed Grid (00:00 - 24:00) */}
        <div
          ref={timedGridRef}
          className="relative z-0 grid grid-cols-[72px_minmax(0,1fr)]"
        >
          {/* Time gutter */}
          <div className="relative border-r border-border/30 select-none">
            {hourSlots.map((slot) => (
              <div
                key={slot.timeString}
                className="relative h-16 border-b border-transparent"
              >
                {slot.hour !== 0 && (
                  <span className="absolute -top-2.5 right-3 text-right text-[11px] font-medium whitespace-nowrap text-muted-foreground tabular-nums select-none">
                    {slot.label}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* 7 Day Timed Columns */}
          <div className="relative grid min-w-0 grid-cols-7 divide-x divide-border/20">
            {weekDays.map((day) => {
              // Compute side-by-side collision layout for this day
              const dayLayout = computeTimedEventLayout(
                timedEvents,
                day.dateString,
                tz.timezone
              )

              return (
                <div
                  key={day.dateString}
                  data-testid={`week-column-${day.dateString}`}
                  className={cn(
                    "relative h-full min-w-0",
                    day.isToday && "bg-primary/[0.02]"
                  )}
                >
                  {/* Hour horizontal grid lines */}
                  {hourSlots.map((slot) => (
                    <div
                      key={`${day.dateString}-${slot.timeString}`}
                      onClick={() =>
                        onSelectSlot(day.dateString, slot.timeString)
                      }
                      className="h-16 cursor-pointer border-b border-border/25 transition hover:bg-muted/20"
                    />
                  ))}

                  {/* Current Time Red Indicator Line */}
                  {day.isToday && (
                    <div
                      data-testid="current-time-indicator"
                      className="pointer-events-none absolute right-0 left-0 z-20 flex items-center"
                      style={{ top: `${currentTimeTopPct}%` }}
                    >
                      <div className="-ml-1.5 h-2.5 w-2.5 rounded-full bg-rose-500 shadow-xs" />
                      <div className="h-[2px] flex-1 bg-rose-500" />
                    </div>
                  )}

                  {/* Timed Event Blocks */}
                  {dayLayout.map((item) => {
                    const occ = item.event
                    const isVeryShort = item.heightPct <= 1.5
                    const isShort = item.heightPct < 3.2
                    const startTimeStr = tz.formatTime(occ.startTime, {
                      hour: "numeric",
                      minute: "2-digit",
                    })
                    const endTimeStr = tz.formatTime(occ.endTime, {
                      hour: "numeric",
                      minute: "2-digit",
                    })

                    return (
                      <div
                        key={`${day.dateString}-${item.id}`}
                        data-testid={`timed-event-${item.id}`}
                        title={`${occ.title}\n${startTimeStr} – ${endTimeStr}${occ.location ? `\n${occ.location}` : ""}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          onSelectOccurrence(occ, e.currentTarget)
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation()
                          onEditOccurrence?.(occ)
                        }}
                        style={{
                          top: `${item.topPct}%`,
                          height: `calc(${item.heightPct}% - 2px)`,
                          left:
                            item.widthPct < 100
                              ? `calc(${item.leftPct}% + 1px)`
                              : "1px",
                          width:
                            item.widthPct < 100
                              ? `calc(${item.widthPct}% - 2px)`
                              : "calc(100% - 2px)",
                          zIndex: item.zIndex,
                          backgroundColor: `${occ.color || "#3b82f6"}22`,
                          borderLeft: `3px solid ${occ.color || "#3b82f6"}`,
                        }}
                        className={cn(
                          "absolute cursor-pointer overflow-hidden rounded-r-md border border-l-0 border-border/30 text-xs shadow-2xs transition-colors hover:z-20 hover:brightness-95",
                          isVeryShort
                            ? "px-0.5 py-0"
                            : isShort
                              ? "px-0.5 py-0.5"
                              : "p-1.5"
                        )}
                      >
                        {isVeryShort ? (
                          <div className="flex items-center gap-1 truncate text-[10px] leading-tight font-semibold text-foreground">
                            <span className="truncate">{occ.title}</span>
                            <span className="shrink-0 text-[9px] font-normal text-muted-foreground opacity-80">
                              {startTimeStr}
                            </span>
                          </div>
                        ) : isShort ? (
                          <div className="flex items-center gap-1.5 truncate text-[11px] leading-tight font-semibold text-foreground">
                            <span className="truncate">{occ.title}</span>
                            <span className="shrink-0 text-[10px] font-normal text-muted-foreground">
                              {startTimeStr}
                            </span>
                          </div>
                        ) : (
                          <>
                            <div className="truncate leading-tight font-semibold text-foreground">
                              {occ.title}
                            </div>
                            <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
                              {startTimeStr} – {endTimeStr}
                            </div>
                            {item.heightPct >= 4.5 && occ.location && (
                              <div className="mt-0.5 flex items-center gap-1 truncate text-[10px] text-muted-foreground">
                                <MapPin className="h-2.5 w-2.5 shrink-0" />
                                <span className="truncate">{occ.location}</span>
                              </div>
                            )}
                            {item.heightPct >= 5.5 && occ.meetUrl && (
                              <div className="mt-1 flex items-center gap-1 text-[10px] font-medium text-primary">
                                <Video className="h-2.5 w-2.5 shrink-0" />
                                <span>{t("calendar.join")}</span>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
