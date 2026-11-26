import React from "react"
import { it, vi, expect, afterEach } from "vitest"
import {
  render,
  fireEvent,
  screen,
  within,
  cleanup,
  act,
} from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import Account from "../app/(app)/finance/accounts/[id]"
import AccountsList from "../app/(app)/finance/accounts"
import Budget from "../app/(app)/finance/budgets/[id]"
import Borrowing from "../app/(app)/finance/borrowing/[id]"

const agreement = vi.hoisted(() => ({
  direction: "BORROWED",
  currency: "EUR",
  remainingAmount: "5000",
}))

const {
  push,
  next,
  preview,
  openCopilotSheet,
  ledgerSpy,
  statementsSpy,
  screenOptionsRef,
  accountState,
  ledgerState,
  analyticsState,
  budgetState,
} = await vi.hoisted(async () => {
  const { createRequire } = await vi.importActual<{
    createRequire: (url: string) => {
      extensions: Record<string, (module: { exports: unknown }) => void>
    }
  }>("node:module")
  createRequire(import.meta.url).extensions[".xml"] = (module: {
    exports: unknown
  }) => {
    module.exports = "icon"
  }
  return {
    accountState: {
      isActive: true,
    },
    ledgerState: {
      hasNextPage: true,
      transactions: [] as {
        id: string
        transactionDate?: string
        currency?: string
        amount?: string
        amountInBase?: string
        type?: string
      }[],
    },
    analyticsState: {
      mode: "balance" as "balance" | "flow",
      period: "30D" as "30D" | "90D" | "YTD" | "1Y",
      interval: "week" as "week" | "month",
      isSuccess: true,
      isLoading: false,
      isError: false,
      net: 5000,
      inflow: 8000,
      outflow: -3000,
      periodInflow: 12000,
      periodOutflow: -7000,
    },
    budgetState: {
      burn: [{ date: "2024-01-01", value: 300 }],
      interval: "MONTHLY",
      success: true,
      periods: [{ date: "2024-01-01" }],
    },
    push: vi.fn(),
    next: vi.fn(),
    preview: vi.fn((value: string) => ({ amount: Number(value) * 2 })),
    openCopilotSheet: vi.fn(),
    ledgerSpy: vi.fn(),
    statementsSpy: vi.fn(),
    screenOptionsRef: {
      current: null as Record<string, unknown> | null,
    },
  }
})

vi.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "entity" }),
  useRouter: () => ({ push }),
  Stack: {
    Screen: ({ options }: { options?: Record<string, unknown> }) => {
      screenOptionsRef.current = options ?? null
      return null
    },
  },
}))
vi.mock("@expo/ui", () => ({ Icon: { select: () => "" } }))
vi.mock("@gorhom/bottom-sheet", () => ({
  BottomSheetScrollView: ({ children }: React.PropsWithChildren) => (
    <div>{children}</div>
  ),
}))
vi.mock("lucide-react-native", () =>
  Object.fromEntries(
    "ArrowRightLeft Scale Plus Edit3 ReceiptText AlertCircle Calendar Sparkles ChevronLeft ChevronRight CreditCard AlertTriangle MoreVertical SlidersHorizontal TrendingUp TrendingDown CalendarClock Landmark FileText Phone FileCheck2 ChevronDown ChevronUp PlusCircle CheckCircle2 Search X PlayCircle Unlock Check"
      .split(" ")
      .map((k) => [k, () => null])
  )
)
vi.mock("react-native", () => ({
  StyleSheet: { hairlineWidth: 1 },
  Platform: { OS: "ios" },
  Alert: { alert: vi.fn() },
  View: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  ScrollView: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  Text: ({
    children,
    numberOfLines,
  }: React.PropsWithChildren<{ numberOfLines?: number }>) => (
    <span data-lines={numberOfLines ?? ""}>{children}</span>
  ),
  TextInput: ({
    value,
    onChangeText,
    placeholder,
    accessibilityLabel,
  }: {
    value?: string
    onChangeText?: (text: string) => void
    placeholder?: string
    accessibilityLabel?: string
  }) => (
    <input
      value={value ?? ""}
      placeholder={placeholder}
      aria-label={accessibilityLabel}
      onChange={(e) => onChangeText?.(e.target.value)}
    />
  ),
  ActivityIndicator: () => null,
  RefreshControl: () => null,
  TouchableOpacity: ({
    onPress,
    style,
    accessibilityLabel,
    accessibilityRole,
    accessibilityState,
    disabled,
    children,
  }: React.PropsWithChildren<{
    onPress: () => void
    style: unknown
    accessibilityLabel?: string
    accessibilityRole?: string
    accessibilityState?: { selected?: boolean; expanded?: boolean }
    disabled?: boolean
  }>) => (
    <button
      role={accessibilityRole}
      aria-label={accessibilityLabel}
      aria-selected={
        accessibilityRole === "tab" ? accessibilityState?.selected : undefined
      }
      aria-pressed={
        accessibilityRole !== "tab" ? accessibilityState?.selected : undefined
      }
      aria-expanded={accessibilityState?.expanded}
      disabled={disabled}
      data-style={JSON.stringify(style)}
      onClick={onPress}
    >
      {children}
    </button>
  ),
  SectionList: ({
    sections = [],
    ListHeaderComponent,
    ListEmptyComponent,
    onEndReached,
    renderItem,
    renderSectionHeader,
  }: {
    sections?: { data?: { id: string }[] }[]
    ListHeaderComponent: React.ReactNode
    ListEmptyComponent?: React.ReactNode
    onEndReached: () => void
    renderSectionHeader?: (x: {
      section: { data?: { id: string }[] }
    }) => React.ReactNode
    renderItem: (x: {
      item: { id: string }
      index: number
      section: { data?: { id: string }[] }
    }) => React.ReactNode
  }) => (
    <>
      {ListHeaderComponent}
      <button onClick={onEndReached}>Next page</button>
      {sections.length > 0
        ? sections.flatMap((section) =>
            (section.data || []).map((item, index) => (
              <React.Fragment key={item.id}>
                {index === 0 && renderSectionHeader?.({ section })}
                {renderItem({ item, index, section })}
              </React.Fragment>
            ))
          )
        : ListEmptyComponent}
      {sections.length === 0 &&
        ListEmptyComponent != null &&
        renderItem({ item: { id: "tx" }, index: 0, section: { data: [] } })}
    </>
  ),
}))

