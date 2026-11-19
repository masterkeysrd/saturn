import { useState, useEffect, useMemo, useRef } from "react"
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
  Loader2,
  PanelLeft,
  Columns2,
  Rows2,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useTimezone, useConnectedAccounts, useI18n } from "@saturn/hooks"
import { formatThreadParticipants } from "@saturn/core"
import type { Thread } from "@saturn/api/saturn/mail/v1/mail"
import type { MailLayoutMode } from "../mail-utils"
import { cn } from "@/lib/utils"

export interface ThreadListProps {
  threads: Thread[]
  selectedThreadId?: string
  focusedThreadId?: string
  selectedIds?: Set<string>
  onSelectedIdsChange?: (ids: Set<string>) => void
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
  searchInputRef?: React.RefObject<HTMLInputElement | null>
  railOpen?: boolean
  onToggleRail?: () => void
  layoutMode?: MailLayoutMode
  onToggleLayoutMode?: () => void
  widthPx?: number
  fullWidth?: boolean
  onRefresh?: () => void
  isLoading?: boolean
  hasNextPage?: boolean
  isFetchingNextPage?: boolean
  totalCount?: number
  onLoadMore?: () => void
}

export function ThreadList({
  threads,
  selectedThreadId,
  focusedThreadId,
  selectedIds: controlledSelectedIds,
  onSelectedIdsChange,
  onSelectThread,
  onToggleStar,
  onBulkAction,
  searchQuery,
  onSearchChange,
  searchInputRef,
  railOpen = true,
  onToggleRail,
  layoutMode = "split",
  onToggleLayoutMode,
  widthPx,
  fullWidth = false,
  onRefresh,
  isLoading = false,
  hasNextPage = false,
  isFetchingNextPage = false,
  totalCount,
  onLoadMore,
}: ThreadListProps) {
  const tz = useTimezone()
  const { t } = useI18n()
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

  const allAccountEmails = useMemo(() => {
    return accounts.map((a) => a.email).filter(Boolean) as string[]
  }, [accounts])

  // Multi-select state (supports controlled or uncontrolled usage)
  const [internalSelectedIds, setInternalSelectedIds] = useState<Set<string>>(
    new Set()
  )
  const selectedIds = controlledSelectedIds ?? internalSelectedIds
  const setSelectedIds = (
    updater: Set<string> | ((prev: Set<string>) => Set<string>)
  ) => {
    const next = typeof updater === "function" ? updater(selectedIds) : updater
    if (onSelectedIdsChange) {
      onSelectedIdsChange(next)
    } else {
      setInternalSelectedIds(next)
    }
  }

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null)
  const onLoadMoreRef = useRef(onLoadMore)

  useEffect(() => {
    onLoadMoreRef.current = onLoadMore
  }, [onLoadMore])

  const canLoadMore = Boolean(hasNextPage && !isFetchingNextPage && onLoadMore)

  useEffect(() => {
    if (!canLoadMore) return
    if (typeof IntersectionObserver === "undefined") return

    const root = scrollContainerRef.current
    const target = loadMoreSentinelRef.current
    if (!root || !target) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          onLoadMoreRef.current?.()
        }
      },
      {
        root,
        rootMargin: "200px",
      }
    )

    observer.observe(target)
    return () => observer.disconnect()
  }, [canLoadMore, threads.length])

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

  return (
    <div
      data-testid="thread-list-pane"
      style={!fullWidth && widthPx ? { width: `${widthPx}px` } : undefined}
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden bg-background select-none",
        fullWidth
          ? "w-full flex-1"
          : "w-full shrink-0 border-r border-border/40 md:w-[360px]"
      )}
    >
      {/* Search Header */}
      <div className="flex h-14 shrink-0 items-center justify-between gap-1.5 border-b border-border/40 bg-card/40 px-3 backdrop-blur">
        {onToggleRail && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            data-testid="mail-toggle-rail-btn"
            onClick={onToggleRail}
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
            title={
              railOpen ? t("mail.collapseFolders") : t("mail.expandFolders")
            }
            aria-label={
              railOpen ? t("mail.collapseFolders") : t("mail.expandFolders")
            }
          >
            <PanelLeft className="h-4 w-4" />
          </Button>
        )}
        <div className="relative flex-1">
          <Search className="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            data-testid="mail-search-input"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t("mail.searchPlaceholder")}
            className="h-8 bg-background/80 pl-8 text-xs"
          />
        </div>
        {onToggleLayoutMode && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            data-testid="mail-layout-toggle-btn"
            onClick={onToggleLayoutMode}
            className="hidden h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground md:inline-flex"
            title={
              layoutMode === "split"
                ? t("mail.switchToList")
                : t("mail.switchToSplit")
            }
            aria-label={
              layoutMode === "split"
                ? t("mail.switchToList")
                : t("mail.switchToSplit")
            }
          >
            {layoutMode === "split" ? (
              <Rows2 className="h-4 w-4" />
            ) : (
              <Columns2 className="h-4 w-4" />
            )}
          </Button>
        )}
        {onRefresh && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onRefresh}
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
            title={t("mail.refresh")}
            aria-label={t("mail.refreshMail")}
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
              aria-label={t("mail.deselectAll")}
            >
              <CheckSquare className="h-4 w-4" />
            </button>
            <span className="font-semibold text-primary">
              {t("mail.selectedCount", { count: selectedIds.size })}
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
              title={t("mail.archiveSelected")}
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
              title={t("mail.trashSelected")}
              className="h-7 w-7 text-destructive hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              data-testid="bulk-read-btn"
              onClick={() => onBulkAction("read", Array.from(selectedIds))}
              title={t("mail.markAsRead")}
              className="h-7 w-7"
            >
              <MailCheck className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              data-testid="bulk-unread-btn"
              onClick={() => onBulkAction("unread", Array.from(selectedIds))}
              title={t("mail.markAsUnread")}
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
              aria-label={t("mail.selectAll")}
            >
              <Square className="h-3.5 w-3.5" />
            </button>
            <span>
              {totalCount && totalCount > threads.length
                ? t("mail.conversationsCountOf", {
                    count: threads.length,
                    total: totalCount,
                  })
                : t("mail.conversationsCount", { count: threads.length })}
            </span>
          </div>
        </div>
      )}

      {/* Thread Items List */}
      <div
        ref={scrollContainerRef}
        data-testid="thread-list-scroll-container"
        onScroll={(e) => {
          if (!hasNextPage || isFetchingNextPage || !onLoadMore) return
          const el = e.currentTarget
          if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) {
            onLoadMore()
          }
        }}
        className="flex min-h-0 flex-1 flex-col divide-y divide-border/20 overflow-y-auto"
      >
        {threads.length === 0 ? (
          <div
            data-testid="empty-threads-state"
            className="flex flex-1 flex-col items-center justify-center p-6 text-center text-xs text-muted-foreground"
          >
            <Mail className="mb-2 h-8 w-8 text-muted-foreground/40" />
            <p className="font-medium">
              {searchQuery ? t("mail.noMatches") : t("empty.mailTitle")}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground/80">
              {searchQuery
                ? t("mail.noMatchesDescription")
                : t("empty.mailDescription")}
            </p>
          </div>
        ) : (
          threads.map((thread) => {
            const isSelected = selectedThreadId === thread.id
            const isFocused = !isSelected && focusedThreadId === thread.id
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

            // Participants summary (cleanly excluding user's receiving account)
            const selfEmails = account?.email
              ? [account.email]
              : allAccountEmails
            const participantNames = formatThreadParticipants({
              participants: thread.participants,
              selfEmails,
              isSentBucket: Boolean(thread.inSent && !thread.inInbox),
            })

            return (
              <div
                key={thread.id}
                data-testid={`thread-row-${thread.id}`}
                onClick={() => onSelectThread(thread)}
                className={cn(
                  "group relative flex shrink-0 cursor-pointer gap-2 p-3 transition",
                  isSelected
                    ? "bg-accent/60"
                    : isFocused
                      ? "bg-accent/35 ring-1 ring-primary/40 ring-inset"
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
                    aria-label={thread.isUnread ? t("mail.unread") : undefined}
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
                        aria-label={t("mail.selectConversation")}
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
                        aria-label={
                          thread.isStarred ? t("mail.unstar") : t("mail.star")
                        }
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
                    {thread.subject || t("mail.noSubject")}
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
        {hasNextPage && (
          <div
            ref={loadMoreSentinelRef}
            data-testid="load-more-sentinel"
            className="flex shrink-0 items-center justify-center p-3"
          >
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="load-more-threads-btn"
              onClick={onLoadMore}
              disabled={isFetchingNextPage}
              className="h-8 w-full gap-1.5 text-xs"
            >
              {isFetchingNextPage ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>{t("common.loading")}</span>
                </>
              ) : (
                <span>{t("mail.loadMore")}</span>
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
