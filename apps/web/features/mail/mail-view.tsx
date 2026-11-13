import { useState, useMemo, useEffect, useRef } from "react"
import {
  useMailThreads,
  useModifyThread,
  useBatchModifyThreads,
  useSaveDraft,
  useSendDraft,
  useConnectedAccounts,
  useSyncConnectedAccount,
} from "@saturn/hooks"
import type {
  Thread,
  MailboxRole,
  ListThreadsRequest,
} from "@saturn/api/saturn/mail/v1/mail"
import { MailboxRail } from "./components/mailbox-rail"
import { ThreadList } from "./components/thread-list"
import { ThreadReader } from "./components/thread-reader"
import { MailComposer } from "./components/mail-composer"
import { EventDialog } from "@/features/calendar/components/event-dialog"
import { toast } from "@/components/ui/toast"

export function MailView() {
  const { data: accountsData } = useConnectedAccounts()
  const accounts = useMemo(() => {
    return (accountsData?.accounts || []).filter(
      (a) =>
        a.enabledCapabilities?.includes("mail") ||
        a.enabledCapabilities?.includes("MAIL")
    )
  }, [accountsData])

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

  // Active selected thread
  const [selectedThreadId, setSelectedThreadId] = useState<string | undefined>()

  // Compose modal state
  const [composeOpen, setComposeOpen] = useState(false)

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

  // Build filter query for useMailThreads
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

  // Fetch threads
  const {
    data: threadsData,
    isLoading: threadsLoading,
    refetch: refetchThreads,
  } = useMailThreads(filter)

  const threads = useMemo(() => threadsData?.threads || [], [threadsData])

  // Ensure selectedThreadId stays valid or points to first thread if available
  const activeThread = useMemo(() => {
    if (!selectedThreadId) return threads[0]
    return threads.find((t) => t.id === selectedThreadId) || threads[0]
  }, [threads, selectedThreadId])

  // Mutations
  const modifyThreadMutation = useModifyThread({
    onError: (err) => {
      toast.add({
        title: "Action failed",
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
        title: "Bulk action failed",
        description: err.message,
        type: "error",
      })
    },
  })

  const saveDraftMutation = useSaveDraft()
  const sendDraftMutation = useSendDraft()

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
  const handleArchiveThread = (thread: Thread) => {
    modifyThreadMutation.mutate({
      id: thread.id,
      req: { id: thread.id, inInbox: false },
    })
    toast.add({ title: "Conversation archived", type: "success" })
  }

  const handleTrashThread = (thread: Thread) => {
    modifyThreadMutation.mutate({
      id: thread.id,
      req: { id: thread.id, inTrash: true },
    })
    toast.add({ title: "Conversation moved to trash", type: "success" })
  }

  const handleToggleStar = (thread: Thread) => {
    modifyThreadMutation.mutate({
      id: thread.id,
      req: { id: thread.id, isStarred: !thread.isStarred },
    })
  }

  const handleToggleRead = (thread: Thread) => {
    if (thread.isUnread) {
      // User is explicitly marking as unread: remove from auto-marked set
      markedAsReadRef.current.delete(thread.id)
    }
    modifyThreadMutation.mutate({
      id: thread.id,
      req: { id: thread.id, isUnread: !thread.isUnread },
    })
  }

  const handleBulkAction = (
    action: "archive" | "trash" | "read" | "unread",
    threadIds: string[]
  ) => {
    if (threadIds.length === 0) return

    if (action === "archive") {
      batchModifyMutation.mutate({
        ids: threadIds,
        inInbox: false,
      })
      toast.add({
        title: `${threadIds.length} conversations archived`,
        type: "success",
      })
    } else if (action === "trash") {
      batchModifyMutation.mutate({
        ids: threadIds,
        inTrash: true,
      })
      toast.add({
        title: `${threadIds.length} conversations moved to trash`,
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
  }

  // Handle send from compose modal or inline reply
  const handleSendMail = async (data: {
    connectedAccountId: string
    to: Array<{ email: string; displayName?: string }>
    cc: Array<{ email: string; displayName?: string }>
    bcc: Array<{ email: string; displayName?: string }>
    subject: string
    bodyHtml: string
    bodyText: string
    threadId?: string
    replyToMessageId?: string
  }) => {
    // Save draft first then send
    const draft = await saveDraftMutation.mutateAsync({
      connectedAccountId: data.connectedAccountId,
      threadId: data.threadId,
      replyToMessageId: data.replyToMessageId,
      to: data.to.map((t) => ({
        email: t.email,
        name: t.displayName || "",
        avatarUrl: "",
        isVerified: false,
      })),
      cc: data.cc.map((t) => ({
        email: t.email,
        name: t.displayName || "",
        avatarUrl: "",
        isVerified: false,
      })),
      bcc: data.bcc.map((t) => ({
        email: t.email,
        name: t.displayName || "",
        avatarUrl: "",
        isVerified: false,
      })),
      subject: data.subject,
      bodyHtml: data.bodyHtml,
      bodyText: data.bodyText,
    })

    if (draft?.id) {
      await sendDraftMutation.mutateAsync({ id: draft.id })
      toast.add({ title: "Email sent", type: "success" })
    }
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

  return (
    <div
      data-testid="mail-main-view"
      className="flex h-full w-full overflow-hidden bg-background"
    >
      {/* Pane 1: Mailbox & Accounts Rail */}
      <MailboxRail
        selectedRole={selectedRole}
        selectedAccountId={selectedAccountId}
        selectedMailboxId={selectedMailboxId}
        onSelectRole={(role) => {
          setSelectedRole(role)
          setSelectedMailboxId(undefined)
          setSelectedThreadId(undefined)
        }}
        onSelectAccount={(accId) => {
          setSelectedAccountId(accId)
          setSelectedThreadId(undefined)
        }}
        onSelectMailbox={(mbxId) => {
          setSelectedMailboxId(mbxId)
          setSelectedThreadId(undefined)
        }}
        onOpenCompose={() => setComposeOpen(true)}
      />

      {/* Pane 2: Thread List */}
      <ThreadList
        threads={threads}
        selectedThreadId={activeThread?.id}
        onSelectThread={(t) => setSelectedThreadId(t.id)}
        onArchiveThread={handleArchiveThread}
        onTrashThread={handleTrashThread}
        onToggleStar={handleToggleStar}
        onToggleRead={handleToggleRead}
        onBulkAction={handleBulkAction}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onOpenCompose={() => setComposeOpen(true)}
        onRefresh={handleRefresh}
        isLoading={threadsLoading || syncAccountMutation.isPending}
      />

      {/* Pane 3: Thread Reader */}
      <ThreadReader
        key={activeThread?.id}
        threadId={activeThread?.id}
        initialThread={activeThread}
        onArchive={handleArchiveThread}
        onTrash={handleTrashThread}
        onToggleStar={handleToggleStar}
        onToggleRead={handleToggleRead}
        onCreateEvent={handleOpenCreateEventDialog}
        onSendReply={handleSendMail}
      />

      {/* Docked / Floating Compose Modal */}
      {composeOpen && (
        <MailComposer
          isOpen={composeOpen}
          defaultAccountId={selectedAccountId || accounts[0]?.id}
          onClose={() => setComposeOpen(false)}
          onSend={async (data) => {
            await handleSendMail(data)
            setComposeOpen(false)
          }}
          onSaveDraft={async (draft) => {
            return saveDraftMutation.mutateAsync({
              ...draft,
              connectedAccountId:
                draft.connectedAccountId || accounts[0]?.id || "",
            })
          }}
          onDiscard={() => setComposeOpen(false)}
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
    </div>
  )
}

export default MailView
