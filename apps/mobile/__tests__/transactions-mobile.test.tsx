import React from "react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { Transaction } from "@saturn/api/saturn/finance/v1/finance"
import type { SectionListProps } from "react-native"
import Transactions from "../app/(app)/finance/transactions"

const { list, accounts, selection, push, snap } = vi.hoisted(() => ({
  list: vi.fn(),
  accounts: vi.fn(),
  selection: vi.fn(),
  push: vi.fn(),
  snap: vi.fn(),
}))

vi.mock("@saturn/api/saturn/finance/v1/finance", () => ({
  listTransactions: list,
  useListAccountsQuery: accounts,
  useGetSettingsQuery: () => ({ data: { baseCurrency: "USD" } }),
  useListBudgetsQuery: () => ({ data: { budgets: [] } }),
  useListExchangeRatesQuery: () => ({
    data: {
      exchangeRates: [
        {
          fromCurrency: "EUR",
          toCurrency: "USD",
          rate: 2,
          rateDate: "2026-04-01",
        },
      ],
    },
  }),
}))

vi.mock("expo-router", () => ({ useRouter: () => ({ push }) }))
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 34 }),
}))

vi.mock("../lib/space-context", () => ({
  useSpace: () => ({ activeSpaceId: "space" }),
}))

vi.mock("../lib/copilot-sheet-context", () => ({
  useMobileCopilotView: vi.fn(),
}))

vi.mock("../lib/haptics", () => ({ haptics: { light: vi.fn(), selection } }))

vi.mock("../lib/budget-icons", () => ({ BudgetCategoryIcon: () => null }))

vi.mock("../lib/theme", () => {
  const theme = {
    colors: { success: "green", destructive: "red", textMuted: "gray" },
    radius: {},
    shadows: {},
    typography: {},
  }
  return {
    useTheme: () => ({ ...theme, getBudgetColors: () => ({}) }),
    useThemedStyles: (fn: (t: typeof theme) => unknown) => fn(theme),
  }
})

vi.mock("lucide-react-native", () =>
  Object.fromEntries(
    "Search Plus ReceiptText X SlidersHorizontal Calendar ChevronLeft ChevronRight ChevronDown ArrowUpRight ArrowDownLeft Repeat Coins"
      .split(" ")
      .map((k) => [k, () => null])
  )
)

vi.mock("../components/app-header", () => ({
  AIHeaderButton: ({ testID }: { testID: string }) => (
    <button data-testid={testID} />
  ),
}))

vi.mock("../components/ui/typography", () => ({
  MonoAmount: ({
    color,
    size,
    children,
  }: React.PropsWithChildren<{ color: string; size: string }>) => (
    <span data-color={color} data-size={size}>
      {children}
    </span>
  ),
}))

vi.mock("../components/ui/button", () => ({
  Button: ({
    children,
    onPress,
  }: React.PropsWithChildren<{ onPress: () => void }>) => (
    <button onClick={onPress}>{children}</button>
  ),
}))

vi.mock("../components/ui/empty-state", () => ({
  EmptyState: ({
    description,
    actionLabel,
    onAction,
  }: {
    description: string
    actionLabel: string
    onAction: () => void
  }) => (
    <div>
      {description}
      <button onClick={onAction}>{actionLabel}</button>
    </div>
  ),
}))

vi.mock("../components/ui/skeleton-loader", () => ({
  SkeletonCard: () => null,
}))

vi.mock("../components/ui/bottom-sheet", () => ({
  BottomSheetHeader: () => null,
  AppBottomSheet: ({
    ref,
    children,
  }: React.PropsWithChildren<{
    ref: React.Ref<{ snapToIndex: typeof snap }>
  }>) => {
    React.useImperativeHandle(ref, () => ({ snapToIndex: snap }))
    return <aside>{children}</aside>
  },
}))

vi.mock("@gorhom/bottom-sheet", () => ({
  BottomSheetScrollView: ({ children }: React.PropsWithChildren) => (
    <div>{children}</div>
  ),
}))

vi.mock("react-native", () => ({
  StyleSheet: { hairlineWidth: 0.5 },
  View: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
  ScrollView: ({ children }: React.PropsWithChildren) => <nav>{children}</nav>,
  ActivityIndicator: () => null,
  RefreshControl: () => null,
  TextInput: ({
    value,
    onChangeText,
  }: {
    value: string
    onChangeText: (s: string) => void
  }) => <input value={value} onChange={(e) => onChangeText(e.target.value)} />,
  TouchableOpacity: ({
    children,
    accessibilityLabel,
    onPress,
    style,
  }: React.PropsWithChildren<{
    accessibilityLabel?: string
    onPress: () => void
    style: unknown
  }>) => (
    <button
      aria-label={accessibilityLabel}
      data-style={JSON.stringify(style)}
      onClick={onPress}
    >
      {children}
    </button>
  ),
  SectionList: ({
    sections,
    renderItem,
    renderSectionHeader,
    ListEmptyComponent,
  }: Pick<
    SectionListProps<Transaction, { title: string; data: Transaction[] }>,
    "sections" | "renderItem" | "renderSectionHeader"
  > & { ListEmptyComponent: React.ReactNode }) => (
    <main>
      {sections.length
        ? sections.map((section) => (
            <section key={section.title}>
              {renderSectionHeader?.({ section })}
              {section.data.map((item, index) => (
                <React.Fragment key={item.id}>
                  {renderItem?.({
                    item,
                    index,
                    section,
                    separators: {
                      highlight: vi.fn(),
                      unhighlight: vi.fn(),
                      updateProps: vi.fn(),
                    },
                  })}
                </React.Fragment>
              ))}
            </section>
          ))
        : ListEmptyComponent}
    </main>
  ),
}))

