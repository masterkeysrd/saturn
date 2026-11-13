import { describe, it, expect, vi } from "vitest"
import { shouldDehydrateQuery } from "../lib/query-persister"

vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
}))

vi.mock("@react-native-community/netinfo", () => ({
  default: {
    addEventListener: vi.fn(),
  },
}))

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
}))

describe("Android SQLite CursorWindow Persistence Guard", () => {
  it("persists thread list metadata queries (status=success, meta.persist undefined)", () => {
    const threadListQuery = {
      state: { status: "success" },
      queryKey: ["mail", "threads", { mailboxId: "INBOX" }],
    }
    expect(shouldDehydrateQuery(threadListQuery)).toBe(true)
  })

  it("never persists hydrated email message bodies where meta.persist === false", () => {
    // Large hydrated HTML message bodies must not enter Android SQLite CursorWindow
    const singleThreadQuery = {
      state: { status: "success" },
      queryKey: ["mail", "thread", "mth_12345"],
      meta: { persist: false },
    }
    expect(shouldDehydrateQuery(singleThreadQuery)).toBe(false)
  })

  it("rejects non-successful query states (loading, error) from disk cache", () => {
    const errorQuery = {
      state: { status: "error" },
      queryKey: ["mail", "threads"],
    }
    const pendingQuery = {
      state: { status: "pending" },
      queryKey: ["mail", "threads"],
    }
    expect(shouldDehydrateQuery(errorQuery)).toBe(false)
    expect(shouldDehydrateQuery(pendingQuery)).toBe(false)
  })

  it("rejects sensitive auth, token, and password queries from disk cache", () => {
    expect(
      shouldDehydrateQuery({
        state: { status: "success" },
        queryKey: ["auth", "session"],
      })
    ).toBe(false)
    expect(
      shouldDehydrateQuery({
        state: { status: "success" },
        queryKey: ["token", "access"],
      })
    ).toBe(false)
    expect(
      shouldDehydrateQuery({
        state: { status: "success" },
        queryKey: ["password", "reset"],
      })
    ).toBe(false)
  })
})
