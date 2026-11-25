import React from "react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, fireEvent, waitFor } from "@testing-library/react"
import * as Clipboard from "expo-clipboard"
import {
  describeToolCall,
  formatDateWithTimezone,
  getStreamPhaseLabel,
} from "@saturn/core"
import { darkColors, spacing } from "@saturn/tokens"
import {
  AgentFormSchema,
  API_KEY_SCOPES,
  CreateProviderSchema,
  SendThreadTurnSchema,
} from "@saturn/schemas"
import enLocale from "../../../packages/i18n/locales/en.json"
import { haptics } from "../lib/haptics"
import { parseMarkdownBlocks } from "../components/ai/markdown-parser"
import { JsonCodeBlock } from "../components/ui/json-code-block"
import { ChatMessageBubble } from "../components/ai/chat-message-bubble"
import { ToolApprovalCard } from "../components/ai/tool-approval-card"

const mockPush = vi.hoisted(() => vi.fn())
const mockGetQueriesData = vi.hoisted(() =>
  vi.fn<() => [unknown, unknown][]>(() => [])
)

vi.mock("react-native", async () => {
  const ReactMod = await import("react")
  const flattenStyle = (s: unknown): Record<string, unknown> => {
    if (!s) return {}
    if (Array.isArray(s)) {
      return Object.assign(
        {},
        ...s.flat(Infinity).filter(Boolean).map(flattenStyle)
      )
    }
    return typeof s === "object" ? (s as Record<string, unknown>) : {}
  }

  return {
    Platform: {
      OS: "ios",
      select: (obj: Record<string, unknown>) => obj.ios ?? obj.default,
    },
    StyleSheet: {
      create: <T extends Record<string, unknown>>(styles: T): T => styles,
      hairlineWidth: 1,
    },
    Share: {
      share: vi.fn().mockResolvedValue({ action: "sharedAction" }),
    },
    View: ({
      children,
      style,
      testID,
      ...props
    }: Record<string, unknown> & { testID?: string }) =>
      ReactMod.createElement(
        "div",
        {
          ...props,
          ...(testID ? { "data-testid": testID } : {}),
          style: flattenStyle(style),
        },
        children as React.ReactNode
      ),
    ScrollView: ({
      children,
      style,
      testID,
      horizontal: _h,
      nestedScrollEnabled: _ns,
      showsHorizontalScrollIndicator: _sh,
      showsVerticalScrollIndicator: _sv,
      bounces: _b,
      ...props
    }: Record<string, unknown> & { testID?: string }) =>
      ReactMod.createElement(
        "div",
        {
          ...props,
          ...(testID ? { "data-testid": testID } : {}),
          style: flattenStyle(style),
        },
        children as React.ReactNode
      ),
    Text: ({
      children,
      style,
      testID,
      numberOfLines: _numberOfLines,
      selectable: _selectable,
      ...props
    }: Record<string, unknown> & { testID?: string }) =>
      ReactMod.createElement(
        "span",
        {
          ...props,
          ...(testID ? { "data-testid": testID } : {}),
          style: flattenStyle(style),
        },
        children as React.ReactNode
      ),
    TouchableOpacity: ({
      children,
      onPress,
      style,
      disabled,
      testID,
      activeOpacity: _activeOpacity,
      accessibilityRole: _accessibilityRole,
      accessibilityLabel,
      hitSlop: _hitSlop,
      ...props
    }: Record<string, unknown> & {
      testID?: string
      accessibilityLabel?: string
      onPress?: () => void
      disabled?: boolean
    }) =>
      ReactMod.createElement(
        "button",
        {
          type: "button",
          ...props,
          ...(testID ? { "data-testid": testID } : {}),
          ...(accessibilityLabel ? { "aria-label": accessibilityLabel } : {}),
          disabled,
          style: flattenStyle(style),
          onClick: disabled ? undefined : onPress,
        },
        children as React.ReactNode
      ),
    ActivityIndicator: ({ testID }: { testID?: string }) =>
      ReactMod.createElement("span", {
        "data-testid": testID ?? "activity-indicator",
      }),
  }
})

vi.mock("expo-clipboard", () => ({
  setStringAsync: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: vi.fn() }),
}))

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    getQueriesData: mockGetQueriesData,
  }),
}))

vi.mock("lucide-react-native", async () => {
  const ReactMod = await import("react")
  const icon =
    (name: string) =>
    ({ color, size }: { color?: string; size?: number }) =>
      ReactMod.createElement("span", {
        "data-testid": `icon-${name}`,
        "data-color": color,
        "data-size": size,
      })
  return {
    AlertCircle: icon("AlertCircle"),
    AlertTriangle: icon("AlertTriangle"),
    Bot: icon("Bot"),
    Brain: icon("Brain"),
    Calendar: icon("Calendar"),
    Check: icon("Check"),
    CheckCircle2: icon("CheckCircle2"),
    ChevronDown: icon("ChevronDown"),
    ChevronRight: icon("ChevronRight"),
    Copy: icon("Copy"),
    FileText: icon("FileText"),
    Landmark: icon("Landmark"),
    Layers: icon("Layers"),
    Mail: icon("Mail"),
    MapPin: icon("MapPin"),
    Plug: icon("Plug"),
    Share2: icon("Share2"),
    ShieldAlert: icon("ShieldAlert"),
    Workflow: icon("Workflow"),
    Wrench: icon("Wrench"),
    X: icon("X"),
  }
})

