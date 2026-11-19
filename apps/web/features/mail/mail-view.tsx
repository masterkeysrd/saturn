import { useState, useMemo, useEffect, useRef, useCallback } from "react"
import {
  useInRouterContext,
  useNavigate,
  useSearchParams,
} from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import {
  useInfiniteMailThreads,
  useModifyThread,
  useBatchModifyThreads,
  useSaveDraft,
  useSendDraft,
  useDeleteDraft,
  useConnectedAccounts,
  useInitiateOAuth,
  useSyncConnectedAccount,
  useI18n,
  type ConnectedAccount,
} from "@saturn/hooks"
import { useRegisterCopilotView } from "@saturn/hooks/ai"
import { buildCopilotEntityKey, filterReauthMailAccounts } from "@saturn/core"
import type {
  Thread,
  Message,
  Draft,
  MailboxRole,
  ListThreadsRequest,
  Attachment,
} from "@saturn/api/saturn/mail/v1/mail"
import { useSpacePermissions } from "@/features/space/use-space"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { MailboxRail } from "./components/mailbox-rail"
import { ThreadList } from "./components/thread-list"
import { ThreadReader } from "./components/thread-reader"
import { MailComposer } from "./components/mail-composer"
import { StageToFinanceDialog } from "./components/stage-to-finance-dialog"
import { EventDialog } from "@/features/calendar/components/event-dialog"
import { toast } from "@/components/ui/toast"
import {
  buildFinanceStageDefaults,
  clampMailListWidth,
  MAIL_LIST_MAX_WIDTH,
  MAIL_LIST_MIN_WIDTH,
  readMailLayoutPref,
  readMailListWidthPref,
  readMailRailOpenPref,
  UNDO_SEND_DELAY_MS,
  writeMailLayoutPref,
  writeMailListWidthPref,
  writeMailRailOpenPref,
  type MailLayoutMode,
  type StageToFinanceInitialData,
} from "./mail-utils"

function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState<boolean>(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return true
    }
    return window.matchMedia("(min-width: 768px)").matches
  })

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return
    }
    const mq = window.matchMedia("(min-width: 768px)")
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches)
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])

  return isDesktop
}

function MailSearchParamsSync({
  onSelectThreadId,
  onOpenCompose,
  onNavigateReady,
}: {
  onSelectThreadId: (threadId: string) => void
  onOpenCompose: () => void
  onNavigateReady?: (navigateFn: (to: string) => void) => void
}) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const paramThreadId = searchParams.get("threadId")
  const paramCompose = searchParams.get("compose")
  const paramOAuth = searchParams.get("oauth")
  const lastThreadIdRef = useRef<string | null>(null)
  const handledOAuthRef = useRef(false)

  useEffect(() => {
    onNavigateReady?.(navigate)
  }, [navigate, onNavigateReady])

  useEffect(() => {
    if (paramThreadId && paramThreadId !== lastThreadIdRef.current) {
      lastThreadIdRef.current = paramThreadId
      onSelectThreadId(paramThreadId)
    } else if (!paramThreadId) {
      lastThreadIdRef.current = null
    }
  }, [paramThreadId, onSelectThreadId])

  useEffect(() => {
    if (paramCompose === "1" || paramCompose === "true") {
      onOpenCompose()
      const next = new URLSearchParams(searchParams)
      next.delete("compose")
      setSearchParams(next, { replace: true })
    }
  }, [paramCompose, searchParams, setSearchParams, onOpenCompose])

  useEffect(() => {
    if (paramOAuth === "success" && !handledOAuthRef.current) {
      handledOAuthRef.current = true
      toast.add({
        title: t("mail.reauth.reconnectedSuccess"),
        type: "success",
      })
      void queryClient.invalidateQueries({ queryKey: ["connector"] })
      void queryClient.invalidateQueries({ queryKey: ["mail"] })
      const next = new URLSearchParams(searchParams)
      next.delete("oauth")
      setSearchParams(next, { replace: true })
    } else if (paramOAuth !== "success") {
      handledOAuthRef.current = false
    }
  }, [paramOAuth, searchParams, setSearchParams, queryClient, t])

  return null
}

