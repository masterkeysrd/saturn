import { useMemo } from "react"
import { useMailboxes } from "@saturn/hooks"

export function MailUnreadBadge() {
  const { data } = useMailboxes()

  const unreadCount = useMemo(() => {
    if (!data?.mailboxes) return 0
    return data.mailboxes
      .filter((mb) => mb.systemRole === "MAILBOX_ROLE_INBOX")
      .reduce((acc, mb) => acc + (mb.unreadCount || 0), 0)
  }, [data])

  if (!unreadCount || unreadCount <= 0) return null

  return (
    <span
      data-testid="mail-unread-badge"
      className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary/15 px-1 text-[10px] font-bold text-primary tabular-nums"
    >
      {unreadCount > 99 ? "99+" : unreadCount}
    </span>
  )
}
