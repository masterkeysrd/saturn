import { useState, useEffect, useCallback, useMemo } from "react"
import {
  Search,
  Star,
  Paperclip,
  Archive,
  Trash2,
  MailCheck,
  Mail,
  CheckSquare,
  Square,
  RefreshCw,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useTimezone, useConnectedAccounts } from "@saturn/hooks"
import type { Thread } from "@saturn/api/saturn/mail/v1/mail"
import { cn } from "@/lib/utils"

export interface ThreadListProps {
  threads: Thread[]
  selectedThreadId?: string
  onSelectThread: (thread: Thread) => void
  onArchiveThread: (thread: Thread) => void
  onTrashThread: (thread: Thread) => void
  onToggleStar: (thread: Thread) => void
  onToggleRead: (thread: Thread) => void
  onBulkAction: (
    action: "archive" | "trash" | "read" | "unread",
    threadIds: string[]
  ) => void
  searchQuery: string
  onSearchChange: (q: string) => void
  onReply?: (thread: Thread) => void
  onOpenCompose?: () => void
  onRefresh?: () => void
  isLoading?: boolean
}

export function ThreadList({
  threads,
  selectedThreadId,
  onSelectThread,
  onArchiveThread,
  onTrashThread,
  onToggleStar,
  onToggleRead,
  onBulkAction,
  searchQuery,
  onSearchChange,
  onReply,
  onOpenCompose,
  onRefresh,
  isLoading = false,
}: ThreadListProps) {
  const tz = useTimezone()
  const { data: accountsData } = useConnectedAccounts()
  const accounts = useMemo(() => accountsData?.accounts || [], [accountsData])

  // Create account lookup map by id
  const accountMap = useMemo(() => {
    const map = new Map<
      string,
      { color?: string; displayName?: string; email?: string }
    >()
    for (const a of accounts) {
      if (a.id) {
        map.set(a.id, a)
      }
    }
    return map
  }, [accounts])

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Clear selected ids when threads change substantially
  const allIds = useMemo(() => threads.map((t) => t.id), [threads])
  const allSelected = threads.length > 0 && selectedIds.size === threads.length

  const handleToggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(allIds))
    }
  }

  const handleToggleSelectOne = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  // Keyboard navigation shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Ignore if user is currently typing in an input or textarea
      const target = e.target as HTMLElement
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return
      }

      const currentIndex = threads.findIndex((t) => t.id === selectedThreadId)
      const currentThread =
        currentIndex !== -1 ? threads[currentIndex] : undefined

      switch (e.key) {
        case "j": // Down
          e.preventDefault()
          if (currentIndex < threads.length - 1) {
            onSelectThread(threads[currentIndex + 1])
          }
          break
        case "k": // Up
          e.preventDefault()
          if (currentIndex > 0) {
            onSelectThread(threads[currentIndex - 1])
          }
          break
        case "e": // Archive
          e.preventDefault()
          if (selectedIds.size > 0) {
            onBulkAction("archive", Array.from(selectedIds))
            setSelectedIds(new Set())
          } else if (currentThread) {
            onArchiveThread(currentThread)
          }
          break
        case "s": // Toggle star
          e.preventDefault()
          if (currentThread) {
            onToggleStar(currentThread)
          }
          break
        case "u": // Toggle read/unread
          e.preventDefault()
          if (selectedIds.size > 0) {
            onBulkAction("unread", Array.from(selectedIds))
          } else if (currentThread) {
            onToggleRead(currentThread)
          }
          break
        case "#": // Trash
          e.preventDefault()
          if (selectedIds.size > 0) {
            onBulkAction("trash", Array.from(selectedIds))
            setSelectedIds(new Set())
          } else if (currentThread) {
            onTrashThread(currentThread)
          }
          break
        case "c": // Compose
          e.preventDefault()
          onOpenCompose?.()
          break
        case "r": // Reply
          e.preventDefault()
          if (currentThread) {
            onReply?.(currentThread)
          }
          break
      }
    },
    [
      threads,
      selectedThreadId,
      selectedIds,
      onSelectThread,
      onArchiveThread,
      onTrashThread,
      onToggleStar,
      onToggleRead,
      onBulkAction,
      onOpenCompose,
      onReply,
    ]
  )

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handleKeyDown])

  return (
    <div
      data-testid="thread-list-pane"
      className="flex h-full w-80 shrink-0 flex-col border-r border-border/40 bg-background select-none lg:w-96"
    >
      {/* Search Header */}
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border/40 bg-card/40 px-3 backdrop-blur">
        <div className="relative flex-1">
          <Search className="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            data-testid="mail-search-input"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search mail..."
            className="h-8 bg-background/80 pl-8 text-xs"
          />
        </div>
        {onRefresh && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onRefresh}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            title="Refresh"
            aria-label="Refresh mail"
          >
            <RefreshCw
              className={cn(
                "h-4 w-4",
                isLoading && "animate-spin text-primary"
              )}
            />
          </Button>
        )}
      </div>

      {/* Bulk Action Bar (when threads selected) */}
      {selectedIds.size > 0 ? (
        <div
          data-testid="bulk-action-bar"
          className="flex h-10 shrink-0 items-center justify-between border-b border-border/40 bg-primary/5 px-3 text-xs"
        >
          <div className="flex items-center gap-2">
            <div className="w-2 shrink-0" />
            <button
              type="button"
              onClick={handleToggleSelectAll}
              className="text-primary hover:text-primary/80"
              aria-label="Deselect all"
            >
              <CheckSquare className="h-4 w-4" />
            </button>
            <span className="font-semibold text-primary">
              {selectedIds.size} selected
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              data-testid="bulk-archive-btn"
              onClick={() => {
                onBulkAction("archive", Array.from(selectedIds))
                setSelectedIds(new Set())
              }}
              title="Archive selected"
              className="h-7 w-7"
            >
              <Archive className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              data-testid="bulk-trash-btn"
              onClick={() => {
                onBulkAction("trash", Array.from(selectedIds))
                setSelectedIds(new Set())
              }}
              title="Trash selected"
              className="h-7 w-7 text-destructive hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              data-testid="bulk-read-btn"
              onClick={() => onBulkAction("read", Array.from(selectedIds))}
              title="Mark as read"
              className="h-7 w-7"
            >
              <MailCheck className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              data-testid="bulk-unread-btn"
              onClick={() => onBulkAction("unread", Array.from(selectedIds))}
              title="Mark as unread"
              className="h-7 w-7"
            >
              <Mail className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex h-9 shrink-0 items-center justify-between border-b border-border/30 px-3 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-2 shrink-0" />
            <button
              type="button"
              onClick={handleToggleSelectAll}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Select all"
            >
              <Square className="h-3.5 w-3.5" />
            </button>
            <span>{threads.length} conversations</span>
          </div>
        </div>
      )}

      {/* Thread Items List */}
      <div className="flex flex-1 flex-col divide-y divide-border/20 overflow-y-auto">
        {threads.length === 0 ? (
          <div
            data-testid="empty-threads-state"
            className="flex flex-1 flex-col items-center justify-center p-6 text-center text-xs text-muted-foreground"
          >
            <Mail className="mb-2 h-8 w-8 text-muted-foreground/40" />
            <p className="font-medium">No conversations</p>
            <p className="mt-1 text-[11px] text-muted-foreground/80">
              {searchQuery ? "No matches found" : "Your inbox is clear"}
            </p>
          </div>
        ) : (
          threads.map((thread) => {
            const isSelected = selectedThreadId === thread.id
            const isChecked = selectedIds.has(thread.id)
            const account = accountMap.get(thread.connectedAccountId)
            const dateStr = thread.lastMessageAt
              ? tz.isToday(thread.lastMessageAt)
                ? tz.formatTime(thread.lastMessageAt, {
                    hour: "numeric",
                    minute: "2-digit",
                  })
                : tz.format(thread.lastMessageAt, {
                    month: "short",
                    day: "numeric",
                  })
              : ""

            // Participants summary
            const participantNames =
              thread.participants
                ?.map((p) => p.name || p.email.split("@")[0])
                .join(", ") || "Unknown"

            return (
              <div
                key={thread.id}
                data-testid={`thread-row-${thread.id}`}
                onClick={() => onSelectThread(thread)}
                className={cn(
                  "group relative flex cursor-pointer gap-2 p-3 transition",
                  isSelected
                    ? "bg-accent/60"
                    : thread.isUnread
                      ? "bg-primary/[0.03] hover:bg-muted/40"
                      : "hover:bg-muted/30"
                )}
              >
                {/* Column 1: Unread Dot Gutter */}
                <div className="flex w-2 shrink-0 items-start justify-center pt-1">
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full transition-colors",
                      thread.isUnread ? "bg-primary" : "bg-transparent"
                    )}
                    aria-label={thread.isUnread ? "Unread" : undefined}
                  />
                </div>

                {/* Column 2: Indented Content Block (Top Row, Subject, Snippet) */}
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  {/* Top Row: Select, Star, Senders, Date, Account dot */}
                  <div className="flex items-center justify-between gap-1.5 text-xs">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={(e) => handleToggleSelectOne(thread.id, e)}
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                        aria-label="Select conversation"
                      >
                        {isChecked ? (
                          <CheckSquare className="h-3.5 w-3.5 text-primary" />
                        ) : (
                          <Square className="h-3.5 w-3.5 opacity-60 group-hover:opacity-100" />
                        )}
                      </button>
                      <button
                        type="button"
                        data-testid={`star-btn-${thread.id}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          onToggleStar(thread)
                        }}
                        className="shrink-0 text-muted-foreground hover:text-amber-500"
                        aria-label={thread.isStarred ? "Unstar" : "Star"}
                      >
                        <Star
                          className={cn(
                            "h-3.5 w-3.5 transition",
                            thread.isStarred
                              ? "fill-amber-400 text-amber-500"
                              : "opacity-40 group-hover:opacity-100"
                          )}
                        />
                      </button>
                      <span
                        className={cn(
                          "min-w-0 truncate font-medium",
                          thread.isUnread
                            ? "font-bold text-foreground"
                            : "text-foreground/90"
                        )}
                      >
                        {participantNames}
                      </span>
                      {thread.messageCount > 1 && (
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          ({thread.messageCount})
                        </span>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                      {thread.hasAttachments && (
                        <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground/70" />
                      )}
                      {account && (
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{
                            backgroundColor: account.color || "#3b82f6",
                          }}
                          title={account.displayName || account.email}
                        />
                      )}
                      <span className="whitespace-nowrap tabular-nums">
                        {dateStr}
                      </span>
                    </div>
                  </div>

                  {/* Subject Line */}
                  <div
                    className={cn(
                      "truncate text-xs",
                      thread.isUnread
                        ? "font-semibold text-foreground"
                        : "text-foreground/80"
                    )}
                  >
                    {thread.subject || "(no subject)"}
                  </div>

                  {/* Snippet Preview */}
                  <div className="line-clamp-1 text-[11px] text-muted-foreground">
                    {thread.snippet || ""}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
