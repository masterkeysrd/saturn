import { useContext, useMemo } from "react"
import { useConnectedAccounts, useTimezone } from "@saturn/hooks"
import { findSelfAttendee, parseDate } from "@saturn/core"
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
  occurrences: EventOccurrence[]
  financeItems?: CalendarFinanceItem[]
  onSelectOccurrence: (
    occ: EventOccurrence,
    anchorEl?: HTMLElement | null
  ) => void
  onEditOccurrence?: (occ: EventOccurrence) => void
  onSelectFinanceItem?: (item: ScheduledTransaction) => void
  onOpenCreateDialog: () => void
}

export function AgendaView({
  occurrences,
  financeItems = [],
  onSelectOccurrence,
  onEditOccurrence,
  onSelectFinanceItem,
  onOpenCreateDialog,
}: AgendaViewProps) {
  const tz = useTimezone()
  const auth = useContext(AuthContext)
  const { data: accountsData } = useConnectedAccounts()
  const selfEmails = useMemo(
    () => [
      auth?.user?.email,
      ...(accountsData?.accounts ?? []).map((a) => a.email),
    ],
    [auth?.user?.email, accountsData?.accounts]
  )

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
        dObj =
          parseDate(occ.startDate, tz.timezone) ?? tz.startOfDay(occ.startDate)
        dateKey = occ.startDate
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

    groups.sort((a, b) => a.dateKey.localeCompare(b.dateKey))

    return groups
  }, [occurrences, financeItems, tz])

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
          No Scheduled Events
        </h3>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">
          There are no upcoming events in this time period. You can create a new
          event or adjust your active calendars.
        </p>
        <Button onClick={onOpenCreateDialog} size="sm" className="mt-4 gap-1.5">
          Schedule Event
        </Button>
      </div>
    )
  }

  return (
    <div
      data-testid="agenda-view-container"
      className="flex-1 overflow-y-auto bg-background p-4 sm:p-6"
    >
      <div className="mx-auto max-w-3xl space-y-6">
        {groupedEvents.map((group) => (
          <div key={group.dateKey} className="space-y-2">
            {/* Date Group Header */}
            <div className="sticky top-0 z-10 flex items-center gap-3 bg-background/95 py-2 backdrop-blur">
              <span
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold",
                  group.isToday
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "bg-muted text-foreground"
                )}
              >
                {tz.parts(group.dateObj)?.day}
              </span>
              <div className="text-sm font-semibold text-foreground">
                {tz.format(group.dateObj, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
                {group.isToday && (
                  <span className="ml-2 text-xs font-normal text-primary">
                    Today
                  </span>
                )}
              </div>
            </div>

            {/* Events & Scheduled Bills on this day */}
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
                        {isIncome ? "Payday" : "Scheduled Bill"}
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
                const selfAttendee = findSelfAttendee(occ.attendees, selfEmails)
                const rsvpStatus = selfAttendee?.responseStatus
                const safeMeetUrl =
                  occ.meetUrl && /^https?:\/\//i.test(occ.meetUrl.trim())
                    ? occ.meetUrl.trim()
                    : ""

                return (
                  <div
                    key={occ.instanceId || occ.eventId}
                    data-testid={`agenda-event-${occ.instanceId || occ.eventId}`}
                    onClick={(e) => onSelectOccurrence(occ, e.currentTarget)}
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
                          <span className="text-muted-foreground">All day</span>
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
                          {occ.title}
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
                                <Check className="h-3 w-3" /> Accepted
                              </span>
                            )}
                            {rsvpStatus ===
                              "ATTENDEE_RESPONSE_STATUS_TENTATIVE" && (
                              <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                                <HelpCircle className="h-3 w-3" /> Tentative
                              </span>
                            )}
                            {rsvpStatus ===
                              "ATTENDEE_RESPONSE_STATUS_DECLINED" && (
                              <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400">
                                <X className="h-3 w-3" /> Declined
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
                          <span>Join</span>
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
