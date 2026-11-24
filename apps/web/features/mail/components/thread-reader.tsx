import { useState, useMemo, useCallback, useEffect, useRef } from "react"
import {
  Archive,
  Trash2,
  Star,
  Mail,
  Reply,
  ReplyAll,
  Forward,
  MoreHorizontal,
  Printer,
  Copy,
  CalendarPlus,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  ChevronsUpDown,
  ChevronsDownUp,
  RefreshCw,
  AlertCircle,
  Image as ImageIcon,
  Sparkles,
  MessageSquareShare,
  Paperclip,
  ArrowLeft,
  Receipt,
} from "lucide-react"
import { openAIDrawer } from "@/features/ai/lib/drawer-events"
import { CopilotAttachButton } from "@/features/ai/components/copilot-attach-button"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "@/components/ui/toast"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import {
  useTimezone,
  useConnectedAccounts,
  useMailThread,
  useSummarizeMailThread,
  useI18n,
} from "@saturn/hooks"
import {
  buildCopilotEntityKey,
  normalizeReplySubject,
  normalizeForwardSubject,
  computeReplyRecipients,
  buildQuotedReplyHtml,
  buildForwardedMessageHtml,
  computeHumanizedMailTimestamp,
  partitionThreadMessagesForSuperCollapse,
  type HumanizedMailTimestamp,
} from "@saturn/core"
import type { TranslationKey } from "@saturn/i18n"
import type {
  Thread,
  Message,
  Draft,
  Attachment,
} from "@saturn/api/saturn/mail/v1/mail"
import { SandboxedEmailFrame } from "./sandboxed-email-frame"
import { AttachmentList } from "./attachment-list"
import { MailComposer } from "./mail-composer"
import { SenderAvatar } from "./sender-avatar"
import { hasFinancialSignal } from "../mail-utils"
import { cn } from "@/lib/utils"
import { useMailRemoteContentPreference } from "@/features/space/use-space"

function translateHumanizedMailTimestamp(
  stamp: HumanizedMailTimestamp,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
): string {
  switch (stamp.kind) {
    case "just_now":
      return t("mail.threadTime.justNow")
    case "minutes_ago":
      return t("mail.threadTime.minutesAgo", { count: stamp.count })
    case "hours_ago":
      return stamp.count === 1
        ? t("mail.threadTime.hourAgo")
        : t("mail.threadTime.hoursAgo", { count: stamp.count })
    case "today":
      return t("common.today")
    case "yesterday":
      return t("common.yesterday")
    case "days_ago":
      return t("mail.threadTime.daysAgo", { count: stamp.count })
    case "date_dmy":
      return stamp.formatted
  }
}

export interface ThreadReaderProps {
  threadId?: string
  initialThread?: Thread
  replyTrigger?: { threadId: string; seq: number } | null
  showBackButton?: boolean
  onBack?: () => void
  borderless?: boolean
  onArchive: (thread: Thread) => void
  onTrash: (thread: Thread) => void
  onToggleStar: (thread: Thread) => void
  onToggleRead: (thread: Thread) => void
  onCreateEvent: (eventData: {
    title: string
    description: string
    sourceMailMessageId: string
    attendees: Array<{ email: string; displayName?: string }>
  }) => void
  onStageToFinance?: (thread: Thread, message?: Message) => void
  onSendReply: (data: {
    id?: string
    connectedAccountId: string
    to: Array<{ email: string; displayName?: string }>
    cc: Array<{ email: string; displayName?: string }>
    bcc: Array<{ email: string; displayName?: string }>
    subject: string
    bodyHtml: string
    bodyText: string
    threadId?: string
    replyToMessageId?: string
    attachments?: Attachment[]
  }) => Promise<void>
  onSaveDraft?: (draft: Partial<Draft>) => Promise<Draft | undefined>
  onDiscardDraft?: (draftId: string) => Promise<void> | void
}

