import {
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react"
import { useConnectedAccounts, useI18n, useTimezone } from "@saturn/hooks"
import {
  findSelfAttendee,
  formatLocalDateString,
  parseDate,
} from "@saturn/core"
import type { EventOccurrence } from "@saturn/api/saturn/calendar/v1/calendar"
import type { ScheduledTransaction } from "@saturn/api/gen/saturn/finance/v1/finance"
import { AuthContext } from "@/features/auth/auth-context"
import {
  Video,
  MapPin,
  Calendar,
  Check,
  HelpCircle,
  X,
  ArrowDownLeft,
  ArrowUpRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { MoneyAmount } from "@/components/ui/money-amount"
import type { CalendarFinanceItem } from "../calendar-finance"
import { cn } from "@/lib/utils"

export interface AgendaViewProps {
  currentDate?: Date
  resetSeq?: number
  occurrences: EventOccurrence[]
  financeItems?: CalendarFinanceItem[]
  onSelectOccurrence: (
    occ: EventOccurrence,
    anchorEl?: HTMLElement | null
  ) => void
  onEditOccurrence?: (occ: EventOccurrence) => void
  onSelectFinanceItem?: (item: ScheduledTransaction) => void
  onOpenCreateDialog: () => void
  onVisibleDateChange?: (date: Date) => void
}

export function AgendaView({
  currentDate,
  resetSeq = 0,
  occurrences,
  financeItems = [],
  onSelectOccurrence,
  onEditOccurrence,
  onSelectFinanceItem,
  onOpenCreateDialog,
  onVisibleDateChange,
}: AgendaViewProps) {
  const tz = useTimezone()
  const { t } = useI18n()
  const auth = useContext(AuthContext)
  const { data: accountsData } = useConnectedAccounts()
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const lastReportedMonthRef = useRef<string | null>(null)
  const selfEmails = useMemo(
    () => [
      auth?.user?.email,
      ...(accountsData?.accounts ?? []).map((a) => a.email),
    ],
    [auth?.user?.email, accountsData?.accounts]
  )
  const currentDateKey = useMemo(
    () => formatLocalDateString(currentDate ?? tz.now(), tz.timezone),
    [currentDate, tz]
  )
  const todayDateKey = useMemo(
    () => formatLocalDateString(tz.now(), tz.timezone),
    [tz]
  )
  const tomorrowLabel = useMemo(() => {
    try {
      const raw = new Intl.RelativeTimeFormat(tz.locale || "en-US", {
        numeric: "auto",
      }).format(1, "day")
      return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : "Tomorrow"
    } catch {
      return "Tomorrow"
    }
  }, [tz.locale])

  // Sort occurrences chronologically and group by day alongside finance items
  const groupedEvents = useMemo(() => {
    const sorted = [...occurrences].sort((a, b) => {
      const aTime = a.isAllDay
        ? (parseDate(a.startDate, tz.timezone)?.getTime() ?? 0)
        : new Date(a.startTime).getTime()
      const bTime = b.isAllDay
        ? (parseDate(b.startDate, tz.timezone)?.getTime() ?? 0)
        : new Date(b.startTime).getTime()
      return aTime - bTime
    })

    const groups: Array<{
      dateKey: string
      dateObj: Date
      isToday: boolean
      events: EventOccurrence[]
      finItems: CalendarFinanceItem[]
    }> = []

    for (const occ of sorted) {
      let dObj: Date
      let dateKey: string

      if (occ.isAllDay) {
        const effectiveStart =
          currentDateKey &&
          occ.startDate < currentDateKey &&
          occ.endDate &&
          occ.endDate > currentDateKey
            ? currentDateKey
            : occ.startDate
        dObj =
          parseDate(effectiveStart, tz.timezone) ??
          tz.startOfDay(effectiveStart)
        dateKey = effectiveStart
      } else {
        dObj = new Date(occ.startTime)
        const p = tz.parts(dObj)
        dateKey = p
          ? `${String(p.year).padStart(4, "0")}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`
          : occ.startTime.slice(0, 10)
      }

      let group = groups.find((g) => g.dateKey === dateKey)
      if (!group) {
        group = {
          dateKey,
          dateObj: dObj,
          isToday: tz.isToday(occ.isAllDay ? occ.startDate : dObj),
          events: [],
          finItems: [],
        }
        groups.push(group)
      }
      group.events.push(occ)
    }

    for (const fin of financeItems) {
      let group = groups.find((g) => g.dateKey === fin.dateKey)
      if (!group) {
        const dObj =
          parseDate(fin.dateKey, tz.timezone) ?? tz.startOfDay(fin.dateKey)
        group = {
          dateKey: fin.dateKey,
          dateObj: dObj,
          isToday: tz.isToday(fin.dateKey),
          events: [],
          finItems: [],
        }
        groups.push(group)
      }
      group.finItems.push(fin)
    }

    // Only include dates >= currentDateKey (past dates only appear when the user explicitly selects a past date)
    const filteredGroups = currentDateKey
      ? groups.filter((g) => g.dateKey >= currentDateKey)
      : groups

    filteredGroups.sort((a, b) => a.dateKey.localeCompare(b.dateKey))

    return filteredGroups
  }, [occurrences, financeItems, currentDateKey, tz])

  useLayoutEffect(() => {
    const container = scrollContainerRef.current
    lastReportedMonthRef.current = null
    if (container) {
      container.scrollTop = 0
    }
  }, [currentDateKey, resetSeq])

  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container || !onVisibleDateChange) return

    const containerTop = container.getBoundingClientRect().top
    const groupEls = container.querySelectorAll<HTMLElement>("[data-date-key]")
    let visibleDateKey: string | null = null

    for (const el of groupEls) {
      if (el.getBoundingClientRect().bottom > containerTop + 16) {
        visibleDateKey = el.getAttribute("data-date-key")
        break
      }
    }

    if (!visibleDateKey) return
    const [yStr, mStr, dStr] = visibleDateKey.split("-")
    if (!yStr || !mStr || !dStr) return
    const monthKey = `${yStr}-${mStr}`
    if (monthKey === lastReportedMonthRef.current) return

    lastReportedMonthRef.current = monthKey
    const parsed =
      parseDate(visibleDateKey, tz.timezone) ??
      new Date(Date.UTC(Number(yStr), Number(mStr) - 1, Number(dStr), 12, 0, 0))
    onVisibleDateChange(parsed)
  }, [onVisibleDateChange, tz.timezone])

  if (groupedEvents.length === 0) {
    return (
      <div
        data-testid="agenda-view-container"
        className="flex flex-1 flex-col items-center justify-center bg-background p-8 text-center"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Calendar className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="mt-3 text-base font-semibold text-foreground">
          {t("calendar.noScheduledEvents")}
        </h3>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">
          {t("calendar.noUpcomingEventsDescription")}
        </p>
        <Button onClick={onOpenCreateDialog} size="sm" className="mt-4 gap-1.5">
          {t("calendar.scheduleEvent")}
        </Button>
      </div>
    )
  }

  const nowParts = tz.parts(tz.now())

  return (
    <div
      ref={scrollContainerRef}
      onScroll={handleScroll}
      data-testid="agenda-view-container"
      className="relative flex-1 overflow-y-auto bg-background p-4 sm:p-6"
    >
      <div className="mx-auto max-w-3xl space-y-6">
        {groupedEvents.map((group) => {
          const isPastDay = Boolean(
            todayDateKey && group.dateKey < todayDateKey
          )
          const groupParts = tz.parts(group.dateObj)
          const rawWeekday = tz.format(group.dateObj, {
            weekday: "long",
            year: undefined,
            month: undefined,
            day: undefined,
          })
          const weekdayLabel = rawWeekday
            ? rawWeekday.charAt(0).toUpperCase() + rawWeekday.slice(1)
            : ""
          const isTomorrow = !group.isToday && tz.isTomorrow(group.dateObj)
          const isCurrentYear =
            nowParts && groupParts ? groupParts.year === nowParts.year : true
          const rawMonth = tz.format(group.dateObj, {
            month: "short",
            day: undefined,
            year: isCurrentYear ? undefined : "numeric",
          })
          const shortMonthLabel = rawMonth
            ? rawMonth.charAt(0).toUpperCase() + rawMonth.slice(1)
            : ""

          return (
            <div
              key={group.dateKey}
              data-date-key={group.dateKey}
              data-past={isPastDay ? "true" : undefined}
              className={cn(
                "space-y-2 transition-opacity",
                isPastDay && "opacity-60 hover:opacity-90"
              )}
            >
              {/* Date Group Header */}
              <div className="flex items-center gap-3 border-b border-border/50 pb-2">
                <span
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold",
                    group.isToday
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : isPastDay
                        ? "bg-muted/70 text-muted-foreground"
                        : "bg-muted text-foreground"
                  )}
                >
                  {groupParts?.day}
                </span>
                <div className="flex items-baseline gap-2">
                  <span
                    className={cn(
                      "text-sm font-semibold",
                      isPastDay ? "text-muted-foreground" : "text-foreground"
                    )}
                  >
                    {weekdayLabel}
                  </span>
                  {group.isToday ? (
                    <span className="text-xs font-medium text-primary">
                      {t("common.today")}
                    </span>
                  ) : isTomorrow ? (
                    <span className="text-xs text-muted-foreground">
                      {tomorrowLabel}
                    </span>
                  ) : (
                    shortMonthLabel && (
                      <span className="text-xs text-muted-foreground">
                        {shortMonthLabel}
                      </span>
                    )
                  )}
                </div>
              </div>

              {/* Events & Scheduled Bills on this day */}
              {group.events.length === 0 && group.finItems.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/50 bg-card/40 px-4 py-3 text-xs text-muted-foreground">
                  {t("calendar.noScheduledEvents")}
                </div>
              ) : (
                <div className="divide-y divide-border/40 overflow-hidden rounded-xl border border-border/40 bg-card shadow-2xs">
                  {group.finItems.map((fin) => {
                    const isIncome = fin.type === "INCOME"
                    return (
                      <button
                        key={fin.id}
                        type="button"
                        data-testid={`agenda-finance-${fin.id}`}
                        onClick={() =>
                          onSelectFinanceItem?.(fin.scheduledTransaction)
                        }
                        className="flex w-full cursor-pointer items-center justify-between gap-3 p-3.5 text-left transition hover:bg-muted/30"
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <span
                            className={cn(
                              "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border",
                              isIncome
                                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                : "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300"
                            )}
                          >
                            {isIncome ? (
                              <ArrowUpRight className="size-3.5" />
                            ) : (
                              <ArrowDownLeft className="size-3.5" />
                            )}
                          </span>
                          <div className="w-32 shrink-0 text-xs font-medium text-muted-foreground">
                            {isIncome
                              ? t("calendar.payday")
                              : t("calendar.scheduledBill")}
                          </div>
                          <span className="min-w-0 truncate text-sm font-semibold text-foreground">
                            {fin.title}
                          </span>
                        </div>
                        <MoneyAmount
                          cents={fin.amountCents}
                          currency={fin.currency}
                          size="md"
                          className={cn(
                            "shrink-0 font-semibold",
                            isIncome
                              ? "text-emerald-700 dark:text-emerald-300"
                              : "text-rose-700 dark:text-rose-300"
                          )}
                        />
                      </button>
                    )
                  })}
                  {group.events.map((occ) => {
                    const selfAttendee = findSelfAttendee(
                      occ.attendees,
                      selfEmails
                    )
                    const rsvpStatus = selfAttendee?.responseStatus
                    const safeMeetUrl =
                      occ.meetUrl && /^https?:\/\//i.test(occ.meetUrl.trim())
                        ? occ.meetUrl.trim()
                        : ""

                    return (
                      <div
                        key={occ.instanceId || occ.eventId}
                        data-testid={`agenda-event-${occ.instanceId || occ.eventId}`}
                        onClick={(e) =>
                          onSelectOccurrence(occ, e.currentTarget)
                        }
                        onDoubleClick={(e) => {
                          e.stopPropagation()
                          onEditOccurrence?.(occ)
                        }}
                        className="group flex cursor-pointer flex-col justify-between gap-3 p-3.5 transition hover:bg-muted/30 sm:flex-row sm:items-center"
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          {/* Calendar Color Indicator */}
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: occ.color || "#3b82f6" }}
                          />

                          {/* Time Range */}
                          <div className="w-32 shrink-0 text-xs font-medium text-foreground tabular-nums">
                            {occ.isAllDay ? (
                              <span className="text-muted-foreground">
                                {t("calendar.allDay")}
                              </span>
                            ) : (
                              <span>
                                {tz.formatTime(occ.startTime, {
                                  hour: "numeric",
                                  minute: "2-digit",
                                })}{" "}
                                –{" "}
                                {tz.formatTime(occ.endTime, {
                                  hour: "numeric",
                                  minute: "2-digit",
                                })}
                              </span>
                            )}
                          </div>

                          {/* Title & Metadata */}
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <span className="truncate text-sm font-semibold text-foreground">
                              {occ.title || t("calendar.noTitle")}
                            </span>
                            {occ.calendarName && (
                              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                {occ.calendarName}
                              </span>
                            )}
                            {occ.location && (
                              <div className="hidden max-w-xs items-center gap-1 truncate text-xs text-muted-foreground sm:flex">
                                <MapPin className="h-3 w-3 shrink-0" />
                                <span className="truncate">{occ.location}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Actions / Join Meeting / RSVP Badge */}
                        <div className="flex shrink-0 items-center gap-2 self-end sm:self-center">
                          {rsvpStatus &&
                            rsvpStatus !==
                              "ATTENDEE_RESPONSE_STATUS_UNSPECIFIED" && (
                              <div className="text-[11px] font-medium text-muted-foreground">
                                {rsvpStatus ===
                                  "ATTENDEE_RESPONSE_STATUS_ACCEPTED" && (
                                  <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                                    <Check className="h-3 w-3" />{" "}
                                    {t("calendar.accepted")}
                                  </span>
                                )}
                                {rsvpStatus ===
                                  "ATTENDEE_RESPONSE_STATUS_TENTATIVE" && (
                                  <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                                    <HelpCircle className="h-3 w-3" />{" "}
                                    {t("calendar.tentative")}
                                  </span>
                                )}
                                {rsvpStatus ===
                                  "ATTENDEE_RESPONSE_STATUS_DECLINED" && (
                                  <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400">
                                    <X className="h-3 w-3" />{" "}
                                    {t("calendar.declined")}
                                  </span>
                                )}
                              </div>
                            )}

                          {safeMeetUrl && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 gap-1 text-xs"
                              onClick={(e) => {
                                e.stopPropagation()
                                window.open(
                                  safeMeetUrl,
                                  "_blank",
                                  "noopener,noreferrer"
                                )
                              }}
                            >
                              <Video className="h-3 w-3 text-primary" />
                              <span>{t("calendar.join")}</span>
                            </Button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