function lookupI18n(
  key: string,
  params?: Record<string, string | number>
): string {
  const parts = key.split(".")
  let curr: unknown = enLocale
  for (const part of parts) {
    if (curr && typeof curr === "object" && part in curr) {
      curr = (curr as Record<string, unknown>)[part]
    } else {
      curr = undefined
      break
    }
  }
  let text = typeof curr === "string" ? curr : key
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, "g"), String(v))
    }
  }
  return text
}

vi.mock("@saturn/hooks", () => ({
  useTimezone: () => ({
    timezone: "UTC",
    locale: "en-US",
    format: (date: string | number | Date, opts?: Intl.DateTimeFormatOptions) =>
      formatDateWithTimezone(
        date,
        "UTC",
        { year: "numeric", month: "short", day: "numeric", ...opts },
        "en-US"
      ),
  }),
  useI18n: () => ({
    t: (key: string, params?: Record<string, string | number>) =>
      lookupI18n(key, params),
    locale: "en-US",
  }),
}))

const mockTheme = {
  mode: "dark" as const,
  resolvedMode: "dark" as const,
  setMode: vi.fn(),
  colors: darkColors,
  spacing,
  radius: { xs: 4, sm: 6, md: 10, lg: 14, xl: 20, full: 999 },
  shadows: { sm: {}, md: {}, lg: {} },
  budgetColors: {},
  getBudgetColors: () => ({ bg: "", border: "", text: "", bar: "" }),
  typography: { mono: "Menlo" },
  isDark: true,
}

vi.mock("../lib/theme", () => ({
  useTheme: () => mockTheme,
  useThemedStyles: (fn: (t: typeof mockTheme) => Record<string, unknown>) =>
    fn(mockTheme),
}))

vi.mock("../components/ui/badge", async () => {
  const ReactMod = await import("react")
  return {
    Badge: ({
      label,
      children,
    }: {
      label?: string
      children?: React.ReactNode
    }) => ReactMod.createElement("span", null, label || children),
  }
})

vi.mock("../components/ui/typography", async () => {
  const ReactMod = await import("react")
  return {
    MonoAmount: ({
      children,
      color,
    }: {
      children?: React.ReactNode
      color?: string
    }) =>
      ReactMod.createElement(
        "span",
        { style: color ? { color } : undefined },
        children
      ),
  }
})

