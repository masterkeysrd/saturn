import { formatLocalDateString } from "@saturn/core"

export function formatTabBadgeCount(
  count: number
): number | string | undefined {
  if (!Number.isFinite(count) || count <= 0) {
    return undefined
  }
  const normalized = Math.floor(count)
  if (normalized <= 0) {
    return undefined
  }
  if (normalized > 99) {
    return "99+"
  }
  return normalized
}

export function sumInboxUnreadCount(
  mailboxes:
    readonly { systemRole?: string; unreadCount?: number }[] | undefined
): number {
  if (!mailboxes || mailboxes.length === 0) {
    return 0
  }
  let total = 0
  for (const mailbox of mailboxes) {
    if (mailbox.systemRole !== "MAILBOX_ROLE_INBOX") {
      continue
    }
    const unread = mailbox.unreadCount
    if (typeof unread === "number" && Number.isFinite(unread) && unread > 0) {
      total += unread
    }
  }
  return total
}

export function countOverdueOrDueTodayScheduled(
  items: readonly { status?: string; dueDate?: string }[] | undefined,
  now: Date,
  timeZone: string
): number {
  if (!items || items.length === 0) {
    return 0
  }
  const todayYmd = formatLocalDateString(now, timeZone)
  if (!todayYmd) {
    return 0
  }
  let count = 0
  for (const item of items) {
    if (item.status !== "PENDING" || !item.dueDate) {
      continue
    }
    const dueYmd = formatLocalDateString(item.dueDate, timeZone)
    if (dueYmd && dueYmd <= todayYmd) {
      count += 1
    }
  }
  return count
}