vi.mock("../lib/space-context", () => ({
  useSpace: () => ({ activeSpaceId: "space" }),
}))

vi.mock("../lib/copilot-sheet-context", () => ({
  useMobileCopilotView: vi.fn(),
  useOptionalMobileCopilotSheet: () => ({ openCopilotSheet }),
}))

vi.mock("../lib/theme", () => ({
  useTheme: () => ({
    resolvedMode: "dark",
    colors: {
      border: "theme-border",
      success: "theme-success",
      destructive: "theme-destructive",
      textPrimary: "theme-text-primary",
      primary: "theme-primary",
      primaryForeground: "theme-primary-fg",
      primarySubtle: "theme-primary-subtle",
      surfaceSubtle: "theme-surface-subtle",
      info: "theme-info",
    },
    getBudgetColors: () => ({}),
  }),
  useThemedStyles: (create: (t: object) => unknown) =>
    create({
      colors: {
        border: "theme-border",
        primary: "theme-primary",
        primaryForeground: "theme-primary-fg",
        primarySubtle: "theme-primary-subtle",
        surfaceSubtle: "theme-surface-subtle",
      },
      radius: { sm: 6, md: 10, lg: 14, full: 9999 },
      shadows: {},
    }),
}))

vi.mock("../lib/haptics", () => ({
  haptics: { light: vi.fn(), selection: vi.fn() },
}))

vi.mock("../lib/budget-icons", () => ({ getBudgetIcon: () => () => null }))
vi.mock("../components/ui/toast", () => ({
  useToast: () => ({ show: vi.fn() }),
}))
vi.mock("../components/app-header", () => ({
  AIHeaderButton: ({ testID }: { testID: string }) => (
    <button data-testid={testID} onClick={openCopilotSheet}>
      AI
    </button>
  ),
}))
vi.mock("../components/ui/action-menu", () => ({
  ActionMenu: () => <button>Menu</button>,
}))
vi.mock("../components/ui/card", () => ({
  Card: ({ children }: React.PropsWithChildren) => (
    <section>{children}</section>
  ),
}))

vi.mock("../components/ui/typography", () => ({
  Caption: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
  MonoAmount: ({
    children,
    color,
  }: React.PropsWithChildren<{ color?: string }>) => (
    <span data-color={color}>{children}</span>
  ),
}))

vi.mock("../components/ui/badge", () => ({
  Badge: ({ label, border }: { label: string; border: string }) => (
    <span data-border={border}>{label}</span>
  ),
}))

vi.mock("../components/ui/empty-state", () => ({
  EmptyState: ({
    title,
    description,
    actionLabel,
    onAction,
  }: {
    title?: string
    description?: string
    actionLabel?: string
    onAction?: () => void
  }) => (
    <div data-testid="empty-state">
      <span>{title}</span>
      {description ? <p>{description}</p> : null}
      {actionLabel && onAction ? (
        <button onClick={onAction}>{actionLabel}</button>
      ) : null}
    </div>
  ),
}))

vi.mock("../components/ui/bottom-sheet", async () => {
  const ReactMod = await import("react")
  const AppBottomSheet = ReactMod.forwardRef(
    (
      {
        title,
        onClose,
        children,
      }: {
        title?: string
        onClose?: () => void
        children?: React.ReactNode
      },
      ref
    ) => {
      ReactMod.useImperativeHandle(ref, () => ({
        expand: vi.fn(),
        snapToIndex: vi.fn(),
        close: vi.fn(() => onClose?.()),
      }))
      return ReactMod.createElement(
        "div",
        { "data-testid": "app-bottom-sheet", "data-title": title },
        children
      )
    }
  )
  AppBottomSheet.displayName = "AppBottomSheet"
  return {
    AppBottomSheet,
    BottomSheetHeader: ({
      title,
      onClose,
    }: {
      title?: string
      onClose?: () => void
    }) =>
      ReactMod.createElement(
        "div",
        null,
        ReactMod.createElement("span", null, title),
        onClose
          ? ReactMod.createElement(
              "button",
              { "aria-label": `Close ${title}`, onClick: onClose },
              "Close"
            )
          : null
      ),
  }
})

vi.mock("../components/ui/skeleton-loader", () => ({
  SkeletonCard: () => <div data-testid="skeleton-card" />,
}))

vi.mock("../components/finance/card-account-item", () => ({
  CardAccountItem: ({
    convertedText,
    hideHolderName,
    onPress,
  }: {
    convertedText: string
    hideHolderName?: boolean
    onPress?: () => void
  }) => (
    <p
      data-testid="card-account-item"
      data-hide-holder-name={String(Boolean(hideHolderName))}
      data-has-on-press={String(Boolean(onPress))}
    >
      {convertedText}
    </p>
  ),
}))

