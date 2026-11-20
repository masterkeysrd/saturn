import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react"
import { useNavigate } from "react-router-dom"
import { useListThreadsQuery } from "@saturn/api/saturn/platform/ai/v1/ai"
import { useI18n, useTimezone } from "@saturn/hooks"
import { CopilotContextProvider, useCopilot } from "@saturn/hooks/ai"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { useActiveSpaceContext } from "@/features/space/use-space"
import {
  OPEN_AI_DRAWER_EVENT,
  type OpenAIDrawerDetail,
} from "../lib/drawer-events"
import {
  ThreadConversation,
  type PendingDrawerPrompt,
} from "./thread-conversation"
import {
  CheckIcon,
  HistoryIcon,
  Maximize2Icon,
  PlusIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react"

const COPILOT_WIDTH_STORAGE_KEY = "saturn:copilot-width"
const MIN_COPILOT_WIDTH = 380
const MAX_COPILOT_WIDTH = 640
const DEFAULT_COPILOT_WIDTH = 420

function clampCopilotWidth(width: number): number {
  if (!Number.isFinite(width)) return DEFAULT_COPILOT_WIDTH
  return Math.min(MAX_COPILOT_WIDTH, Math.max(MIN_COPILOT_WIDTH, width))
}

function readStoredCopilotWidth(): number {
  if (typeof window === "undefined") return DEFAULT_COPILOT_WIDTH
  try {
    const raw = window.localStorage.getItem(COPILOT_WIDTH_STORAGE_KEY)
    if (!raw) return DEFAULT_COPILOT_WIDTH
    return clampCopilotWidth(Number(raw))
  } catch {
    return DEFAULT_COPILOT_WIDTH
  }
}

function writeStoredCopilotWidth(width: number): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(COPILOT_WIDTH_STORAGE_KEY, String(width))
  } catch {
    // Ignore storage quota or sandbox restrictions
  }
}

export function GlobalAITrigger() {
  const { t } = useI18n()
  const { spaceId } = useActiveSpaceContext()
  const { isOpen, toggleOpen } = useCopilot()

  const { data: threadsData } = useListThreadsQuery(
    { isArchived: false, pageSize: 15, pageToken: "" },
    { enabled: Boolean(spaceId) && isOpen }
  )

  const recentThreads = threadsData?.threads ?? []
  const hasPendingApproval = recentThreads.some(
    (th) => th.status === "awaiting_approval"
  )

  if (!spaceId) {
    return null
  }

  return (
    <Button
      type="button"
      variant={isOpen ? "secondary" : "outline"}
      size="sm"
      onClick={toggleOpen}
      className="relative h-8 cursor-pointer gap-2 rounded-lg border-border/70 px-2.5 text-xs"
      aria-label={t("ai.drawer.openCopilot")}
      aria-expanded={isOpen}
    >
      <SparklesIcon className="size-3.5 text-primary" />
      <span className="hidden sm:inline">{t("ai.drawer.askAI")}</span>
      <Kbd className="hidden sm:inline-flex">⌘J</Kbd>
      {hasPendingApproval && (
        <span
          className="size-2 rounded-full bg-amber-500"
          title={t("ai.drawer.approvalPending")}
        />
      )}
    </Button>
  )
}

