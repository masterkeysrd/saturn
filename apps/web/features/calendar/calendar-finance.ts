import { getScheduledDisplayName, getTimezoneParts } from "@saturn/core"
import type { EventOccurrence } from "@saturn/api/saturn/calendar/v1/calendar"
import type {
  RecurringTransaction,
  RecurringType,
  ScheduledTransaction,
} from "@saturn/api/gen/saturn/finance/v1/finance"

export const CALENDAR_FINANCE_OVERLAY_STORAGE_KEY =
  "saturn:calendar-finance-overlay"

export interface CalendarFinanceItem {
  id: string
  dateKey: string
  title: string
  amountCents: number
  currency: string
  type: RecurringType
  scheduledTransaction: ScheduledTransaction
}

export function readCalendarFinanceOverlayPref(): boolean {
  try {
    return (
      typeof window !== "undefined" &&
      window.localStorage.getItem(CALENDAR_FINANCE_OVERLAY_STORAGE_KEY) ===
        "true"
    )
  } catch {
    return false
  }
}

export function writeCalendarFinanceOverlayPref(enabled: boolean): void {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        CALENDAR_FINANCE_OVERLAY_STORAGE_KEY,
        enabled ? "true" : "false"
      )
    }
  } catch {
    // Ignore storage quota or sandboxed browser errors
  }
}

export function mapScheduledToCalendarFinanceItems(
  scheduled: ScheduledTransaction[],
  recurringTemplates: RecurringTransaction[],
  timezone: string
): CalendarFinanceItem[] {
  const items: CalendarFinanceItem[] = []
  for (const item of scheduled) {
    if (!item.dueDate) continue
    const parts = getTimezoneParts(item.dueDate, timezone)
    const dateKey = parts
      ? `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`
      : item.dueDate.slice(0, 10)
    if (!dateKey) continue

    items.push({
      id: item.id || `${item.sourceId}-${dateKey}`,
      dateKey,
      title: getScheduledDisplayName(item, recurringTemplates),
      amountCents: Number(item.amount || 0),
      currency: item.currency || "USD",
      type: item.type,
      scheduledTransaction: item,
    })
  }
  return items
}

export interface DuplicateEventDraft {
  calendarId: string
  title: string
  description: string
  location: string
  isAllDay: boolean
  startDate: string
  endDate: string
  startTime: string
  endTime: string
  timezone: string
  meetUrl: string
}

export function extractOccurrenceDuplicateDraft(
  occ: EventOccurrence,
  fallbackTimezone: string
): DuplicateEventDraft {
  const targetTz = occ.timezone || fallbackTimezone || "UTC"
  if (occ.isAllDay) {
    const startDate = occ.startDate || ""
    const endDate =
      occ.endDate && occ.endDate >= startDate ? occ.endDate : startDate
    return {
      calendarId: occ.calendarId || "",
      title: occ.title || "",
      description: occ.description || "",
      location: occ.location || "",
      isAllDay: true,
      startDate,
      endDate,
      startTime: "09:00",
      endTime: "10:00",
      timezone: targetTz,
      meetUrl: occ.meetUrl || "",
    }
  }

  const sParts = occ.startTime
    ? getTimezoneParts(occ.startTime, targetTz)
    : undefined
  const eParts = occ.endTime
    ? getTimezoneParts(occ.endTime, targetTz)
    : undefined

  const startDate = sParts
    ? `${String(sParts.year).padStart(4, "0")}-${String(sParts.month).padStart(2, "0")}-${String(sParts.day).padStart(2, "0")}`
    : ""
  const endDate = eParts
    ? `${String(eParts.year).padStart(4, "0")}-${String(eParts.month).padStart(2, "0")}-${String(eParts.day).padStart(2, "0")}`
    : startDate

  const startTime = sParts
    ? `${String(sParts.hour).padStart(2, "0")}:${String(sParts.minute).padStart(2, "0")}`
    : "09:00"
  const endTime = eParts
    ? `${String(eParts.hour).padStart(2, "0")}:${String(eParts.minute).padStart(2, "0")}`
    : "10:00"

  return {
    calendarId: occ.calendarId || "",
    title: occ.title || "",
    description: occ.description || "",
    location: occ.location || "",
    isAllDay: false,
    startDate,
    endDate,
    startTime,
    endTime,
    timezone: targetTz,
    meetUrl: occ.meetUrl || "",
  }
}

export function isRecurringOccurrence(occ: EventOccurrence): boolean {
  const ext = occ as EventOccurrence & {
    recurringEventId?: string
    rrule?: string
  }
  return Boolean(occ.masterId || ext.recurringEventId || ext.rrule)
}
