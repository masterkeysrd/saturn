import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { configureClient, SaturnApiError } from "./client"
import { streamSSE } from "./stream"
import type { StorageAdapter } from "./storage"

function makeStorage(
  initialToken: string | null = "old_access"
): StorageAdapter {
  let token = initialToken
  let refreshToken: string | null = "refresh_tok_1"
  return {
    getSession: () => ({ accessToken: token, hasSession: !!token }),
    setSession: (t: string) => {
      token = t
    },
    clearSession: () => {
      token = null
    },
    getActiveSpaceId: () => "spc_123",
    setActiveSpaceId: () => {},
    getRefreshToken: () => refreshToken,
    setRefreshToken: (rt: string) => {
      refreshToken = rt
    },
  }
}

function makeSSEStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk))
      }
      controller.close()
    },
  })
}

describe("@saturn/api streamSSE", () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it("parses chunked SSE events, attaches Authorization + Space-Id headers, and retries once on 401", async () => {
    const onUnauthorized = vi.fn()
    const onRefreshed = vi.fn()
    configureClient({
      baseUrl: "https://api.example.com",
      storage: makeStorage("expired_tok"),
      onUnauthorized,
      onRefreshed,
    })

    const fetchMock = vi
      .fn()
      // 1. 401 on initial stream call
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "expired" }), { status: 401 })
      )
      // 2. Session refresh succeeds
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            accessToken: "fresh_tok",
            refreshToken: "fresh_refresh",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      // 3. Retry returns split SSE chunks
      .mockResolvedValueOnce(
        new Response(
          makeSSEStream([
            ": keepalive\n\nevent: run.started\n",
            'data: {"type":"run.started","runId":"air_1"}\n\n',
            'event: message.delta\ndata: {"type":"message.delta",',
            '"delta":"Hello"}\n\nevent: run.completed\ndata: {"type":"run.completed"}\n\n',
          ]),
          {
            status: 200,
            headers: { "Content-Type": "text/event-stream" },
          }
        )
      )

    globalThis.fetch = fetchMock as unknown as typeof fetch

    const received: Array<{ event: unknown; type?: string }> = []
    await streamSSE({
      url: "/api/v1/platform/ai/threads/thr_1:stream",
      body: { content: "Hi" },
      onEvent: (event, type) => {
        received.push({ event, type })
      },
    })

    expect(onRefreshed).toHaveBeenCalledWith("fresh_tok")
    expect(onUnauthorized).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(3)

    const retryInit = fetchMock.mock.calls[2][1] as RequestInit
    const retryHeaders = retryInit.headers as Record<string, string>
    expect(retryHeaders["Authorization"]).toBe("Bearer fresh_tok")
    expect(retryHeaders["Space-Id"]).toBe("spc_123")
    expect(retryHeaders["Accept"]).toBe("text/event-stream")
    expect(retryHeaders["Content-Type"]).toBe("application/json")

    expect(received).toEqual([
      { type: "run.started", event: { type: "run.started", runId: "air_1" } },
      {
        type: "message.delta",
        event: { type: "message.delta", delta: "Hello" },
      },
      { type: "run.completed", event: { type: "run.completed" } },
    ])
  })

  it("throws SaturnApiError on non-401 HTTP failures", async () => {
    configureClient({
      baseUrl: "https://api.example.com",
      storage: makeStorage("valid_tok"),
    })

    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: 8,
          message: "monthly workspace AI budget exceeded",
          details: [
            {
              "@type": "type.googleapis.com/google.rpc.ErrorInfo",
              reason: "AI_MONTHLY_BUDGET_EXCEEDED",
              domain: "saturn",
            },
          ],
        }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      )
    )
    globalThis.fetch = fetchMock as unknown as typeof fetch

    let caught: unknown
    try {
      await streamSSE({
        url: "/api/v1/platform/ai/threads/thr_1:stream",
        body: { content: "Hi" },
        onEvent: () => {},
      })
    } catch (err) {
      caught = err
    }

    expect(caught).toBeInstanceOf(SaturnApiError)
    const err = caught as SaturnApiError
    expect(err.status).toBe(429)
    expect(err.reason).toBe("AI_MONTHLY_BUDGET_EXCEEDED")
  })

  it("supports FormData without overriding multipart Content-Type and handles AbortSignal", async () => {
    configureClient({
      baseUrl: "https://api.example.com",
      storage: makeStorage("valid_tok"),
    })

    const controller = new AbortController()
    const encoder = new TextEncoder()
    const slowStream = new ReadableStream<Uint8Array>({
      start(ctrl) {
        ctrl.enqueue(
          encoder.encode('event: run.started\ndata: {"type":"run.started"}\n\n')
        )
      },
    })

    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(slowStream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      })
    )
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const form = new FormData()
    form.append("content", "Analyze")

    const events: unknown[] = []
    await expect(
      streamSSE({
        url: "/api/v1/platform/ai/threads/thr_1:stream",
        body: form,
        signal: controller.signal,
        onEvent: (ev) => {
          events.push(ev)
          controller.abort()
        },
      })
    ).rejects.toMatchObject({ name: "AbortError" })

    const init = fetchMock.mock.calls[0][1] as RequestInit
    const hdrs = init.headers as Record<string, string>
    expect(hdrs["Content-Type"]).toBeUndefined()
    expect(events).toHaveLength(1)
  })
})
