import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQueryClient, type QueryClient } from "@tanstack/react-query"
import type { ThreadStreamPhase } from "@saturn/core"
import { streamSSE } from "@saturn/api/stream"
import {
  cancelThreadTurn,
  createThread,
  useGetThreadQuery,
  useListThreadMessagesQuery,
  type ErrorDetail,
  type PendingToolApproval,
  type Run,
  type Thread,
  type ThreadMessage,
  type ThreadStreamEvent,
  type ToolApprovalDecision,
} from "@saturn/api/saturn/platform/ai/v1/ai"
import { calendarKeys } from "../calendar/use-calendar"
import { invalidateFinanceQueries } from "../finance/invalidate"
import { draftKeys } from "../mail/use-drafts"
import { mailKeys } from "../mail/use-mail"

export interface StreamAttachmentInput {
  filename: string
  contentType: string
  file?: File | Blob
  base64Data?: string
}

export interface SendMessageParams {
  content: string
  attachments?: StreamAttachmentInput[]
  agentId?: string
  modelId?: string
  contextHint?: string
  threadId?: string
}

export type { ThreadStreamPhase }

export interface StreamingToolCall {
  toolCallId: string
  toolName: string
  mcpServerId?: string
  arguments?: Record<string, unknown>
  result?: Record<string, unknown>
  isError?: boolean
  startedAt?: number
  durationMs?: number
  status: "running" | "completed" | "error"
}

export interface StreamingAssistantDraft {
  thinking: string
  text: string
  toolCalls: StreamingToolCall[]
}

export type ThreadStreamStatus = "idle" | "streaming" | "awaiting_approval"

export interface UseThreadStreamOptions {
  threadId?: string | null
  onThreadCreated?: (thread: Thread) => void
  onThreadUpdated?: (thread: Thread) => void
  onRunCompleted?: (run: Run) => void
  onError?: (error: ErrorDetail | Error) => void
}

function isReadOnlyMCPTool(toolName: string): boolean {
  return (
    toolName === "space_get_context" ||
    toolName.includes("_list_") ||
    toolName.includes("_get_")
  )
}

async function invalidateMutatedDomainCaches(
  queryClient: QueryClient,
  toolName?: string
): Promise<void> {
  if (!toolName || isReadOnlyMCPTool(toolName)) {
    return
  }

  const tasks: Promise<void>[] = []

  if (toolName.startsWith("finance_")) {
    tasks.push(invalidateFinanceQueries(queryClient))
  } else if (toolName.startsWith("calendar_")) {
    tasks.push(
      queryClient.invalidateQueries({ queryKey: calendarKeys.all() }),
      queryClient.invalidateQueries({
        predicate: (q) =>
          typeof q.queryKey[0] === "string" &&
          q.queryKey[0].startsWith("/api/v1/calendar"),
      })
    )
  } else if (toolName.startsWith("mail_")) {
    tasks.push(
      queryClient.invalidateQueries({ queryKey: mailKeys.all() }),
      queryClient.invalidateQueries({ queryKey: draftKeys.all() }),
      queryClient.invalidateQueries({
        predicate: (q) =>
          typeof q.queryKey[0] === "string" &&
          q.queryKey[0].startsWith("/api/v1/mail"),
      })
    )
  } else if (toolName.startsWith("workflows_")) {
    tasks.push(
      queryClient.invalidateQueries({
        predicate: (q) =>
          typeof q.queryKey[0] === "string" &&
          q.queryKey[0].startsWith("/api/v1/platform/workflows"),
      })
    )
  }

  if (tasks.length > 0) {
    await Promise.all(tasks)
  }
}

async function invalidateAIThreadCaches(
  queryClient: QueryClient,
  threadId?: string | null
): Promise<void> {
  await queryClient.invalidateQueries({
    predicate: (q) => {
      const key = q.queryKey[0]
      if (typeof key !== "string") return false
      if (threadId && key === `/api/v1/platform/ai/threads/${threadId}`) {
        return true
      }
      if (
        threadId &&
        key === `/api/v1/platform/ai/threads/${threadId}/messages`
      ) {
        return true
      }
      return (
        key === "/api/v1/platform/ai/threads" ||
        key === "/api/v1/platform/ai/runs" ||
        key === "/api/v1/platform/ai/settings" ||
        key === "/api/v1/platform/ai/agents"
      )
    },
  })
}

