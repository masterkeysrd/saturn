import {
  formatDateWithTimezone,
  getStartOfDay,
  getTimezoneParts,
  isSameDayInTimezone,
  parseDate,
} from "../timezone"

const INTERVAL_LABELS: Record<string, string> = {
  DAILY: "Daily",
  INTERVAL_DAILY: "Daily",
  WEEKLY: "Weekly",
  INTERVAL_WEEKLY: "Weekly",
  BIWEEKLY: "Biweekly",
  INTERVAL_BIWEEKLY: "Biweekly",
  MONTHLY: "Monthly",
  INTERVAL_MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  INTERVAL_QUARTERLY: "Quarterly",
  YEARLY: "Yearly",
  INTERVAL_YEARLY: "Yearly",
  ONE_TIME: "One-Time",
  INTERVAL_ONE_TIME: "One-Time",
  UNSPECIFIED: "Monthly",
  INTERVAL_UNSPECIFIED: "Monthly",
  RECURRENCE_INTERVAL_UNSPECIFIED: "Monthly",
}

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Active",
  STATUS_ACTIVE: "Active",
  RECURRING_EXPENSE_STATUS_ACTIVE: "Active",
  RECURRING_TRANSACTION_STATUS_ACTIVE: "Active",
  PAUSED: "Paused",
  STATUS_PAUSED: "Paused",
  RECURRING_EXPENSE_STATUS_PAUSED: "Paused",
  RECURRING_TRANSACTION_STATUS_PAUSED: "Paused",
  ARCHIVED: "Archived",
  STATUS_ARCHIVED: "Archived",
  CANCELLED: "Cancelled",
  STATUS_CANCELLED: "Cancelled",
  COMPLETED: "Completed",
  STATUS_COMPLETED: "Completed",
  PENDING: "Pending",
  STATUS_PENDING: "Pending",
  PAID: "Paid",
  STATUS_PAID: "Paid",
  SKIPPED: "Skipped",
  STATUS_SKIPPED: "Skipped",
  ENDED: "Ended",
  STATUS_ENDED: "Ended",
  CLOSED: "Closed",
  STATUS_CLOSED: "Closed",
  UNSPECIFIED: "Active",
  STATUS_UNSPECIFIED: "Active",
  RECURRING_EXPENSE_STATUS_UNSPECIFIED: "Active",
  RECURRING_TRANSACTION_STATUS_UNSPECIFIED: "Active",
}

export function formatCents(cents: string | number | undefined | null): number {
  if (cents === undefined || cents === null) return 0
  const val = typeof cents === "number" ? cents : parseFloat(cents)
  return isNaN(val) ? 0 : val / 100
}

export function formatAmount(
  cents: string | number | undefined | null,
  currency?: string
): string {
  const amount = formatCents(cents)
  const formatted = amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return currency ? `${formatted} ${currency}` : formatted
}

function normalizeDecimalInput(unsigned: string): string {
  const hasDot = unsigned.includes(".")
  const hasComma = unsigned.includes(",")

  if (hasDot && hasComma) {
    if (unsigned.lastIndexOf(",") > unsigned.lastIndexOf(".")) {
      return unsigned.replace(/\./g, "").replace(",", ".")
    }
    return unsigned.replace(/,/g, "")
  }

  if (hasComma) {
    const commaCount = (unsigned.match(/,/g) || []).length
    if (commaCount > 1) {
      return unsigned.replace(/,/g, "")
    }
    if (/^[1-9]\d{0,2},\d{3}$/.test(unsigned)) {
      return unsigned.replace(",", "")
    }
    return unsigned.replace(",", ".")
  }

  if (hasDot) {
    const dotCount = (unsigned.match(/\./g) || []).length
    if (dotCount > 1) {
      return unsigned.replace(/\./g, "")
    }
  }

  return unsigned
}

export function toCents(
  amountInput: string | number | undefined | null,
  defaultSign?: 1 | -1
): number {
  if (amountInput === undefined || amountInput === null) return 0
  if (typeof amountInput === "number") {
    return isNaN(amountInput) ? 0 : Math.round(amountInput * 100)
  }
  const stripped = amountInput.replace(/[$€£\s]/g, "").trim()
  if (!stripped) return 0

  const isNegative = stripped.startsWith("-")
  const isPositive = stripped.startsWith("+")
  const unsigned = stripped.replace(/^[+-]/, "")
  if (!unsigned) return 0

  const normalized = normalizeDecimalInput(unsigned)
  const raw = parseFloat(normalized)
  if (isNaN(raw)) return 0
  const absCents = Math.round(Math.abs(raw) * 100)
  if (absCents === 0) return 0
  if (isNegative) return -absCents
  if (isPositive) return absCents
  return defaultSign === -1 ? -absCents : absCents
}

