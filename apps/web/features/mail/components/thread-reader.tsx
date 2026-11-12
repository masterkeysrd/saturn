import { useState, useMemo } from "react"
import {
  Archive,
  Trash2,
  Star,
  Mail,
  Reply,
  ReplyAll,
  CalendarPlus,
  ChevronDown,
  ChevronUp,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useTimezone, useConnectedAccounts, useMailThread } from "@saturn/hooks"
import {
  normalizeReplySubject,
  computeReplyRecipients,
  buildQuotedReplyHtml,
  formatParticipantDisplay,
} from "@saturn/core"
import type { Thread, Message } from "@saturn/api/saturn/mail/v1/mail"
import { SandboxedEmailFrame } from "./sandboxed-email-frame"
import { AttachmentList } from "./attachment-list"
import { MailComposer } from "./mail-composer"
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
  const { data: fetchedThread } = useMailThread(threadId)
  const thread = fetchedThread || initialThread

  const account = useMemo(() => {
    return accounts.find((a) => a.id === thread?.connectedAccountId)
  }, [accounts, thread?.connectedAccountId])

  // Track user overrides for expanded/collapsed messages
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set())
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const messages = useMemo(() => thread?.messages || [], [thread?.messages])

  const isMessageExpanded = (msg: Message, index: number) => {
    if (collapsedIds.has(msg.id)) return false
    if (expandedIds.has(msg.id)) return true
    return index === messages.length - 1 || msg.isUnread
  }

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

  // Reply Composer state
  const [showReplyComposer, setShowReplyComposer] = useState(false)
  const [replyType, setReplyType] = useState<"reply" | "reply-all">("reply")
  const [replyTargetMessage, setReplyTargetMessage] = useState<
    Message | undefined
  >()

  const handleStartReply = (
    type: "reply" | "reply-all",
    targetMsg?: Message
  ) => {
    const msg = targetMsg || messages[messages.length - 1]
    setReplyType(type)
    setReplyTargetMessage(msg)
    setShowReplyComposer(true)
  }

  // Compute recipient list for reply
  const replyRecipients = useMemo(() => {
    if (!replyTargetMessage) return { to: [], cc: [] }
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

  if (!threadId || !thread) {
    return (
      <div
        data-testid="thread-reader-empty"
        className="flex flex-1 flex-col items-center justify-center p-8 text-center text-xs text-muted-foreground select-none"
      >
        <Mail className="mb-3 h-10 w-10 text-muted-foreground/30" />
        <p className="font-semibold text-foreground/80">
          No conversation selected
        </p>
        <p className="mt-1 text-muted-foreground/60">
          Select a thread from the list to read its messages
        </p>
      </div>
    )
  }

  return (
    <div
      data-testid="thread-reader-pane"
      className="flex flex-1 flex-col overflow-hidden bg-background"
    >
      {/* Thread Header Toolbar */}
      <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border/40 bg-card/40 px-4 backdrop-blur">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {account && (
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: account.color || "#3b82f6" }}
              title={account.displayName || account.email}
            />
          )}
          <h2
            data-testid="thread-subject-heading"
            className="truncate text-sm font-semibold tracking-tight text-foreground sm:text-base"
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
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
          >
            <Archive className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            data-testid="trash-thread-btn"
            onClick={() => onTrash(thread)}
            title="Delete (#)"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            data-testid="star-thread-btn"
            onClick={() => onToggleStar(thread)}
            title="Star (s)"
            className="h-8 w-8 text-muted-foreground hover:text-amber-500"
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
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
          >
            <Mail className="h-4 w-4" />
          </Button>
          <div className="mx-1 h-4 w-px bg-border/60" />
          {/* Create Calendar Event from Email Button */}
          <Button
            variant="outline"
            size="sm"
            data-testid="create-calendar-event-btn"
            onClick={handleCreateCalendarEvent}
            className="h-8 gap-1.5 px-2.5 text-xs font-medium"
            title="Create Calendar Event from Email"
          >
            <CalendarPlus className="h-3.5 w-3.5 text-primary" />
            <span className="hidden sm:inline">Create Event</span>
          </Button>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex flex-1 flex-col divide-y divide-border/30 overflow-y-auto p-4">
        {messages.map((msg, index) => {
          const isExpanded = isMessageExpanded(msg, index)
          const fromDisplay =
            formatParticipantDisplay(msg.from) || "Unknown sender"
          const sentDateStr = msg.sentAt
            ? tz.format(msg.sentAt, {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })
            : ""

          return (
            <div
              key={msg.id}
              data-testid={`message-card-${msg.id}`}
              className={cn(
                "py-3 transition-colors",
                !isExpanded && "cursor-pointer hover:bg-muted/30"
              )}
            >
              {/* Message Header */}
              <div
                onClick={() =>
                  !isExpanded && toggleMessageExpanded(msg.id, false)
                }
                className="flex items-start justify-between gap-2"
              >
                <div className="flex items-center gap-2.5 overflow-hidden">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    {msg.from?.name?.charAt(0) ||
                      msg.from?.email?.charAt(0) ||
                      "U"}
                  </div>
                  <div className="flex flex-col truncate">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-xs font-semibold text-foreground">
                        {fromDisplay}
                      </span>
                      {msg.isDraft && (
                        <span className="py-0.2 rounded bg-amber-500/10 px-1.5 text-[10px] font-bold text-amber-600">
                          Draft
                        </span>
                      )}
                    </div>
                    {isExpanded && msg.to && msg.to.length > 0 && (
                      <span className="truncate text-[11px] text-muted-foreground">
                        to: {msg.to.map((t) => t.name || t.email).join(", ")}
                      </span>
                    )}
                    {!isExpanded && (
                      <span className="truncate text-[11px] text-muted-foreground">
                        {msg.snippet}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">
                    {sentDateStr}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleMessageExpanded(msg.id, isExpanded)
                    }}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label={
                      isExpanded ? "Collapse message" : "Expand message"
                    }
                  >
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Message Expanded Body */}
              {isExpanded && (
                <div className="mt-3 flex flex-col gap-3 pl-9">
                  {/* Sandboxed Body Frame */}
                  <SandboxedEmailFrame
                    html={msg.bodyHtml}
                    plainText={msg.bodyPlain}
                    hasRemoteImages={msg.hasRemoteImages}
                  />

                  {/* Attachment chips */}
                  {msg.attachments && msg.attachments.length > 0 && (
                    <AttachmentList attachments={msg.attachments} />
                  )}

                  {/* Message Action Bar */}
                  <div className="mt-2 flex items-center gap-2 border-t border-border/20 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      data-testid={`reply-msg-btn-${msg.id}`}
                      onClick={() => handleStartReply("reply", msg)}
                      className="h-7 gap-1 px-2.5 text-xs font-medium"
                    >
                      <Reply className="h-3 w-3" />
                      <span>Reply</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      data-testid={`reply-all-msg-btn-${msg.id}`}
                      onClick={() => handleStartReply("reply-all", msg)}
                      className="h-7 gap-1 px-2.5 text-xs font-medium"
                    >
                      <ReplyAll className="h-3 w-3" />
                      <span>Reply All</span>
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {/* Inline Reply Composer */}
        {showReplyComposer && (
          <div className="mt-4 pt-2">
            <MailComposer
              isInlineReply={true}
              defaultAccountId={thread.connectedAccountId}
              defaultTo={replyRecipients.to.map((p) => ({
                email: p.email,
                displayName: p.displayName || "",
              }))}
              defaultSubject={normalizeReplySubject(thread.subject)}
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