export function useThreadStream(options: UseThreadStreamOptions = {}) {
  const {
    threadId = null,
    onThreadCreated,
    onThreadUpdated,
    onRunCompleted,
    onError,
  } = options

  const queryClient = useQueryClient()
  const abortRef = useRef<AbortController | null>(null)
  const activeThreadIdRef = useRef<string | null>(threadId)
  const prevThreadIdRef = useRef<string | null>(threadId)
  const lazyCreatedThreadIdRef = useRef<string | null>(null)
  const runningToolIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    activeThreadIdRef.current = threadId
  }, [threadId])

  const [isStreaming, setIsStreaming] = useState(false)
  const [status, setStatus] = useState<ThreadStreamStatus>("idle")
  const [streamPhase, setStreamPhase] = useState<ThreadStreamPhase>("idle")
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const [streamingMessage, setStreamingMessage] =
    useState<StreamingAssistantDraft | null>(null)
  const [pendingApprovals, setPendingApprovals] = useState<
    PendingToolApproval[]
  >([])
  const [optimisticMessages, setOptimisticMessages] = useState<ThreadMessage[]>(
    []
  )
  const [streamedMessages, setStreamedMessages] = useState<ThreadMessage[]>([])
  const [error, setError] = useState<ErrorDetail | Error | null>(null)

  const threadQuery = useGetThreadQuery(
    { id: threadId ?? "" },
    { enabled: Boolean(threadId) }
  )

  const messagesQuery = useListThreadMessagesQuery(
    { threadId: threadId ?? "", pageSize: 100, pageToken: "" },
    { enabled: Boolean(threadId) }
  )

  // Reset local transient buffers when switching threads (except lazy creation null -> created.id).
  useEffect(() => {
    if (
      prevThreadIdRef.current === null &&
      threadId !== null &&
      lazyCreatedThreadIdRef.current === threadId
    ) {
      prevThreadIdRef.current = threadId
      lazyCreatedThreadIdRef.current = null
      return
    }
    prevThreadIdRef.current = threadId
    lazyCreatedThreadIdRef.current = null

    abortRef.current?.abort()
    abortRef.current = null
    runningToolIdsRef.current.clear()
    setIsStreaming(false)
    setActiveRunId(null)
    setStreamingMessage(null)
    setOptimisticMessages([])
    setStreamedMessages([])
    setPendingApprovals([])
    setStatus("idle")
    setStreamPhase("idle")
    setError(null)
  }, [threadId])

  // Sync persisted pending approvals & status from thread snapshot when not actively streaming.
  useEffect(() => {
    const th = threadQuery.data
    if (!th || isStreaming) return
    const persistedApprovals = th.state?.pendingApprovals ?? []
    if (th.status === "awaiting_approval" && persistedApprovals.length > 0) {
      setPendingApprovals(persistedApprovals)
      setStatus("awaiting_approval")
      setStreamPhase("awaiting_approval")
    } else if (th.status === "idle") {
      setPendingApprovals([])
      setStatus("idle")
      setStreamPhase("idle")
    }
  }, [threadQuery.data, isStreaming])

  const handleStreamEvent = useCallback(
    (ev: ThreadStreamEvent, targetThreadId: string) => {
      switch (ev.type) {
        case "run.started":
          runningToolIdsRef.current.clear()
          setStatus("streaming")
          setStreamPhase("thinking")
          setActiveRunId(ev.runId ?? null)
          setStreamingMessage(
            (prev) => prev ?? { thinking: "", text: "", toolCalls: [] }
          )
          break

        case "thinking.delta":
          if (ev.delta) {
            setStreamPhase("thinking")
            setStreamingMessage((prev) => ({
              thinking: (prev?.thinking ?? "") + ev.delta,
              text: prev?.text ?? "",
              toolCalls: prev?.toolCalls ?? [],
            }))
          }
          break

        case "message.delta":
          if (ev.delta) {
            setStreamPhase("generating")
            setStreamingMessage((prev) => ({
              thinking: prev?.thinking ?? "",
              text: (prev?.text ?? "") + ev.delta,
              toolCalls: prev?.toolCalls ?? [],
            }))
          }
          break

        case "tool.call.started": {
          const startedAt = Date.now()
          const fallbackIdx = runningToolIdsRef.current.size + 1
          const tcId = ev.toolCallId ?? `tc_${fallbackIdx}`
          runningToolIdsRef.current.add(tcId)
          setStreamPhase("tool_running")
          setStreamingMessage((prev) => {
            const current = prev ?? { thinking: "", text: "", toolCalls: [] }
            const existingIdx = current.toolCalls.findIndex(
              (tc) => tc.toolCallId === tcId
            )
            const nextCall: StreamingToolCall = {
              toolCallId: tcId,
              toolName: ev.toolName ?? "tool",
              mcpServerId: ev.mcpServerId,
              arguments: ev.arguments,
              startedAt,
              status: "running",
            }
            const nextCalls =
              existingIdx >= 0
                ? current.toolCalls.map((tc, i) =>
                    i === existingIdx ? nextCall : tc
                  )
                : [...current.toolCalls, nextCall]
            return { ...current, toolCalls: nextCalls }
          })
          break
        }

        case "tool.call.completed": {
          const completedAt = Date.now()
          const tcId = ev.toolCallId ?? ""
          runningToolIdsRef.current.delete(tcId)
          if (runningToolIdsRef.current.size === 0) {
            setStreamPhase("thinking")
          }
          setStreamingMessage((prev) => {
            const current = prev ?? { thinking: "", text: "", toolCalls: [] }
            const nextStatus = ev.isError ? "error" : "completed"
            const idx = current.toolCalls.findIndex(
              (tc) => tc.toolCallId === tcId
            )
            const prevCall = idx >= 0 ? current.toolCalls[idx] : undefined
            const durationMs = prevCall?.startedAt
              ? Math.max(1, completedAt - prevCall.startedAt)
              : undefined
            const updated: StreamingToolCall = {
              toolCallId: tcId,
              toolName: ev.toolName ?? prevCall?.toolName ?? "tool",
              mcpServerId: ev.mcpServerId ?? prevCall?.mcpServerId,
              arguments: prevCall?.arguments,
              result: ev.result,
              isError: ev.isError,
              startedAt: prevCall?.startedAt,
              durationMs,
              status: nextStatus,
            }
            const nextCalls =
              idx >= 0
                ? current.toolCalls.map((tc, i) => (i === idx ? updated : tc))
                : [...current.toolCalls, updated]
            return { ...current, toolCalls: nextCalls }
          })
          if (!ev.isError) {
            void invalidateMutatedDomainCaches(queryClient, ev.toolName)
          }
          break
        }

        case "tool.approval.required":
          runningToolIdsRef.current.clear()
          setPendingApprovals(ev.approvals ?? [])
          setStatus("awaiting_approval")
          setStreamPhase("awaiting_approval")
          setIsStreaming(false)
          void invalidateAIThreadCaches(queryClient, targetThreadId)
          break

        case "message.completed":
          if (ev.message) {
            const completedMsg = ev.message
            if (completedMsg.role === "user") {
              setOptimisticMessages([])
            } else {
              setStreamingMessage(null)
            }
            setStreamedMessages((prev) => {
              if (prev.some((m) => m.id === completedMsg.id)) {
                return prev.map((m) =>
                  m.id === completedMsg.id ? completedMsg : m
                )
              }
              return [...prev, completedMsg]
            })
          }
          break

        case "thread.updated":
          if (ev.thread) {
            queryClient.setQueryData(
              [
                `/api/v1/platform/ai/threads/${ev.thread.id}`,
                { id: ev.thread.id },
              ],
              ev.thread
            )
            onThreadUpdated?.(ev.thread)
          }
          void invalidateAIThreadCaches(queryClient, targetThreadId)
          break

        case "run.completed":
          runningToolIdsRef.current.clear()
          setIsStreaming(false)
          setStatus("idle")
          setStreamPhase("idle")
          setActiveRunId(null)
          setStreamingMessage(null)
          setPendingApprovals([])
          if (ev.run) {
            onRunCompleted?.(ev.run)
          }
          void invalidateAIThreadCaches(queryClient, targetThreadId)
          break

        case "run.error": {
          const detail: ErrorDetail = ev.error ?? {
            message: "AI stream failed",
          }
          runningToolIdsRef.current.clear()
          setIsStreaming(false)
          setStatus("idle")
          setStreamPhase("idle")
          setActiveRunId(null)
          setStreamingMessage(null)
          setError(detail)
          onError?.(detail)
          void invalidateAIThreadCaches(queryClient, targetThreadId)
          break
        }
      }
    },
    [onError, onRunCompleted, onThreadUpdated, queryClient]
  )

  const runSSEStream = useCallback(
    async (
      targetThreadId: string,
      url: string,
      body: BodyInit | Record<string, unknown>
    ) => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      runningToolIdsRef.current.clear()

      setIsStreaming(true)
      setStatus("streaming")
      setStreamPhase("connecting")
      setError(null)
      setStreamingMessage({ thinking: "", text: "", toolCalls: [] })

      try {
        await streamSSE<ThreadStreamEvent>({
          url,
          method: "POST",
          body,
          signal: controller.signal,
          onEvent: (ev) => handleStreamEvent(ev, targetThreadId),
        })
      } catch (err) {
        runningToolIdsRef.current.clear()
        if (err instanceof Error && err.name === "AbortError") {
          setIsStreaming(false)
          setStatus("idle")
          setStreamPhase("idle")
          setStreamingMessage(null)
          return
        }
        const errObj =
          err instanceof Error ? err : new Error("Failed to stream AI turn")
        setIsStreaming(false)
        setStatus("idle")
        setStreamPhase("idle")
        setStreamingMessage(null)
        setError(errObj)
        onError?.(errObj)
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null
        }
        setIsStreaming(false)
      }
    },
    [handleStreamEvent, onError]
  )

  const sendMessage = useCallback(
    async (params: SendMessageParams) => {
      const attachments = params.attachments ?? []
      const optimisticBlocks: ThreadMessage["blocks"] = [
        ...attachments.map((att) => ({
          type: "attachment",
          attachment: {
            filename: att.filename,
            contentType: att.contentType,
            sizeBytes: String(att.file ? att.file.size : 0),
          },
        })),
        ...(params.content.trim()
          ? [{ type: "text", text: params.content }]
          : []),
      ]

      let resolvedThreadId = params.threadId ?? activeThreadIdRef.current

      const optimisticUserMsg: ThreadMessage = {
        id: `optimistic-user-${Date.now()}`,
        threadId: resolvedThreadId ?? "",
        spaceId: "",
        seq:
          (messagesQuery.data?.messages?.length ?? 0) +
          streamedMessages.length +
          1,
        role: "user",
        blocks: optimisticBlocks,
      }

      setIsStreaming(true)
      setStatus("streaming")
      setStreamPhase("connecting")
      setError(null)
      setOptimisticMessages([optimisticUserMsg])
      setPendingApprovals([])
      setStreamingMessage({ thinking: "", text: "", toolCalls: [] })

      if (!resolvedThreadId) {
        try {
          const created = await createThread({
            thread: {
              agentId: params.agentId,
              modelId: params.modelId,
              title: "New Chat",
            } as Thread,
          })
          if (!created.id) {
            throw new Error("Created thread did not return an id")
          }
          resolvedThreadId = created.id
          activeThreadIdRef.current = resolvedThreadId
          lazyCreatedThreadIdRef.current = resolvedThreadId
          onThreadCreated?.(created)
          void invalidateAIThreadCaches(queryClient, resolvedThreadId)
        } catch (err) {
          const errObj =
            err instanceof Error ? err : new Error("Failed to create AI thread")
          setIsStreaming(false)
          setStatus("idle")
          setStreamPhase("idle")
          setStreamingMessage(null)
          setError(errObj)
          onError?.(errObj)
          return
        }
      }

      const hasFiles = attachments.some((att) => att.file !== undefined)
      let requestBody: BodyInit | Record<string, unknown>

      if (hasFiles) {
        const form = new FormData()
        form.append("content", params.content)
        if (params.agentId) form.append("agent_id", params.agentId)
        if (params.modelId) form.append("model_id", params.modelId)
        if (params.contextHint) form.append("context_hint", params.contextHint)
        for (const att of attachments) {
          if (att.file) {
            form.append("attachments", att.file, att.filename)
          }
        }
        requestBody = form
      } else {
        requestBody = {
          content: params.content,
          ...(params.agentId && { agentId: params.agentId }),
          ...(params.modelId && { modelId: params.modelId }),
          ...(params.contextHint && { contextHint: params.contextHint }),
          ...(attachments.length > 0 && {
            attachments: attachments.map((att) => ({
              filename: att.filename,
              contentType: att.contentType,
              data: att.base64Data ?? "",
            })),
          }),
        }
      }

      await runSSEStream(
        resolvedThreadId,
        `/api/v1/platform/ai/threads/${resolvedThreadId}:stream`,
        requestBody
      )
    },
    [
      messagesQuery.data?.messages?.length,
      onError,
      onThreadCreated,
      queryClient,
      runSSEStream,
      streamedMessages.length,
    ]
  )

  const resolveApprovals = useCallback(
    async (decisions: ToolApprovalDecision[]) => {
      const targetId = activeThreadIdRef.current
      if (!targetId) return

      setPendingApprovals([])
      await runSSEStream(
        targetId,
        `/api/v1/platform/ai/threads/${targetId}:resolveApprovals`,
        { decisions }
      )
    },
    [runSSEStream]
  )

  const stop = useCallback(async () => {
    abortRef.current?.abort()
    abortRef.current = null
    runningToolIdsRef.current.clear()
    setIsStreaming(false)
    setStatus("idle")
    setStreamPhase("idle")
    setActiveRunId(null)
    setStreamingMessage(null)

    const targetId = activeThreadIdRef.current
    if (targetId) {
      await cancelThreadTurn(targetId, { id: targetId }).catch(() => undefined)
      await invalidateAIThreadCaches(queryClient, targetId)
    }
  }, [queryClient])

  const clearError = useCallback(() => setError(null), [])

  const activeToolCall = useMemo(() => {
    const calls = streamingMessage?.toolCalls
    if (!calls || calls.length === 0) return null
    for (let i = calls.length - 1; i >= 0; i--) {
      if (calls[i].status === "running") return calls[i]
    }
    return null
  }, [streamingMessage])

  const messages = useMemo(() => {
    const persisted = messagesQuery.data?.messages ?? []
    const seen = new Set(persisted.map((m) => m.id))
    const merged = [...persisted]
    for (const sm of streamedMessages) {
      if (!seen.has(sm.id)) {
        seen.add(sm.id)
        merged.push(sm)
      }
    }
    for (const om of optimisticMessages) {
      if (!seen.has(om.id)) {
        merged.push(om)
      }
    }
    return merged
  }, [messagesQuery.data?.messages, optimisticMessages, streamedMessages])

  return {
    thread: threadQuery.data,
    messages,
    isLoadingMessages: messagesQuery.isLoading,
    isStreaming,
    status,
    streamPhase,
    activeToolCall,
    activeRunId,
    streamingMessage,
    pendingApprovals,
    error,
    sendMessage,
    resolveApprovals,
    stop,
    clearError,
  }
}
