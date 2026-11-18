import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  configureClient,
  request,
  refreshSession,
  SaturnApiError,
} from "./client"
import { defaultStorage, type StorageAdapter } from "./storage"

function makeStorage(
  initialToken: string | null = "expired_token"
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
    getActiveSpaceId: () => "spc_1",
    setActiveSpaceId: () => {},
    getRefreshToken: () => refreshToken,
    setRefreshToken: (rt: string) => {
      refreshToken = rt
    },
  }
}

describe("@saturn/api client", () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it("does not call onUnauthorized when post-refresh retry returns 400/403/404/409 and throws SaturnApiError", async () => {
    const onUnauthorized = vi.fn()
    const onRefreshed = vi.fn()
    configureClient({
      baseUrl: "https://api.example.com",
      storage: makeStorage("old_access"),
      onUnauthorized,
      onRefreshed,
    })

    const fetchMock = vi
      .fn()
      // 1. Initial call returns 401
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 16, message: "token expired" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        })
      )
      // 2. Refresh succeeds
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            accessToken: "new_access",
            refreshToken: "new_refresh",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      // 3. Retry returns 409 Conflict with details
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 10,
            message: "budget name already exists",
            details: [
              {
                "@type": "type.googleapis.com/google.rpc.ErrorInfo",
                reason: "BUDGET_EXISTS",
                domain: "saturn",
                metadata: { budget_id: "bgt_1" },
              },
              {
                "@type": "type.googleapis.com/google.rpc.BadRequest",
                fieldViolations: [
                  { field: "name", description: "already taken" },
                ],
              },
            ],
          }),
          { status: 409, headers: { "Content-Type": "application/json" } }
        )
      )

    globalThis.fetch = fetchMock as unknown as typeof fetch

    let caught: unknown
    try {
      await request({ method: "POST", url: "/api/v1/finance/budgets" })
    } catch (err) {
      caught = err
    }

    expect(onRefreshed).toHaveBeenCalledWith("new_access")
    expect(onUnauthorized).not.toHaveBeenCalled()
    expect(caught).toBeInstanceOf(SaturnApiError)
    const apiErr = caught as SaturnApiError
    expect(apiErr.status).toBe(409)
    expect(apiErr.code).toBe(10)
    expect(apiErr.message).toBe("budget name already exists")
    expect(apiErr.reason).toBe("BUDGET_EXISTS")
    expect(apiErr.metadata).toEqual({ budget_id: "bgt_1" })
    expect(apiErr.fieldViolations).toEqual([
      { field: "name", description: "already taken" },
    ])
  })

  it("does not refresh or logout on 401 INVALID_CREDENTIALS from password check", async () => {
    const onUnauthorized = vi.fn()
    configureClient({
      baseUrl: "https://api.example.com",
      storage: makeStorage("valid_access"),
      onUnauthorized,
    })

    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: 16,
          message: "current password is incorrect",
          details: [
            {
              "@type": "type.googleapis.com/google.rpc.ErrorInfo",
              reason: "INVALID_CREDENTIALS",
              domain: "saturn",
            },
          ],
        }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      )
    )
    globalThis.fetch = fetchMock as unknown as typeof fetch

    let caught: unknown
    try {
      await request({
        method: "POST",
        url: "/api/v1/identity/users:change-password",
        data: { currentPassword: "wrong", newPassword: "new" },
      })
    } catch (err) {
      caught = err
    }

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(onUnauthorized).not.toHaveBeenCalled()
    expect(caught).toBeInstanceOf(SaturnApiError)
    expect((caught as SaturnApiError).reason).toBe("INVALID_CREDENTIALS")
    expect((caught as SaturnApiError).status).toBe(401)
  })

  it("calls onUnauthorized when refresh fails", async () => {
    const onUnauthorized = vi.fn()
    configureClient({
      baseUrl: "https://api.example.com",
      storage: makeStorage("old_access"),
      onUnauthorized,
    })

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 401 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "refresh revoked" }), {
          status: 401,
        })
      )
    globalThis.fetch = fetchMock as unknown as typeof fetch

    await expect(
      request({ method: "GET", url: "/api/v1/spaces" })
    ).rejects.toThrow("refresh revoked")

    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })

  it("refreshSession uses configured baseUrl and deduplicates concurrent refreshes", async () => {
    configureClient({
      baseUrl: "https://selfhosted.saturn.local",
      storage: makeStorage("old_access"),
      onUnauthorized: vi.fn(),
      onRefreshed: vi.fn(),
    })

    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          accessToken: "fresh_access",
          refreshToken: "fresh_refresh",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    )
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const [t1, t2] = await Promise.all([refreshSession(), refreshSession()])
    expect(t1).toBe("fresh_access")
    expect(t2).toBe("fresh_access")
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://selfhosted.saturn.local/api/v1/identity/sessions:refresh"
    )
  })

  it("defaultStorage.clearSession removes active_space_id and space_meta from localStorage", () => {
    const store = new Map<string, string>()
    const originalLocalStorage = globalThis.localStorage
    const originalWindow = globalThis.window
    vi.stubGlobal("window", {})
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    })

    try {
      localStorage.setItem("has_session", "true")
      localStorage.setItem("active_space_id", "spc_1")
      localStorage.setItem("space_meta", '{"spaceId":"spc_1"}')

      defaultStorage.clearSession()

      expect(localStorage.getItem("has_session")).toBeNull()
      expect(localStorage.getItem("active_space_id")).toBeNull()
      expect(localStorage.getItem("space_meta")).toBeNull()
    } finally {
      vi.stubGlobal("window", originalWindow)
      vi.stubGlobal("localStorage", originalLocalStorage)
    }
  })
})