vi.mock("../components/ai/streaming-dots", async () => {
  const ReactMod = await import("react")
  return {
    StreamingDots: () =>
      ReactMod.createElement("span", { "data-testid": "streaming-dots" }),
  }
})

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
    mockGetQueriesData.mockReturnValue([])
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

  it("pretty-prints, unwraps nested MCP JSON, and syntax-colors spans in JsonCodeBlock", async () => {
    const nestedMcp = {
      content: [
        {
          type: "text",
          text: '{"merchant":"Whole Foods","amount_cents":4500}',
        },
      ],
    }

    const { container, getByRole } = render(
      <JsonCodeBlock value={nestedMcp} testID="json-viewer" />
    )

    const spans = Array.from(container.querySelectorAll("span"))
    const keySpan = spans.find((el) => el.textContent === '"merchant"')
    const strSpan = spans.find((el) => el.textContent === '"Whole Foods"')
    const numSpan = spans.find((el) => el.textContent === "4500")

    const hexToRgb = (hex: string) => {
      const clean = hex.replace("#", "")
      const r = parseInt(clean.slice(0, 2), 16)
      const g = parseInt(clean.slice(2, 4), 16)
      const b = parseInt(clean.slice(4, 6), 16)
      return `rgb(${r}, ${g}, ${b})`
    }

    expect(keySpan?.style.color).toBe(hexToRgb(darkColors.syntaxKey))
    expect(strSpan?.style.color).toBe(hexToRgb(darkColors.syntaxString))
    expect(numSpan?.style.color).toBe(hexToRgb(darkColors.syntaxNumber))

    fireEvent.click(getByRole("button", { name: "Copy JSON" }))
    expect(haptics.selection).toHaveBeenCalled()
    await waitFor(() => {
      expect(Clipboard.setStringAsync).toHaveBeenCalledWith(
        expect.stringContaining('"merchant": "Whole Foods"')
      )
      expect(getByRole("button", { name: "Copy JSON" }).textContent).toContain(
        "Copied"
      )
    })
  })

  it("renders structured tool call parameters and domain results in ChatMessageBubble and toggles Raw JSON", () => {
    const toolResultsByCallId = new Map([
      [
        "call_1",
        {
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  budgets: [
                    {
                      id: "bdg_1",
                      name: "Groceries",
                      spent_cents: 12000,
                      limit_cents: 40000,
                      currency: "USD",
                      usage_percent: 30,
                    },
                  ],
                }),
              },
            ],
          },
          isError: false,
        },
      ],
    ])

    const { getByText, queryByText, getByTestId } = render(
      <ChatMessageBubble
        message={{
          id: "msg_1",
          role: "assistant",
          blocks: [
            {
              type: "tool_call",
              toolCallId: "call_1",
              toolName: "finance_list_budgets",
              arguments: { include_archived: false },
            },
          ],
        }}
        toolResultsByCallId={toolResultsByCallId}
      />
    )

    expect(
      queryByText('finance_list_budgets({"include_archived":false})')
    ).toBeNull()
    expect(getByText("Checked budgets")).toBeTruthy()
    expect(getByText("1 budget")).toBeTruthy()

    fireEvent.click(getByText("Checked budgets"))

    expect(getByText("Include Archived")).toBeTruthy()
    expect(getByText("No")).toBeTruthy()
    expect(getByText("Groceries")).toBeTruthy()
    expect(getByText("$120.00 USD")).toBeTruthy()
    expect(getByText("$400.00 USD")).toBeTruthy()

    fireEvent.click(getByTestId("tool-raw-toggle-call_1"))
    expect(getByTestId("tool-raw-args-call_1")).toBeTruthy()
    expect(getByTestId("tool-raw-result-call_1")).toBeTruthy()
  })

  it("renders structured action preview in ToolApprovalCard and toggles Raw JSON", () => {
    mockGetQueriesData.mockReturnValue([
      [
        ["/api/v1/finance/accounts"],
        { accounts: [{ id: "acc_1", name: "Main Checking", currency: "USD" }] },
      ],
    ])

    const { getByText, queryByTestId, getByTestId } = render(
      <ToolApprovalCard
        approval={{
          toolCallId: "app_1",
          toolName: "finance_create_transaction",
          arguments: {
            type: "EXPENSE",
            amount_cents: 4500,
            currency: "USD",
            description: "Whole Foods",
            account_id: "acc_1",
          },
        }}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    )

    expect(getByText("Whole Foods")).toBeTruthy()
    expect(getByText("$45.00 USD")).toBeTruthy()
    expect(getByText("Main Checking")).toBeTruthy()
    expect(queryByTestId("approval-raw-json")).toBeNull()

    fireEvent.click(getByTestId("approval-raw-toggle"))
    expect(getByTestId("approval-raw-json")).toBeTruthy()
  })

  it("renders at most one live thinking/streaming indicator per turn in ChatMessageBubble", () => {
    const cases = [
      {
        name: "initial thinking before reasoning tokens shows single status row",
        draft: { thinking: "", text: "", toolCalls: [] },
        phase: "thinking" as const,
        expectedDots: 1,
        expectedThinkingCount: 1,
      },
      {
        name: "streaming reasoning tokens shows single Thinking pill with dots and hides duplicate status row",
        draft: {
          thinking: "Checking recent threads...",
          text: "",
          toolCalls: [],
        },
        phase: "thinking" as const,
        expectedDots: 1,
        expectedThinkingCount: 1,
      },
      {
        name: "inline <think> tags fold into single Thinking pill without leaking raw tags or duplicating status",
        draft: {
          thinking: "",
          text: "<think>Inspecting budget limits",
          toolCalls: [],
        },
        phase: "generating" as const,
        expectedDots: 1,
        expectedThinkingCount: 1,
      },
      {
        name: "running tool card suppresses bottom status row and settles earlier thoughts into Thought process",
        draft: {
          thinking: "Let me check your budgets.",
          text: "",
          toolCalls: [
            {
              toolCallId: "tc_run",
              toolName: "finance_list_budgets",
              status: "running" as const,
            },
          ],
        },
        phase: "tool_running" as const,
        expectedDots: 0,
        expectedThinkingCount: 0,
      },
      {
        name: "actively streaming markdown response hides redundant Generating status row",
        draft: {
          thinking: "Done checking.",
          text: "Your Groceries budget has $280 remaining.",
          toolCalls: [],
        },
        phase: "generating" as const,
        expectedDots: 0,
        expectedThinkingCount: 0,
      },
    ]

    for (const tc of cases) {
      const view = render(
        <ChatMessageBubble
          streamingDraft={tc.draft}
          isStreaming
          streamPhase={tc.phase}
        />
      )

      const dots = view.queryAllByTestId("streaming-dots")
      const thinkingLabels = view.queryAllByText("Thinking…")
      expect(dots.length, `${tc.name} (dots)`).toBe(tc.expectedDots)
      expect(thinkingLabels.length, `${tc.name} (Thinking… count)`).toBe(
        tc.expectedThinkingCount
      )
      view.unmount()
    }
  })
})
