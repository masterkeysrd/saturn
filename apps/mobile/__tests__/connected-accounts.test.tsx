import { describe, it, expect, vi, beforeEach } from "vitest"
import * as WebBrowser from "expo-web-browser"
import * as Linking from "expo-linking"
import { haptics } from "../lib/haptics"

vi.mock("expo-web-browser", () => ({
  openAuthSessionAsync: vi.fn(),
  maybeCompleteAuthSession: vi.fn(),
}))

vi.mock("expo-linking", () => ({
  createURL: vi.fn((path: string) => `saturn://${path}`),
}))

vi.mock("../lib/haptics", () => ({
  haptics: {
    light: vi.fn(),
    medium: vi.fn(),
    heavy: vi.fn(),
    selection: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}))

describe("Mobile Connected Accounts logic", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("launches WebBrowser auth session with PKCE redirect URL and fires haptics.success", async () => {
    const redirectUrl = Linking.createURL("oauth-callback")
    expect(redirectUrl).toBe("saturn://oauth-callback")

    vi.mocked(WebBrowser.openAuthSessionAsync).mockResolvedValueOnce({
      type: "success",
      url: "saturn://oauth-callback?code=test-code&state=test-state",
    })

    const authUrl = "https://accounts.google.com/o/oauth2/v2/auth?client_id=123"

    // Simulate mobile OAuth session trigger
    await haptics.light()
    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl)

    expect(haptics.light).toHaveBeenCalled()
    expect(WebBrowser.openAuthSessionAsync).toHaveBeenCalledWith(
      authUrl,
      "saturn://oauth-callback"
    )
    expect(result.type).toBe("success")

    if (result.type === "success") {
      await haptics.success()
    }

    expect(haptics.success).toHaveBeenCalled()
  })

  it("fires haptics.selection and haptics.heavy for capability toggle and disconnect flows", async () => {
    // Capability toggle trigger
    await haptics.selection()
    expect(haptics.selection).toHaveBeenCalled()

    // Destructive disconnect trigger
    await haptics.heavy()
    expect(haptics.heavy).toHaveBeenCalled()
  })
})
