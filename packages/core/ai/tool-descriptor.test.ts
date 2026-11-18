import { describe, it, expect } from "vitest"
import {
  describeToolCall,
  extractToolErrorMessage,
  formatCurrencyCents,
  formatToolDuration,
  getStreamPhaseLabel,
  humanizeFieldLabel,
  isEmptyToolParam,
  splitThinkingFromText,
  stripHtmlTags,
  unwrapToolResult,
} from "./index"

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

  it("populates isReadOnly and isDestructive for built-in and heuristic tools", () => {
    const readTool = describeToolCall({ toolName: "finance_list_accounts" })
    expect(readTool.isReadOnly).toBe(true)
    expect(readTool.isDestructive).toBe(false)

    const writeTool = describeToolCall({
      toolName: "finance_create_transaction",
    })
    expect(writeTool.isReadOnly).toBe(false)
    expect(writeTool.isDestructive).toBe(false)

    const deleteTool = describeToolCall({ toolName: "calendar_delete_event" })
    expect(deleteTool.isReadOnly).toBe(false)
    expect(deleteTool.isDestructive).toBe(true)

    const sendMailTool = describeToolCall({ toolName: "mail_send_message" })
    expect(sendMailTool.isReadOnly).toBe(false)
    expect(sendMailTool.isDestructive).toBe(true)

    const mcpRead = describeToolCall({ toolName: "mcp__github__search_issues" })
    expect(mcpRead.isReadOnly).toBe(true)
    expect(mcpRead.isDestructive).toBe(false)

    const mcpDelete = describeToolCall({ toolName: "mcp__jira__delete_issue" })
    expect(mcpDelete.isReadOnly).toBe(false)
    expect(mcpDelete.isDestructive).toBe(true)
  })

  it("unwraps MCP result envelopes and extracts summaries", () => {
    const wrappedContent = {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            accounts: [{ id: "acc_1" }, { id: "acc_2" }],
          }),
        },
      ],
    }
    expect(unwrapToolResult(wrappedContent)).toEqual({
      accounts: [{ id: "acc_1" }, { id: "acc_2" }],
    })
    expect(
      describeToolCall({
        toolName: "finance_list_accounts",
        result: wrappedContent,
      }).summary
    ).toBe("2 accounts")

    const structuredEnvelope = {
      structuredContent: { budgets: [{ id: "bgt_1" }] },
    }
    expect(unwrapToolResult(structuredEnvelope)).toEqual({
      budgets: [{ id: "bgt_1" }],
    })

    const plainTextEnvelope = {
      content: [{ type: "text", text: "Operation completed." }],
    }
    expect(unwrapToolResult(plainTextEnvelope)).toEqual({
      text: "Operation completed.",
    })
  })

  it("extracts human-readable error messages and formats labels/currency/html", () => {
    expect(extractToolErrorMessage({ error: "Permission denied" })).toBe(
      "Permission denied"
    )

    expect(
      extractToolErrorMessage({
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: "Insufficient budget" }),
          },
        ],
      })
    ).toBe("Insufficient budget")

    expect(
      extractToolErrorMessage(
        undefined,
        JSON.stringify({ message: "Upstream timeout" })
      )
    ).toBe("Upstream timeout")

    expect(formatCurrencyCents(4500, "USD")).toBe("$45.00 USD")
    expect(formatCurrencyCents(1500, "JPY")).toBe("¥1,500 JPY")
    expect(humanizeFieldLabel("start_date")).toBe("Start Date")
    expect(humanizeFieldLabel("connectedAccountId")).toBe(
      "Connected Account ID"
    )
    expect(stripHtmlTags("<p>Hello <b>world</b></p><p>Line 2</p>")).toBe(
      "Hello world\nLine 2"
    )
    expect(isEmptyToolParam("")).toBe(true)
    expect(isEmptyToolParam([])).toBe(true)
    expect(isEmptyToolParam({})).toBe(true)
    expect(isEmptyToolParam(0)).toBe(false)
    expect(isEmptyToolParam(false)).toBe(false)
  })

  it("describes expanded Finance, Mail, Calendar, and Workflow MCP tools and splits <think> tags", () => {
    const updTx = describeToolCall({
      toolName: "finance_update_transaction",
      arguments: { amount_cents: 4250, currency: "USD" },
    })
    expect(updTx.label).toBe("Update Transaction")
    expect(updTx.isReadOnly).toBe(false)
    expect(updTx.isDestructive).toBe(false)

    const delTx = describeToolCall({ toolName: "finance_delete_transaction" })
    expect(delTx.isDestructive).toBe(true)

    const runs = describeToolCall({
      toolName: "workflows_list_flow_runs",
      result: { runs: [{ id: "wfr_1" }, { id: "wfr_2" }] },
    })
    expect(runs.isReadOnly).toBe(true)
    expect(runs.summary).toBe("2 runs")

    const closed = splitThinkingFromText(
      "<think>\nCheck April groceries budget.\n</think>\nYou spent $320."
    )
    expect(closed.thinking).toBe("Check April groceries budget.")
    expect(closed.text).toBe("You spent $320.")
    expect(closed.hasUnclosedThink).toBe(false)

    const streaming = splitThinkingFromText(
      "<think>Comparing checking and savings"
    )
    expect(streaming.thinking).toBe("Comparing checking and savings")
    expect(streaming.text).toBe("")
    expect(streaming.hasUnclosedThink).toBe(true)
  })

  it("strips script/style/malformed HTML linearly without double-unescaping entities", () => {
    expect(stripHtmlTags("<p>Hello<script>alert(1)</script >World</p>")).toBe(
      "Hello World"
    )
    expect(
      stripHtmlTags("<p>Hello</p><script>alert(1)</script ><b>World</b>")
    ).toBe("Hello\n World")

    expect(stripHtmlTags("<scr<script>ipt>alert(1)</script>")).not.toContain(
      "<script"
    )

    expect(stripHtmlTags("<p>&amp;lt;script&amp;gt;</p>")).toBe(
      "&lt;script&gt;"
    )

    const start = performance.now()
    const stripped = stripHtmlTags("<style ".repeat(5000))
    const elapsedMs = performance.now() - start
    expect(stripped).toBe("")
    expect(elapsedMs).toBeLessThan(50)
  })

  it("splits <thinking> blocks and pathological unclosed <think> streams in linear time", () => {
    const thinkingRes = splitThinkingFromText(
      "Prefix <thinking>Step 1</thinking> Answer"
    )
    expect(thinkingRes.thinking).toBe("Step 1")
    expect(thinkingRes.text).toBe("Prefix  Answer")
    expect(thinkingRes.hasUnclosedThink).toBe(false)

    const start = performance.now()
    const pathological = splitThinkingFromText("<think>a".repeat(10000))
    const elapsedMs = performance.now() - start
    expect(pathological.hasUnclosedThink).toBe(true)
    expect(pathological.text).toBe("")
    expect(elapsedMs).toBeLessThan(50)
  })
})
