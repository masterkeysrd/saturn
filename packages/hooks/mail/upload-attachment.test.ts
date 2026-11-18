import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { configureClient } from "@saturn/api/client"
import type { StorageAdapter } from "@saturn/api/storage"
import { uploadDraftAttachment } from "./upload-attachment"

function makeStorage(token: string | null = "tok_1"): StorageAdapter {
  let current = token
  let rt: string | null = "rt_1"
  return {
    getSession: () => ({ accessToken: current, hasSession: !!current }),
    setSession: (t) => {
      current = t
    },
    clearSession: () => {
      current = null
    },
    getActiveSpaceId: () => "spc_1",
    setActiveSpaceId: () => {},
    getRefreshToken: () => rt,
    setRefreshToken: (next) => {
      rt = next
    },
  }
}

describe("uploadDraftAttachment", () => {
  const originalXHR = globalThis.XMLHttpRequest
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    globalThis.XMLHttpRequest = originalXHR
    globalThis.fetch = originalFetch
  })

  it("sets withCredentials = true, retries once on 401 via refreshSession, and supports RN file URI objects", async () => {
    configureClient({
      baseUrl: "https://api.example.com",
      storage: makeStorage("expired_tok"),
    })

    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          accessToken: "fresh_tok",
          refreshToken: "fresh_rt",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    )
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const calls: Array<{
      url: string
      withCredentials: boolean
      headers: Record<string, string>
    }> = []

    class MockXHR {
      withCredentials = false
      status = 200
      responseText = ""
      upload = {} as XMLHttpRequestUpload
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      private url = ""
      private headers: Record<string, string> = {}

      open(_method: string, url: string) {
        this.url = url
      }
      setRequestHeader(k: string, v: string) {
        this.headers[k] = v
      }
      send() {
        calls.push({
          url: this.url,
          withCredentials: this.withCredentials,
          headers: { ...this.headers },
        })
        if (calls.length === 1) {
          this.status = 401
          this.responseText = "unauthorized"
        } else {
          this.status = 200
          this.responseText = JSON.stringify({
            id: "att_1",
            filename: "photo.jpg",
            contentType: "image/jpeg",
            size: "1024",
            contentId: "",
            isInline: false,
            downloadUrl: "/api/v1/mail/attachments/tok",
          })
        }
        this.onload?.()
      }
    }

    globalThis.XMLHttpRequest = MockXHR as unknown as typeof XMLHttpRequest

    const result = await uploadDraftAttachment({
      draftId: "mdf_1",
      file: {
        uri: "file:///tmp/photo.jpg",
        name: "photo.jpg",
        type: "image/jpeg",
      },
    })

    expect(calls).toHaveLength(2)
    expect(calls[0].withCredentials).toBe(true)
    expect(calls[0].headers["Authorization"]).toBe("Bearer expired_tok")
    expect(calls[1].withCredentials).toBe(true)
    expect(calls[1].headers["Authorization"]).toBe("Bearer fresh_tok")
    expect(calls[1].url).toBe(
      "https://api.example.com/api/v1/mail/drafts/mdf_1/attachments"
    )
    expect(result.id).toBe("att_1")
  })
})
