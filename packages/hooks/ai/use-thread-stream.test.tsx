import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, act, waitFor } from "@testing-library/react"
import { createElement, type ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useThreadStream } from "./use-thread-stream"
import * as streamMod from "@saturn/api/stream"
import * as aiApi from "@saturn/api/saturn/platform/ai/v1/ai"

vi.mock("@saturn/api/stream", () => ({
  streamSSE: vi.fn(),
}))

vi.mock("@saturn/api/saturn/platform/ai/v1/ai", async () => {
  const actual = await vi.importActual<typeof aiApi>(
    "@saturn/api/saturn/platform/ai/v1/ai"
  )
  return {
    ...actual,
    getThread: vi.fn(),
    listThreadMessages: vi.fn(),
    createThread: vi.fn(),
    cancelThreadTurn: vi.fn(),
  }
})

describe("@saturn/hooks useThreadStream", () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    vi.mocked(aiApi.getThread).mockResolvedValue({
      id: "thr_1",
      spaceId: "spc_1",
      userId: "usr_1",
      title: "New Chat",
      status: "idle",
      messageCount: 0,
      isPinned: false,
      isArchived: false,
    })
    vi.mocked(aiApi.listThreadMessages).mockResolvedValue({
      messages: [],
      nextPageToken: "",
    })
    vi.mocked(aiApi.cancelThreadTurn).mockResolvedValue({
      id: "thr_1",
      spaceId: "spc_1",
      userId: "usr_1",
      title: "New Chat",
      status: "idle",
      messageCount: 0,
      isPinned: false,
      isArchived: false,
    })
  })

  function createWrapper() {
    return function Wrapper({ children }: { children: ReactNode }) {
      return createElement(
        QueryClientProvider,
        { client: queryClient },
        children
      )
    }
  }

  it("streams optimistic message, deltas, tool calls, and invalidates mutated domain caches", async () => {
    queryClient.setQueryData(["/api/v1/finance/transactions", {}], {
      items: [],
    })
    const onRunCompleted = vi.fn()

    vi.mocked(streamMod.streamSSE).mockImplementation(async ({ onEvent }) => {
      onEvent({ type: "run.started", threadId: "thr_1", runId: "air_1" })
      onEvent({
        type: "message.completed",
        threadId: "thr_1",
        message: {
          id: "aim_user_1",
          threadId: "thr_1",
          spaceId: "spc_1",
          seq: 1,
          role: "user",
          blocks: [{ type: "text", text: "Add $15 coffee expense" }],
        },
      })
      onEvent({ type: "thinking.delta", delta: "Checking accounts..." })
      onEvent({
        type: "tool.call.started",
        toolCallId: "tc_read",
        toolName: "finance_list_accounts",
      })
      onEvent({
        type: "tool.call.completed",
        toolCallId: "tc_read",
        toolName: "finance_list_accounts",
        isError: false,
      })
      onEvent({
        type: "tool.call.started",
        toolCallId: "tc_write",
        toolName: "finance_create_expense",
        arguments: { amount: 1500 },
      })
      onEvent({
        type: "tool.call.completed",
        toolCallId: "tc_write",
        toolName: "finance_create_expense",
        isError: false,
        result: { id: "tx_1" },
      })
      onEvent({ type: "message.delta", delta: "Recorded " })
      onEvent({ type: "message.delta", delta: "$15 coffee." })
      onEvent({
        type: "message.completed",
        threadId: "thr_1",
        message: {
          id: "aim_ast_1",
          threadId: "thr_1",
          spaceId: "spc_1",
          seq: 2,
          role: "assistant",
          blocks: [{ type: "text", text: "Recorded $15 coffee." }],
        },
      })
      onEvent({
        type: "run.completed",
        threadId: "thr_1",
        run: {
          id: "air_1",
          spaceId: "spc_1",
          kind: "chat_turn",
          source: "chat",
          status: "completed",
        },
      })
    })

    const { result } = renderHook(
      () => useThreadStream({ threadId: "thr_1", onRunCompleted }),
      { wrapper: createWrapper() }
    )

    await act(async () => {
      await result.current.sendMessage({
        content: "Add $15 coffee expense",
        contextHint: "/finance",
      })
    })

    expect(streamMod.streamSSE).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "/api/v1/platform/ai/threads/thr_1:stream",
        body: expect.objectContaining({
          content: "Add $15 coffee expense",
          contextHint: "/finance",
        }),
      })
    )
    expect(result.current.status).toBe("idle")
    expect(result.current.isStreaming).toBe(false)
    expect(result.current.messages).toHaveLength(2)
    expect(result.current.messages[1].id).toBe("aim_ast_1")
    expect(onRunCompleted).toHaveBeenCalledTimes(1)

    // Verify finance cache invalidation was triggered for finance_create_expense
    expect(
      queryClient.getQueryState(["/api/v1/finance/transactions", {}])
        ?.isInvalidated
    ).toBe(true)
  })

  it("pauses on tool.approval.required and resumes via resolveApprovals", async () => {
    vi.mocked(streamMod.streamSSE)
      .mockImplementationOnce(async ({ onEvent }) => {
        onEvent({ type: "run.started", threadId: "thr_1", runId: "air_2" })
        onEvent({
          type: "tool.approval.required",
          threadId: "thr_1",
          runId: "air_2",
          approvals: [
            {
              toolCallId: "tc_1",
              mcpServerId: "mcp_saturn",
              mcpServerName: "Saturn Workspace",
              toolName: "calendar_create_event",
              destructiveHint: false,
            },
          ],
        })
      })
      .mockImplementationOnce(async ({ onEvent }) => {
        onEvent({
          type: "tool.call.completed",
          toolCallId: "tc_1",
          toolName: "calendar_create_event",
          isError: false,
        })
        onEvent({ type: "run.completed", threadId: "thr_1" })
      })

    const { result } = renderHook(
      () => useThreadStream({ threadId: "thr_1" }),
      {
        wrapper: createWrapper(),
      }
    )

    await act(async () => {
      await result.current.sendMessage({ content: "Schedule dentist" })
    })

    expect(result.current.status).toBe("awaiting_approval")
    expect(result.current.pendingApprovals).toHaveLength(1)
    expect(result.current.pendingApprovals[0].toolName).toBe(
      "calendar_create_event"
    )

    await act(async () => {
      await result.current.resolveApprovals([
        { toolCallId: "tc_1", approved: true },
      ])
    })

    expect(streamMod.streamSSE).toHaveBeenLastCalledWith(
      expect.objectContaining({
        url: "/api/v1/platform/ai/threads/thr_1:resolveApprovals",
        body: { decisions: [{ toolCallId: "tc_1", approved: true }] },
      })
    )
    expect(result.current.status).toBe("idle")
    expect(result.current.pendingApprovals).toHaveLength(0)
  })

  it("lazily creates thread when threadId is unset and supports stop()", async () => {
    const onThreadCreated = vi.fn()
    vi.mocked(aiApi.createThread).mockResolvedValue({
      id: "thr_new",
      spaceId: "spc_1",
      userId: "usr_1",
      title: "New Chat",
      status: "idle",
      messageCount: 0,
      isPinned: false,
      isArchived: false,
    })

    vi.mocked(streamMod.streamSSE).mockImplementation(
      ({ signal }) =>
        new Promise((_, reject) => {
          signal?.addEventListener("abort", () => {
            const err = new Error("Aborted")
            err.name = "AbortError"
            reject(err)
          })
        })
    )

    const { result } = renderHook(
      () => useThreadStream({ threadId: null, onThreadCreated }),
      { wrapper: createWrapper() }
    )

    let pendingSend: Promise<void> | undefined
    act(() => {
      pendingSend = result.current.sendMessage({ content: "Hello!" })
    })

    await waitFor(() => {
      expect(aiApi.createThread).toHaveBeenCalledTimes(1)
      expect(onThreadCreated).toHaveBeenCalledWith(
        expect.objectContaining({ id: "thr_new" })
      )
      expect(result.current.isStreaming).toBe(true)
    })

    await act(async () => {
      await result.current.stop()
      await pendingSend
    })

    expect(aiApi.cancelThreadTurn).toHaveBeenCalledWith("thr_new", {
      id: "thr_new",
    })
    expect(result.current.isStreaming).toBe(false)
    expect(result.current.status).toBe("idle")
    expect(result.current.streamPhase).toBe("idle")
  })

  it("tracks streamPhase transitions, activeToolCall, and tool durationMs", async () => {
    let emitEvent!: (ev: aiApi.ThreadStreamEvent) => void
    let resolveStream!: () => void

    vi.mocked(streamMod.streamSSE).mockImplementation(
      ({ onEvent }) =>
        new Promise<void>((resolve) => {
          emitEvent = onEvent
          resolveStream = resolve
        })
    )

    const { result } = renderHook(
      () => useThreadStream({ threadId: "thr_1" }),
      {
        wrapper: createWrapper(),
      }
    )

    let pendingSend: Promise<void> | undefined
    act(() => {
      pendingSend = result.current.sendMessage({ content: "Check balances" })
    })

    await waitFor(() => {
      expect(result.current.streamPhase).toBe("connecting")
    })

    act(() => {
      emitEvent({ type: "run.started", threadId: "thr_1", runId: "air_1" })
    })
    expect(result.current.streamPhase).toBe("thinking")

    act(() => {
      emitEvent({
        type: "tool.call.started",
        toolCallId: "tc_1",
        toolName: "finance_list_accounts",
      })
    })
    expect(result.current.streamPhase).toBe("tool_running")
    expect(result.current.activeToolCall?.toolName).toBe(
      "finance_list_accounts"
    )

    act(() => {
      emitEvent({
        type: "tool.call.completed",
        toolCallId: "tc_1",
        toolName: "finance_list_accounts",
        isError: false,
        result: { accounts: [] },
      })
    })
    expect(result.current.streamPhase).toBe("thinking")
    expect(result.current.activeToolCall).toBeNull()
    expect(
      result.current.streamingMessage?.toolCalls[0].durationMs
    ).toBeGreaterThanOrEqual(1)

    act(() => {
      emitEvent({ type: "message.delta", delta: "Done." })
    })
    expect(result.current.streamPhase).toBe("generating")

    await act(async () => {
      emitEvent({ type: "run.completed", threadId: "thr_1" })
      resolveStream()
      await pendingSend
    })
    expect(result.current.streamPhase).toBe("idle")
  })

  it("does not abort active stream when threadId transitions from null to created thread id", async () => {
    vi.mocked(aiApi.createThread).mockResolvedValue({
      id: "thr_lazy",
      spaceId: "spc_1",
      userId: "usr_1",
      title: "New Chat",
      status: "idle",
      messageCount: 0,
      isPinned: false,
      isArchived: false,
    })

    let aborted = false
    let emitEvent!: (ev: aiApi.ThreadStreamEvent) => void
    let resolveStream!: () => void

    vi.mocked(streamMod.streamSSE).mockImplementation(
      ({ signal, onEvent }) =>
        new Promise<void>((resolve) => {
          emitEvent = onEvent
          resolveStream = resolve
          signal?.addEventListener("abort", () => {
            aborted = true
          })
        })
    )

    let currentThreadId: string | null = null
    const { result, rerender } = renderHook(
      ({ tid }: { tid: string | null }) =>
        useThreadStream({
          threadId: tid,
          onThreadCreated: (th) => {
            currentThreadId = th.id ?? null
          },
        }),
      {
        initialProps: { tid: null as string | null },
        wrapper: createWrapper(),
      }
    )

    let pendingSend: Promise<void> | undefined
    act(() => {
      pendingSend = result.current.sendMessage({ content: "Hello!" })
    })

    await waitFor(() => {
      expect(currentThreadId).toBe("thr_lazy")
    })

    // Simulate parent updating threadId prop from null -> "thr_lazy" mid-stream.
    rerender({ tid: currentThreadId })

    expect(aborted).toBe(false)
    expect(result.current.isStreaming).toBe(true)
    expect(result.current.messages).toHaveLength(1)

    act(() => {
      emitEvent({ type: "message.delta", delta: "Hi there!" })
    })
    expect(result.current.streamingMessage?.text).toBe("Hi there!")

    await act(async () => {
      emitEvent({ type: "run.completed", threadId: "thr_lazy" })
      resolveStream()
      await pendingSend
    })
    expect(result.current.isStreaming).toBe(false)
    expect(result.current.streamPhase).toBe("idle")
  })

  it("surfaces createThread failure via error state", async () => {
    vi.mocked(aiApi.createThread).mockRejectedValue(
      new Error("Provider unavailable")
    )

    const { result } = renderHook(() => useThreadStream({ threadId: null }), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      await result.current.sendMessage({ content: "Hello!" })
    })

    expect(result.current.isStreaming).toBe(false)
    expect(result.current.streamPhase).toBe("idle")
    expect(result.current.error?.message).toBe("Provider unavailable")
  })
})