export function ThreadReader({
  threadId,
  initialThread,
  replyTrigger,
  showBackButton = false,
  onBack,
  borderless = false,
  onArchive,
  onTrash,
  onToggleStar,
  onToggleRead,
  onCreateEvent,
  onStageToFinance,
  onSendReply,
  onSaveDraft,
  onDiscardDraft,
}: ThreadReaderProps) {
  const tz = useTimezone()
  const { t, language } = useI18n()
  const { data: accountsData } = useConnectedAccounts()
  const accounts = useMemo(() => accountsData?.accounts || [], [accountsData])

  // Fetch full thread details (messages + bodies)
  const {
    data: fetchedThread,
    isLoading: threadLoading,
    isError: threadError,
    refetch: refetchThread,
  } = useMailThread(threadId)
  const thread = fetchedThread || initialThread

  const summarizeMutation = useSummarizeMailThread({
    onError: () => {
      toast.add({ title: t("mail.summary.failed"), type: "error" })
    },
  })
  const [isSummaryCollapsed, setIsSummaryCollapsed] = useState(false)

  const account = useMemo(() => {
    return accounts.find((a) => a.id === thread?.connectedAccountId)
  }, [accounts, thread?.connectedAccountId])

  // Global auto-load images preference
  const { autoLoadRemoteContent: autoLoadImages, setAutoLoadRemoteContent } =
    useMailRemoteContentPreference()

  const handleToggleGlobalAutoLoadImages = () => {
    const next = !autoLoadImages
    void setAutoLoadRemoteContent(next)
      .then(() => {
        toast.add({
          type: "success",
          title: next
            ? t("mail.autoLoadEnabledToast")
            : t("mail.autoLoadDisabledToast"),
        })
      })
      .catch(() => {
        toast.add({
          type: "error",
          title: t("mail.autoLoadUpdateFailed"),
        })
      })
  }

  // Track user overrides for expanded/collapsed messages (reset automatically via key on threadId change)
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set())
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [isMiddleUnfolded, setIsMiddleUnfolded] = useState(false)

  const messages = useMemo(() => thread?.messages || [], [thread?.messages])

  // Drafts must never be hidden behind the super-collapse deck
  const partitionInput = useMemo(
    () =>
      messages.map((m) =>
        m.isDraft && !m.isUnread ? { ...m, isUnread: true } : m
      ),
    [messages]
  )

  const messageSegments = useMemo(
    () =>
      partitionThreadMessagesForSuperCollapse(partitionInput, isMiddleUnfolded),
    [partitionInput, isMiddleUnfolded]
  )

  const humanizedTimeText = useCallback(
    (date: string | undefined): string => {
      if (!date) return ""
      const stamp = computeHumanizedMailTimestamp(date, {
        now: tz.now(),
        timeZone: tz.timezone,
      })
      if (!stamp) return ""
      return translateHumanizedMailTimestamp(stamp, t)
    },
    [t, tz]
  )

  const isMessageExpanded = useCallback(
    (msg: Message, index: number) => {
      if (collapsedIds.has(msg.id)) return false
      if (expandedIds.has(msg.id)) return true
      // In short threads (<= 3 messages), expand all by default for immediate context
      if (messages.length <= 3) return true
      // In longer threads, expand only the latest message and unread messages
      return index === messages.length - 1 || msg.isUnread
    },
    [collapsedIds, expandedIds, messages.length]
  )

  const toggleMessageExpanded = (msgId: string, currentlyExpanded: boolean) => {
    if (currentlyExpanded) {
      setCollapsedIds((prev) => new Set(prev).add(msgId))
      setExpandedIds((prev) => {
        const next = new Set(prev)
        next.delete(msgId)
        return next
      })
    } else {
      setExpandedIds((prev) => new Set(prev).add(msgId))
      setCollapsedIds((prev) => {
        const next = new Set(prev)
        next.delete(msgId)
        return next
      })
    }
  }

  // Check if all messages in the thread are currently expanded
  const areAllExpanded = useMemo(() => {
    if (messages.length === 0) return true
    return messages.every((msg, idx) => isMessageExpanded(msg, idx))
  }, [messages, isMessageExpanded])

  const handleToggleExpandAll = () => {
    if (areAllExpanded) {
      // Collapse all except the latest message
      const toCollapse = new Set(messages.slice(0, -1).map((m) => m.id))
      setCollapsedIds(toCollapse)
      const lastMsgId = messages[messages.length - 1]?.id
      setExpandedIds(new Set(lastMsgId ? [lastMsgId] : []))
      setIsMiddleUnfolded(false)
    } else {
      // Expand all messages
      setCollapsedIds(new Set())
      setExpandedIds(new Set(messages.map((m) => m.id)))
      setIsMiddleUnfolded(true)
    }
  }

  // Reply & Forward Composer state
  const [showReplyComposer, setShowReplyComposer] = useState(false)
  const [replyType, setReplyType] = useState<"reply" | "reply-all" | "forward">(
    "reply"
  )
  const [replyTargetMessage, setReplyTargetMessage] = useState<
    Message | undefined
  >()
  const replyComposerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showReplyComposer) return
    const raf = requestAnimationFrame(() => {
      replyComposerRef.current?.scrollIntoView?.({
        behavior: "smooth",
        block: "start",
      })
    })
    return () => cancelAnimationFrame(raf)
  }, [showReplyComposer, replyType, replyTargetMessage?.id])

  const handleStartReply = (
    type: "reply" | "reply-all" | "forward",
    targetMsg?: Message
  ) => {
    const msg = targetMsg || messages[messages.length - 1]
    setReplyType(type)
    setReplyTargetMessage(msg)
    setShowReplyComposer(true)
  }

  const lastHandledReplySeqRef = useRef<number>(0)
  useEffect(() => {
    if (
      !replyTrigger ||
      replyTrigger.seq <= lastHandledReplySeqRef.current ||
      !thread ||
      replyTrigger.threadId !== thread.id ||
      messages.length === 0
    ) {
      return
    }
    lastHandledReplySeqRef.current = replyTrigger.seq
    const msg = messages[messages.length - 1]
    setReplyType("reply")
    setReplyTargetMessage(msg)
    setShowReplyComposer(true)
  }, [replyTrigger, thread, messages])

  // Compute recipient list for reply/forward
  const replyRecipients = useMemo(() => {
    if (!replyTargetMessage) return { to: [], cc: [] }
    if (replyType === "forward") {
      return { to: [], cc: [] }
    }
    const selfEmails = account?.email ? [account.email] : []

    const fromPart = {
      email: replyTargetMessage.from?.email || "",
      displayName: replyTargetMessage.from?.name || "",
    }
    const toParts = (replyTargetMessage.to || []).map((p) => ({
      email: p.email,
      displayName: p.name,
    }))
    const ccParts = (replyTargetMessage.cc || []).map((p) => ({
      email: p.email,
      displayName: p.name,
    }))
    const replyToParts = (replyTargetMessage.replyTo || []).map((p) => ({
      email: p.email,
      displayName: p.name,
    }))

    return computeReplyRecipients({
      replyType,
      from: fromPart,
      to: toParts,
      cc: ccParts,
      replyTo: replyToParts,
      selfEmails,
    })
  }, [replyTargetMessage, replyType, account])

  // Quoted reply HTML
  const quotedReplyHtml = useMemo(() => {
    if (!replyTargetMessage) return ""
    return buildQuotedReplyHtml({
      from: {
        email: replyTargetMessage.from?.email || "",
        displayName: replyTargetMessage.from?.name || "",
      },
      sentAt: replyTargetMessage.sentAt,
      bodyHtml: replyTargetMessage.bodyHtml,
      bodyText: replyTargetMessage.bodyPlain,
      preserveStyles: true,
      attachments: replyTargetMessage.attachments,
    })
  }, [replyTargetMessage])

  // Forwarded message HTML
  const forwardedMessageHtml = useMemo(() => {
    if (!replyTargetMessage) return ""
    return buildForwardedMessageHtml({
      from: {
        email: replyTargetMessage.from?.email || "",
        displayName: replyTargetMessage.from?.name || "",
      },
      to: (replyTargetMessage.to || []).map((p) => ({
        email: p.email,
        displayName: p.name,
      })),
      cc: (replyTargetMessage.cc || []).map((p) => ({
        email: p.email,
        displayName: p.name,
      })),
      subject: replyTargetMessage.subject || thread?.subject || "",
      sentAt: replyTargetMessage.sentAt,
      bodyHtml: replyTargetMessage.bodyHtml,
      bodyText: replyTargetMessage.bodyPlain,
      preserveStyles: true,
      attachments: replyTargetMessage.attachments,
    })
  }, [replyTargetMessage, thread])

  // "Create Calendar Event" handoff
  const handleCreateCalendarEvent = () => {
    if (!thread) return
    const latestMsg = messages[messages.length - 1]

    const attendees: Array<{ email: string; displayName?: string }> = []
    if (latestMsg?.from?.email) {
      attendees.push({
        email: latestMsg.from.email,
        displayName: latestMsg.from.name,
      })
    }
    if (latestMsg?.to) {
      for (const p of latestMsg.to) {
        if (p.email && !attendees.some((a) => a.email === p.email)) {
          attendees.push({ email: p.email, displayName: p.name })
        }
      }
    }

    onCreateEvent({
      title: thread.subject || t("mail.meetingFromEmail"),
      description: `Created from email thread: ${thread.subject}\nSnippet: ${thread.snippet}`,
      sourceMailMessageId: latestMsg?.id || "",
      attendees,
    })
  }

  if (!threadId) {
    return (
      <div
        data-testid="thread-reader-empty"
        className="flex flex-1 flex-col items-center justify-center border-l border-border/40 bg-muted/15 p-8 text-center text-xs text-muted-foreground select-none"
      >
        <Mail className="mb-3 h-10 w-10 text-muted-foreground/40" />
        <p className="font-semibold text-foreground">
          {t("mail.noConversationSelected")}
        </p>
        <p className="mt-1 text-muted-foreground">
          {t("mail.selectThreadDescription")}
        </p>
      </div>
    )
  }

  if (
    threadLoading &&
    !fetchedThread &&
    (!initialThread?.messages || initialThread.messages.length === 0)
  ) {
    return (
      <div
        data-testid="thread-reader-loading"
        className="flex flex-1 flex-col items-center justify-center border-l border-border/40 bg-muted/15 p-8 text-center text-xs text-muted-foreground select-none"
      >
        <RefreshCw className="mb-3 h-6 w-6 animate-spin text-primary" />
        <p className="font-medium text-foreground">
          {t("mail.loadingConversation")}
        </p>
      </div>
    )
  }

  if (
    threadError &&
    !fetchedThread &&
    (!initialThread?.messages || initialThread.messages.length === 0)
  ) {
    return (
      <div
        data-testid="thread-reader-error"
        className="flex flex-1 flex-col items-center justify-center border-l border-border/40 bg-muted/15 p-8 text-center text-xs text-muted-foreground select-none"
      >
        <AlertCircle className="mb-3 h-8 w-8 text-destructive" />
        <p className="font-semibold text-foreground">
          {t("mail.couldNotLoad")}
        </p>
        <p className="mt-1 max-w-sm text-muted-foreground">
          {t("mail.couldNotLoadDescription")}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetchThread()}
          className="mt-4 gap-1.5 border-border/60 bg-background text-xs text-foreground hover:bg-muted"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>{t("common.retry")}</span>
        </Button>
      </div>
    )
  }

  if (!thread) {
    return (
      <div
        data-testid="thread-reader-empty"
        className="flex flex-1 flex-col items-center justify-center border-l border-border/40 bg-muted/15 p-8 text-center text-xs text-muted-foreground select-none"
      >
        <Mail className="mb-3 h-10 w-10 text-muted-foreground/40" />
        <p className="font-semibold text-foreground">
          {t("mail.noConversationSelected")}
        </p>
        <p className="mt-1 text-muted-foreground">
          {t("mail.selectThreadDescription")}
        </p>
      </div>
    )
  }

  const showStageReceiptChip = Boolean(
    onStageToFinance &&
    thread &&
    hasFinancialSignal(
      thread.subject,
      messages[messages.length - 1]?.snippet || thread.snippet
    )
  )

  return (
    <div
      data-testid="thread-reader-pane"
      className={cn(
        "flex min-w-0 flex-1 flex-col overflow-hidden bg-muted/15 text-foreground",
        !borderless && "border-l border-border/40"
      )}
    >
      {/* Thread Header Toolbar */}
      <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border/40 bg-card/60 px-4 backdrop-blur sm:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          {showBackButton && onBack && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-testid="thread-reader-back-btn"
              onClick={onBack}
              className="h-8 shrink-0 gap-1 px-2 text-xs font-medium text-foreground hover:bg-muted"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>{t("common.back")}</span>
            </Button>
          )}
          {account && (
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: account.color || "#3b82f6" }}
              title={account.displayName || account.email}
            />
          )}
          <h2
            data-testid="thread-subject-heading"
            className="truncate text-base font-semibold tracking-tight text-foreground sm:text-lg"
          >
            {thread.subject || t("mail.noSubject")}
          </h2>
        </div>

        {/* Action Buttons */}
        <div className="flex shrink-0 items-center gap-1">
          {thread.id && (
            <CopilotAttachButton
              size="sm"
              item={{
                key: buildCopilotEntityKey("mail_thread", thread.id),
                kind: "mail_thread",
                id: thread.id,
                label: thread.subject || t("mail.noSubject"),
                summary: {
                  isUnread: Boolean(thread.isUnread),
                  messageCount: thread.messageCount,
                },
              }}
            />
          )}
          <Button
            variant="ghost"
            size="sm"
            data-testid="summarize-thread-btn"
            onClick={() => {
              if (isSummaryCollapsed) setIsSummaryCollapsed(false)
              if (!thread.summary) {
                summarizeMutation.mutate({
                  id: thread.id,
                  forceRegenerate: false,
                  language,
                })
              } else if (thread.summary.isStale) {
                summarizeMutation.mutate({
                  id: thread.id,
                  forceRegenerate: true,
                  language,
                })
              }
            }}
            title={t("mail.summarizeThread")}
            className="h-8 cursor-pointer gap-1.5 rounded-full px-2.5 text-xs text-primary hover:bg-primary/10"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span className="hidden md:inline">{t("mail.summarize")}</span>
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            data-testid="archive-thread-btn"
            onClick={() => onArchive(thread)}
            title={t("mail.archiveShortcut")}
            className="h-8 w-8 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Archive className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            data-testid="trash-thread-btn"
            onClick={() => onTrash(thread)}
            title={t("mail.deleteShortcut")}
            className="h-8 w-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            data-testid="star-thread-btn"
            onClick={() => onToggleStar(thread)}
            title={t("mail.starShortcut")}
            className="h-8 w-8 text-muted-foreground hover:bg-muted hover:text-amber-500"
          >
            <Star
              className={cn(
                "h-4 w-4",
                thread.isStarred && "fill-amber-400 text-amber-500"
              )}
            />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            data-testid="mark-unread-btn"
            onClick={() => onToggleRead(thread)}
            title={t("mail.markUnreadShortcut")}
            className="h-8 w-8 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Mail className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            data-testid="toggle-auto-load-images-btn"
            onClick={handleToggleGlobalAutoLoadImages}
            title={
              autoLoadImages
                ? t("mail.imagesAutoLoadedTitle")
                : t("mail.imagesBlockedTitle")
            }
            className={cn(
              "h-8 w-8 text-muted-foreground hover:bg-muted hover:text-foreground",
              autoLoadImages && "text-primary hover:text-primary"
            )}
          >
            <ImageIcon className="h-4 w-4" />
          </Button>
          {messages.length > 1 && (
            <Button
              variant="ghost"
              size="icon-sm"
              data-testid="toggle-expand-all-btn"
              onClick={handleToggleExpandAll}
              title={
                areAllExpanded
                  ? t("mail.collapseOlderMessages")
                  : t("mail.expandAllMessages")
              }
              className="h-8 w-8 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {areAllExpanded ? (
                <ChevronsDownUp className="h-4 w-4" />
              ) : (
                <ChevronsUpDown className="h-4 w-4" />
              )}
            </Button>
          )}
          <div className="mx-1 h-4 w-px bg-border/60" />
          {showStageReceiptChip && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="stage-receipt-chip-btn"
              onClick={() => onStageToFinance?.(thread)}
              className="h-8 gap-1.5 border-primary/30 bg-primary/5 px-2.5 text-xs font-medium text-primary hover:bg-primary/10"
              title={t("mail.stageReceipt")}
            >
              <Receipt className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">
                {t("mail.stageReceiptShort")}
              </span>
            </Button>
          )}
          {/* Create Calendar Event from Email Button */}
          <Button
            variant="outline"
            size="sm"
            data-testid="create-calendar-event-btn"
            onClick={handleCreateCalendarEvent}
            className="h-8 gap-1.5 border-border/60 bg-background px-2.5 text-xs font-medium text-foreground hover:bg-muted"
            title={t("mail.createEvent")}
          >
            <CalendarPlus className="h-3.5 w-3.5 text-primary" />
            <span className="hidden sm:inline">
              {t("mail.createEventShort")}
            </span>
          </Button>
        </div>
      </div>

      {/* In-Place AI Summary Card */}
      {(Boolean(thread.summary) || summarizeMutation.isPending) && (
        <div
          data-testid="thread-summary-card"
          className="mx-auto mt-4 w-full max-w-4xl rounded-xl border border-brand-secondary/25 bg-brand-secondary/5 px-4 py-3"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-brand-secondary" />
              <span className="text-xs font-semibold text-foreground">
                {t("mail.summary.title")}
              </span>
              {thread.summary?.isStale && !summarizeMutation.isPending && (
                <>
                  <span className="shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                    {t("mail.summary.staleBadge")}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    data-testid="summary-update-btn"
                    onClick={() =>
                      summarizeMutation.mutate({
                        id: thread.id,
                        forceRegenerate: true,
                        language,
                      })
                    }
                    className="h-6 px-2 text-[11px] font-medium text-amber-600 hover:bg-amber-500/10 hover:text-amber-600 dark:text-amber-400"
                  >
                    {t("mail.summary.updateSummary")}
                  </Button>
                </>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon-xs"
                data-testid="summary-regenerate-btn"
                title={t("mail.summary.regenerate")}
                aria-label={t("mail.summary.regenerate")}
                onClick={() =>
                  summarizeMutation.mutate({
                    id: thread.id,
                    forceRegenerate: true,
                    language,
                  })
                }
                className="text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <RefreshCw
                  className={cn(
                    "h-3.5 w-3.5",
                    summarizeMutation.isPending && "animate-spin"
                  )}
                />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                data-testid="summary-ask-copilot-btn"
                title={t("mail.summary.askCopilot")}
                aria-label={t("mail.summary.askCopilot")}
                onClick={() =>
                  openAIDrawer({
                    prompt: t("mail.summarizePrompt", {
                      subject: thread.subject || t("mail.noSubject"),
                      id: thread.id,
                    }),
                    autoSend: false,
                  })
                }
                className="text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <MessageSquareShare className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                data-testid="summary-toggle-btn"
                title={
                  isSummaryCollapsed
                    ? t("mail.summary.expand")
                    : t("mail.summary.collapse")
                }
                aria-label={
                  isSummaryCollapsed
                    ? t("mail.summary.expand")
                    : t("mail.summary.collapse")
                }
                onClick={() => setIsSummaryCollapsed((prev) => !prev)}
                className="text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {isSummaryCollapsed ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronUp className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          </div>

          {summarizeMutation.isPending && !thread.summary && (
            <div className="mt-3 flex flex-col gap-2">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/5" />
              <span className="text-xs text-muted-foreground">
                {t("mail.summary.summarizing")}
              </span>
            </div>
          )}

          {!isSummaryCollapsed && thread.summary && (
            <div className="mt-2 flex flex-col gap-3">
              <p className="text-sm leading-relaxed text-foreground">
                {thread.summary.tldr}
              </p>

              {thread.summary.keyPoints.length > 0 && (
                <div className="border-t border-border/40 pt-2">
                  <p className="text-xs font-semibold text-foreground">
                    {t("mail.summary.keyPoints")}
                  </p>
                  <ul className="mt-1.5 list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                    {thread.summary.keyPoints.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                </div>
              )}

              {thread.summary.actionItems.length > 0 && (
                <div className="border-t border-border/40 pt-2">
                  <p className="text-xs font-semibold text-foreground">
                    {t("mail.summary.actionItems")}
                  </p>
                  <ul className="mt-1 flex flex-col">
                    {thread.summary.actionItems.map((item, idx) => (
                      <li
                        key={item}
                        className={cn(
                          "flex items-start gap-2 py-1.5 text-sm text-muted-foreground",
                          idx > 0 && "border-t border-border/40"
                        )}
                      >
                        <ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-brand-secondary" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Messages Continuous Document Canvas */}
      <div className="flex-1 overflow-y-auto bg-muted/15">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 px-6 py-4">
          {messageSegments.map((segment) => {
            if (segment.type === "folded") {
              return (
                <button
                  key={segment.key}
                  type="button"
                  data-testid="web-super-collapse-btn"
                  aria-label={t("mail.superCollapse.hiddenMessagesCount", {
                    count: segment.count,
                  })}
                  onClick={() => setIsMiddleUnfolded(true)}
                  className="group flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-muted-foreground transition hover:text-foreground"
                >
                  <span className="relative flex-1 py-2">
                    <span className="absolute inset-x-0 top-1 h-px bg-border/40" />
                    <span className="block h-px bg-border/60" />
                  </span>
                  <span className="flex h-7 min-w-9 shrink-0 items-center justify-center rounded-full border border-border/70 bg-card px-3 text-xs font-semibold tabular-nums shadow-2xs transition group-hover:border-border">
                    {segment.count}
                  </span>
                  <span className="relative flex-1 py-2">
                    <span className="absolute inset-x-0 top-1 h-px bg-border/40" />
                    <span className="block h-px bg-border/60" />
                  </span>
                </button>
              )
            }

            const msg = segment.message
            const index = segment.index
            const isExpanded = isMessageExpanded(msg, index)
            const sentDateStr = humanizedTimeText(msg.sentAt)

            // If this message is an unsent draft, render it seamlessly into the message trail
            if (msg.isDraft) {
              return (
                <div
                  key={msg.id}
                  data-testid={`draft-composer-card-${msg.id}`}
                  className="flex flex-col gap-2"
                >
                  {/* Compact draft status header above the single composer card */}
                  <div className="flex items-center justify-between gap-3 px-1">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <SenderAvatar
                        email={account?.email || msg.from?.email}
                        name={account?.displayName || t("mail.me")}
                        size="md"
                      />
                      <div className="flex flex-col truncate">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-foreground">
                            {account?.displayName || t("mail.me")}
                          </span>
                          <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] font-bold text-red-600 dark:text-red-400">
                            {t("mail.draft")}
                          </span>
                        </div>
                        <span className="text-[11px] text-muted-foreground">
                          {msg.updateTime || msg.sentAt
                            ? t("mail.lastSaved", {
                                time: tz.format(msg.updateTime || msg.sentAt, {
                                  month: "short",
                                  day: "numeric",
                                  hour: "numeric",
                                  minute: "2-digit",
                                }),
                              })
                            : t("mail.unsavedDraft")}
                        </span>
                      </div>
                    </div>
                  </div>

                  <MailComposer
                    key={`draft-${msg.id}`}
                    isInlineReply={true}
                    defaultAccountId={
                      msg.connectedAccountId || thread.connectedAccountId
                    }
                    defaultTo={(msg.to || []).map((p) => ({
                      email: p.email,
                      displayName: p.name || "",
                    }))}
                    defaultCc={(msg.cc || []).map((p) => ({
                      email: p.email,
                      displayName: p.name || "",
                    }))}
                    defaultBcc={(msg.bcc || []).map((p) => ({
                      email: p.email,
                      displayName: p.name || "",
                    }))}
                    defaultSubject={msg.subject || thread.subject || ""}
                    defaultBodyHtml={msg.bodyHtml || ""}
                    defaultBodyText={msg.bodyPlain || ""}
                    defaultAttachments={msg.attachments || []}
                    threadId={thread.id}
                    replyToMessageId={msg.inReplyTo || undefined}
                    onSend={async (data) => {
                      await onSendReply({
                        ...data,
                        threadId: thread.id,
                        replyToMessageId: msg.inReplyTo || undefined,
                      })
                      refetchThread()
                    }}
                    onSaveDraft={onSaveDraft}
                    onDiscard={async () => {
                      await onDiscardDraft?.(msg.id)
                      refetchThread()
                    }}
                  />
                </div>
              )
            }

            if (!isExpanded) {
              // Collapsed 1-Line Accordion Strip (Gmail Style)
              return (
                <div
                  key={msg.id}
                  data-testid={`message-card-${msg.id}`}
                  role="button"
                  tabIndex={0}
                  aria-expanded={false}
                  onClick={() => toggleMessageExpanded(msg.id, false)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      toggleMessageExpanded(msg.id, false)
                    }
                  }}
                  className="group flex cursor-pointer items-center justify-between rounded-xl border border-border/50 bg-card/70 px-4 py-3 transition hover:bg-card"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden pr-4">
                    <SenderAvatar
                      email={msg.from?.email}
                      name={msg.from?.name}
                      avatarUrl={msg.from?.avatarUrl}
                      isVerified={msg.from?.isVerified}
                      size="md"
                      showPopover={false}
                    />
                    {msg.isUnread && (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                    )}
                    <span className="max-w-[200px] shrink-0 truncate text-xs font-semibold text-foreground">
                      {msg.from?.name ||
                        msg.from?.email?.split("@")[0] ||
                        t("mail.unknown")}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                      {msg.snippet}
                    </span>
                  </div>

                  <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                    {msg.attachments && msg.attachments.length > 0 && (
                      <Paperclip className="h-3.5 w-3.5" />
                    )}
                    <span className="tabular-nums">{sentDateStr}</span>
                  </div>
                </div>
              )
            }

            // Expanded Message Section in Document Trail
            return (
              <div
                key={msg.id}
                data-testid={`message-card-${msg.id}`}
                className="rounded-xl border border-border/60 bg-card p-5 shadow-2xs"
              >
                {/* Message Header (click anywhere to collapse) */}
                <div
                  role="button"
                  tabIndex={0}
                  aria-expanded={true}
                  data-testid={`message-header-${msg.id}`}
                  onClick={() => toggleMessageExpanded(msg.id, true)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      toggleMessageExpanded(msg.id, true)
                    }
                  }}
                  className="flex cursor-pointer items-start justify-between gap-3"
                >
                  <div
                    className="flex items-center gap-3 overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <SenderAvatar
                      email={msg.from?.email}
                      name={msg.from?.name}
                      avatarUrl={msg.from?.avatarUrl}
                      isVerified={msg.from?.isVerified}
                      size="md"
                      onQuickReply={() => handleStartReply("reply", msg)}
                    />
                    <div className="flex flex-col truncate">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-foreground">
                          {msg.from?.name ||
                            msg.from?.email?.split("@")[0] ||
                            t("mail.unknown")}
                        </span>
                        {msg.from?.email && (
                          <span className="truncate text-xs font-normal text-muted-foreground">
                            &lt;{msg.from.email}&gt;
                          </span>
                        )}
                        {msg.isDraft && (
                          <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-400">
                            {t("mail.draft")}
                          </span>
                        )}
                      </div>
                      {msg.to && msg.to.length > 0 && (
                        <span className="truncate text-[11px] text-muted-foreground">
                          {t("mail.toPrefix")}
                          {msg.to.map((t) => t.name || t.email).join(", ")}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Header Quick Actions & 3-Dots Menu */}
                  <div
                    className="flex shrink-0 items-center gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="mr-1 text-xs text-muted-foreground tabular-nums">
                      {sentDateStr}
                    </span>

                    {/* Quick Reply Button */}
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      data-testid={`reply-quick-btn-${msg.id}`}
                      onClick={() => handleStartReply("reply", msg)}
                      title={t("mail.reply")}
                      className="h-7 w-7 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Reply className="h-3.5 w-3.5" />
                    </Button>

                    {/* Quick Forward Button */}
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      data-testid={`forward-quick-btn-${msg.id}`}
                      onClick={() => handleStartReply("forward", msg)}
                      title={t("mail.forward")}
                      className="h-7 w-7 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Forward className="h-3.5 w-3.5" />
                    </Button>

                    {/* 3-Dots More Options Menu */}
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            data-testid={`message-more-btn-${msg.id}`}
                            title={t("mail.moreOptions")}
                            className="h-7 w-7 text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        }
                      />
                      <DropdownMenuContent
                        align="end"
                        className="w-48 rounded-xl border border-border/80 bg-popover p-1 text-popover-foreground shadow-xl"
                      >
                        <DropdownMenuItem
                          data-testid={`menu-reply-${msg.id}`}
                          onClick={() => handleStartReply("reply", msg)}
                          className="gap-2.5 px-2.5 py-1.5 text-xs text-foreground hover:bg-muted focus:bg-muted focus:text-foreground"
                        >
                          <Reply className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{t("mail.reply")}</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          data-testid={`menu-reply-all-${msg.id}`}
                          onClick={() => handleStartReply("reply-all", msg)}
                          className="gap-2.5 px-2.5 py-1.5 text-xs text-foreground hover:bg-muted focus:bg-muted focus:text-foreground"
                        >
                          <ReplyAll className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{t("mail.replyAll")}</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          data-testid={`menu-forward-${msg.id}`}
                          onClick={() => handleStartReply("forward", msg)}
                          className="gap-2.5 px-2.5 py-1.5 text-xs text-foreground hover:bg-muted focus:bg-muted focus:text-foreground"
                        >
                          <Forward className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{t("mail.forward")}</span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator className="my-1 bg-border/40" />
                        {onStageToFinance && (
                          <DropdownMenuItem
                            data-testid="stage-to-finance-menu-item"
                            onClick={() => onStageToFinance(thread, msg)}
                            className="gap-2.5 px-2.5 py-1.5 text-xs text-foreground hover:bg-muted focus:bg-muted focus:text-foreground"
                          >
                            <Receipt className="h-3.5 w-3.5 text-primary" />
                            <span>{t("mail.stageToFinanceInbox")}</span>
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          data-testid={`menu-print-${msg.id}`}
                          onClick={() => window.print()}
                          className="gap-2.5 px-2.5 py-1.5 text-xs text-foreground hover:bg-muted focus:bg-muted focus:text-foreground"
                        >
                          <Printer className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{t("mail.printMessage")}</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          data-testid={`menu-copy-email-${msg.id}`}
                          onClick={() => {
                            if (msg.from?.email) {
                              navigator.clipboard.writeText(msg.from.email)
                              toast.add({
                                title: t("mail.emailCopied"),
                                type: "success",
                              })
                            }
                          }}
                          className="gap-2.5 px-2.5 py-1.5 text-xs text-foreground hover:bg-muted focus:bg-muted focus:text-foreground"
                        >
                          <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{t("mail.copySenderAddress")}</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {/* Message Expanded Body */}
                <div className="mt-4 pt-1">
                  {/* Sandboxed Body Frame */}
                  <SandboxedEmailFrame
                    key={msg.id}
                    html={msg.bodyHtml}
                    plainText={msg.bodyPlain || msg.snippet}
                    hasRemoteImages={msg.hasRemoteImages}
                    attachments={msg.attachments}
                  />

                  {/* Attachment chips */}
                  {msg.attachments && msg.attachments.length > 0 && (
                    <AttachmentList attachments={msg.attachments} />
                  )}

                  {/* Message Action Bar */}
                  <div className="mt-4 flex items-center gap-2 border-t border-border/40 pt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      data-testid={`reply-msg-btn-${msg.id}`}
                      onClick={() => handleStartReply("reply", msg)}
                      className="h-8 gap-1.5 border-border/60 bg-background px-3 text-xs font-medium text-foreground hover:bg-muted"
                    >
                      <Reply className="h-3.5 w-3.5" />
                      <span>{t("mail.reply")}</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      data-testid={`reply-all-msg-btn-${msg.id}`}
                      onClick={() => handleStartReply("reply-all", msg)}
                      className="h-8 gap-1.5 border-border/60 bg-background px-3 text-xs font-medium text-foreground hover:bg-muted"
                    >
                      <ReplyAll className="h-3.5 w-3.5" />
                      <span>{t("mail.replyAll")}</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      data-testid={`forward-msg-btn-${msg.id}`}
                      onClick={() => handleStartReply("forward", msg)}
                      className="h-8 gap-1.5 border-border/60 bg-background px-3 text-xs font-medium text-foreground hover:bg-muted"
                    >
                      <Forward className="h-3.5 w-3.5" />
                      <span>{t("mail.forward")}</span>
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}

          {/* Inline Reply Composer */}
          {showReplyComposer && !messages.some((m) => m.isDraft) && (
            <div ref={replyComposerRef} className="pt-1 pb-6">
              <MailComposer
                key={`${replyType}-${replyTargetMessage?.id}`}
                isInlineReply={true}
                autoFocusEditor={true}
                defaultAccountId={thread.connectedAccountId}
                defaultTo={replyRecipients.to.map((p) => ({
                  email: p.email,
                  displayName: p.displayName || "",
                }))}
                defaultCc={replyRecipients.cc.map((p) => ({
                  email: p.email,
                  displayName: p.displayName || "",
                }))}
                defaultSubject={
                  replyType === "forward"
                    ? normalizeForwardSubject(thread.subject)
                    : normalizeReplySubject(thread.subject)
                }
                defaultBodyHtml={
                  replyType === "forward"
                    ? forwardedMessageHtml
                    : quotedReplyHtml
                }
                defaultAttachments={
                  replyType === "forward" ? replyTargetMessage?.attachments : []
                }
                threadId={thread.id}
                replyToMessageId={replyTargetMessage?.id}
                onSend={async (data) => {
                  await onSendReply(data)
                  setShowReplyComposer(false)
                }}
                onDiscard={() => setShowReplyComposer(false)}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
