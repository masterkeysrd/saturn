import { useMemo } from "react"
import { parseDate, type DateGroupedSection } from "@saturn/core"
import { useI18n } from "../i18n"
import { useTimezone } from "../timezone"

export interface UseDateSectionsOptions {
  /** Fallback title for undated/invalid entries. Defaults to "Older". */
  olderLabel?: string
  /** Title used when a transaction has no date at all. Defaults to olderLabel. */
  undatedLabel?: string
}

/**
 * Groups transactions into date sections with locale-aware titles
 * ("Today", "Yesterday", or a localized weekday/month/day format).
 */
export function useDateSections<T extends { transactionDate?: string }>(
  transactions: T[],
  options?: UseDateSectionsOptions
): DateGroupedSection<T>[] {
  const { t } = useI18n()
  const tz = useTimezone()
  const olderLabel = options?.olderLabel ?? t("finance.transactions.list.older")
  const undatedLabel = options?.undatedLabel ?? olderLabel

  return useMemo(() => {
    const sorted = [...transactions].sort((a, b) => {
      const timeA = a.transactionDate
        ? new Date(a.transactionDate).getTime()
        : 0
      const timeB = b.transactionDate
        ? new Date(b.transactionDate).getTime()
        : 0
      return timeB - timeA
    })

    const map = new Map<string, T[]>()
    const titleOf = (tx: T): string => {
      if (!tx.transactionDate || !parseDate(tx.transactionDate, tz.timezone)) {
        return undatedLabel
      }
      if (tz.isToday(tx.transactionDate)) {
        return t("common.today")
      }
      if (tz.isYesterday(tx.transactionDate)) {
        return t("common.yesterday")
      }
      const parts = tz.parts(tx.transactionDate)
      const nowParts = tz.parts(tz.now())
      const showYear = parts && nowParts ? parts.year !== nowParts.year : false
      const formatted = tz.format(tx.transactionDate, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: showYear ? "numeric" : undefined,
      })
      return formatted
        ? formatted.charAt(0).toUpperCase() + formatted.slice(1)
        : undatedLabel
    }

    sorted.forEach((tx) => {
      const title = titleOf(tx)
      if (!map.has(title)) {
        map.set(title, [])
      }
      map.get(title)!.push(tx)
    })

    return Array.from(map.entries()).map(([title, items]) => ({
      title,
      data: items,
    }))
  }, [transactions, tz, t, olderLabel, undatedLabel])
}
