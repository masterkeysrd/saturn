import React from "react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, fireEvent } from "@testing-library/react"
import {
  DASHBOARD_PRESETS,
  DASHBOARD_WIDGET_CATALOG,
  DEFAULT_DASHBOARD_WIDGETS,
  formatDateWithTimezone,
  normalizeDashboardWidgets,
} from "@saturn/core"
import type { InboxItem } from "@saturn/api/saturn/finance/v1/finance"
import {
  buildUpdateInboxItemRequest,
  canQuickApproveInboxItem,
  decodeInboxRawPayload,
  getInboxDocTypeLabelKey,
  parseDecimalToCentsString,
  resolveInboxTransactionType,
} from "../lib/inbox-triage"
import {
  applyDashboardPreset,
  areDashboardWidgetListsEqual,
  buildUpdateDashboardPreferencesPayload,
  findActiveDashboardPresetId,
  getOrderedDashboardRows,
  moveDashboardWidget,
  toggleDashboardWidget,
} from "../lib/overview-preferences"
import { FinanceSummaryWidget } from "../components/widgets/finance-summary-widget"
import { SwipeableInboxCard } from "../components/finance/swipeable-inbox-card"

vi.mock("react-native", async () => {
  const ReactMod = await import("react")
  const flattenStyle = (s: unknown): Record<string, unknown> => {
    if (!s) return {}
    if (Array.isArray(s)) {
      return Object.assign({}, ...s.map(flattenStyle))
    }
    if (typeof s === "object") return s as Record<string, unknown>
    return {}
  }

  return {
    StyleSheet: {
      create: <T extends Record<string, unknown>>(styles: T): T => styles,
      hairlineWidth: 1,
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
    Text: ({
      children,
      style,
      testID,
      numberOfLines: _numberOfLines,
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
    Pressable: ({
      children,
      onPress,
      style,
      testID,
      ...props
    }: Record<string, unknown> & {
      testID?: string
      onPress?: () => void
      style?: unknown | ((state: { pressed: boolean }) => unknown)
    }) => {
      const resolvedStyle =
        typeof style === "function" ? style({ pressed: false }) : style
      return ReactMod.createElement(
        "div",
        {
          ...props,
          ...(testID ? { "data-testid": testID } : {}),
          role: "button",
          style: flattenStyle(resolvedStyle),
          onClick: onPress,
        },
        children as React.ReactNode
      )
    },
    TouchableOpacity: ({
      children,
      onPress,
      style,
      disabled,
      testID,
      activeOpacity: _activeOpacity,
      accessibilityRole: _accessibilityRole,
      accessibilityLabel,
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
          ...props,
          ...(testID ? { "data-testid": testID } : {}),
          ...(accessibilityLabel ? { "aria-label": accessibilityLabel } : {}),
          disabled,
          style: flattenStyle(style),
          onClick: (e: React.MouseEvent) => {
            e.stopPropagation()
            onPress?.()
          },
        },
        children as React.ReactNode
      ),
  }
})

vi.mock("react-native-reanimated", async () => {
  const ReactMod = await import("react")
  return {
    default: {
      View: ({ children, style, ...props }: Record<string, unknown>) => {
        const flat = Array.isArray(style)
          ? Object.assign({}, ...style.filter(Boolean))
          : style
        return ReactMod.createElement(
          "div",
          { ...props, style: flat },
          children as React.ReactNode
        )
      },
    },
    useAnimatedStyle: (fn: () => Record<string, unknown>) => fn(),
    interpolate: (_val: number, _in: number[], out: number[]) =>
      out[out.length - 1],
  }
})

vi.mock("react-native-gesture-handler/ReanimatedSwipeable", async () => {
  const ReactMod = await import("react")
  const Swipeable = ReactMod.forwardRef(
    (
      {
        children,
        renderLeftActions,
        renderRightActions,
        testID,
      }: {
        children?: React.ReactNode
        renderLeftActions?: (
          progress: { value: number },
          drag: { value: number }
        ) => React.ReactNode
        renderRightActions?: (
          progress: { value: number },
          drag: { value: number }
        ) => React.ReactNode
        testID?: string
      },
      _ref
    ) =>
      ReactMod.createElement(
        "div",
        { "data-testid": testID },
        renderLeftActions?.({ value: 1 }, { value: 80 }),
        children,
        renderRightActions?.({ value: 1 }, { value: -80 })
      )
  )
  return { default: Swipeable }
})

vi.mock("expo-router", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  useIsFocused: () => true,
}))

vi.mock("lucide-react-native", async () => {
  const ReactMod = await import("react")
  const makeIcon =
    (name: string) =>
    ({ color, size }: { color?: string; size?: number }) =>
      ReactMod.createElement("span", {
        "data-testid": `icon-${name}`,
        "data-color": color,
        "data-size": size,
      })
  return {
    Landmark: makeIcon("Landmark"),
    ChevronRight: makeIcon("ChevronRight"),
    ArrowDownLeft: makeIcon("ArrowDownLeft"),
    ArrowUpRight: makeIcon("ArrowUpRight"),
    ArrowLeftRight: makeIcon("ArrowLeftRight"),
    Plus: makeIcon("Plus"),
    Inbox: makeIcon("Inbox"),
    Check: makeIcon("Check"),
    Trash2: makeIcon("Trash2"),
    PiggyBank: makeIcon("PiggyBank"),
    ChevronDown: makeIcon("ChevronDown"),
    Receipt: makeIcon("Receipt"),
    Mail: makeIcon("Mail"),
  }
})

vi.mock("@saturn/api/saturn/finance/v1/finance", () => ({
  useGetSettingsQuery: () => ({
    data: { baseCurrency: "USD" },
    isLoading: false,
  }),
  useListAccountsQuery: () => ({
    data: { accounts: [{ id: "acc_1", currentBalance: "100000" }] },
    isLoading: false,
  }),
  useGetInsightsQuery: () => ({
    data: {
      income: { totalIncome: "50000" },
      spent: { totalSpent: "20000" },
    },
    isLoading: false,
  }),
  useListInboxItemsQuery: () => ({
    data: { inboxItems: [] },
    isLoading: false,
  }),
}))

vi.mock("@saturn/hooks", () => {
  const fixedNow = new Date("2026-10-18T15:00:00.000Z")
  return {
    useCurrencyConversionPreview: () => ({
      exchangeRates: [],
      isLoading: false,
    }),
    useTimezone: () => ({
      timezone: "UTC",
      locale: "en-US",
      now: () => fixedNow,
      format: (
        date: string | number | Date,
        options?: Intl.DateTimeFormatOptions
      ) =>
        formatDateWithTimezone(
          date,
          "UTC",
          {
            year: "numeric",
            month: "short",
            day: "numeric",
            ...options,
          },
          "en-US"
        ),
      formatDate: (
        date: string | number | Date,
        options?: Intl.DateTimeFormatOptions
      ) =>
        formatDateWithTimezone(
          date,
          "UTC",
          {
            year: "numeric",
            month: "numeric",
            day: "numeric",
            ...options,
          },
          "en-US"
        ),
    }),
    useI18n: () => ({
      t: (key: string, params?: Record<string, string | number>) => {
        if (key === "dashboard.widget.net_worth.incomeStat") {
          return `Income (${params?.month})`
        }
        if (key === "dashboard.widget.net_worth.expensesStat") {
          return `Expenses (${params?.month})`
        }
        if (key === "common.approve") return "Approve"
        if (key === "common.discard") return "Discard"
        if (key === "finance.inbox.card.badgeDuplicate") return "Duplicate?"
        if (key === "finance.inbox.card.assignAccount") return "Assign Account"
        if (key === "finance.inbox.card.assignBudget") return "Assign Budget"
        if (key === "finance.inbox.docTypes.receipt") return "Receipt"
        return key
      },
      locale: "en-US",
    }),
  }
})

vi.mock("../lib/space-context", () => ({
  useSpace: () => ({ activeSpaceId: "spc_01" }),
}))

const mockMobileTheme = {
  isDark: true,
  colors: {
    background: "#090d16",
    surface: "#111827",
    surfaceElevated: "#182235",
    surfaceSubtle: "#0d131f",
    border: "rgba(255, 255, 255, 0.09)",
    borderFocus: "#4de2cf",
    textPrimary: "#f8fafc",
    textSecondary: "#cbd5e1",
    textMuted: "#94a3b8",
    primary: "#4de2cf",
    primaryForeground: "#09131c",
    primarySubtle: "rgba(77, 226, 207, 0.12)",
    success: "#34d399",
    successSubtle: "rgba(52, 211, 153, 0.12)",
    destructive: "#fb7185",
    destructiveSubtle: "rgba(251, 113, 133, 0.12)",
    warning: "#fbbf24",
    warningSubtle: "rgba(251, 191, 36, 0.12)",
    warningBorder: "rgba(251, 191, 36, 0.30)",
    info: "#38bdf8",
    infoSubtle: "rgba(56, 189, 248, 0.12)",
  },
  radius: { xs: 4, sm: 6, md: 10, lg: 14, xl: 20, full: 999 },
  shadows: {
    sm: {},
    md: {},
    lg: {},
  },
  getBudgetColors: () => ({
    bg: "rgba(99, 102, 241, 0.12)",
    border: "rgba(99, 102, 241, 0.30)",
    text: "#818cf8",
    bar: "#6366f1",
  }),
}

vi.mock("../lib/theme", () => ({
  useTheme: () => mockMobileTheme,
  useThemedStyles: (
    fn: (t: typeof mockMobileTheme) => Record<string, unknown>
  ) => fn(mockMobileTheme),
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

vi.mock("../components/ui/card", async () => {
  const ReactMod = await import("react")
  return {
    Card: ({ children }: { children?: React.ReactNode }) =>
      ReactMod.createElement("div", null, children),
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
    }) => ReactMod.createElement("span", { style: { color } }, children),
    Caption: ({ children }: { children?: React.ReactNode }) =>
      ReactMod.createElement("span", null, children),
  }
})

vi.mock("../components/ui/skeleton-loader", async () => {
  const ReactMod = await import("react")
  return {
    Skeleton: () => ReactMod.createElement("div", null),
  }
})

function makeInboxItem(overrides: Partial<InboxItem> = {}): InboxItem {
  return {
    id: "inb_01",
    spaceId: "spc_01",
    status: "PENDING",
    docType: "RECEIPT",
    amount: "2450",
    currency: "USD",
    vendorName: "Blue Bottle Coffee",
    transactionDate: "2026-04-12",
    accountId: "acc_checking",
    budgetId: "bud_dining",
    scheduledTransactionId: "",
    transactionId: "",
    metadata: {
      transaction_type: "EXPENSE",
    },
    ...overrides,
  }
}

describe("Finance Inbox Triage Helpers", () => {
  describe("canQuickApproveInboxItem", () => {
    it("allows Expense with budgetId, positive amount, and vendorName", () => {
      expect(canQuickApproveInboxItem(makeInboxItem())).toBe(true)
    })

    it("requires budgetId for unlinked Expense items", () => {
      expect(
        canQuickApproveInboxItem(
          makeInboxItem({
            budgetId: "",
            scheduledTransactionId: "",
            borrowingId: "",
          })
        )
      ).toBe(false)
    })

    it("allows Income without budgetId", () => {
      expect(
        canQuickApproveInboxItem(
          makeInboxItem({
            budgetId: "",
            metadata: { transaction_type: "INCOME" },
          })
        )
      ).toBe(true)
    })

    it("allows Expense without budgetId when linked to a scheduled bill or borrowing", () => {
      expect(
        canQuickApproveInboxItem(
          makeInboxItem({
            budgetId: "",
            scheduledTransactionId: "sch_123",
          })
        )
      ).toBe(true)

      expect(
        canQuickApproveInboxItem(
          makeInboxItem({
            budgetId: "",
            borrowingId: "bor_456",
          })
        )
      ).toBe(true)
    })

    it("rejects zero/invalid amounts and empty vendor names", () => {
      expect(canQuickApproveInboxItem(makeInboxItem({ amount: "0" }))).toBe(
        false
      )
      expect(canQuickApproveInboxItem(makeInboxItem({ amount: "-100" }))).toBe(
        false
      )
      expect(
        canQuickApproveInboxItem(makeInboxItem({ vendorName: "   " }))
      ).toBe(false)
    })

    it("requires distinct source and destination accounts for Transfer items", () => {
      expect(
        canQuickApproveInboxItem(
          makeInboxItem({
            budgetId: "",
            accountId: "acc_1",
            metadata: {
              transaction_type: "TRANSFER",
              destination_account_id: "acc_2",
            },
          })
        )
      ).toBe(true)

      expect(
        canQuickApproveInboxItem(
          makeInboxItem({
            budgetId: "",
            accountId: "acc_1",
            metadata: {
              transaction_type: "TRANSFER",
            },
          })
        )
      ).toBe(false)

      expect(
        canQuickApproveInboxItem(
          makeInboxItem({
            budgetId: "",
            accountId: "acc_1",
            metadata: {
              transaction_type: "TRANSFER",
              destination_account_id: "acc_1",
            },
          })
        )
      ).toBe(false)
    })
  })

  describe("resolveInboxTransactionType & doc helpers", () => {
    it("defaults unknown transaction_type metadata to EXPENSE", () => {
      expect(resolveInboxTransactionType({ metadata: {} })).toBe("EXPENSE")
      expect(
        resolveInboxTransactionType({
          metadata: { transaction_type: "income" },
        })
      ).toBe("INCOME")
      expect(
        resolveInboxTransactionType({
          metadata: { transaction_type: "TRANSFER" },
        })
      ).toBe("TRANSFER")
    })

    it("maps docType enums to display label keys", () => {
      expect(getInboxDocTypeLabelKey("RECEIPT")).toBe(
        "finance.inbox.docTypes.receipt"
      )
      expect(getInboxDocTypeLabelKey("INVOICE")).toBe(
        "finance.inbox.docTypes.invoice"
      )
      expect(getInboxDocTypeLabelKey("BANK_NOTIFICATION")).toBe(
        "finance.inbox.docTypes.bankAlert"
      )
      expect(getInboxDocTypeLabelKey("UNKNOWN")).toBe(
        "finance.inbox.card.document"
      )
    })

    it("decodes base64 raw payloads and falls back safely for plain text", () => {
      const encoded = btoa("Card ending in 4242 charged $24.50")
      expect(decodeInboxRawPayload(encoded)).toBe(
        "Card ending in 4242 charged $24.50"
      )
      expect(decodeInboxRawPayload("Plain alert text")).toBe("Plain alert text")
      expect(decodeInboxRawPayload("")).toBe("")
    })

    it("converts decimal strings into rounded cents strings", () => {
      expect(parseDecimalToCentsString("24.50")).toBe("2450")
      expect(parseDecimalToCentsString("1,250.99")).toBe("125099")
      expect(parseDecimalToCentsString("", "900")).toBe("900")
    })
  })

  describe("buildUpdateInboxItemRequest", () => {
    it("builds UpdateInboxItemRequest with exact updateMask paths and merged metadata", () => {
      const base = makeInboxItem({
        metadata: {
          transaction_type: "EXPENSE",
          potential_duplicate_id: "txn_dup_9",
        },
      })

      const result = buildUpdateInboxItemRequest(base, {
        docType: "BANK_NOTIFICATION",
        transactionType: "TRANSFER",
        amount: "50000",
        currency: "EUR",
        vendorName: "Savings Transfer",
        accountId: "acc_src",
        destinationAccountId: "acc_dst",
        budgetId: "",
      })

      expect(result.id).toBe("inb_01")
      expect(result.req.id).toBe("inb_01")
      expect(result.req.updateMask?.paths).toEqual(
        expect.arrayContaining([
          "doc_type",
          "amount",
          "currency",
          "vendor_name",
          "account_id",
          "budget_id",
          "metadata",
        ])
      )
      expect(result.req.inboxItem.docType).toBe("BANK_NOTIFICATION")
      expect(result.req.inboxItem.amount).toBe("50000")
      expect(result.req.inboxItem.currency).toBe("EUR")
      expect(result.req.inboxItem.vendorName).toBe("Savings Transfer")
      expect(result.req.inboxItem.accountId).toBe("acc_src")
      expect(result.req.inboxItem.budgetId).toBe("")
      expect(result.req.inboxItem.metadata).toEqual({
        transaction_type: "TRANSFER",
        destination_account_id: "acc_dst",
        potential_duplicate_id: "txn_dup_9",
      })
    })
  })
})

describe("Overview Customization & Preferences State Transitions", () => {
  it("applies all presets cleanly and recognizes active preset IDs", () => {
    for (const preset of DASHBOARD_PRESETS) {
      const applied = applyDashboardPreset(preset.id)
      expect(applied).toEqual([...preset.widgets])
      expect(findActiveDashboardPresetId(applied)).toBe(preset.id)
    }

    const custom = moveDashboardWidget(
      applyDashboardPreset("finance"),
      "upcoming_bills",
      "up"
    )
    expect(findActiveDashboardPresetId(custom)).toBeNull()
  })

  it("toggles widgets on/off and prevents turning off the last remaining active widget", () => {
    const start = applyDashboardPreset("comms") // ["ai_quick_ask", "today_schedule", "priority_mail"]

    // Enable a disabled widget -> appended
    const withBudget = toggleDashboardWidget(start, "budget_pace", true)
    expect(withBudget).toEqual([
      "ai_quick_ask",
      "today_schedule",
      "priority_mail",
      "budget_pace",
    ])

    // Toggling an already enabled widget on is a no-op copy
    expect(toggleDashboardWidget(start, "today_schedule", true)).toEqual(start)

    // Remove down to 1 active widget
    const twoLeft = toggleDashboardWidget(start, "ai_quick_ask", false)
    const oneLeft = toggleDashboardWidget(twoLeft, "today_schedule", false)
    expect(oneLeft).toEqual(["priority_mail"])

    // Attempting to disable the last remaining widget is blocked
    const stillOne = toggleDashboardWidget(oneLeft, "priority_mail", false)
    expect(stillOne).toEqual(["priority_mail"])
  })

  it("reorders widgets up and down and respects list boundaries", () => {
    const start = applyDashboardPreset("default")
    // ["ai_quick_ask", "net_worth", "budget_pace", "today_schedule", "priority_mail"]

    const movedUp = moveDashboardWidget(start, "budget_pace", "up")
    expect(movedUp).toEqual([
      "ai_quick_ask",
      "budget_pace",
      "net_worth",
      "today_schedule",
      "priority_mail",
    ])

    const movedDown = moveDashboardWidget(movedUp, "ai_quick_ask", "down")
    expect(movedDown).toEqual([
      "budget_pace",
      "ai_quick_ask",
      "net_worth",
      "today_schedule",
      "priority_mail",
    ])

    // Boundary checks
    expect(moveDashboardWidget(start, "ai_quick_ask", "up")).toEqual(start)
    expect(moveDashboardWidget(start, "priority_mail", "down")).toEqual(start)
  })

  it("normalizes round-trips, orders active rows above disabled rows, and builds Space update payloads", () => {
    expect(normalizeDashboardWidgets(undefined)).toEqual([
      ...DEFAULT_DASHBOARD_WIDGETS,
    ])
    expect(normalizeDashboardWidgets([])).toEqual([
      ...DEFAULT_DASHBOARD_WIDGETS,
    ])
    expect(
      normalizeDashboardWidgets([
        "workflow_runs",
        "invalid_widget",
        "net_worth",
        "workflow_runs",
      ])
    ).toEqual(["workflow_runs", "net_worth"])

    const rows = getOrderedDashboardRows(["workflow_runs", "net_worth"])
    expect(rows).toHaveLength(DASHBOARD_WIDGET_CATALOG.length)
    expect(
      rows.slice(0, 2).map((r) => [r.id, r.enabled, r.activeIndex])
    ).toEqual([
      ["workflow_runs", true, 0],
      ["net_worth", true, 1],
    ])
    expect(rows.slice(2).every((r) => !r.enabled && r.activeIndex === -1)).toBe(
      true
    )

    expect(
      areDashboardWidgetListsEqual(
        ["workflow_runs", "net_worth"],
        ["workflow_runs", "net_worth"]
      )
    ).toBe(true)
    expect(
      areDashboardWidgetListsEqual(
        ["workflow_runs", "net_worth"],
        ["net_worth", "workflow_runs"]
      )
    ).toBe(false)

    const payload = buildUpdateDashboardPreferencesPayload(
      "spc_01XYZ",
      ["workflow_runs", "net_worth"],
      "4"
    )
    expect(payload).toEqual({
      space_id: "spc_01XYZ",
      req: {
        spaceId: "spc_01XYZ",
        dashboardPreferences: {
          widgets: ["workflow_runs", "net_worth"],
        },
        updateMask: { paths: ["widgets"] },
        version: "4",
      },
    })
  })
})

describe("FinanceSummaryWidget month label (DF-13)", () => {
  it("renders short month name only without day or year in Income and Expenses stats", () => {
    const { container, getByText } = render(<FinanceSummaryWidget />)

    expect(getByText("Income (Oct)")).toBeTruthy()
    expect(getByText("Expenses (Oct)")).toBeTruthy()
    expect(container.textContent).not.toContain("Oct 18")
    expect(container.textContent).not.toContain("2026")
  })
})

describe("SwipeableInboxCard 2-zone layout & swipe action contrast (DF-23)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders 2 compact zones without redundant footer discard button and uses #ffffff on swipe fills", () => {
    const onPress = vi.fn()
    const onApprove = vi.fn()
    const onDiscard = vi.fn()
    const onPickBudget = vi.fn()
    const onPickAccount = vi.fn()

    const duplicateItem = makeInboxItem({
      accountId: "",
      budgetId: "",
      metadata: {
        transaction_type: "EXPENSE",
        potential_duplicate_id: "txn_dup_1",
      },
    })

    const { getByTestId, queryByTestId, container } = render(
      <SwipeableInboxCard
        item={duplicateItem}
        baseCurrency="USD"
        isWritable
        onPress={onPress}
        onApprove={onApprove}
        onDiscard={onDiscard}
        onPickBudget={onPickBudget}
        onPickAccount={onPickAccount}
      />
    )

    // Preserved testIDs and removal of redundant footer discard button
    expect(getByTestId("inbox-card-inb_01")).toBeTruthy()
    expect(getByTestId("inbox-chip-account-inb_01")).toBeTruthy()
    expect(getByTestId("inbox-chip-budget-inb_01")).toBeTruthy()
    expect(getByTestId("inbox-approve-btn-inb_01").textContent).toBe("Approve")
    expect(queryByTestId("inbox-discard-btn-inb_01")).toBeNull()

    // Compact subtitle includes short date without year, source label, and inline Duplicate?
    expect(container.textContent).toContain("Apr 12 · Receipt")
    expect(container.textContent).toContain("Duplicate?")
    expect(container.textContent).not.toContain("2026")

    // LeftApproveAction & RightDiscardAction use #ffffff for icon + text on green/red fills
    const leftAction = getByTestId("inbox-swipe-approve-inb_01")
    const rightAction = getByTestId("inbox-swipe-discard-inb_01")

    const leftIcon = leftAction.querySelector("[data-testid='icon-Check']")
    const leftText = leftAction.querySelector("span:last-child")
    expect(leftIcon?.getAttribute("data-color")).toBe("#ffffff")
    expect((leftText as HTMLElement).style.color).toBe("rgb(255, 255, 255)")

    const rightIcon = rightAction.querySelector("[data-testid='icon-Trash2']")
    const rightText = rightAction.querySelector("span:last-child")
    expect(rightIcon?.getAttribute("data-color")).toBe("#ffffff")
    expect((rightText as HTMLElement).style.color).toBe("rgb(255, 255, 255)")

    // Interactions
    fireEvent.click(getByTestId("inbox-chip-account-inb_01"))
    expect(onPickAccount).toHaveBeenCalledWith(duplicateItem)

    fireEvent.click(getByTestId("inbox-chip-budget-inb_01"))
    expect(onPickBudget).toHaveBeenCalledWith(duplicateItem)

    fireEvent.click(getByTestId("inbox-approve-btn-inb_01"))
    expect(onApprove).toHaveBeenCalledWith(duplicateItem)

    fireEvent.click(leftAction)
    expect(onApprove).toHaveBeenCalledTimes(2)

    fireEvent.click(rightAction)
    expect(onDiscard).toHaveBeenCalledWith(duplicateItem)
  })
})
