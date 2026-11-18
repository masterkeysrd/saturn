import {
  formatCurrencyCents,
  humanizeFieldLabel,
  isCentsFieldKey,
  isDateOnlyLike,
  isEmptyToolParam,
  isIsoTimestampLike,
  isPlainRecord,
  stripCentsSuffix,
} from "@saturn/core"
import type { TimezoneObject } from "@saturn/hooks"

export type TzFormatter = Pick<TimezoneObject, "format">

export function formatToolDateValue(
  value: string,
  tz: TzFormatter,
  options?: Intl.DateTimeFormatOptions
): string {
  const trimmed = value.trim()
  if (!trimmed) return ""
  if (isDateOnlyLike(trimmed)) {
    return tz.format(trimmed, {
      month: "short",
      day: "numeric",
      year: "numeric",
      ...options,
    })
  }
  if (isIsoTimestampLike(trimmed)) {
    return tz.format(trimmed, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      ...options,
    })
  }
  return trimmed
}

export function formatToolTimeRange(
  tz: TzFormatter,
  opts: {
    isAllDay?: boolean
    startTime?: string
    endTime?: string
    startDate?: string
    endDate?: string
  }
): string | undefined {
  if (opts.isAllDay || (opts.startDate && !opts.startTime)) {
    if (!opts.startDate) return undefined
    const start = formatToolDateValue(opts.startDate, tz)
    if (opts.endDate && opts.endDate !== opts.startDate) {
      const end = formatToolDateValue(opts.endDate, tz)
      return `${start} → ${end}`
    }
    return start
  }

  if (opts.startTime) {
    const startFormatted = tz.format(opts.startTime, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
    if (opts.endTime) {
      const sameDay = opts.startTime.slice(0, 10) === opts.endTime.slice(0, 10)
      const endFormatted = tz.format(
        opts.endTime,
        sameDay
          ? { hour: "numeric", minute: "2-digit" }
          : {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            }
      )
      return `${startFormatted} → ${endFormatted}`
    }
    return startFormatted
  }

  return undefined
}

export interface FormattedFieldEntry {
  key: string
  label: string
  displayValue: string
  isMono?: boolean
}

export function formatFieldValue(
  key: string,
  value: unknown,
  tz: TzFormatter,
  siblingRecord?: Record<string, unknown>
): string {
  if (value === null || value === undefined) return "—"
  if (typeof value === "boolean") return value ? "Yes" : "No"
  if (typeof value === "number") {
    if (isCentsFieldKey(key)) {
      const currency =
        typeof siblingRecord?.currency === "string"
          ? siblingRecord.currency
          : undefined
      return formatCurrencyCents(value, currency)
    }
    return value.toLocaleString()
  }
  if (typeof value === "string") {
    if (isDateOnlyLike(value) || isIsoTimestampLike(value)) {
      return formatToolDateValue(value, tz)
    }
    return value
  }
  if (Array.isArray(value)) {
    return value
      .map((item) =>
        typeof item === "string" || typeof item === "number"
          ? String(item)
          : JSON.stringify(item)
      )
      .join(", ")
  }
  if (isPlainRecord(value)) {
    return Object.entries(value)
      .filter(([, v]) => !isEmptyToolParam(v))
      .map(
        ([k, v]) =>
          `${humanizeFieldLabel(k)}: ${formatFieldValue(k, v, tz, value)}`
      )
      .join(" · ")
  }
  return String(value)
}

export function buildReadableFieldEntries(
  record: Record<string, unknown>,
  tz: TzFormatter,
  excludeKeys: Set<string> = new Set()
): FormattedFieldEntry[] {
  const entries: FormattedFieldEntry[] = []
  for (const [key, value] of Object.entries(record)) {
    if (excludeKeys.has(key) || isEmptyToolParam(value)) continue
    const labelKey = isCentsFieldKey(key) ? stripCentsSuffix(key) : key
    const label = humanizeFieldLabel(labelKey)
    const displayValue = formatFieldValue(key, value, tz, record)
    const isId = /(?:^|_)id$/i.test(key) || /Id$/.test(key)
    entries.push({
      key,
      label,
      displayValue,
      isMono: isId,
    })
  }
  return entries
}