function mount() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Transactions />
    </QueryClientProvider>
  )
}

const button = (name: string) => screen.getByRole("button", { name })

beforeEach(() => {
  list.mockResolvedValue({ transactions: [] })
  accounts.mockReturnValue({
    data: {
      accounts: [{ id: "old", name: "Archived checking", isActive: false }],
    },
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

it("renders flat rows with internal hairlines, archived accounts and signed base-currency day totals", async () => {
  const base = {
    transactionDate: "2026-04-01",
    currency: "EUR",
    accountId: "old",
  }
  list.mockResolvedValue({
    transactions: [
      {
        ...base,
        id: "expense",
        description: "Coffee",
        amount: "100",
        type: "EXPENSE",
      },
      {
        ...base,
        id: "income",
        description: "Rebate",
        amount: "900",
        amountInBase: "300",
        type: "INCOME",
      },
      {
        ...base,
        transactionDate: "2026-03-31",
        id: "fee",
        description: "Fee",
        amount: "40",
        type: "EXPENSE",
      },
    ],
  })
  mount()

  const row = (name: string) => screen.getByText(name).closest("button")!
  await screen.findByText("Coffee")

  expect(row("Coffee").parentElement?.tagName).toBe("SECTION")
  expect(row("Coffee").getAttribute("data-style")).toContain(
    '"borderBottomWidth":0.5'
  )
  expect(row("Rebate").getAttribute("data-style")).not.toContain(
    "borderBottomWidth"
  )
  expect(within(row("Coffee")).getByText("Archived checking")).toBeTruthy()
  expect(accounts).toHaveBeenCalledWith({}, { enabled: true })

  const net = within(row("Coffee").parentElement!).getByText("+$1.00")
  expect(net.dataset.size).toBe("sm")
  expect(net.dataset.color).toBe("green")
  expect(
    within(row("Fee").parentElement!).getByText("-$0.80").dataset.color
  ).toBe("red")
  fireEvent.click(row("Coffee"))
  expect(push).toHaveBeenCalledWith("/(app)/finance/transactions/expense")
})

it("offers all seven periods and sends each flow filter to the API", async () => {
  mount()
  fireEvent.click(button("Filter transactions"))
  expect(snap).toHaveBeenCalledWith(0)
  const sheet = within(screen.getByRole("complementary"))
  for (const name of [
    "This Month",
    "Last Month",
    "Last 3M",
    "Last 6M",
    "YTD",
    "Last 12M",
    "All Time",
  ])
    expect(sheet.getByRole("button", { name })).toBeTruthy()
  for (const [name, types] of [
    ["Expenses", ["EXPENSE"]],
    ["Income", ["INCOME"]],
    ["Transfers", ["TRANSFER_IN", "TRANSFER_OUT"]],
    ["Adjustments", ["BALANCE_ADJUSTMENT"]],
  ] as const) {
    fireEvent.click(sheet.getByRole("button", { name }))
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ types }))
    )
  }
  fireEvent.click(button("Remove type filter"))
  await waitFor(() =>
    expect(list).toHaveBeenLastCalledWith(
      expect.objectContaining({ types: undefined })
    )
  )
  fireEvent.click(sheet.getByRole("button", { name: "Archived checking" }))
  await waitFor(() =>
    expect(list).toHaveBeenLastCalledWith(
      expect.objectContaining({ accountId: "old" })
    )
  )
})

it("clears search inline and resets empty searches or stepped months to the default ledger", async () => {
  mount()
  const input = screen.getByRole("textbox") as HTMLInputElement
  const period = screen.getByRole("button", { name: "Select period" })
  const initial = period.textContent
  fireEvent.change(input, { target: { value: "coffee" } })
  fireEvent.click(button("Clear search"))
  expect(input.value).toBe("")
  expect(selection).toHaveBeenCalled()
  fireEvent.change(input, { target: { value: "missing" } })
  await waitFor(() =>
    expect(list).toHaveBeenLastCalledWith(
      expect.objectContaining({ searchQuery: "missing" })
    )
  )
  fireEvent.click(await screen.findByRole("button", { name: "Reset Filters" }))
  expect(input.value).toBe("")
  fireEvent.click(screen.getByRole("button", { name: "Previous month" }))
  expect(period.textContent).not.toBe(initial)
  fireEvent.click(screen.getByRole("button", { name: "Next month" }))
  expect(period.textContent).toBe(initial)
  expect(
    await within(screen.getByRole("main")).findByRole("button", {
      name: "Add Transaction",
    })
  ).toBeTruthy()
  fireEvent.click(screen.getByRole("button", { name: "Previous month" }))
  expect(period.textContent).not.toBe(initial)
  fireEvent.click(await screen.findByRole("button", { name: "Reset Filters" }))
  expect(period.textContent).toBe(initial)
  expect(
    await within(screen.getByRole("main")).findByRole("button", {
      name: "Add Transaction",
    })
  ).toBeTruthy()
})
