import { useState, useMemo, useCallback, useEffect } from "react"
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
  ChevronsUpDown,
  ChevronsDownUp,
  RefreshCw,
  AlertCircle,
  Image as ImageIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/toast"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { useTimezone, useConnectedAccounts, useMailThread } from "@saturn/hooks"
import {
  normalizeReplySubject,
  normalizeForwardSubject,
  computeReplyRecipients,
  buildQuotedReplyHtml,
} from "@saturn/core"
import type { Thread, Message } from "@saturn/api/saturn/mail/v1/mail"
import { SandboxedEmailFrame } from "./sandboxed-email-frame"
import { AttachmentList } from "./attachment-list"
import { MailComposer } from "./mail-composer"
import { SenderAvatar } from "./sender-avatar"
import { cn } from "@/lib/utils"

export interface ThreadReaderProps {
  threadId?: string
  initialThread?: Thread
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
  onSendReply: (data: {
    connectedAccountId: string
    to: Array<{ email: string; displayName?: string }>
    cc: Array<{ email: string; displayName?: string }>
    bcc: Array<{ email: string; displayName?: string }>
    subject: string
    bodyHtml: string
    bodyText: string
    threadId?: string
    replyToMessageId?: string
  }) => Promise<void>
}

export function ThreadReader({
  threadId,
  initialThread,
  onArchive,
  onTrash,
  onToggleStar,
  onToggleRead,
  onCreateEvent,
  onSendReply,
}: ThreadReaderProps) {
  const tz = useTimezone()
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

  const account = useMemo(() => {
    return accounts.find((a) => a.id === thread?.connectedAccountId)
  }, [accounts, thread?.connectedAccountId])

  // Global auto-load images preference
  const [autoLoadImages, setAutoLoadImages] = useState<boolean>(() => {
    if (typeof localStorage === "undefined") return false
    return localStorage.getItem("saturn_mail_auto_load_images") === "true"
  })

  useEffect(() => {
    const handleSync = () => {
      setAutoLoadImages(
        localStorage.getItem("saturn_mail_auto_load_images") === "true"
      )
    }
    window.addEventListener("storage", handleSync)
    window.addEventListener("saturn-mail-auto-load-changed", handleSync)
    return () => {
      window.removeEventListener("storage", handleSync)
      window.removeEventListener("saturn-mail-auto-load-changed", handleSync)
    }
  }, [])

  const handleToggleGlobalAutoLoadImages = () => {
    const next = !autoLoadImages
    setAutoLoadImages(next)
    try {
      if (next) {
        localStorage.setItem("saturn_mail_auto_load_images", "true")
      } else {
        localStorage.removeItem("saturn_mail_auto_load_images")
      }
      window.dispatchEvent(new Event("saturn-mail-auto-load-changed"))
    } catch {
      // ignore
    }
  }

  // Track user overrides for expanded/collapsed messages (reset automatically via key on threadId change)
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set())
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const messages = useMemo(() => thread?.messages || [], [thread?.messages])

  const isMessageExpanded = useCallback(
    (msg: Message, index: number) => {
      if (collapsedIds.has(msg.id)) return false
      if (expandedIds.has(msg.id)) return true
      // In short threads (<= 3 messages), expand all by default for immediate context
      if (messages.length <= 3) return true
      // In longer threads, expand the original message, the latest message, and unread messages
      return index === 0 || index === messages.length - 1 || msg.isUnread
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
    } else {
      // Expand all messages
      setCollapsedIds(new Set())
      setExpandedIds(new Set(messages.map((m) => m.id)))
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

  const handleStartReply = (
    type: "reply" | "reply-all" | "forward",
    targetMsg?: Message
  ) => {
    const msg = targetMsg || messages[messages.length - 1]
    setReplyType(type)
    setReplyTargetMessage(msg)
    setShowReplyComposer(true)
  }

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
    })
  }, [replyTargetMessage])

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
      title: thread.subject || "Meeting from email",
      description: `Created from email thread: ${thread.subject}\nSnippet: ${thread.snippet}`,
      sourceMailMessageId: latestMsg?.id || "",
      attendees,
    })
  }

  if (!threadId) {
    return (
      <div
        data-testid="thread-reader-empty"
        className="flex flex-1 flex-col items-center justify-center bg-white p-8 text-center text-xs text-zinc-500 select-none"
      >
        <Mail className="mb-3 h-10 w-10 text-zinc-300" />
        <p className="font-semibold text-zinc-800">No conversation selected</p>
        <p className="mt-1 text-zinc-500">
          Select a thread from the list to read its messages
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
        className="flex flex-1 flex-col items-center justify-center bg-white p-8 text-center text-xs text-zinc-500 select-none"
      >
        <RefreshCw className="mb-3 h-6 w-6 animate-spin text-primary" />
        <p className="font-medium text-zinc-800">Loading conversation...</p>
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
        className="flex flex-1 flex-col items-center justify-center bg-white p-8 text-center text-xs text-zinc-500 select-none"
      >
        <AlertCircle className="mb-3 h-8 w-8 text-red-500" />
        <p className="font-semibold text-zinc-900">Could not load email</p>
        <p className="mt-1 max-w-sm text-zinc-500">
          There was an issue retrieving this conversation from the server.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetchThread()}
          className="mt-4 gap-1.5 border-zinc-300 bg-white text-xs text-zinc-700 hover:bg-zinc-50"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Retry</span>
        </Button>
      </div>
    )
  }

  if (!thread) {
    return (
      <div
        data-testid="thread-reader-empty"
        className="flex flex-1 flex-col items-center justify-center bg-white p-8 text-center text-xs text-zinc-500 select-none"
      >
        <Mail className="mb-3 h-10 w-10 text-zinc-300" />
        <p className="font-semibold text-zinc-800">No conversation selected</p>
        <p className="mt-1 text-zinc-500">
          Select a thread from the list to read its messages
        </p>
      </div>
    )
  }

  return (
    <div
      data-testid="thread-reader-pane"
      className="flex flex-1 flex-col overflow-hidden border-l border-border/40 bg-white text-zinc-900"
    >
      {/* Thread Header Toolbar */}
      <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-zinc-200/80 bg-white px-6">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          {account && (
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: account.color || "#3b82f6" }}
              title={account.displayName || account.email}
            />
          )}
          <h2
            data-testid="thread-subject-heading"
            className="truncate text-base font-semibold tracking-tight text-zinc-900 sm:text-lg"
          >
            {thread.subject || "(no subject)"}
          </h2>
        </div>

        {/* Action Buttons */}
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            data-testid="archive-thread-btn"
            onClick={() => onArchive(thread)}
            title="Archive (e)"
            className="h-8 w-8 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
          >
            <Archive className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            data-testid="trash-thread-btn"
            onClick={() => onTrash(thread)}
            title="Delete (#)"
            className="h-8 w-8 text-zinc-600 hover:bg-red-50 hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            data-testid="star-thread-btn"
            onClick={() => onToggleStar(thread)}
            title="Star (s)"
            className="h-8 w-8 text-zinc-600 hover:bg-zinc-100 hover:text-amber-500"
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
            title="Mark as unread (u)"
            className="h-8 w-8 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
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
                ? "Remote images: Auto-loaded (click to block by default)"
                : "Remote images: Blocked by default (click to always load)"
            }
            className={cn(
              "h-8 w-8 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
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
                  ? "Collapse older messages"
                  : "Expand all messages"
              }
              className="h-8 w-8 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
            >
              {areAllExpanded ? (
                <ChevronsDownUp className="h-4 w-4" />
              ) : (
                <ChevronsUpDown className="h-4 w-4" />
              )}
            </Button>
          )}
          <div className="mx-1 h-4 w-px bg-zinc-200" />
          {/* Create Calendar Event from Email Button */}
          <Button
            variant="outline"
            size="sm"
            data-testid="create-calendar-event-btn"
            onClick={handleCreateCalendarEvent}
            className="h-8 gap-1.5 border-zinc-300 bg-white px-2.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900"
            title="Create Calendar Event from Email"
          >
            <CalendarPlus className="h-3.5 w-3.5 text-primary" />
            <span className="hidden sm:inline">Create Event</span>
          </Button>
        </div>
      </div>

      {/* Messages Continuous Document Canvas */}
      <div className="flex flex-1 flex-col divide-y divide-zinc-200/70 overflow-y-auto bg-white px-6 py-2">
        {messages.map((msg, index) => {
          const isExpanded = isMessageExpanded(msg, index)
          const sentDateStr = msg.sentAt
            ? tz.format(msg.sentAt, {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })
            : ""

          if (!isExpanded) {
            // Collapsed 1-Line Accordion Strip (Gmail Style)
            return (
              <div
                key={msg.id}
                data-testid={`message-card-${msg.id}`}
                onClick={() => toggleMessageExpanded(msg.id, false)}
                className="group -mx-6 flex cursor-pointer items-center justify-between px-6 py-3 transition hover:bg-zinc-50/80"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden pr-4">
                  <SenderAvatar
                    email={msg.from?.email}
                    name={msg.from?.name}
                    avatarUrl={msg.from?.avatarUrl}
                    isVerified={msg.from?.isVerified}
                    size="sm"
                    showPopover={false}
                  />
                  <span className="shrink-0 text-xs font-semibold text-zinc-900">
                    {msg.from?.name ||
                      msg.from?.email?.split("@")[0] ||
                      "Unknown"}
                  </span>
                  <span className="truncate text-xs text-zinc-500">
                    {msg.snippet}
                  </span>
                </div>

                <div className="flex shrink-0 items-center gap-2.5 text-xs text-zinc-500">
                  <span className="tabular-nums">{sentDateStr}</span>
                  <ChevronDown className="h-4 w-4 opacity-50 group-hover:opacity-100" />
                </div>
              </div>
            )
          }

          // Expanded Message Section in Document Trail
          return (
            <div
              key={msg.id}
              data-testid={`message-card-${msg.id}`}
              className="py-4"
            >
              {/* Message Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 overflow-hidden">
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
                      <span className="text-xs font-semibold text-zinc-900">
                        {msg.from?.name ||
                          msg.from?.email?.split("@")[0] ||
                          "Unknown"}
                      </span>
                      {msg.from?.email && (
                        <span className="truncate text-xs font-normal text-zinc-500">
                          &lt;{msg.from.email}&gt;
                        </span>
                      )}
                      {msg.isDraft && (
                        <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                          Draft
                        </span>
                      )}
                    </div>
                    {msg.to && msg.to.length > 0 && (
                      <span className="truncate text-[11px] text-zinc-500">
                        to: {msg.to.map((t) => t.name || t.email).join(", ")}
                      </span>
                    )}
                  </div>
                </div>

                {/* Header Quick Actions & 3-Dots Menu */}
                <div className="flex shrink-0 items-center gap-1">
                  <span className="mr-1 text-xs text-zinc-500 tabular-nums">
                    {sentDateStr}
                  </span>

                  {/* Quick Reply Button */}
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    data-testid={`reply-quick-btn-${msg.id}`}
                    onClick={() => handleStartReply("reply", msg)}
                    title="Reply"
                    className="h-7 w-7 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                  >
                    <Reply className="h-3.5 w-3.5" />
                  </Button>

                  {/* Quick Forward Button */}
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    data-testid={`forward-quick-btn-${msg.id}`}
                    onClick={() => handleStartReply("forward", msg)}
                    title="Forward"
                    className="h-7 w-7 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
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
                          title="More options"
                          className="h-7 w-7 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </Button>
                      }
                    />
                    <DropdownMenuContent
                      align="end"
                      className="w-48 rounded-xl border border-zinc-200/80 bg-white p-1 text-zinc-900 shadow-xl"
                    >
                      <DropdownMenuItem
                        data-testid={`menu-reply-${msg.id}`}
                        onClick={() => handleStartReply("reply", msg)}
                        className="gap-2.5 px-2.5 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900"
                      >
                        <Reply className="h-3.5 w-3.5 text-zinc-500" />
                        <span>Reply</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        data-testid={`menu-reply-all-${msg.id}`}
                        onClick={() => handleStartReply("reply-all", msg)}
                        className="gap-2.5 px-2.5 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900"
                      >
                        <ReplyAll className="h-3.5 w-3.5 text-zinc-500" />
                        <span>Reply All</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        data-testid={`menu-forward-${msg.id}`}
                        onClick={() => handleStartReply("forward", msg)}
                        className="gap-2.5 px-2.5 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900"
                      >
                        <Forward className="h-3.5 w-3.5 text-zinc-500" />
                        <span>Forward</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="my-1 bg-zinc-100" />
                      <DropdownMenuItem
                        data-testid={`menu-print-${msg.id}`}
                        onClick={() => window.print()}
                        className="gap-2.5 px-2.5 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900"
                      >
                        <Printer className="h-3.5 w-3.5 text-zinc-500" />
                        <span>Print message</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        data-testid={`menu-copy-email-${msg.id}`}
                        onClick={() => {
                          if (msg.from?.email) {
                            navigator.clipboard.writeText(msg.from.email)
                            toast.add({
                              title: "Email copied to clipboard",
                              type: "success",
                            })
                          }
                        }}
                        className="gap-2.5 px-2.5 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900"
                      >
                        <Copy className="h-3.5 w-3.5 text-zinc-500" />
                        <span>Copy sender address</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {/* Collapse Chevron Button */}
                  <button
                    type="button"
                    onClick={() => toggleMessageExpanded(msg.id, true)}
                    className="ml-0.5 rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                    aria-label="Collapse message"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Message Expanded Body */}
              <div className="mt-4 pt-1">
                {/* Sandboxed Body Frame */}
                <SandboxedEmailFrame
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
                <div className="mt-4 flex items-center gap-2 border-t border-zinc-100 pt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid={`reply-msg-btn-${msg.id}`}
                    onClick={() => handleStartReply("reply", msg)}
                    className="h-8 gap-1.5 border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900"
                  >
                    <Reply className="h-3.5 w-3.5" />
                    <span>Reply</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid={`reply-all-msg-btn-${msg.id}`}
                    onClick={() => handleStartReply("reply-all", msg)}
                    className="h-8 gap-1.5 border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900"
                  >
                    <ReplyAll className="h-3.5 w-3.5" />
                    <span>Reply All</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid={`forward-msg-btn-${msg.id}`}
                    onClick={() => handleStartReply("forward", msg)}
                    className="h-8 gap-1.5 border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900"
                  >
                    <Forward className="h-3.5 w-3.5" />
                    <span>Forward</span>
                  </Button>
                </div>
              </div>
            </div>
          )
        })}

        {/* Inline Reply Composer */}
        {showReplyComposer && (
          <div className="mt-4 border-t border-zinc-200/80 pt-4 pb-6">
            <MailComposer
              isInlineReply={true}
              defaultAccountId={thread.connectedAccountId}
              defaultTo={replyRecipients.to.map((p) => ({
                email: p.email,
                displayName: p.displayName || "",
              }))}
              defaultSubject={
                replyType === "forward"
                  ? normalizeForwardSubject(thread.subject)
                  : normalizeReplySubject(thread.subject)
              }
              defaultBodyHtml={quotedReplyHtml}
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
  )
}
