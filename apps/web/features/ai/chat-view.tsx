import { useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { useI18n, useTimezone } from "@saturn/hooks"
import {
  useDeleteThreadMutation,
  useListThreadsQuery,
  useUpdateThreadMutation,
  type Thread,
} from "@saturn/api/saturn/platform/ai/v1/ai"
import { useActiveSpaceContext } from "@/features/space/use-space"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { ThreadConversation } from "./components/thread-conversation"
import { cn } from "@/lib/utils"
import {
  MessageSquareIcon,
  PanelLeftIcon,
  PinIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"

interface ThreadGroup {
  label: string
  items: Thread[]
}

export function ChatView() {
  const { t } = useI18n()
  const { spaceId } = useActiveSpaceContext()
  const { threadId } = useParams<{ threadId?: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const tz = useTimezone()
  const [mobileThreadsOpen, setMobileThreadsOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Thread | null>(null)

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
      setDeleteTarget(null)
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
    if (pinned.length > 0)
      out.push({ label: t("ai.chat.pinned"), items: pinned })
    if (today.length > 0) out.push({ label: t("common.today"), items: today })
    if (yesterday.length > 0)
      out.push({ label: t("common.yesterday"), items: yesterday })
    if (earlier.length > 0)
      out.push({ label: t("ai.chat.earlier"), items: earlier })
    return out
  }, [data?.threads, tz, t])

  const handleSelectThread = (id?: string) => {
    if (!spaceId) return
    setMobileThreadsOpen(false)
    navigate(
      id ? `/space/${spaceId}/ai/chat/${id}` : `/space/${spaceId}/ai/chat`
    )
  }

  const handleConfirmDelete = () => {
    if (!deleteTarget?.id) return
    deleteThread.mutate({
      id: deleteTarget.id,
      req: { id: deleteTarget.id },
    })
  }

  const renderThreadList = () => (
    <ScrollArea className="min-h-0 flex-1">
      <div className="space-y-4 p-3">
        {groups.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            {t("ai.chat.emptyThreads")}
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
                        {th.title || t("ai.chat.newChat")}
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
                        th.isPinned
                          ? t("ai.chat.unpinThread")
                          : t("ai.chat.pinThread")
                      }
                      className={cn(
                        "cursor-pointer rounded p-1 transition-opacity hover:bg-background focus-visible:opacity-100",
                        th.isPinned
                          ? "opacity-100"
                          : "opacity-100 md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100"
                      )}
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
                      onClick={() => setDeleteTarget(th)}
                      aria-label={t("ai.chat.deleteThread")}
                      className="cursor-pointer rounded p-1 opacity-100 transition-opacity hover:bg-background hover:text-destructive focus-visible:opacity-100 md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100"
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
  )

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <aside className="hidden w-72 shrink-0 flex-col border-r border-border/50 bg-muted/15 md:flex">
        <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
          <div className="flex items-center gap-2">
            <MessageSquareIcon className="size-4 text-primary" />
            <h1 className="text-sm font-semibold">{t("ai.chat.threads")}</h1>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleSelectThread(undefined)}
            className="h-7 cursor-pointer gap-1 rounded-full px-2.5 text-xs"
          >
            <PlusIcon className="size-3.5" />
            {t("ai.chat.new")}
          </Button>
        </div>

        {renderThreadList()}
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-border/40 px-3 py-2 md:hidden">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setMobileThreadsOpen(true)}
            className="h-8 cursor-pointer gap-1.5 rounded-lg px-2.5 text-xs"
          >
            <PanelLeftIcon className="size-3.5" />
            {t("ai.chat.threads")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleSelectThread(undefined)}
            className="h-8 cursor-pointer gap-1 rounded-lg px-2.5 text-xs"
          >
            <PlusIcon className="size-3.5" />
            {t("ai.chat.newChat")}
          </Button>
        </div>

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

      <Sheet open={mobileThreadsOpen} onOpenChange={setMobileThreadsOpen}>
        <SheetContent side="left" className="flex w-80 flex-col p-0">
          <SheetHeader className="flex-row items-center justify-between border-b border-border/40 px-4 py-3 pr-12">
            <SheetTitle className="flex items-center gap-2 text-sm font-semibold">
              <MessageSquareIcon className="size-4 text-primary" />
              {t("ai.chat.threads")}
            </SheetTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleSelectThread(undefined)}
              className="h-7 cursor-pointer gap-1 rounded-full px-2.5 text-xs"
            >
              <PlusIcon className="size-3.5" />
              {t("ai.chat.new")}
            </Button>
          </SheetHeader>
          {renderThreadList()}
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("ai.chat.deleteThreadTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("ai.chat.deleteThreadPrefix")}{" "}
              <span className="font-semibold text-foreground">
                {deleteTarget?.title || t("ai.chat.newChat")}
              </span>
              {t("ai.chat.deleteThreadSuffix")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteThread.isPending}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteThread.isPending}
              onClick={handleConfirmDelete}
            >
              {deleteThread.isPending
                ? t("ai.chat.deleting")
                : t("ai.chat.deleteThreadTitle")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