export function toCentsString(amountStr: string | number): string {
  return toCents(amountStr).toString()
}

export function formatInterval(interval: string | undefined | null): string {
  if (!interval) return INTERVAL_LABELS.MONTHLY
  const key = interval.trim().toUpperCase()
  if (Object.prototype.hasOwnProperty.call(INTERVAL_LABELS, key)) {
    return INTERVAL_LABELS[key]
  }
  const normalized = key.replace(/_/g, " ").toLowerCase()
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

export function formatNextDueDate(
  dateStr: string | undefined | null,
  timezone: string = "UTC"
): string {
  if (!dateStr) return "N/A"
  const d = parseDate(dateStr, timezone)
  if (!d || d.getFullYear() <= 1970) return "N/A"
  const now = new Date()
  const dParts = getTimezoneParts(d, timezone)
  const nowParts = getTimezoneParts(now, timezone)
  const showYear = dParts && nowParts ? dParts.year !== nowParts.year : true
  return formatDateWithTimezone(d, timezone, {
    month: "short",
    day: "numeric",
    year: showYear ? "numeric" : undefined,
  })
}

const ACTIVE_STATUS_KEYS = new Set([
  "ACTIVE",
  "STATUS_ACTIVE",
  "RECURRING_EXPENSE_STATUS_ACTIVE",
  "RECURRING_TRANSACTION_STATUS_ACTIVE",
  "UNSPECIFIED",
  "STATUS_UNSPECIFIED",
  "RECURRING_EXPENSE_STATUS_UNSPECIFIED",
  "RECURRING_TRANSACTION_STATUS_UNSPECIFIED",
])

export function formatStatus(status: string | undefined | null): string {
  if (!status) return STATUS_LABELS.ACTIVE
  const key = status.trim().toUpperCase()
  if (Object.prototype.hasOwnProperty.call(STATUS_LABELS, key)) {
    return STATUS_LABELS[key]
  }
  const normalized = key.replace(/_/g, " ").toLowerCase()
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

export function isStatusActive(status: string | undefined | null): boolean {
  if (!status) return true
  return ACTIVE_STATUS_KEYS.has(status.trim().toUpperCase())
}

export function formatSourceType(
  sourceType: string | undefined | null
): string {
  if (!sourceType) return "Scheduled Payment"
  const clean = sourceType
    .replace(/^SOURCE_TYPE_/i, "")
    .replace(/_/g, " ")
    .toLowerCase()
  if (!clean || clean === "unspecified") return "Scheduled Payment"
  if (clean === "recurrent expense" || clean === "recurring expense")
    return "Recurring Expense"
  return clean
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

export function getCurrencySymbol(
  currencyCode: string | undefined | null
): string {
  if (!currencyCode) return "$"
  try {
    const formatter = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currencyCode,
      currencyDisplay: "narrowSymbol",
    })
    const parts = formatter.formatToParts(0)
    const symbolPart = parts.find((p) => p.type === "currency")
    return symbolPart?.value || currencyCode
  } catch {
    return currencyCode
  }
}

export function getSectionDateTitle(
  dateStr?: string,
  timezone: string = "UTC"
): string {
  if (!dateStr) return "Older"
  const date = parseDate(dateStr, timezone)
  if (!date) return "Older"

  const now = new Date()
  if (isSameDayInTimezone(date, now, timezone)) return "Today"

  const startOfToday = getStartOfDay(now, timezone)
  const yesterdayInstant = new Date(startOfToday.getTime() - 1000)
  if (isSameDayInTimezone(date, yesterdayInstant, timezone)) return "Yesterday"

  const dateParts = getTimezoneParts(date, timezone)
  const nowParts = getTimezoneParts(now, timezone)
  const showYear =
    dateParts && nowParts ? dateParts.year !== nowParts.year : false

  return formatDateWithTimezone(date, timezone, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: showYear ? "numeric" : undefined,
  })
}

export interface DateGroupedSection<T> {
  title: string
  data: T[]
}

export function groupTransactionsByDate<T extends { transactionDate?: string }>(
  transactions: T[],
  timezone: string = "UTC"
): DateGroupedSection<T>[] {
  const sorted = [...transactions].sort((a, b) => {
    const timeA = a.transactionDate ? new Date(a.transactionDate).getTime() : 0
    const timeB = b.transactionDate ? new Date(b.transactionDate).getTime() : 0
    return timeB - timeA
  })

  const map = new Map<string, T[]>()
  sorted.forEach((tx) => {
    const title = getSectionDateTitle(tx.transactionDate, timezone)
    if (!map.has(title)) {
      map.set(title, [])
    }
    map.get(title)!.push(tx)
  })

  return Array.from(map.entries()).map(([title, items]) => ({
    title,
    data: items,
  }))
}
