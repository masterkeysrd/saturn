import { useMemo, useRef, useEffect } from "react"
import { useTimezone } from "@saturn/hooks"
import {
  getHourSlots,
  computeTimedEventLayout,
  computeMultiDayBannerRows,
  formatLocalDateString,
} from "@saturn/core"
import type { EventOccurrence } from "@saturn/api/saturn/calendar/v1/calendar"
import { cn } from "@/lib/utils"
import { Video, MapPin } from "lucide-react"

export interface DayViewProps {
  currentDate: Date
  occurrences: EventOccurrence[]
  onSelectSlot: (dateStr: string, timeStr: string) => void
  onSelectOccurrence: (occ: EventOccurrence) => void
}

export function DayView({
  currentDate,
  occurrences,
  onSelectSlot,
  onSelectOccurrence,
}: DayViewProps) {
  const tz = useTimezone()
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const dateStr = formatLocalDateString(currentDate, tz.timezone)
  const isToday = tz.isToday(currentDate)

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
      [dateStr]
    )
  }, [allDayEvents, dateStr])

  // Compute side-by-side collision layout for this day
  const dayLayout = useMemo(() => {
    return computeTimedEventLayout(timedEvents, dateStr, tz.timezone)
  }, [timedEvents, dateStr, tz.timezone])

  // Current time position in workspace timezone
  const nowParts = tz.parts(tz.now())
  const currentMinutes = nowParts ? nowParts.hour * 60 + nowParts.minute : 0
  const currentTimeTopPct = Number(((currentMinutes / 1440) * 100).toFixed(3))

  // Auto-scroll to 8:00 AM on initial mount
  useEffect(() => {
    if (scrollContainerRef.current) {
      const targetScroll =
        (scrollContainerRef.current.scrollHeight * 8) / 24 - 40
      scrollContainerRef.current.scrollTop = targetScroll
    }
  }, [])

  return (
    <div
      data-testid="day-view-container"
      className="flex flex-1 flex-col overflow-hidden bg-background select-none"
    >
      {/* Sticky Header: Day Title & All-day banner section */}
      <div className="z-20 shrink-0 border-b border-border/50 bg-background/95 backdrop-blur">
        <div className="grid grid-cols-[72px_1fr]">
          <div className="flex items-center justify-center border-r border-border/30 py-2 text-[10px] font-medium text-muted-foreground">
            {tz.timezone.split("/").pop()?.replace(/_/g, " ")}
          </div>
          <div className="flex items-center gap-3 px-4 py-2">
            <span
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold",
                isToday
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-muted text-foreground"
              )}
            >
              {tz.parts(currentDate)?.day}
            </span>
            <div>
              <div className="text-sm font-semibold text-foreground">
                {tz.format(currentDate, { weekday: "long" })}
              </div>
              <div className="text-xs text-muted-foreground">
                {tz.format(currentDate, {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </div>
            </div>
          </div>
        </div>

        {/* All-Day Events Section (if any all-day events exist) */}
        {bannerLayout.totalRows > 0 && (
          <div className="grid grid-cols-[72px_1fr] border-t border-border/30">
            <div className="flex items-center justify-center border-r border-border/30 text-[10px] font-medium text-muted-foreground">
              all-day
            </div>
            <div
              className="relative p-1"
              style={{ height: `${bannerLayout.totalRows * 24 + 4}px` }}
            >
              {bannerLayout.items.map((item) => {
                const occ = (
                  item.event as unknown as { occurrence: EventOccurrence }
                ).occurrence
                return (
                  <button
                    key={item.id}
                    type="button"
                    data-testid={`banner-${item.id}`}
                    onClick={() => onSelectOccurrence(occ)}
                    style={{
                      top: `${2 + item.rowIndex * 24}px`,
                      backgroundColor: occ.color || "#3b82f6",
                    }}
                    className="absolute right-2 left-2 z-10 flex h-5 items-center truncate rounded-md px-2 text-[11px] font-semibold text-white shadow-2xs transition hover:brightness-110"
                  >
                    <span className="truncate">{occ.title}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Scrollable Timed Grid (00:00 - 24:00) */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
        <div className="relative grid min-h-[1152px] grid-cols-[72px_1fr]">
          {/* Time gutter */}
          <div className="relative border-r border-border/30 select-none">
            {hourSlots.map((slot) => (
              <div
                key={slot.timeString}
                className="relative h-12 border-b border-transparent"
              >
                {slot.hour !== 0 && (
                  <span className="absolute -top-2.5 right-3 text-right text-[11px] font-medium whitespace-nowrap text-muted-foreground tabular-nums select-none">
                    {slot.label}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Day Column with Timed Events */}
          <div
            data-testid={`day-column-${dateStr}`}
            className={cn("relative h-full", isToday && "bg-primary/[0.015]")}
          >
            {/* Hour horizontal grid lines */}
            {hourSlots.map((slot) => (
              <div
                key={slot.timeString}
                onClick={() => onSelectSlot(dateStr, slot.timeString)}
                className="h-12 cursor-pointer border-b border-border/25 transition hover:bg-muted/20"
              />
            ))}

            {/* Current Time Red Indicator Line */}
            {isToday && (
              <div
                data-testid="current-time-indicator"
                className="pointer-events-none absolute right-0 left-0 z-30 flex items-center"
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
                  key={item.id}
                  data-testid={`timed-event-${item.id}`}
                  title={`${occ.title}\n${startTimeStr} – ${endTimeStr}${occ.location ? `\n${occ.location}` : ""}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onSelectOccurrence(occ)
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
                          <span>Join</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
