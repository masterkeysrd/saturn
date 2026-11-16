import { useMemo } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { useTimezone } from "@saturn/hooks"
import {
  useDeleteThreadMutation,
  useListThreadsQuery,
  useUpdateThreadMutation,
  type Thread,
} from "@saturn/api/saturn/platform/ai/v1/ai"
import { useActiveSpaceContext } from "@/features/space/use-space"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ThreadConversation } from "./components/thread-conversation"
import { cn } from "@/lib/utils"
import { MessageSquareIcon, PinIcon, PlusIcon, Trash2Icon } from "lucide-react"

interface ThreadGroup {
  label: string
  items: Thread[]
}

export function ChatView() {
  const { spaceId } = useActiveSpaceContext()
  const { threadId } = useParams<{ threadId?: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const tz = useTimezone()

  const { data } = useListThreadsQuery({
    isArchived: false,
    pageSize: 50,
    pageToken: "",
  })

  const updateThread = useUpdateThreadMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["/api/v1/platform/ai/threads"],
      })
    },
  })

  const deleteThread = useDeleteThreadMutation({
    onSuccess: (_, vars) => {
      void queryClient.invalidateQueries({
        queryKey: ["/api/v1/platform/ai/threads"],
      })
      if (vars.id === threadId && spaceId) {
        navigate(`/space/${spaceId}/ai/chat`, { replace: true })
      }
    },
  })

  const groups = useMemo<ThreadGroup[]>(() => {
    const threads = data?.threads ?? []
    const pinned: Thread[] = []
    const today: Thread[] = []
    const yesterday: Thread[] = []
    const earlier: Thread[] = []

    for (const th of threads) {
      if (th.isPinned) {
        pinned.push(th)
        continue
      }
      const ts = th.lastMessageAt || th.createTime
      if (ts && tz.isToday(ts)) {
        today.push(th)
      } else if (ts && tz.isYesterday(ts)) {
        yesterday.push(th)
      } else {
        earlier.push(th)
      }
    }

    const out: ThreadGroup[] = []
    if (pinned.length > 0) out.push({ label: "Pinned", items: pinned })
    if (today.length > 0) out.push({ label: "Today", items: today })
    if (yesterday.length > 0) out.push({ label: "Yesterday", items: yesterday })
    if (earlier.length > 0) out.push({ label: "Earlier", items: earlier })
    return out
  }, [data?.threads, tz])

  const handleSelectThread = (id?: string) => {
    if (!spaceId) return
    navigate(
      id ? `/space/${spaceId}/ai/chat/${id}` : `/space/${spaceId}/ai/chat`
    )
  }

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <aside className="hidden w-72 shrink-0 flex-col border-r border-border/50 bg-muted/15 md:flex">
        <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
          <div className="flex items-center gap-2">
            <MessageSquareIcon className="size-4 text-primary" />
            <h1 className="text-sm font-semibold">Threads</h1>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleSelectThread(undefined)}
            className="h-7 cursor-pointer gap-1 rounded-full px-2.5 text-xs"
          >
            <PlusIcon className="size-3.5" />
            New
          </Button>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-4 p-3">
            {groups.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                Start a conversation to save your private chat history.
              </p>
            ) : (
              groups.map((grp) => (
                <div key={grp.label} className="space-y-1">
                  <div className="px-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                    {grp.label}
                  </div>
                  {grp.items.map((th) => {
                    const isActive = th.id === threadId
                    return (
                      <div
                        key={th.id}
                        className={cn(
                          "group flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-xs transition-colors",
                          isActive
                            ? "bg-secondary text-foreground"
                            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => handleSelectThread(th.id)}
                          className="min-w-0 flex-1 cursor-pointer text-left"
                        >
                          <div className="truncate font-medium">
                            {th.title || "New Chat"}
                          </div>
                          {th.agentName && (
                            <div className="truncate text-[10px] text-muted-foreground">
                              {th.agentName}
                            </div>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            updateThread.mutate({
                              id: th.id ?? "",
                              req: {
                                id: th.id ?? "",
                                thread: { isPinned: !th.isPinned } as Thread,
                                updateMask: { paths: ["is_pinned"] },
                              },
                            })
                          }
                          aria-label={
                            th.isPinned ? "Unpin thread" : "Pin thread"
                          }
                          className="cursor-pointer rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-background"
                        >
                          <PinIcon
                            className={cn(
                              "size-3",
                              th.isPinned && "fill-current text-primary"
                            )}
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            deleteThread.mutate({
                              id: th.id ?? "",
                              req: { id: th.id ?? "" },
                            })
                          }
                          aria-label="Delete thread"
                          className="cursor-pointer rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-background hover:text-destructive"
                        >
                          <Trash2Icon className="size-3" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <ThreadConversation
          threadId={threadId ?? null}
          onThreadCreated={(created) => {
            if (created.id) {
              handleSelectThread(created.id)
            }
            void queryClient.invalidateQueries({
              queryKey: ["/api/v1/platform/ai/threads"],
            })
          }}
        />
      </div>
    </div>
  )
}
