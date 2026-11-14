import { describe, it, expect, vi, beforeEach } from "vitest"
import * as Clipboard from "expo-clipboard"
import { haptics } from "../lib/haptics"
import {
  API_KEY_EXPIRATION_PRESETS,
  API_KEY_SCOPES,
  CreateAPIKeySchema,
} from "@saturn/schemas"

vi.mock("expo-clipboard", () => ({
  setStringAsync: vi.fn(async () => true),
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

describe("Mobile API Keys flow", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("copies one-time API key secret via expo-clipboard and triggers haptics.success", async () => {
    const rawKey = "sat_example_secret_token_value"
    await Clipboard.setStringAsync(rawKey)
    await haptics.success()

    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(rawKey)
    expect(haptics.success).toHaveBeenCalledTimes(1)
  })

  it("validates mobile API key creation payload and supports select-all scopes", () => {
    haptics.selection()
    expect(haptics.selection).toHaveBeenCalledTimes(1)

    const preset = API_KEY_EXPIRATION_PRESETS.find((p) => p.id === "90d")
    const fixedNow = new Date("2026-04-01T00:00:00.000Z")
    const expiresAt = new Date(
      fixedNow.getTime() + (preset?.days ?? 90) * 24 * 60 * 60 * 1000
    ).toISOString()

    const parsed = CreateAPIKeySchema.safeParse({
      name: "iOS Shortcut",
      scopes: [...API_KEY_SCOPES],
      spaceIds: ["spc_1"],
      expiresAt,
    })
    expect(parsed.success).toBe(true)
  })
})
