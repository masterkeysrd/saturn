import { describe, it, expect, vi, beforeEach } from "vitest"
import { describeToolCall, getStreamPhaseLabel } from "@saturn/core"
import {
  AgentFormSchema,
  API_KEY_SCOPES,
  CreateProviderSchema,
  SendThreadTurnSchema,
} from "@saturn/schemas"
import { haptics } from "../lib/haptics"
import { parseMarkdownBlocks } from "../components/ai/markdown-parser"

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

  it("parses headings, lists, quotes, and streaming/closed code blocks cleanly", () => {
    const blocks = parseMarkdownBlocks(
      [
        "## Budget Summary",
        "",
        "- Groceries: **$120**",
        "- Coffee: `$15`",
        "",
        "> On track for April",
        "",
        "```json",
        '{"remaining": 380}',
      ].join("\n")
    )

    expect(blocks).toEqual([
      { type: "heading", level: 2, text: "Budget Summary" },
      {
        type: "list",
        ordered: false,
        items: ["Groceries: **$120**", "Coffee: `$15`"],
      },
      { type: "blockquote", text: "On track for April" },
      { type: "code", language: "json", code: '{"remaining": 380}' },
    ])
    expect(parseMarkdownBlocks("\n\n\n")).toEqual([])
  })

  it("parses GFM markdown tables and horizontal rules", () => {
    const blocks = parseMarkdownBlocks(
      [
        "| Account | Balance | Currency |",
        "| :--- | ---: | :---: |",
        "| Checking | **$1,250.00** | USD |",
        "| Savings | $400.00 |",
        "---",
        "Done.",
      ].join("\n")
    )

    expect(blocks).toEqual([
      {
        type: "table",
        headers: ["Account", "Balance", "Currency"],
        alignments: ["left", "right", "center"],
        rows: [
          ["Checking", "**$1,250.00**", "USD"],
          ["Savings", "$400.00", ""],
        ],
      },
      { type: "hr" },
      { type: "paragraph", text: "Done." },
    ])
  })
})