export function DockedCopilotSidebar() {
  const { t } = useI18n()
  const { spaceId } = useActiveSpaceContext()
  const tz = useTimezone()
  const navigate = useNavigate()
  const { isOpen, setOpen, toggleOpen, threadId, setThreadId } = useCopilot()

  const [pendingPrompt, setPendingPrompt] =
    useState<PendingDrawerPrompt | null>(null)
  const [width, setWidth] = useState<number>(() => readStoredCopilotWidth())
  const [prevSpaceId, setPrevSpaceId] = useState(spaceId)
  const widthRef = useRef(width)

  if (prevSpaceId !== spaceId) {
    setPrevSpaceId(spaceId)
    setPendingPrompt(null)
  }

  useEffect(() => {
    widthRef.current = width
  }, [width])

  const { data: threadsData } = useListThreadsQuery(
    { isArchived: false, pageSize: 15, pageToken: "" },
    { enabled: Boolean(spaceId) && isOpen }
  )

  const recentThreads = threadsData?.threads ?? []
  const activeThread = recentThreads.find((th) => th.id === threadId)
  const awaitingApprovalThread = recentThreads.find(
    (th) => th.status === "awaiting_approval"
  )

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault()
        toggleOpen()
      }
    }
    const handleOpenEvent = (event: Event) => {
      const detail = (event as CustomEvent<OpenAIDrawerDetail>).detail ?? {}
      if (detail.threadId !== undefined) {
        setThreadId(detail.threadId)
      } else if (detail.prompt) {
        setThreadId(null)
      }
      if (detail.prompt) {
        setPendingPrompt({
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          text: detail.prompt,
          autoSend: detail.autoSend,
        })
      }
      setOpen(true)
    }

    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener(OPEN_AI_DRAWER_EVENT, handleOpenEvent)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener(OPEN_AI_DRAWER_EVENT, handleOpenEvent)
    }
  }, [toggleOpen, setOpen, setThreadId])

  if (!spaceId || !isOpen) {
    return null
  }

  const handleResizePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = widthRef.current

    const handleMove = (moveEvent: PointerEvent | MouseEvent) => {
      const delta = startX - moveEvent.clientX
      const nextWidth = clampCopilotWidth(startWidth + delta)
      widthRef.current = nextWidth
      setWidth(nextWidth)
    }

    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove)
      window.removeEventListener("pointerup", handleUp)
      window.removeEventListener("mousemove", handleMove)
      window.removeEventListener("mouseup", handleUp)
      writeStoredCopilotWidth(widthRef.current)
    }

    window.addEventListener("pointermove", handleMove)
    window.addEventListener("pointerup", handleUp)
    window.addEventListener("mousemove", handleMove)
    window.addEventListener("mouseup", handleUp)
  }

  const handleResizeKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault()
      const next = clampCopilotWidth(width + 16)
      setWidth(next)
      writeStoredCopilotWidth(next)
    } else if (e.key === "ArrowRight") {
      e.preventDefault()
      const next = clampCopilotWidth(width - 16)
      setWidth(next)
      writeStoredCopilotWidth(next)
    }
  }

  const handleExpandToFullChat = () => {
    setOpen(false)
    navigate(
      threadId
        ? `/space/${spaceId}/ai/chat/${threadId}`
        : `/space/${spaceId}/ai/chat`
    )
  }

  const formatThreadTimestamp = (iso?: string) => {
    if (!iso) return ""
    if (tz.isToday(iso)) {
      return tz.formatTime
        ? tz.formatTime(iso, { hour: "numeric", minute: "2-digit" })
        : tz.format(iso, { hour: "numeric", minute: "2-digit" })
    }
    return tz.formatDate
      ? tz.formatDate(iso, { month: "short", day: "numeric" })
      : tz.format(iso, { month: "short", day: "numeric" })
  }

  const headerTitle = activeThread
    ? activeThread.title || t("ai.chat.newChat")
    : t("ai.drawer.copilot")

  return (
    <aside
      aria-label={t("ai.drawer.copilot")}
      style={{ "--copilot-width": `${width}px` } as CSSProperties}
      className="relative flex h-full w-full max-w-[420px] shrink-0 flex-col border-l border-border/60 bg-card max-md:fixed max-md:inset-y-0 max-md:right-0 max-md:z-40 max-md:shadow-2xl md:w-[var(--copilot-width)] md:max-w-none"
    >
      {/* Left-edge drag resize handle */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={t("ai.drawer.resize")}
        aria-valuemin={MIN_COPILOT_WIDTH}
        aria-valuemax={MAX_COPILOT_WIDTH}
        aria-valuenow={width}
        tabIndex={0}
        onPointerDown={handleResizePointerDown}
        onKeyDown={handleResizeKeyDown}
        className="absolute inset-y-0 left-0 z-10 hidden w-1.5 -translate-x-1/2 cursor-col-resize items-center justify-center transition-colors hover:bg-primary/25 focus-visible:bg-primary/35 focus-visible:outline-none md:flex"
      />

      {/* Copilot Header */}
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border/60 px-3">
        <div className="flex min-w-0 items-center gap-2">
          <SparklesIcon className="size-4 shrink-0 text-primary" />
          <h2 className="truncate text-sm font-semibold text-foreground">
            {headerTitle}
          </h2>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {recentThreads.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    title={t("ai.drawer.recentThreads")}
                    aria-label={t("ai.drawer.recentThreads")}
                    className="size-7 cursor-pointer rounded-lg"
                  />
                }
              >
                <HistoryIcon className="size-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel className="text-xs">
                  {t("ai.drawer.recentConversations")}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {recentThreads.map((th) => {
                  const isAwaiting = th.status === "awaiting_approval"
                  const timestamp = formatThreadTimestamp(th.lastMessageAt)
                  return (
                    <DropdownMenuItem
                      key={th.id}
                      onClick={() => setThreadId(th.id ?? null)}
                      className="flex items-center justify-between gap-2 text-xs"
                    >
                      <span className="flex min-w-0 flex-1 items-center gap-1.5">
                        {isAwaiting && (
                          <span
                            className="size-2 shrink-0 rounded-full bg-amber-500"
                            aria-label={t("ai.drawer.awaitingApproval")}
                            title={t("ai.drawer.awaitingApproval")}
                          />
                        )}
                        <span className="truncate">
                          {th.title || t("ai.chat.newChat")}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground tabular-nums">
                        {timestamp && <span>{timestamp}</span>}
                        {th.id === threadId && (
                          <CheckIcon className="size-3.5 text-primary" />
                        )}
                      </span>
                    </DropdownMenuItem>
                  )
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => setThreadId(null)}
            title={t("ai.drawer.newThread")}
            aria-label={t("ai.drawer.newThread")}
            className="size-7 cursor-pointer rounded-lg"
          >
            <PlusIcon className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={handleExpandToFullChat}
            title={t("ai.drawer.expand")}
            aria-label={t("ai.drawer.expand")}
            className="size-7 cursor-pointer rounded-lg"
          >
            <Maximize2Icon className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => setOpen(false)}
            title={t("ai.drawer.close")}
            aria-label={t("ai.drawer.close")}
            className="size-7 cursor-pointer rounded-lg"
          >
            <XIcon className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Pending Approval Banner */}
      {awaitingApprovalThread && threadId !== awaitingApprovalThread.id && (
        <div
          role="status"
          className="flex shrink-0 items-center justify-between gap-2 border-b border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs"
        >
          <div className="flex min-w-0 items-center gap-2">
            <span className="size-2 shrink-0 rounded-full bg-amber-500" />
            <span className="truncate font-medium text-amber-800 dark:text-amber-300">
              {t("ai.drawer.approvalNeeded", {
                title: awaitingApprovalThread.title || t("ai.chat.newChat"),
              })}
            </span>
          </div>
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={() => setThreadId(awaitingApprovalThread.id ?? null)}
            className="h-6 shrink-0 cursor-pointer rounded-md border-amber-500/40 bg-background/80 px-2 text-[11px] font-medium text-amber-800 hover:bg-amber-500/15 dark:text-amber-300"
          >
            {t("ai.drawer.review")}
          </Button>
        </div>
      )}

      <ThreadConversation
        key={spaceId}
        threadId={threadId}
        compact
        pendingPrompt={pendingPrompt}
        onPendingPromptConsumed={() => setPendingPrompt(null)}
        onThreadCreated={(th) => {
          if (th.id) setThreadId(th.id)
        }}
      />
    </aside>
  )
}

export function GlobalAIDrawer({
  triggerOnly = false,
}: {
  triggerOnly?: boolean
} = {}) {
  const { spaceId } = useActiveSpaceContext()
  const { hasProvider } = useCopilot()

  if (triggerOnly) {
    return <GlobalAITrigger />
  }

  if (hasProvider) {
    return (
      <>
        <GlobalAITrigger />
        <DockedCopilotSidebar />
      </>
    )
  }

  return (
    <CopilotContextProvider spaceId={spaceId}>
      <GlobalAITrigger />
      <DockedCopilotSidebar />
    </CopilotContextProvider>
  )
}
