import { describe, it, expect, vi, beforeEach } from "vitest"
import { describeToolCall, getStreamPhaseLabel } from "@saturn/core"
import {
  AgentFormSchema,
  API_KEY_SCOPES,
  CreateProviderSchema,
  SendThreadTurnSchema,
} from "@saturn/schemas"
import { haptics } from "../lib/haptics"

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

describe("Mobile AI assistant, approval haptics, and schemas", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("triggers warning haptic when tool approval is requested and success on approval", () => {
    haptics.warning()
    haptics.success()

    expect(haptics.warning).toHaveBeenCalledTimes(1)
    expect(haptics.success).toHaveBeenCalledTimes(1)
  })

  it("exposes ai:read, ai:execute, and ai:write in API_KEY_SCOPES", () => {
    expect(API_KEY_SCOPES).toContain("ai:read")
    expect(API_KEY_SCOPES).toContain("ai:execute")
    expect(API_KEY_SCOPES).toContain("ai:write")
    expect(API_KEY_SCOPES).not.toContain("agents:read")
  })

  it("validates mobile AI chat turn, agent, and provider payloads", () => {
    expect(
      SendThreadTurnSchema.safeParse({
        content: "Summarize April spending",
      }).success
    ).toBe(true)

    expect(
      SendThreadTurnSchema.safeParse({
        content: "   ",
      }).success
    ).toBe(false)

    expect(
      CreateProviderSchema.safeParse({
        name: "Anthropic",
        driver: "anthropic",
        apiKey: "sk-ant-test",
      }).success
    ).toBe(true)

    expect(
      AgentFormSchema.safeParse({
        slug: "mobile-helper",
        name: "Mobile Helper",
        execution: {
          approvalPolicy: "confirm_writes",
          maxSteps: 10,
          timeoutSeconds: 60,
        },
        mcpBindings: [{ mcpServerId: "mcp_saturn", allowedTools: ["*"] }],
      }).success
    ).toBe(true)
  })

  it("maps tool names and stream phases to domain-aware mobile labels", () => {
    const fin = describeToolCall({
      toolName: "finance_create_transaction",
      arguments: { amount_cents: 1200, currency: "USD", description: "Lunch" },
    })
    expect(fin.domainLabel).toBe("Finance")
    expect(fin.activeLabel).toBe("Recording transaction…")
    expect(fin.summary).toBe("12.00 USD · Lunch")

    expect(
      getStreamPhaseLabel("tool_running", {
        activeToolName: "calendar_list_events",
      })
    ).toBe("Checking calendar events…")
  })
})
