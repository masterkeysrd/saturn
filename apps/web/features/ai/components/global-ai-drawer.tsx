import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useListThreadsQuery } from "@saturn/api/saturn/platform/ai/v1/ai"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
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
} from "lucide-react"

export function GlobalAIDrawer() {
  const { spaceId } = useActiveSpaceContext()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [threadId, setThreadId] = useState<string | null>(null)
  const [pendingPrompt, setPendingPrompt] =
    useState<PendingDrawerPrompt | null>(null)

  const { data: threadsData } = useListThreadsQuery(
    { isArchived: false, pageSize: 15, pageToken: "" },
    { enabled: Boolean(spaceId) && open }
  )

  const recentThreads = threadsData?.threads ?? []
  const hasPendingApproval = recentThreads.some(
    (t) => t.status === "awaiting_approval"
  )

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault()
        setOpen((prev) => !prev)
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
  }, [])

  if (!spaceId) {
    return null
  }

  const handleExpandToFullChat = () => {
    setOpen(false)
    navigate(
      threadId
        ? `/space/${spaceId}/ai/chat/${threadId}`
        : `/space/${spaceId}/ai/chat`
    )
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="relative h-8 cursor-pointer gap-2 rounded-full border-border/60 px-3 text-xs"
        aria-label="Open Saturn AI Copilot"
      >
        <SparklesIcon className="size-3.5 text-primary" />
        <span className="hidden sm:inline">Ask AI</span>
        <Kbd className="hidden sm:inline-flex">⌘J</Kbd>
        {hasPendingApproval && (
          <span
            className="size-2 rounded-full bg-amber-500"
            title="Tool approval awaiting confirmation"
          />
        )}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="flex w-full max-w-[460px] flex-col gap-0 p-0 sm:max-w-[460px]"
        >
          <SheetHeader className="flex flex-row items-center justify-between space-y-0 border-b border-border/40 px-4 py-3">
            <div className="flex items-center gap-2">
              <SparklesIcon className="size-4 text-primary" />
              <SheetTitle className="text-sm font-semibold">
                Saturn Copilot
              </SheetTitle>
            </div>
            <div className="flex items-center gap-1 pr-6">
              {recentThreads.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        title="Recent threads"
                        aria-label="Recent threads"
                        className="size-7 cursor-pointer rounded-full"
                      />
                    }
                  >
                    <HistoryIcon className="size-3.5" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                    <DropdownMenuLabel className="text-xs">
                      Recent Conversations
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {recentThreads.map((th) => (
                      <DropdownMenuItem
                        key={th.id}
                        onClick={() => setThreadId(th.id ?? null)}
                        className="flex items-center justify-between gap-2 text-xs"
                      >
                        <span className="truncate">
                          {th.title || "New Chat"}
                        </span>
                        {th.id === threadId && (
                          <CheckIcon className="size-3.5 shrink-0 text-primary" />
                        )}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setThreadId(null)}
                title="New thread"
                aria-label="New thread"
                className="size-7 cursor-pointer rounded-full"
              >
                <PlusIcon className="size-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={handleExpandToFullChat}
                title="Expand to full chat"
                aria-label="Expand to full chat"
                className="size-7 cursor-pointer rounded-full"
              >
                <Maximize2Icon className="size-3.5" />
              </Button>
            </div>
          </SheetHeader>

          <ThreadConversation
            threadId={threadId}
            compact
            pendingPrompt={pendingPrompt}
            onPendingPromptConsumed={() => setPendingPrompt(null)}
            onThreadCreated={(th) => {
              if (th.id) setThreadId(th.id)
            }}
          />
        </SheetContent>
      </Sheet>
    </>
  )
}