vi.mock("../components/finance/transaction-list-item", () => ({
  TransactionListItem: ({
    onPress,
    showBudget,
    showDate,
    showBorderBottom,
  }: {
    onPress: () => void
    showBudget?: boolean
    showDate?: boolean
    showBorderBottom?: boolean
  }) => (
    <button
      data-budget={showBudget}
      data-date={showDate}
      data-divider={showBorderBottom}
      onClick={onPress}
    >
      Entry
    </button>
  ),
}))
vi.mock("../components/finance/date-section-header", () => ({
  DateSectionHeader: ({ rightContent }: { rightContent?: React.ReactNode }) => (
    <>{rightContent}</>
  ),
}))
vi.mock("../components/finance/detail-chart", () => ({
  DetailChart: ({
    onSelect,
    title,
    footer,
  }: {
    onSelect?: (day: string) => void
    title: string
    footer?: React.ReactNode
  }) => (
    <div data-testid="detail-chart">
      <button
        aria-label={`Chart: ${title}`}
        onClick={() => onSelect?.("2024-01-01")}
      >
        {title}
      </button>
      {footer ? <div data-testid="chart-footer">{footer}</div> : null}
    </div>
  ),
}))
vi.mock("@saturn/hooks/finance", async (original) => ({
  ...(await original<object>()),
  useDetailLedger: (space: unknown, filter: unknown, enabled: unknown) => {
    ledgerSpy(space, filter, enabled)
    return {
      data: ledgerState.transactions.length
        ? { pages: [{ transactions: ledgerState.transactions }] }
        : undefined,
      hasNextPage: ledgerState.hasNextPage,
      fetchNextPage: next,
    }
  },
  useCurrencyConversionPreview: () => ({ getConversionPreview: preview }),
  useAccountAnalytics: () => ({
    mode: analyticsState.mode,
    interval: analyticsState.interval,
    period: analyticsState.period,
    setMode: vi.fn(),
    setInterval: vi.fn(),
    setPeriod: vi.fn(),
    net: analyticsState.net,
    inflow: analyticsState.inflow,
    outflow: analyticsState.outflow,
    periodInflow: analyticsState.periodInflow,
    periodOutflow: analyticsState.periodOutflow,
    points: [],
    query: {
      isSuccess: analyticsState.isSuccess,
      isLoading: analyticsState.isLoading,
      isError: analyticsState.isError,
      refetch: vi.fn(),
    },
  }),
  useBorrowingAnalytics: () => ({
    query: { isSuccess: true },
    points: [{ date: "2026-05-01", value: 5000 }],
  }),
  useBudgetAnalytics: () => ({
    query: { isSuccess: true },
    burn: budgetState.burn,
    history: { isSuccess: budgetState.success },
    periods: budgetState.periods,
  }),
}))
vi.mock("@saturn/api/saturn/finance/v1/finance", () => ({
  useGetAccountQuery: () => ({
    data: {
      id: "entity",
      currency: "EUR",
      currentBalance: "-1200",
      name: "Wallet",
      notes: "Cash only",
      isActive: accountState.isActive,
    },
  }),
  useGetSettingsQuery: () => ({ data: { baseCurrency: "USD" } }),
  useListStatementsQuery: (
    params: unknown,
    options?: { enabled?: boolean }
  ) => {
    statementsSpy(params, options)
    return {
      data: options?.enabled
        ? {
            statements: [
              {
                id: "s",
                filename: "April.pdf",
                statementDate: "2025-04-30",
                statementEndingBalance: "2300",
                status: "COMPLETED",
              },
            ],
          }
        : undefined,
    }
  },
  useListBudgetsQuery: () => ({}),
  useListInstitutionsQuery: () => ({}),
  useGetBudgetQuery: () => ({
    data: {
      id: "entity",
      name: "Meals",
      limitAmount: "1000",
      interval: budgetState.interval,
      status: "ACTIVE",
      currency: "USD",
    },
  }),
  useGetBudgetPeriodQuery: ({ date }: { date: string }) => ({
    data:
      date < "2024-01-01"
        ? undefined
        : date.startsWith("2024")
          ? {
              startDate: "2024-01-01",
              endDate: "2024-01-31",
              limitAmount: "1000",
              spentAmount: "300",
            }
          : {
              startDate: "2026-10-01",
              endDate: "2026-10-31",
              limitAmount: "1000",
            },
  }),
  useListExchangeRatesQuery: () => ({
    data: {
      exchangeRates: [
        {
          fromCurrency: "EUR",
          toCurrency: "USD",
          rate: 2,
          rateDate: "2026-01-01",
        },
      ],
    },
  }),
  useGetBorrowingQuery: () => ({
    data: {
      id: "entity",
      counterparty: "Alex",
      notes: "School fees",
      contactInfo: "Alex's phone",
      accountId: "acc-1",
      ...agreement,
      totalAmount: "9000",
    },
  }),
  useListAccountsQuery: () => ({
    data: {
      accounts: [
        {
          id: "acc-1",
          name: "Euro Card",
          type: "CREDIT_CARD",
          currency: "EUR",
          currentBalance: "-1200",
          isActive: true,
        },
      ],
    },
    isLoading: false,
    refetch: vi.fn(),
  }),
  useDeleteBudgetMutation: () => ({}),
  useUpdateBudgetMutation: () => ({}),
  useDeleteBorrowingMutation: () => ({}),
}))

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
  screenOptionsRef.current = null
  accountState.isActive = true
  Object.assign(agreement, {
    direction: "BORROWED",
    currency: "EUR",
    remainingAmount: "5000",
  })
  ledgerState.hasNextPage = true
  ledgerState.transactions = []
  Object.assign(analyticsState, {
    mode: "balance",
    period: "30D",
    interval: "week",
    isSuccess: true,
    isLoading: false,
    isError: false,
    net: 5000,
    inflow: 8000,
    outflow: -3000,
    periodInflow: 12000,
    periodOutflow: -7000,
  })
  Object.assign(budgetState, {
    burn: [{ date: "2024-01-01", value: 300 }],
    interval: "MONTHLY",
    success: true,
    periods: [{ date: "2024-01-01" }],
  })
})

