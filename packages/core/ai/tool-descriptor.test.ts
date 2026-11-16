import { describe, it, expect } from "vitest"
import {
  describeToolCall,
  formatToolDuration,
  getStreamPhaseLabel,
} from "./tool-descriptor"

describe("@saturn/core/ai tool-descriptor", () => {
  it("describes built-in Saturn domain tools with human labels and result counts", () => {
    const desc = describeToolCall({
      toolName: "finance_list_accounts",
      result: { accounts: [{ id: "acc_1" }, { id: "acc_2" }] },
    })

    expect(desc.domain).toBe("finance")
    expect(desc.domainLabel).toBe("Finance")
    expect(desc.label).toBe("List Accounts")
    expect(desc.activeLabel).toBe("Checking accounts…")
    expect(desc.completedLabel).toBe("Checked accounts")
    expect(desc.summary).toBe("2 accounts")
  })

  it("extracts amount and description summaries for transaction arguments", () => {
    const desc = describeToolCall({
      toolName: "finance_create_transaction",
      arguments: {
        amount_cents: 2550,
        currency: "usd",
        description: "Coffee Beans",
      },
    })

    expect(desc.domain).toBe("finance")
    expect(desc.label).toBe("Create Transaction")
    expect(desc.summary).toBe("25.50 USD · Coffee Beans")
  })

  it("parses external MCP and sub-agent tool names cleanly", () => {
    const mcpDesc = describeToolCall({
      toolName: "mcp__weather-service__ext_lookup_weather",
      arguments: { city: "Tokyo" },
    })
    expect(mcpDesc.domain).toBe("mcp")
    expect(mcpDesc.serverName).toBe("Weather Service")
    expect(mcpDesc.label).toBe("Ext Lookup Weather")
    expect(mcpDesc.activeLabel).toBe("Running Ext Lookup Weather…")
    expect(mcpDesc.summary).toBe("Tokyo")

    const agentDesc = describeToolCall({
      toolName: "agent__budget-analyst",
    })
    expect(agentDesc.domain).toBe("agent")
    expect(agentDesc.label).toBe("Budget Analyst")
    expect(agentDesc.activeLabel).toBe("Consulting Budget Analyst…")
  })

  it("formats stream phase labels and tool durations", () => {
    expect(getStreamPhaseLabel("connecting")).toBe("Starting turn…")
    expect(getStreamPhaseLabel("thinking")).toBe("Thinking…")
    expect(getStreamPhaseLabel("thinking", { hasCompletedTools: true })).toBe(
      "Reviewing tool results…"
    )
    expect(
      getStreamPhaseLabel("tool_running", {
        activeToolName: "mail_list_threads",
      })
    ).toBe("Searching mail threads…")
    expect(getStreamPhaseLabel("generating")).toBe("Generating response…")

    expect(formatToolDuration(420)).toBe("420ms")
    expect(formatToolDuration(1460)).toBe("1.5s")
  })
})
