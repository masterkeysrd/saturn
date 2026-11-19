import { useMemo } from "react"
import { Link } from "react-router-dom"
import { Calendar, Video } from "lucide-react"
import { formatLocalDateString, parseDate } from "@saturn/core"
import { getLocalizedDashboardWidgetMeta } from "@saturn/i18n"
import {
  useCalendarEvents,
  useCalendars,
  useI18n,
  useTimezone,
} from "@saturn/hooks"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { useActiveSpaceContext } from "@/features/space/use-space"
import { DashboardWidgetCard } from "./widget-shell"

export function TodayScheduleWidget() {
  const { spaceId } = useActiveSpaceContext()
  const tz = useTimezone()
  const { t, locale, language } = useI18n()
  const isEs = language === "es"
  const widgetMeta = getLocalizedDashboardWidgetMeta("today_schedule", locale)

  const todayStr = useMemo(
    () => formatLocalDateString(tz.now(), tz.timezone),
    [tz]
  )

  const { data: calendarsData, isLoading: calendarsLoading } = useCalendars({
    enabled: Boolean(spaceId),
  })

  const enabledCalendarIds = useMemo(
    () =>
      (calendarsData?.calendars ?? [])
        .filter((c) => c.isEnabled)
        .map((c) => c.id),
    [calendarsData?.calendars]
  )

  const { rangeStart, rangeEnd } = useMemo(() => {
    const now = tz.now()
    return {
      rangeStart: tz.startOfDay(now).toISOString(),
      rangeEnd: tz.endOfDay(now).toISOString(),
    }
  }, [tz])

  const { data: eventsData, isLoading: eventsLoading } = useCalendarEvents(
    rangeStart,
    rangeEnd,
    enabledCalendarIds,
    { enabled: Boolean(spaceId) && Boolean(calendarsData) }
  )

  const todayEvents = useMemo(() => {
    const list = eventsData?.occurrences ?? []
    const filtered = list.filter((occ) => {
      if (occ.isAllDay) {
        return (
          occ.startDate <= todayStr &&
          (occ.endDate > todayStr || occ.endDate === occ.startDate)
        )
      }
      if (occ.startTime) {
        const parsed = parseDate(occ.startTime, tz.timezone)
        if (parsed) {
          return formatLocalDateString(parsed, tz.timezone) === todayStr
        }
      }
      return false
    })

    return filtered.sort((a, b) => {
      if (a.isAllDay && !b.isAllDay) return -1
      if (!a.isAllDay && b.isAllDay) return 1
      const aTime = a.startTime ? new Date(a.startTime).getTime() : 0
      const bTime = b.startTime ? new Date(b.startTime).getTime() : 0
      return aTime - bTime
    })
  }, [eventsData?.occurrences, todayStr, tz.timezone])

  const isLoading = calendarsLoading || eventsLoading
  const visibleEvents = todayEvents.slice(0, 4)

  return (
    <DashboardWidgetCard
      title={widgetMeta.title}
      icon={Calendar}
      badge={
        !isLoading ? (
          <Badge variant="neutral">
            {todayEvents.length === 0
              ? isEs
                ? "Libre"
                : "Clear"
              : `${todayEvents.length} ${
                  isEs
                    ? todayEvents.length === 1
                      ? "evento"
                      : "eventos"
                    : todayEvents.length === 1
                      ? "event"
                      : "events"
                }`}
          </Badge>
        ) : undefined
      }
      aiPrompt="Brief me on today's schedule, conflicts, and any preparation needed"
      viewAllTo={spaceId ? `/space/${spaceId}/calendar` : undefined}
      viewAllLabel={t("nav.calendar")}
      isLoading={isLoading}
      loadingSkeleton={
        <div className="space-y-2.5">
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      }
    >
      {visibleEvents.length === 0 ? (
        <div className="flex flex-1 flex-col justify-center gap-2 py-2">
          <div className="flex items-start gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Calendar className="size-4" />
            </div>
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm font-medium text-foreground">
                {widgetMeta.empty}
              </p>
              <p className="text-xs text-muted-foreground">
                {isEs
                  ? "No tienes más eventos de calendario para el resto de hoy."
                  : "You have no upcoming calendar events for the rest of today."}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="divide-y divide-border/50">
          {visibleEvents.map((occ) => (
            <div
              key={occ.instanceId || occ.eventId}
              className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: occ.color || "var(--primary)" }}
                />
                <div className="min-w-0">
                  <Link
                    to={`/space/${spaceId}/calendar?date=${encodeURIComponent(todayStr)}&view=day`}
                    className="block truncate text-sm font-medium text-foreground hover:text-primary"
                  >
                    {occ.title || (isEs ? "(Sin título)" : "(No title)")}
                  </Link>
                  <p className="truncate font-mono text-xs text-muted-foreground tabular-nums">
                    {occ.isAllDay
                      ? isEs
                        ? "Todo el día"
                        : "All day"
                      : occ.startTime
                        ? `${tz.formatTime(occ.startTime)}${occ.endTime ? ` – ${tz.formatTime(occ.endTime)}` : ""}`
                        : ""}
                    {occ.location ? ` · ${occ.location}` : ""}
                  </p>
                </div>
              </div>

              {occ.meetUrl && (
                <a
                  href={occ.meetUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-border/70 bg-background px-2 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                >
                  <Video className="size-3 text-primary" />
                  <span>{isEs ? "Unirse" : "Join"}</span>
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </DashboardWidgetCard>
  )
}
