import { useMemo } from "react"
import { Link } from "react-router-dom"
import { Archive, ArrowRight, Mail, Star } from "lucide-react"
import { formatThreadParticipants, parseDate } from "@saturn/core"
import { getLocalizedDashboardWidgetMeta } from "@saturn/i18n"
import {
  useConnectedAccounts,
  useI18n,
  useInfiniteMailThreads,
  useMailboxes,
  useModifyThread,
  useTimezone,
} from "@saturn/hooks"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useActiveSpaceContext } from "@/features/space/use-space"
import { cn } from "@/lib/utils"
import { DashboardWidgetCard } from "./widget-shell"

export function PriorityMailWidget() {
  const { spaceId } = useActiveSpaceContext()
  const tz = useTimezone()
  const { locale, language } = useI18n()
  const isEs = language === "es"
  const widgetMeta = getLocalizedDashboardWidgetMeta("priority_mail", locale)

  const { data: accountsData, isLoading: accountsLoading } =
    useConnectedAccounts({ spaceId }, { enabled: Boolean(spaceId) })

  const mailAccounts = useMemo(
    () =>
      (accountsData?.accounts ?? []).filter(
        (a) =>
          a.enabledCapabilities?.includes("mail") ||
          a.enabledCapabilities?.includes("MAIL")
      ),
    [accountsData?.accounts]
  )

  const hasMailAccount = mailAccounts.length > 0

  const selfEmails = useMemo(
    () => mailAccounts.map((a) => a.email).filter(Boolean) as string[],
    [mailAccounts]
  )

  const { data: mailboxesData } = useMailboxes(undefined, {
    enabled: Boolean(spaceId) && hasMailAccount,
  })

  const { data: threadsPages, isLoading: threadsLoading } =
    useInfiniteMailThreads({
      systemBucket: "MAILBOX_ROLE_INBOX",
      pageSize: 10,
    })

  const modifyThread = useModifyThread()

  const threads = useMemo(() => {
    const all = threadsPages?.pages.flatMap((p) => p.threads ?? []) ?? []
    return [...all].sort((a, b) => {
      const aScore = (a.isUnread ? 2 : 0) + (a.isStarred ? 1 : 0)
      const bScore = (b.isUnread ? 2 : 0) + (b.isStarred ? 1 : 0)
      if (aScore !== bScore) return bScore - aScore
      const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0
      const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0
      return bTime - aTime
    })
  }, [threadsPages?.pages])

  const unreadCount = useMemo(() => {
    let inboxUnread = 0
    for (const mbx of mailboxesData?.mailboxes ?? []) {
      if (mbx.systemRole === "MAILBOX_ROLE_INBOX") {
        inboxUnread += mbx.unreadCount || 0
      }
    }
    const visibleUnread = threads.filter((t) => t.isUnread).length
    return Math.max(inboxUnread, visibleUnread)
  }, [mailboxesData?.mailboxes, threads])

  const formatThreadTime = (dateStr?: string) => {
    if (!dateStr) return ""
    const parsed = parseDate(dateStr, tz.timezone)
    if (!parsed) return ""
    if (tz.isToday(parsed)) return tz.formatTime(parsed)
    if (tz.isYesterday(parsed)) return "Yesterday"
    return tz.formatDate(parsed, { month: "short", day: "numeric" })
  }

  const isLoading = accountsLoading || (hasMailAccount && threadsLoading)
  const visibleThreads = threads.slice(0, 4)

  return (
    <DashboardWidgetCard
      title={widgetMeta.title}
      icon={Mail}
      badge={
        hasMailAccount && !isLoading ? (
          <Badge variant={unreadCount > 0 ? "info" : "neutral"}>
            {unreadCount} {isEs ? "sin leer" : "unread"}
          </Badge>
        ) : undefined
      }
      aiPrompt={
        hasMailAccount
          ? "Summarize my unread and priority emails and list any required follow-ups"
          : undefined
      }
      viewAllTo={spaceId ? `/space/${spaceId}/mail` : undefined}
      viewAllLabel={isEs ? "Bandeja" : "Inbox"}
      isLoading={isLoading}
      loadingSkeleton={
        <div className="space-y-2.5">
          <Skeleton className="h-11 w-full rounded-lg" />
          <Skeleton className="h-11 w-full rounded-lg" />
          <Skeleton className="h-11 w-full rounded-lg" />
        </div>
      }
    >
      {!hasMailAccount ? (
        <div className="flex flex-1 flex-col justify-center gap-3 py-2">
          <div className="flex items-start gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Mail className="size-4" />
            </div>
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm font-medium text-foreground">
                {isEs
                  ? "Sin cuenta de correo conectada"
                  : "No email account connected"}
              </p>
              <p className="text-xs text-muted-foreground">
                {isEs
                  ? "Conecta Gmail o Google Workspace para gestionar tu correo aquí."
                  : "Connect Gmail or Google Workspace to triage mail here."}
              </p>
            </div>
          </div>
          <div>
            <Link
              to="/settings/connected-accounts"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              {isEs ? "Conectar cuenta" : "Connect account"}
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>
      ) : visibleThreads.length === 0 ? (
        <div className="flex flex-1 flex-col justify-center gap-2 py-2">
          <div className="flex items-start gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Mail className="size-4" />
            </div>
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm font-medium text-foreground">
                {isEs ? "Bandeja al día" : "Inbox Zero"}
              </p>
              <p className="text-xs text-muted-foreground">
                {widgetMeta.empty}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="divide-y divide-border/50">
          {visibleThreads.map((thread) => {
            const sender = formatThreadParticipants({
              participants: thread.participants,
              selfEmails,
            })
            return (
              <div
                key={thread.id}
                className="group flex items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0"
              >
                <Link
                  to={`/space/${spaceId}/mail?threadId=${encodeURIComponent(thread.id || "")}`}
                  className="min-w-0 flex-1 space-y-0.5"
                >
                  <div className="flex items-center gap-1.5">
                    {thread.isUnread && (
                      <span
                        aria-hidden="true"
                        className="size-1.5 shrink-0 rounded-full bg-primary"
                      />
                    )}
                    {thread.isStarred && (
                      <Star className="size-3 shrink-0 fill-amber-500 text-amber-500" />
                    )}
                    <span
                      className={cn(
                        "truncate text-xs",
                        thread.isUnread
                          ? "font-semibold text-foreground"
                          : "font-medium text-muted-foreground"
                      )}
                    >
                      {sender || "Unknown sender"}
                    </span>
                    <span className="ml-auto shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
                      {formatThreadTime(thread.lastMessageAt)}
                    </span>
                  </div>
                  <p className="truncate text-sm font-medium text-foreground">
                    {thread.subject || "(No subject)"}
                  </p>
                </Link>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Archive ${thread.subject || "thread"}`}
                  onClick={() => {
                    if (!thread.id) return
                    modifyThread.mutate({
                      id: thread.id,
                      req: { id: thread.id, inInbox: false },
                    })
                  }}
                  className="shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
                >
                  <Archive className="size-3.5" />
                </Button>
              </div>
            )
          })}
        </div>
      )}
    </DashboardWidgetCard>
  )
}