function mount(element: React.ReactNode) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      {element}
    </QueryClientProvider>
  )
}

it("keeps the negative base balance and requests another page on scroll", () => {
  mount(<Account />)
  expect(preview).toHaveBeenCalledWith("-12", "EUR")
  expect(screen.getByText("≈ -$24.00")).toBeTruthy()
  fireEvent.click(screen.getByText("Next page"))
  expect(next).toHaveBeenCalled()
})

it("shows transaction count badge inside Transactions tab, drops Account Ledger caption, and switches cleanly to Analytics", () => {
  ledgerState.transactions = [
    { id: "tx-1", transactionDate: "2025-04-20T10:00:00Z" },
    { id: "tx-2", transactionDate: "2025-04-19T10:00:00Z" },
  ]
  ledgerState.hasNextPage = true
  mount(<Account />)

  const txTab = screen.getByRole("tab", { name: /Transactions/i })
  const analyticsTab = screen.getByRole("tab", { name: "Analytics" })
  expect(txTab.getAttribute("aria-selected")).toBe("true")
  expect(analyticsTab.getAttribute("aria-selected")).toBe("false")
  expect(within(txTab).getByText("2+")).toBeTruthy()
  expect(screen.queryByText(/Account Ledger/i)).toBeNull()

  // Underline tab indicator uses primary bottom border on active tab only
  const txTabStyles = JSON.parse(txTab.getAttribute("data-style")!)
  const analyticsTabStyles = JSON.parse(
    analyticsTab.getAttribute("data-style")!
  )
  expect(txTabStyles[0].borderBottomWidth).toBe(2)
  expect(txTabStyles[1].borderBottomColor).toBe("theme-primary")
  expect(analyticsTabStyles[0].borderBottomColor).toBe("transparent")
  expect(analyticsTabStyles[1]).toBe(false)

  // Without next page, count badge omits '+'
  cleanup()
  ledgerState.hasNextPage = false
  mount(<Account />)
  const exactTxTab = screen.getByRole("tab", { name: /Transactions/i })
  expect(within(exactTxTab).getByText("2")).toBeTruthy()
  expect(within(exactTxTab).queryByText("2+")).toBeNull()

  // Transactions tab shows search, period stepper, and hides chart
  expect(screen.getByLabelText("Search activity")).toBeTruthy()
  expect(
    screen.queryByRole("button", { name: "Chart: Running balance" })
  ).toBeNull()

  // Switch to Analytics tab: period-aligned KPIs & chart footer range controls
  fireEvent.click(screen.getByRole("tab", { name: "Analytics" }))
  expect(
    screen.getByRole("tab", { name: "Analytics" }).getAttribute("aria-selected")
  ).toBe("true")
  expect(screen.queryByLabelText("Search activity")).toBeNull()
  expect(screen.queryByTestId("empty-state")).toBeNull()
  expect(screen.getByText("Period net change")).toBeTruthy()
  expect(screen.getByText("Inflows")).toBeTruthy()
  expect(screen.getByText("Outflows")).toBeTruthy()
  expect(screen.queryByText("30-day inflow")).toBeNull()
  expect(screen.queryByText("30-day outflow")).toBeNull()
  expect(screen.getByText("+€50.00").getAttribute("data-color")).toBe(
    "theme-success"
  )
  expect(screen.getByText("+€120.00").getAttribute("data-color")).toBe(
    "theme-success"
  )
  expect(screen.getByText("-€70.00").getAttribute("data-color")).toBe(
    "theme-destructive"
  )

  const chart = screen.getByRole("button", { name: "Chart: Running balance" })
  const footer = screen.getByTestId("chart-footer")
  expect(within(footer).getByRole("button", { name: "30D" })).toBeTruthy()
  expect(within(footer).getByRole("button", { name: "90D" })).toBeTruthy()
  expect(
    within(footer).getByRole("button", { name: "Year to date" })
  ).toBeTruthy()
  expect(within(footer).getByRole("button", { name: "1Y" })).toBeTruthy()
  // Mode toggle remains above chart
  const flowToggle = screen.getByRole("button", { name: "Inflow and outflow" })
  expect(
    flowToggle.compareDocumentPosition(chart) & Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy()

  // Cash flow mode also places Weekly · Monthly inside chart footer
  cleanup()
  analyticsState.mode = "flow"
  mount(<Account />)
  fireEvent.click(screen.getByRole("tab", { name: "Analytics" }))
  const flowFooter = screen.getByTestId("chart-footer")
  expect(
    within(flowFooter).getByRole("button", { name: "Weekly" })
  ).toBeTruthy()
  expect(
    within(flowFooter).getByRole("button", { name: "Monthly" })
  ).toBeTruthy()

  // Pagination is skipped on Analytics tab
  next.mockClear()
  fireEvent.click(screen.getByText("Next page"))
  expect(next).not.toHaveBeenCalled()
})

it("renders quiet tap-to-expand Notes directly below CardAccountItem", () => {
  mount(<Account />)
  const card = screen.getByText("≈ -$24.00")
  const noteBtn = screen.getByRole("button", { name: "Cash only" })
  expect(
    card.compareDocumentPosition(noteBtn) & Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy()
  expect(noteBtn.getAttribute("aria-expanded")).toBe("false")
  expect(screen.getByText("Cash only").getAttribute("data-lines")).toBe("1")

  fireEvent.click(noteBtn)
  expect(noteBtn.getAttribute("aria-expanded")).toBe("true")
  expect(screen.getByText("Cash only").getAttribute("data-lines")).toBe("")
})

it("debounces ledger search, filters via unified Filters & Period sheet with conditional active chips, and resets in 1 tap", () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-10-15T12:00:00Z"))
  mount(<Account />)

  // Default unfiltered view renders zero active filter chips and no Reset filters CTA
  expect(
    screen.getByText("Transactions booked under this account will appear here.")
  ).toBeTruthy()
  expect(screen.queryByRole("button", { name: "Reset filters" })).toBeNull()
  expect(
    screen.queryByRole("button", { name: "Remove type filter" })
  ).toBeNull()
  expect(
    screen.queryByRole("button", { name: "Remove period filter" })
  ).toBeNull()
  expect(ledgerSpy).toHaveBeenLastCalledWith(
    "space",
    expect.objectContaining({
      startDate: undefined,
      endDate: undefined,
    }),
    true
  )

  const input = screen.getByLabelText("Search activity")
  expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull()

  fireEvent.change(input, { target: { value: "coffee" } })
  const clearBtn = screen.getByRole("button", { name: "Clear search" })
  expect(clearBtn).toBeTruthy()
  expect(ledgerSpy).not.toHaveBeenLastCalledWith(
    "space",
    expect.objectContaining({ searchQuery: "coffee" }),
    true
  )

  act(() => {
    vi.advanceTimersByTime(300)
  })
  expect(ledgerSpy).toHaveBeenLastCalledWith(
    "space",
    expect.objectContaining({ searchQuery: "coffee" }),
    true
  )

  // Clear search resets input and debounced query
  fireEvent.click(clearBtn)
  expect((input as HTMLInputElement).value).toBe("")
  expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull()
  act(() => {
    vi.advanceTimersByTime(300)
  })
  expect(ledgerSpy).toHaveBeenLastCalledWith(
    "space",
    expect.objectContaining({ searchQuery: "" }),
    true
  )

  // Open unified Filters & Period sheet from the 1-row filter button
  const filterBtn = screen.getByRole("button", { name: "Filter transactions" })
  fireEvent.click(filterBtn)
  expect(screen.getByText("Filters & Period")).toBeTruthy()

  // All 7 period presets and 5 type options are rendered inside the unified sheet
  for (const label of [
    "All Time",
    "This Month",
    "Last Month",
    "Last 3M",
    "Last 6M",
    "YTD",
    "Last 12M",
    "All types",
    "Expenses",
    "Income",
    "Transfers",
    "Adjustments",
  ]) {
    expect(screen.getByRole("button", { name: label })).toBeTruthy()
  }

  // Step previous month inside unified sheet passes startDate and endDate into useDetailLedger
  fireEvent.click(screen.getByRole("button", { name: "Previous month" }))
  expect(ledgerSpy).toHaveBeenLastCalledWith(
    "space",
    expect.objectContaining({
      startDate: expect.stringMatching(/^2026-09-01/),
      endDate: expect.stringMatching(/^2026-09-30/),
    }),
    true
  )

  // Select period preset + type filter inside unified sheet
  fireEvent.click(screen.getByRole("button", { name: "Last 6M" }))
  expect(ledgerSpy).toHaveBeenLastCalledWith(
    "space",
    expect.objectContaining({
      startDate: expect.stringMatching(/^2026-05-01/),
      endDate: expect.stringMatching(/^2026-10-15/),
    }),
    true
  )

  const expensesPill = screen.getByRole("button", { name: "Expenses" })
  fireEvent.click(expensesPill)
  expect(expensesPill.getAttribute("aria-pressed")).toBe("true")
  expect(ledgerSpy).toHaveBeenLastCalledWith(
    "space",
    expect.objectContaining({ types: ["EXPENSE"] }),
    true
  )

  // Close sheet -> conditional removable active chips appear with active filter count badge
  fireEvent.click(
    screen.getByRole("button", { name: "Close Filters & Period" })
  )
  expect(within(filterBtn).getByText("2")).toBeTruthy()
  const removeTypeChip = screen.getByRole("button", {
    name: "Remove type filter",
  })
  const removePeriodChip = screen.getByRole("button", {
    name: "Remove period filter",
  })
  expect(within(removeTypeChip).getByText("Expenses")).toBeTruthy()
  expect(within(removePeriodChip).getByText("Last 6M")).toBeTruthy()

  // Removing just the type chip keeps period active
  fireEvent.click(removeTypeChip)
  expect(
    screen.queryByRole("button", { name: "Remove type filter" })
  ).toBeNull()
  expect(within(filterBtn).getByText("1")).toBeTruthy()
  expect(ledgerSpy).toHaveBeenLastCalledWith(
    "space",
    expect.objectContaining({ types: [] }),
    true
  )

  // Re-apply Expenses and reset everything via 1-tap Reset filters inside sheet
  fireEvent.click(filterBtn)
  fireEvent.click(screen.getByRole("button", { name: "Expenses" }))
  const resetButtons = screen.getAllByRole("button", { name: "Reset filters" })
  fireEvent.click(resetButtons[resetButtons.length - 1])
  expect(
    screen.queryByRole("button", { name: "Remove type filter" })
  ).toBeNull()
  expect(
    screen.queryByRole("button", { name: "Remove period filter" })
  ).toBeNull()
  expect(ledgerSpy).toHaveBeenLastCalledWith(
    "space",
    expect.objectContaining({
      searchQuery: "",
      types: [],
      startDate: undefined,
      endDate: undefined,
    }),
    true
  )
})

it("renders de-boxed action hierarchy, passes hideHolderName to CardAccountItem, wires 2-item iOS header, and shows archived notice when inactive", () => {
  mount(<Account />)
  const card = screen.getByTestId("card-account-item")
  expect(card.getAttribute("data-hide-holder-name")).toBe("true")
  expect(card.getAttribute("data-has-on-press")).toBe("false")

  const addTxBtn = screen.getByRole("button", { name: "Add Tx" })
  const transferBtn = screen.getByRole("button", { name: "Transfer" })
  const adjustBtn = screen.getByRole("button", { name: "Adjust" })
  expect(addTxBtn).toBeTruthy()
  expect(transferBtn).toBeTruthy()
  expect(adjustBtn).toBeTruthy()
  expect(screen.queryByRole("button", { name: "Edit" })).toBeNull()

  const primaryStyle = JSON.parse(addTxBtn.getAttribute("data-style")!)
  const secondaryStyle = JSON.parse(transferBtn.getAttribute("data-style")!)
  expect(primaryStyle.height).toBe(44)
  expect(primaryStyle.flexDirection).toBe("row")
  expect(primaryStyle.backgroundColor).toBe("theme-primary")
  expect(primaryStyle.borderWidth).toBeUndefined()
  expect(secondaryStyle.height).toBe(44)
  expect(secondaryStyle.backgroundColor).toBe("theme-surface-subtle")
  expect(secondaryStyle.borderWidth).toBeUndefined()

  // iOS header exposes exactly 2 clean items: ellipsis overflow menu (Edit, Statements) + sparkles Copilot trigger
  const headerItems = (
    screenOptionsRef.current?.unstable_headerRightItems as () => {
      type: string
      label: string
      icon?: { type: string; name: string }
      onPress?: () => void
      menu?: {
        title: string
        items: {
          label: string
          icon?: { type: string; name: string }
          onPress: () => void
        }[]
      }
    }[]
  )()
  expect(headerItems).toHaveLength(2)
  expect(headerItems[0].type).toBe("menu")
  expect(headerItems[0].icon?.name).toBe("ellipsis")
  expect(headerItems[0].menu?.items.map((i) => i.label)).toEqual([
    "Edit",
    "Statements and reconciliation",
  ])
  expect(headerItems[0].menu?.items.map((i) => i.icon?.name)).toEqual([
    "pencil",
    "doc.text",
  ])
  expect(headerItems[1].type).toBe("button")
  expect(headerItems[1].icon?.name).toBe("sparkles")
  expect(headerItems[1].label).toBe("AI Assistant")
  headerItems[1].onPress?.()
  expect(openCopilotSheet).toHaveBeenCalledTimes(1)

  headerItems[0].menu?.items[0].onPress()
  expect(push).toHaveBeenCalledWith({
    pathname: "/modal/manage-account",
    params: { id: "entity" },
  })

  // Archived account hides actionGrid and shows compact Inactive notice with 1-tap Edit
  cleanup()
  push.mockClear()
  accountState.isActive = false
  mount(<Account />)
  expect(screen.queryByRole("button", { name: "Add Tx" })).toBeNull()
  expect(screen.queryByRole("button", { name: "Transfer" })).toBeNull()
  expect(screen.queryByRole("button", { name: "Adjust" })).toBeNull()
  expect(screen.getByText("Inactive")).toBeTruthy()
  fireEvent.click(screen.getByRole("button", { name: "Edit" }))
  expect(push).toHaveBeenCalledWith({
    pathname: "/modal/manage-account",
    params: { id: "entity" },
  })
  const archivedHeaderItems = (
    screenOptionsRef.current?.unstable_headerRightItems as () => {
      menu?: { items: { label: string }[] }
    }[]
  )()
  expect(archivedHeaderItems[0].menu?.items.map((i) => i.label)).toContain(
    "Edit"
  )
})

it("renders loading skeleton and error banner for analytics chart states", () => {
  analyticsState.isSuccess = false
  analyticsState.isLoading = true
  mount(<Account />)
  fireEvent.click(screen.getByRole("tab", { name: "Analytics" }))
  expect(screen.getByTestId("skeleton-card")).toBeTruthy()

  cleanup()
  analyticsState.isLoading = false
  analyticsState.isError = true
  mount(<Account />)
  fireEvent.click(screen.getByRole("tab", { name: "Analytics" }))
  expect(screen.getByText("Unable to load finance data")).toBeTruthy()
})

it("preserves negative converted previews on the Accounts List screen", () => {
  mount(<AccountsList />)
  expect(preview).toHaveBeenCalledWith("-12", "EUR")
  expect(screen.getByText("≈ -$24.00")).toBeTruthy()
})

it("keeps the period stepper outside the hero and ledger rows flat", () => {
  ledgerState.transactions = [
    { id: "a", transactionDate: "2026-10-01", currency: "USD", amount: "100" },
    {
      id: "b",
      transactionDate: "2026-10-01",
      currency: "EUR",
      amount: "100",
      amountInBase: "120",
    },
  ]
  mount(<Budget />)
  expect(screen.getByLabelText("Previous period").closest("section")).toBeNull()
  expect(screen.getByText("Left to spend").closest("section")).not.toBeNull()
  expect(
    screen
      .getByRole("tab", { name: /Transactions.*2\+/ })
      .getAttribute("aria-selected")
  ).toBe("true")
  expect(screen.getByText("-$2.20")).toBeTruthy()
  const rows = screen.getAllByText("Entry")
  expect(rows.map((r) => r.dataset.divider)).toEqual(["true", "false"])
  for (const row of rows) {
    expect(row.dataset.budget).toBe("false")
    expect(row.dataset.date).toBe("false")
  }
  fireEvent.click(screen.getByRole("tab", { name: "Analytics" }))
  expect(screen.queryByText("Entry")).toBeNull()
  expect(screen.getAllByTestId("detail-chart")).toHaveLength(2)
})

it("shows a period caption instead of an empty burn chart", () => {
  budgetState.burn = []
  budgetState.periods = []
  mount(<Budget />)
  fireEvent.click(screen.getByRole("tab", { name: "Analytics" }))
  expect(screen.getByText("No expenses recorded")).toBeTruthy()
  expect(screen.queryByTestId("detail-chart")).toBeNull()
})

it("debounces budget ledger search and clears unmatched queries", () => {
  vi.useFakeTimers()
  mount(<Budget />)
  const input = screen.getByLabelText("Search activity")
  fireEvent.change(input, { target: { value: "coffee" } })
  expect(ledgerSpy.mock.lastCall?.[1].searchQuery).toBe("")
  act(() => {
    vi.advanceTimersByTime(300)
  })
  expect(ledgerSpy.mock.lastCall?.[1].searchQuery).toBe("coffee")
  expect(screen.getByText("No matches found.")).toBeTruthy()
  fireEvent.click(
    within(screen.getByTestId("empty-state")).getByRole("button", {
      name: "Clear search",
    })
  )
  expect((input as HTMLInputElement).value).toBe("")
  act(() => {
    vi.advanceTimersByTime(300)
  })
  expect(screen.queryByText("No matches found.")).toBeNull()
  fireEvent.change(input, { target: { value: "tea" } })
  fireEvent.click(screen.getByLabelText("Clear search"))
  expect((input as HTMLInputElement).value).toBe("")
})

it("replaces daily allowance with a closed summary when a past period is selected", () => {
  mount(<Budget />)
  fireEvent.click(screen.getByRole("tab", { name: "Analytics" }))
  fireEvent.click(screen.getByText("Spending vs. limit by period"))
  expect(screen.getByText("Closed under budget by $7.00")).toBeTruthy()
  expect(screen.queryByText(/days left/)).toBeNull()
})

it.each(["Next period", "Current"])(
  "returns from a missing budget period using %s",
  (control) => {
    mount(<Budget />)
    fireEvent.click(screen.getByRole("tab", { name: "Analytics" }))
    fireEvent.click(screen.getByText("Spending vs. limit by period"))
    fireEvent.click(screen.getByRole("button", { name: "Previous period" }))
    expect(screen.queryByText(/Closed (under|over) budget/i)).toBeNull()
    expect(screen.getByRole("button", { name: "Current" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: control }))
    expect(screen.queryByRole("button", { name: "Current" })).toBeNull()
    expect(
      screen
        .getByRole("button", { name: "Next period" })
        .hasAttribute("disabled")
    ).toBe(true)
  }
)

it("opens a borrowing transaction directly and starts additional funding in disbursement mode", () => {
  mount(<Borrowing />)
  fireEvent.click(screen.getByText("Entry"))
  expect(push).toHaveBeenCalledWith("/(app)/finance/transactions/tx")
  fireEvent.click(
    screen.getByRole("button", { name: "Additional disbursement" })
  )
  expect(push).toHaveBeenCalledWith({
    pathname: "/modal/add-transaction",
    params: {
      type: "BORROWING",
      borrowingId: "entity",
      borrowingAction: "BORROWING_TRANSACTION_TYPE_DISBURSEMENT",
    },
  })
})

it.each([
  ["ONE_TIME", true, 1],
  ["MONTHLY", false, 1],
  ["MONTHLY", true, 0],
] as const)(
  "omits unavailable history (%s, success=%s, periods=%i)",
  (interval, success, length) => {
    Object.assign(budgetState, {
      interval,
      success,
      periods: budgetState.periods.slice(0, length),
    })
    mount(<Budget />)
    fireEvent.click(screen.getByRole("tab", { name: "Analytics" }))
    expect(screen.queryByText("Spending vs. limit by period")).toBeNull()
  }
)

it.each([
  [Budget, /add expense/i],
  [Borrowing, /repay debt/i],
  [Borrowing, /adjust balance/i],
  [Borrowing, /additional disbursement/i],
] as const)(
  "allows the detail CTA to grow with its label",
  (Component, name) => {
    mount(<Component />)
    const style = JSON.parse(
      screen.getAllByRole("button", { name })[0].getAttribute("data-style")!
    )
    expect(style.flex).toBeUndefined()
    expect(style.paddingVertical).toBeGreaterThanOrEqual(10)
    expect(style.minHeight).toBeGreaterThanOrEqual(42)
  }
)

it.each(["ios", "android"] as const)(
  "exposes overflow and Copilot on borrowing detail (%s)",
  async (os) => {
    const { Platform } = await import("react-native")
    Object.assign(Platform, { OS: os })
    try {
      mount(<Borrowing />)
      expect(screenOptionsRef.current?.headerTitle).toBe("Alex")
      if (os === "ios") {
        const items = (
          screenOptionsRef.current!.unstable_headerRightItems as () => {
            icon: { name: string }
            menu?: { items: { label: string }[] }
            onPress?: () => void
          }[]
        )()
        expect(items.map((i) => i.icon.name)).toEqual(["ellipsis", "sparkles"])
        expect(items[0].menu?.items.map((i) => i.label)).toEqual([
          "Edit Agreement",
          "Delete Agreement",
        ])
        items[1].onPress?.()
      } else {
        render(
          (screenOptionsRef.current!.headerRight as () => React.ReactElement)()
        )
        expect(screen.getByText("Menu")).toBeTruthy()
        fireEvent.click(screen.getByTestId("borrowing-detail-header-ai"))
      }
      expect(openCopilotSheet).toHaveBeenCalledOnce()
    } finally {
      Object.assign(Platform, { OS: "ios" })
    }
  }
)
it("keeps notes and primary actions outside the compact currency hero", () => {
  mount(<Borrowing />)
  expect(screen.queryByText("Alex")).toBeNull()
  expect(screen.getByText("≈ $100.00")).toBeTruthy()
  const note = screen.getByRole("button", { name: "School fees" })
  expect(note.closest("section")).toBeNull()
  expect(note.getAttribute("aria-expanded")).toBe("false")
  fireEvent.click(note)
  expect(note.getAttribute("aria-expanded")).toBe("true")
  expect(screen.queryByRole("button", { name: /edit/i })).toBeNull()
  fireEvent.click(screen.getByRole("button", { name: "Repay Debt" }))
  expect(push).toHaveBeenCalledWith({
    pathname: "/modal/add-transaction",
    params: { type: "BORROWING", borrowingId: "entity" },
  })
})
it("shows a flat, search-free daily ledger and isolates analytics from pagination", () => {
  ledgerState.transactions = [
    {
      id: "a",
      type: "EXPENSE",
      amount: "100",
      currency: "EUR",
      transactionDate: "2026-01-01",
    },
    {
      id: "b",
      type: "INCOME",
      amount: "400",
      currency: "EUR",
      transactionDate: "2026-01-01",
    },
  ]
  mount(<Borrowing />)
  expect(
    within(screen.getByRole("tab", { name: /Transactions/i })).getByText("2+")
  ).toBeTruthy()
  expect(screen.queryByRole("textbox")).toBeNull()
  expect(screen.getByText(/€3.00/)).toBeTruthy()
  const rows = screen.getAllByText("Entry")
  expect(rows.map((row) => row.getAttribute("data-divider"))).toEqual([
    "true",
    "false",
  ])
  expect(rows.every((row) => row.getAttribute("data-date") === "false")).toBe(
    true
  )
  fireEvent.click(screen.getByRole("tab", { name: "Analytics" }))
  for (const text of [
    "Principal",
    "Repaid",
    "Remaining principal",
    "Agreement Details",
    "Alex's phone",
  ])
    expect(screen.getByText(text)).toBeTruthy()
  expect(screen.queryByText("Entry")).toBeNull()
  fireEvent.click(screen.getByText("Next page"))
  expect(next).not.toHaveBeenCalled()
})

it.each(["0", "5000"])(
  "offers only applicable actions for a lent agreement with %s remaining",
  (remainingAmount) => {
    Object.assign(agreement, {
      direction: "LENT",
      currency: "DOP",
      remainingAmount,
    })
    mount(<Borrowing />)
    expect(screen.queryByText(/≈/)).toBeNull()
    const receive = screen.queryByRole("button", { name: "Receive Payment" })
    if (remainingAmount === "0") {
      expect(receive).toBeNull()
      expect(screen.getByText("Final Settled")).toBeTruthy()
    } else {
      expect(receive).toBeTruthy()
      fireEvent.click(receive!)
      expect(push).toHaveBeenCalledWith({
        pathname: "/modal/add-transaction",
        params: { type: "BORROWING", borrowingId: "entity" },
      })
    }
    expect(
      screen.getByRole("button", { name: "Additional disbursement" })
    ).toBeTruthy()
    expect(screen.getByRole("button", { name: "Adjust Balance" })).toBeTruthy()
  }
)
it("uses booked base amounts when the ledger day mixes currencies", () => {
  ledgerState.transactions = [
    {
      id: "a",
      type: "EXPENSE",
      amount: "400",
      amountInBase: "800",
      currency: "EUR",
      transactionDate: "2026-01-01",
    },
    {
      id: "b",
      type: "INCOME",
      amount: "200",
      currency: "USD",
      transactionDate: "2026-01-01",
    },
  ]
  mount(<Borrowing />)
  expect(screen.getByText("-$6.00")).toBeTruthy()
})
it("uses the current theme border for a borrowed agreement", () => {
  mount(<Borrowing />)
  expect(screen.getByText("Borrowed").getAttribute("data-border")).toBe(
    "theme-border"
  )
})

it("opens reconciled statements sheet from the overflow menu and lazily loads statements", () => {
  mount(<Account />)
  expect(screen.queryByText("April.pdf")).toBeNull()
  expect(statementsSpy).toHaveBeenLastCalledWith(
    { accountId: "entity", pageSize: 100, pageToken: "" },
    { enabled: false }
  )

  const headerItems = (
    screenOptionsRef.current?.unstable_headerRightItems as () => {
      menu?: { items: { label: string; onPress: () => void }[] }
    }[]
  )()
  const statementsBtn = headerItems[0].menu?.items.find(
    (i) => i.label === "Statements and reconciliation"
  )!
  act(() => {
    statementsBtn.onPress()
  })

  expect(statementsSpy).toHaveBeenLastCalledWith(
    { accountId: "entity", pageSize: 100, pageToken: "" },
    { enabled: true }
  )
  expect(screen.getByText("April.pdf")).toBeTruthy()
  expect(screen.getByText("Reconciled")).toBeTruthy()

  fireEvent.click(
    screen.getByRole("button", { name: "Close Statements and reconciliation" })
  )
  expect(screen.queryByText("April.pdf")).toBeNull()
})

it.each([
  [Account, "Add Tx", "Running balance"],
  [Budget, "Add Expense", "Cumulative spending vs. ideal pace"],
  [Borrowing, "Repay Debt", "Remaining principal"],
] as const)(
  "places the primary action before the chart",
  (Component, action, chart) => {
    mount(<Component />)
    fireEvent.click(screen.getByRole("tab", { name: "Analytics" }))
    const cta = screen.getAllByRole("button", {
      name: new RegExp(`^${action}$`, "i"),
    })[0]
    const plot = screen.getByRole("button", { name: `Chart: ${chart}` })
    expect(
      cta.compareDocumentPosition(plot) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  }
)