export function MailView() {
  const { t } = useI18n()
  const inRouter = useInRouterContext()
  const navigateRef = useRef<((to: string) => void) | null>(null)
  const isDesktop = useIsDesktop()
  const { spaceId, canManageSpace } = useSpacePermissions()
  const { data: accountsData } = useConnectedAccounts({ spaceId })
  const initiateOAuthMutation = useInitiateOAuth()
  const accounts = useMemo(() => {
    return (accountsData?.accounts || []).filter(
      (a) =>
        a.enabledCapabilities?.includes("mail") ||
        a.enabledCapabilities?.includes("MAIL")
    )
  }, [accountsData])

  // Pane & layout state
  const [railOpen, setRailOpen] = useState<boolean>(() =>
    readMailRailOpenPref()
  )
  const [mobileRailOpen, setMobileRailOpen] = useState(false)
  const [layoutMode, setLayoutMode] = useState<MailLayoutMode>(() =>
    readMailLayoutPref()
  )
  const [listWidth, setListWidth] = useState<number>(() =>
    readMailListWidthPref()
  )
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  const handleToggleRail = useCallback(() => {
    if (isDesktop) {
      setRailOpen((prev) => {
        const next = !prev
        writeMailRailOpenPref(next)
        return next
      })
    } else {
      setMobileRailOpen((prev) => !prev)
    }
  }, [isDesktop])

  const handleToggleLayoutMode = useCallback(() => {
    setLayoutMode((prev) => {
      const next: MailLayoutMode = prev === "split" ? "list" : "split"
      writeMailLayoutPref(next)
      return next
    })
  }, [])

  // Navigation filter state
  const [selectedRole, setSelectedRole] =
    useState<MailboxRole>("MAILBOX_ROLE_INBOX")
  const [selectedAccountId, setSelectedAccountId] = useState<
    string | undefined
  >()
  const [selectedMailboxId, setSelectedMailboxId] = useState<
    string | undefined
  >()
  const [searchQuery, setSearchQuery] = useState("")

  // Active selected & keyboard-focused thread
  const [selectedThreadId, setSelectedThreadId] = useState<string | undefined>()
  const [focusedThreadId, setFocusedThreadId] = useState<string | undefined>()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Compose modal state
  const [composeOpen, setComposeOpen] = useState(false)
  const [reopenedDraft, setReopenedDraft] = useState<
    Partial<Draft> | undefined
  >()
  const [replyTrigger, setReplyTrigger] = useState<{
    threadId: string
    seq: number
  } | null>(null)

  // Event dialog handoff state
  const [eventDialogOpen, setEventDialogOpen] = useState(false)
  const [eventDialogInitialValues, setEventDialogInitialValues] = useState<{
    title: string
    description: string
    sourceMailMessageId: string
    attendees: Array<{ email: string; displayName?: string }>
  }>({
    title: "",
    description: "",
    sourceMailMessageId: "",
    attendees: [],
  })

  // Stage to Finance Inbox dialog state
  const [stageDialogOpen, setStageDialogOpen] = useState(false)
  const [stageInitialData, setStageInitialData] =
    useState<StageToFinanceInitialData | null>(null)

  const [prevSpaceId, setPrevSpaceId] = useState(spaceId)
  if (prevSpaceId !== spaceId) {
    setPrevSpaceId(spaceId)
    setSelectedRole("MAILBOX_ROLE_INBOX")
    setSelectedAccountId(undefined)
    setSelectedMailboxId(undefined)
    setSearchQuery("")
    setSelectedThreadId(undefined)
    setFocusedThreadId(undefined)
    setSelectedIds(new Set())
    setComposeOpen(false)
    setReopenedDraft(undefined)
    setEventDialogOpen(false)
    setStageDialogOpen(false)
    setStageInitialData(null)
    setReplyTrigger(null)
  }

  // Build filter query for useInfiniteMailThreads
  const filter = useMemo<ListThreadsRequest>(() => {
    const f: ListThreadsRequest = {
      connectedAccountId: selectedAccountId || "",
      mailboxId: selectedMailboxId || "",
      systemBucket: selectedMailboxId
        ? ("MAILBOX_ROLE_UNSPECIFIED" as MailboxRole)
        : selectedRole,
      query: searchQuery.trim(),
      pageSize: 50,
      pageToken: "",
    }
    return f
  }, [selectedAccountId, selectedMailboxId, selectedRole, searchQuery])

  // Fetch threads with pagination
  const {
    data: threadsData,
    isLoading: threadsLoading,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    refetch: refetchThreads,
  } = useInfiniteMailThreads(filter)

  const threads = useMemo(() => {
    const seen = new Set<string>()
    const list: Thread[] = []
    for (const page of threadsData?.pages || []) {
      for (const t of page.threads || []) {
        if (!seen.has(t.id)) {
          seen.add(t.id)
          list.push(t)
        }
      }
    }
    return list
  }, [threadsData])

  const totalCount = threadsData?.pages[0]?.totalSize

  // Active selected thread (no conversation selected by default until clicked)
  const activeThread = useMemo(() => {
    if (!selectedThreadId) return undefined
    return threads.find((t) => t.id === selectedThreadId)
  }, [threads, selectedThreadId])

  useRegisterCopilotView({
    viewId: "mail.inbox",
    title: "Mail",
    activeEntity: activeThread?.id
      ? {
          key: buildCopilotEntityKey("mail_thread", activeThread.id),
          kind: "mail_thread",
          id: activeThread.id,
          label: activeThread.subject || t("mail.noSubject"),
          summary: {
            isUnread: Boolean(activeThread.isUnread),
            messageCount: activeThread.messageCount,
          },
        }
      : undefined,
    suggestions: activeThread
      ? [
          t("mail.suggestion.threadSummarize"),
          t("mail.suggestion.threadReply"),
          t("mail.suggestion.threadDeadlines"),
        ]
      : [
          t("mail.suggestion.inboxSummarize"),
          t("mail.suggestion.inboxReplies"),
          t("mail.suggestion.inboxReceipts"),
        ],
  })

  // Mutations
  const modifyThreadMutation = useModifyThread({
    onError: (err) => {
      toast.add({
        title: t("mail.actionFailed"),
        description: err.message,
        type: "error",
      })
    },
  })

  // Auto-mark conversation as read when viewed (Gmail / Apple Mail standard)
  const markedAsReadRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!activeThread?.id || !activeThread.isUnread) return
    if (markedAsReadRef.current.has(activeThread.id)) return

    const threadToMark = activeThread.id
    const timer = setTimeout(() => {
      markedAsReadRef.current.add(threadToMark)
      modifyThreadMutation.mutate({
        id: threadToMark,
        req: { id: threadToMark, isUnread: false },
      })
    }, 750)

    return () => clearTimeout(timer)
  }, [activeThread?.id, activeThread?.isUnread, modifyThreadMutation])

  const batchModifyMutation = useBatchModifyThreads({
    onError: (err) => {
      toast.add({
        title: t("mail.bulkActionFailed"),
        description: err.message,
        type: "error",
      })
    },
  })

  const saveDraftMutation = useSaveDraft()
  const sendDraftMutation = useSendDraft()
  const deleteDraftMutation = useDeleteDraft({
    onSuccess: () => {
      toast.add({ title: t("mail.discarded"), type: "success" })
      refetchThreads()
    },
    onError: (err) => {
      toast.add({
        title: t("mail.failedToDiscardDraft"),
        description: err.message,
        type: "error",
      })
    },
  })

  const syncAccountMutation = useSyncConnectedAccount({
    onSuccess: () => {
      refetchThreads()
    },
  })

  const handleRefresh = () => {
    refetchThreads()
    const targetAccountId = selectedAccountId || accounts[0]?.id
    if (targetAccountId) {
      syncAccountMutation.mutate({ id: targetAccountId })
    }
  }

  // Actions
  const handleArchiveThread = useCallback(
    (thread: Thread) => {
      if (selectedThreadId === thread.id) {
        const idx = threads.findIndex((t) => t.id === thread.id)
        const nextThread = threads[idx + 1] || threads[idx - 1]
        setSelectedThreadId(nextThread?.id)
        setFocusedThreadId(nextThread?.id)
      }

      modifyThreadMutation.mutate({
        id: thread.id,
        req: { id: thread.id, inInbox: false },
      })

      toast.add({
        title: t("mail.conversationArchived"),
        type: "success",
        actionProps: {
          children: t("common.undo"),
          onClick: () => {
            modifyThreadMutation.mutate({
              id: thread.id,
              req: { id: thread.id, inInbox: true },
            })
            setSelectedThreadId(thread.id)
            setFocusedThreadId(thread.id)
            toast.add({
              title: t("mail.conversationRestoredToInbox"),
              type: "success",
            })
          },
        },
      })
    },
    [selectedThreadId, threads, modifyThreadMutation, t]
  )

  const handleTrashThread = useCallback(
    (thread: Thread) => {
      if (selectedThreadId === thread.id) {
        const idx = threads.findIndex((t) => t.id === thread.id)
        const nextThread = threads[idx + 1] || threads[idx - 1]
        setSelectedThreadId(nextThread?.id)
        setFocusedThreadId(nextThread?.id)
      }

      modifyThreadMutation.mutate({
        id: thread.id,
        req: { id: thread.id, inTrash: true },
      })

      toast.add({
        title: t("mail.conversationTrash"),
        type: "success",
        actionProps: {
          children: t("common.undo"),
          onClick: () => {
            modifyThreadMutation.mutate({
              id: thread.id,
              req: { id: thread.id, inTrash: false, inInbox: true },
            })
            setSelectedThreadId(thread.id)
            setFocusedThreadId(thread.id)
            toast.add({
              title: t("mail.conversationRestored"),
              type: "success",
            })
          },
        },
      })
    },
    [selectedThreadId, threads, modifyThreadMutation, t]
  )

  const handleToggleStar = useCallback(
    (thread: Thread) => {
      modifyThreadMutation.mutate({
        id: thread.id,
        req: { id: thread.id, isStarred: !thread.isStarred },
      })
    },
    [modifyThreadMutation]
  )

  const handleToggleRead = useCallback(
    (thread: Thread) => {
      if (thread.isUnread) {
        // User is explicitly marking as unread: remove from auto-marked set
        markedAsReadRef.current.delete(thread.id)
      }
      modifyThreadMutation.mutate({
        id: thread.id,
        req: { id: thread.id, isUnread: !thread.isUnread },
      })
    },
    [modifyThreadMutation]
  )

  const handleBulkAction = useCallback(
    (action: "archive" | "trash" | "read" | "unread", threadIds: string[]) => {
      if (threadIds.length === 0) return

      if (action === "archive") {
        batchModifyMutation.mutate({
          ids: threadIds,
          inInbox: false,
        })
        toast.add({
          title: t("mail.conversationsArchived", { count: threadIds.length }),
          type: "success",
        })
      } else if (action === "trash") {
        batchModifyMutation.mutate({
          ids: threadIds,
          inTrash: true,
        })
        toast.add({
          title: t("mail.conversationsTrash", { count: threadIds.length }),
          type: "success",
        })
      } else if (action === "read") {
        batchModifyMutation.mutate({
          ids: threadIds,
          isUnread: false,
        })
      } else if (action === "unread") {
        batchModifyMutation.mutate({
          ids: threadIds,
          isUnread: true,
        })
      }
    },
    [batchModifyMutation, t]
  )

  // Undo Send (7s buffer timer)
  const pendingSendsRef = useRef<
    Map<
      string,
      {
        timer: ReturnType<typeof setTimeout>
        draft: Partial<Draft>
      }
    >
  >(new Map())
  const sendDraftMutationRef = useRef(sendDraftMutation)
  useEffect(() => {
    sendDraftMutationRef.current = sendDraftMutation
  }, [sendDraftMutation])

  // Flush any un-cancelled sends if user navigates away before 7s expires
  useEffect(() => {
    const pendingMap = pendingSendsRef.current
    return () => {
      for (const [draftId, entry] of pendingMap.entries()) {
        clearTimeout(entry.timer)
        void sendDraftMutationRef.current.mutateAsync({ id: draftId })
      }
      pendingMap.clear()
    }
  }, [])

  // Handle send from compose modal or inline reply with 7s Undo Send buffer
  const handleSendMail = async (data: {
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
  }) => {
    // 1. Save draft immediately so content & attachments are safely persisted
    const mappedTo = data.to.map((t) => ({
      email: t.email,
      name: t.displayName || "",
      avatarUrl: "",
      isVerified: false,
    }))
    const mappedCc = data.cc.map((t) => ({
      email: t.email,
      name: t.displayName || "",
      avatarUrl: "",
      isVerified: false,
    }))
    const mappedBcc = data.bcc.map((t) => ({
      email: t.email,
      name: t.displayName || "",
      avatarUrl: "",
      isVerified: false,
    }))

    const draft = await saveDraftMutation.mutateAsync({
      id: data.id,
      connectedAccountId: data.connectedAccountId,
      threadId: data.threadId,
      replyToMessageId: data.replyToMessageId,
      to: mappedTo,
      cc: mappedCc,
      bcc: mappedBcc,
      subject: data.subject,
      bodyHtml: data.bodyHtml,
      bodyText: data.bodyText,
      attachments: data.attachments,
    })

    const draftId = draft?.id
    if (!draftId) return

    const existingPending = pendingSendsRef.current.get(draftId)
    if (existingPending) {
      clearTimeout(existingPending.timer)
      pendingSendsRef.current.delete(draftId)
    }

    const draftSnapshot: Partial<Draft> = {
      ...draft,
      id: draftId,
      connectedAccountId: data.connectedAccountId,
      threadId: data.threadId || draft.threadId,
      replyToMessageId: data.replyToMessageId || draft.replyToMessageId,
      to: mappedTo,
      cc: mappedCc,
      bcc: mappedBcc,
      subject: data.subject,
      bodyHtml: data.bodyHtml,
      bodyText: data.bodyText,
      attachments: data.attachments ?? draft.attachments ?? [],
    }

    const timer = setTimeout(() => {
      pendingSendsRef.current.delete(draftId)
      void sendDraftMutationRef.current
        .mutateAsync({ id: draftId })
        .then(() => {
          toast.add({ title: t("mail.emailSent"), type: "success" })
        })
        .catch((err: unknown) => {
          toast.add({
            title: t("mail.failedToSend"),
            description:
              err instanceof Error ? err.message : t("mail.anErrorOccurred"),
            type: "error",
          })
        })
    }, UNDO_SEND_DELAY_MS)

    pendingSendsRef.current.set(draftId, {
      timer,
      draft: draftSnapshot,
    })

    toast.add({
      title: t("mail.sending"),
      type: "info",
      timeout: UNDO_SEND_DELAY_MS,
      actionProps: {
        children: t("common.undo"),
        onClick: () => {
          const pending = pendingSendsRef.current.get(draftId)
          if (!pending) return
          clearTimeout(pending.timer)
          pendingSendsRef.current.delete(draftId)
          setReopenedDraft(pending.draft)
          setComposeOpen(true)
          toast.add({
            title: t("mail.sendCancelled"),
            type: "info",
          })
        },
      },
    })
  }

  // Open "Create Calendar Event from Email" dialog
  const handleOpenCreateEventDialog = (eventData: {
    title: string
    description: string
    sourceMailMessageId: string
    attendees: Array<{ email: string; displayName?: string }>
  }) => {
    setEventDialogInitialValues(eventData)
    setEventDialogOpen(true)
  }

  // Open "Stage to Finance Inbox" dialog
  const handleOpenStageToFinance = (thread: Thread, message?: Message) => {
    setStageInitialData(buildFinanceStageDefaults(thread, message))
    setStageDialogOpen(true)
  }

  const isStackedMode = !isDesktop || layoutMode === "list"

  // Superhuman-grade keyboard triage
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) {
        return
      }

      const target = e.target as HTMLElement | null
      if (target) {
        const tag = target.tagName
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          tag === "IFRAME" ||
          target.isContentEditable ||
          (typeof target.closest === "function" &&
            (target.closest('[role="combobox"]') ||
              target.closest('[role="dialog"]') ||
              target.closest('[role="alertdialog"]') ||
              target.closest('[contenteditable="true"]')))
        ) {
          return
        }
      }

      if (
        composeOpen ||
        eventDialogOpen ||
        stageDialogOpen ||
        (typeof document !== "undefined" &&
          (document.querySelector(
            '[role="dialog"]:not([data-slot="toast"]), [role="alertdialog"]'
          ) ||
            document.querySelector('[data-testid="mail-compose-modal"]')))
      ) {
        return
      }

      const activeId = selectedThreadId || focusedThreadId
      const currentIndex = activeId
        ? threads.findIndex((t) => t.id === activeId)
        : -1
      const currentThread =
        currentIndex !== -1 ? threads[currentIndex] : undefined

      switch (e.key) {
        case "/":
          e.preventDefault()
          searchInputRef.current?.focus()
          break
        case "j":
        case "J": {
          e.preventDefault()
          if (threads.length === 0) break
          const next =
            currentIndex === -1
              ? threads[0]
              : threads[Math.min(threads.length - 1, currentIndex + 1)]
          if (next) {
            setFocusedThreadId(next.id)
            if (!isStackedMode || selectedThreadId) {
              setSelectedThreadId(next.id)
            }
          }
          break
        }
        case "k":
        case "K": {
          e.preventDefault()
          if (threads.length === 0) break
          const prev =
            currentIndex === -1
              ? threads[0]
              : threads[Math.max(0, currentIndex - 1)]
          if (prev) {
            setFocusedThreadId(prev.id)
            if (!isStackedMode || selectedThreadId) {
              setSelectedThreadId(prev.id)
            }
          }
          break
        }
        case "Enter": {
          const targetThread = currentThread || threads[0]
          if (targetThread) {
            e.preventDefault()
            setFocusedThreadId(targetThread.id)
            setSelectedThreadId(targetThread.id)
          }
          break
        }
        case "Escape":
          if (isStackedMode && selectedThreadId) {
            e.preventDefault()
            setSelectedThreadId(undefined)
          }
          break
        case "e":
        case "E":
          e.preventDefault()
          if (selectedIds.size > 0) {
            handleBulkAction("archive", Array.from(selectedIds))
            setSelectedIds(new Set())
          } else if (currentThread) {
            handleArchiveThread(currentThread)
          }
          break
        case "#":
        case "Delete":
          e.preventDefault()
          if (selectedIds.size > 0) {
            handleBulkAction("trash", Array.from(selectedIds))
            setSelectedIds(new Set())
          } else if (currentThread) {
            handleTrashThread(currentThread)
          }
          break
        case "s":
        case "S":
          e.preventDefault()
          if (currentThread) {
            handleToggleStar(currentThread)
          }
          break
        case "u":
        case "U":
          e.preventDefault()
          if (selectedIds.size > 0) {
            handleBulkAction("unread", Array.from(selectedIds))
          } else if (currentThread) {
            handleToggleRead(currentThread)
          }
          break
        case "c":
        case "C":
          e.preventDefault()
          setReopenedDraft(undefined)
          setComposeOpen(true)
          break
        case "r":
        case "R":
          e.preventDefault()
          if (currentThread) {
            setSelectedThreadId(currentThread.id)
            setReplyTrigger((prev) => ({
              threadId: currentThread.id,
              seq: (prev?.seq ?? 0) + 1,
            }))
          }
          break
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [
    threads,
    selectedThreadId,
    focusedThreadId,
    selectedIds,
    isStackedMode,
    composeOpen,
    eventDialogOpen,
    stageDialogOpen,
    handleArchiveThread,
    handleTrashThread,
    handleToggleStar,
    handleToggleRead,
    handleBulkAction,
  ])

  // Split pane resizer drag handler
  const handleStartResize = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = listWidth

    const onMouseMove = (moveEvent: MouseEvent) => {
      const next = clampMailListWidth(startWidth + (moveEvent.clientX - startX))
      setListWidth(next)
    }
    const onMouseUp = (upEvent: MouseEvent) => {
      const finalWidth = clampMailListWidth(
        startWidth + (upEvent.clientX - startX)
      )
      setListWidth(finalWidth)
      writeMailListWidthPref(finalWidth)
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mouseup", onMouseUp)
    }

    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mouseup", onMouseUp)
  }

  const handleResizerKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault()
      const next = clampMailListWidth(listWidth - 16)
      setListWidth(next)
      writeMailListWidthPref(next)
    } else if (e.key === "ArrowRight") {
      e.preventDefault()
      const next = clampMailListWidth(listWidth + 16)
      setListWidth(next)
      writeMailListWidthPref(next)
    }
  }

  const reauthAccounts = useMemo(
    () => filterReauthMailAccounts(accountsData?.accounts),
    [accountsData?.accounts]
  )

  const navigateToConnectedAccounts = useCallback(() => {
    if (navigateRef.current) {
      navigateRef.current("/settings/connected-accounts")
    } else if (typeof window !== "undefined") {
      window.location.assign("/settings/connected-accounts")
    }
  }, [])

  const handleReconnectAccount = useCallback(
    async (account?: ConnectedAccount) => {
      if (account && canManageSpace) {
        try {
          const returnUrl =
            typeof window !== "undefined"
              ? window.location.href.split("?")[0]
              : ""
          const res = await initiateOAuthMutation.mutateAsync({
            provider: account.provider || "google",
            returnUrl,
            capabilities: account.enabledCapabilities?.length
              ? account.enabledCapabilities
              : ["calendar", "mail", "contacts"],
            connectedAccountId: account.id,
          })
          if (res.authUrl && typeof window !== "undefined") {
            window.location.assign(res.authUrl)
          }
        } catch (err) {
          toast.add({
            title: t("mail.actionFailed"),
            description:
              err instanceof Error ? err.message : t("mail.anErrorOccurred"),
            type: "error",
          })
        }
        return
      }

      navigateToConnectedAccounts()
    },
    [canManageSpace, initiateOAuthMutation, navigateToConnectedAccounts, t]
  )

  const railContent = (
    <MailboxRail
      selectedRole={selectedRole}
      selectedAccountId={selectedAccountId}
      selectedMailboxId={selectedMailboxId}
      onReconnectAccount={(acc) => void handleReconnectAccount(acc)}
      isReconnecting={initiateOAuthMutation.isPending}
      onSelectRole={(role) => {
        setSelectedRole(role)
        setSelectedMailboxId(undefined)
        setSelectedThreadId(undefined)
        setFocusedThreadId(undefined)
        setMobileRailOpen(false)
      }}
      onSelectAccount={(accId) => {
        setSelectedAccountId(accId)
        setSelectedThreadId(undefined)
        setFocusedThreadId(undefined)
        setMobileRailOpen(false)
      }}
      onSelectMailbox={(mbxId) => {
        setSelectedMailboxId(mbxId)
        setSelectedThreadId(undefined)
        setFocusedThreadId(undefined)
        setMobileRailOpen(false)
      }}
      onOpenCompose={() => {
        setReopenedDraft(undefined)
        setComposeOpen(true)
        setMobileRailOpen(false)
      }}
    />
  )

  const showThreadList = !isStackedMode || !activeThread
  const showThreadReader = !isStackedMode || Boolean(activeThread)

  return (
    <div
      data-testid="mail-main-view"
      className="flex h-full min-h-0 w-full flex-1 overflow-hidden bg-background"
    >
      {inRouter && (
        <MailSearchParamsSync
          onSelectThreadId={setSelectedThreadId}
          onOpenCompose={() => {
            setReopenedDraft(undefined)
            setComposeOpen(true)
          }}
          onNavigateReady={(nav) => {
            navigateRef.current = nav
          }}
        />
      )}

      {/* Pane 1: Desktop Collapsible Mailbox Rail */}
      {isDesktop && railOpen && railContent}

      {/* Mobile Left Navigation Drawer */}
      {!isDesktop && (
        <Sheet open={mobileRailOpen} onOpenChange={setMobileRailOpen}>
          <SheetContent side="left" className="w-64 p-0">
            {railContent}
          </SheetContent>
        </Sheet>
      )}

      {/* Pane 2: Thread List */}
      {showThreadList && (
        <ThreadList
          threads={threads}
          selectedThreadId={activeThread?.id}
          focusedThreadId={focusedThreadId}
          selectedIds={selectedIds}
          onSelectedIdsChange={setSelectedIds}
          onSelectThread={(t) => {
            setSelectedThreadId(t.id)
            setFocusedThreadId(t.id)
          }}
          onArchiveThread={handleArchiveThread}
          onTrashThread={handleTrashThread}
          onToggleStar={handleToggleStar}
          onToggleRead={handleToggleRead}
          onBulkAction={handleBulkAction}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          searchInputRef={searchInputRef}
          railOpen={isDesktop ? railOpen : mobileRailOpen}
          hasReauthWarning={reauthAccounts.length > 0}
          onToggleRail={handleToggleRail}
          layoutMode={layoutMode}
          onToggleLayoutMode={handleToggleLayoutMode}
          widthPx={isStackedMode ? undefined : listWidth}
          fullWidth={isStackedMode}
          onRefresh={handleRefresh}
          isLoading={threadsLoading || syncAccountMutation.isPending}
          hasNextPage={Boolean(hasNextPage)}
          isFetchingNextPage={Boolean(isFetchingNextPage)}
          totalCount={totalCount}
          onLoadMore={() => {
            if (hasNextPage && !isFetchingNextPage) {
              fetchNextPage()
            }
          }}
        />
      )}

      {/* Resizable Split Handle (Desktop Split Mode) */}
      {!isStackedMode && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={t("mail.resizeThreadList")}
          aria-valuemin={MAIL_LIST_MIN_WIDTH}
          aria-valuemax={MAIL_LIST_MAX_WIDTH}
          aria-valuenow={listWidth}
          tabIndex={0}
          data-testid="mail-split-resizer"
          onMouseDown={handleStartResize}
          onKeyDown={handleResizerKeyDown}
          className="hidden w-1.5 shrink-0 cursor-col-resize bg-transparent transition-colors hover:bg-primary/25 focus-visible:bg-primary/40 focus-visible:outline-none md:block"
        />
      )}

      {/* Pane 3: Thread Reader */}
      {showThreadReader && (
        <ThreadReader
          key={activeThread?.id}
          threadId={activeThread?.id}
          initialThread={activeThread}
          replyTrigger={replyTrigger}
          showBackButton={isStackedMode && Boolean(activeThread)}
          onBack={() => setSelectedThreadId(undefined)}
          borderless={isStackedMode}
          onArchive={handleArchiveThread}
          onTrash={handleTrashThread}
          onToggleStar={handleToggleStar}
          onToggleRead={handleToggleRead}
          onCreateEvent={handleOpenCreateEventDialog}
          onStageToFinance={handleOpenStageToFinance}
          onSendReply={handleSendMail}
          onSaveDraft={async (draft) => {
            return saveDraftMutation.mutateAsync({
              ...draft,
              connectedAccountId:
                draft.connectedAccountId || accounts[0]?.id || "",
            })
          }}
          onDiscardDraft={async (draftId) => {
            await deleteDraftMutation.mutateAsync({ id: draftId })
            refetchThreads()
            if (activeThread && activeThread.messageCount <= 1) {
              setSelectedThreadId(undefined)
            }
          }}
        />
      )}

      {/* Docked / Floating Compose Modal */}
      {composeOpen && (
        <MailComposer
          key={reopenedDraft?.id || "new-compose"}
          isOpen={composeOpen}
          initialDraft={reopenedDraft}
          defaultAccountId={
            reopenedDraft?.connectedAccountId ||
            selectedAccountId ||
            accounts[0]?.id
          }
          onClose={() => {
            setComposeOpen(false)
            setReopenedDraft(undefined)
          }}
          onSend={async (data) => {
            await handleSendMail(data)
            setComposeOpen(false)
            setReopenedDraft(undefined)
          }}
          onSaveDraft={async (draft) => {
            return saveDraftMutation.mutateAsync({
              ...draft,
              connectedAccountId:
                draft.connectedAccountId || accounts[0]?.id || "",
            })
          }}
          onDiscard={() => {
            setComposeOpen(false)
            setReopenedDraft(undefined)
          }}
        />
      )}

      {/* Calendar Event Creation Handoff Dialog */}
      <EventDialog
        open={eventDialogOpen}
        onClose={() => setEventDialogOpen(false)}
        initialValues={{
          title: eventDialogInitialValues.title,
          description: eventDialogInitialValues.description,
          sourceMailMessageId: eventDialogInitialValues.sourceMailMessageId,
          attendees: eventDialogInitialValues.attendees.map((a) => ({
            email: a.email,
            displayName: a.displayName || "",
            isOptional: false,
            isOrganizer: false,
            responseStatus: "ATTENDEE_RESPONSE_STATUS_NEEDS_ACTION",
          })),
        }}
      />

      {/* Stage Receipt / Invoice to Finance Inbox Dialog */}
      <StageToFinanceDialog
        open={stageDialogOpen}
        onOpenChange={(open) => {
          setStageDialogOpen(open)
          if (!open) setStageInitialData(null)
        }}
        spaceId={spaceId}
        initialData={stageInitialData}
      />
    </div>
  )
}

export default MailView
