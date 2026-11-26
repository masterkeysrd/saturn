import React from "react"
import { it, vi, expect, afterEach } from "vitest"
import {
  render,
  screen,
  fireEvent,
  within,
  cleanup,
} from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Platform } from "react-native"
import Borrowings from "../app/(app)/finance/borrowing"
import { useMobileCopilotView } from "../lib/copilot-sheet-context"
const { push, openCopilotSheet, options, state } = await vi.hoisted(
  async () => {
    const { createRequire } = await vi.importActual<{
      createRequire: (url: string) => {
        extensions: Record<string, (module: { exports: unknown }) => void>
      }
    }>("node:module")
    createRequire(import.meta.url).extensions[".xml"] = (module) => {
      module.exports = "icon"
    }
    return {
      push: vi.fn(),
      openCopilotSheet: vi.fn(),
      options: { current: {} as Record<string, unknown> },
      state: { empty: false },
    }
  }
)
vi.mock("expo-router", () => ({
  useRouter: () => ({ push }),
  Stack: {
    Screen: ({ options: props }: { options: Record<string, unknown> }) => {
      options.current = props
      return null
    },
  },
}))
vi.mock("@expo/ui", () => ({ Icon: { select: () => "" } }))
vi.mock("lucide-react-native", () =>
  Object.fromEntries(
    "HandCoins Search X Plus TrendingUp TrendingDown Calendar CalendarClock MoreVertical"
      .split(" ")
      .map((k) => [k, () => null])
  )
)
vi.mock("react-native", () => ({
  StyleSheet: { hairlineWidth: 1 },
  Platform: { OS: "ios" },
  RefreshControl: () => null,
  ScrollView: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  View: ({
    children,
    testID,
    style,
  }: React.PropsWithChildren<{ testID?: string; style?: unknown }>) => (
    <div data-testid={testID} data-style={JSON.stringify(style)}>
      {children}
    </div>
  ),
  Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
  TextInput: ({
    value,
    onChangeText,
  }: {
    value: string
    onChangeText: (v: string) => void
  }) => <input value={value} onChange={(e) => onChangeText(e.target.value)} />,
  TouchableOpacity: ({
    onPress,
    accessibilityLabel,
    children,
  }: React.PropsWithChildren<{
    onPress: () => void
    accessibilityLabel?: string
  }>) => (
    <button onClick={onPress} aria-label={accessibilityLabel}>
      {children}
    </button>
  ),
}))
vi.mock("../lib/theme", () => {
  const theme = {
    colors: { primary: "primary", success: "success" },
    radius: {},
    shadows: {},
  }
  return {
    useTheme: () => theme,
    useThemedStyles: (f: (t: object) => unknown) => f(theme),
  }
})
vi.mock("../lib/copilot-sheet-context", () => ({
  useMobileCopilotView: vi.fn(),
  useOptionalMobileCopilotSheet: () => ({ openCopilotSheet }),
}))
vi.mock("../lib/space-context", () => ({
  useSpace: () => ({ activeSpaceId: "space" }),
}))
vi.mock("../lib/haptics", () => ({
  haptics: { light: vi.fn(), selection: vi.fn() },
}))
vi.mock("../components/app-header", () => ({
  AIHeaderButton: ({ testID }: { testID: string }) => (
    <button data-testid={testID} onClick={openCopilotSheet}>
      AI
    </button>
  ),
}))
vi.mock("../components/ui/card", () => ({
  Card: ({ children }: React.PropsWithChildren) => (
    <section>{children}</section>
  ),
}))
vi.mock("../components/ui/badge", () => ({
  Badge: ({ label }: { label: string }) => <span>{label}</span>,
}))
vi.mock("../components/ui/typography", () => ({
  MonoAmount: ({ children }: React.PropsWithChildren) => (
    <span>{children}</span>
  ),
}))
vi.mock("../components/ui/skeleton-loader", () => ({
  SkeletonCard: () => null,
}))
vi.mock("../components/ui/toast", () => ({ useToast: () => ({}) }))
vi.mock("../components/ui/empty-state", () => ({
  EmptyState: ({
    title,
    onAction,
    actionLabel,
  }: {
    title: string
    onAction: () => void
    actionLabel: string
  }) => (
    <div data-testid="empty">
      {title}
      <button onClick={onAction}>{actionLabel}</button>
    </div>
  ),
}))
vi.mock("../components/ui/action-menu", () => ({
  ActionMenu: ({
    title,
    onPressAction,
  }: {
    title: string
    onPressAction: (event: { nativeEvent: { event: string } }) => void
  }) => (
    <button
      aria-label={`Menu ${title}`}
      onClick={() => onPressAction({ nativeEvent: { event: "edit" } })}
    >
      Menu
    </button>
  ),
}))
vi.mock("@saturn/api/saturn/finance/v1/finance", () => ({
  useGetSettingsQuery: () => ({ data: { baseCurrency: "USD" } }),
  useListExchangeRatesQuery: () => ({}),
  useDeleteBorrowingMutation: () => ({}),
  useListBorrowingsQuery: () => ({
    data: {
      borrowings: state.empty
        ? []
        : [
            { id: "paid", counterparty: "Settled Sam", remainingAmount: "0" },
            { id: "later", counterparty: "Undated", notes: "school fees" },
            {
              id: "soon",
              counterparty: "Soon",
              dueAt: "2026-06-03",
              contactInfo: "phone123",
              direction: "LENT",
            },
            {
              id: "late",
              counterparty: "Late",
              dueAt: "2026-05-01",
              currency: "EUR",
            },
          ].map((row) => ({
            currency: "USD",
            status: "ACTIVE",
            direction: "BORROWED",
            establishedAt: "2026-01-01",
            totalAmount: "1000",
            remainingAmount: "400",
            ...row,
          })),
    },
  }),
}))
function mount() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Borrowings />
    </QueryClientProvider>
  )
}
afterEach(() => {
  cleanup()
  Platform.OS = "ios"
  state.empty = false
  vi.clearAllMocks()
  vi.useRealTimers()
})
it.each(["ios", "android"] as const)("opens create and Copilot on %s", (os) => {
  Platform.OS = os
  mount()
  expect(useMobileCopilotView).toHaveBeenCalledWith(
    expect.objectContaining({
      viewId: "mobile.finance.borrowing",
      suggestions: expect.any(Array),
    })
  )
  if (os === "ios") {
    const items = (
      options.current.unstable_headerRightItems as () => {
        icon: { name: string }
        onPress: () => void
      }[]
    )()
    expect(items.map((i) => i.icon.name)).toEqual(["plus", "sparkles"])
    items.forEach((i) => i.onPress())
  } else {
    render((options.current.headerRight as () => React.ReactElement)())
    fireEvent.click(screen.getByLabelText("New Agreement"))
    fireEvent.click(screen.getByTestId("borrowing-header-ai"))
  }
  expect(push).toHaveBeenCalledWith("/modal/manage-borrowing")
  expect(openCopilotSheet).toHaveBeenCalledOnce()
})
it("hides the summary when there are no agreements", () => {
  state.empty = true
  mount()
  expect(screen.queryByText("Net Position")).toBeNull()
  expect(screen.getByText("No debts or loans")).toBeTruthy()
})
it("shows one summary, sorts by urgency, and separates navigation, menus and quick payments", () => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date("2026-06-01T12:00:00Z"))
  mount()
  const cards = document.querySelectorAll("section")
  expect(cards).toHaveLength(1)
  for (const label of ["Net Position", "Owed to Me", "I Owe"])
    expect(within(cards[0]).getByText(label)).toBeTruthy()
  expect(
    screen
      .getAllByRole("button", { name: /^(Late|Soon|Undated|Settled Sam)$/ })
      .map((e) => e.getAttribute("aria-label"))
  ).toEqual(["Late", "Soon", "Undated", "Settled Sam"])
  expect(
    screen.getByTestId("payoff-late").getAttribute("data-style")
  ).toContain("primary")
  expect(
    screen.getByTestId("payoff-soon").getAttribute("data-style")
  ).toContain("success")
  fireEvent.click(screen.getByLabelText("Late"))
  fireEvent.click(screen.getByLabelText("Menu Late"))
  fireEvent.click(screen.getAllByText("Repay")[0])
  fireEvent.click(screen.getByText("Receive"))
  expect(push.mock.calls.map((c) => c[0])).toEqual([
    "/(app)/finance/borrowing/late",
    { pathname: "/modal/manage-borrowing", params: { id: "late" } },
    ...["late", "soon"].map((borrowingId) => ({
      pathname: "/modal/add-transaction",
      params: { borrowingId, type: "BORROWING" },
    })),
  ])
})
it("combines status pills with expandable search and clears empty results", () => {
  mount()
  expect(screen.queryByRole("textbox")).toBeNull()
  fireEvent.click(screen.getByLabelText("Search agreements"))
  const input = screen.getByRole("textbox")
  for (const [query, label] of [
    ["eur", "Late"],
    ["Phone123", "Soon"],
    ["fees", "Undated"],
    ["settled sam", "Settled Sam"],
  ]) {
    fireEvent.change(input, { target: { value: query } })
    expect(screen.getByLabelText(label)).toBeTruthy()
    expect(screen.getAllByText("Menu")).toHaveLength(1)
  }
  fireEvent.click(screen.getByText(/I Owe \(2\)/))
  expect(screen.getByText("No matches found.")).toBeTruthy()
  fireEvent.click(within(screen.getByTestId("empty")).getByRole("button"))
  expect(screen.getByLabelText("Late")).toBeTruthy()
  expect(screen.queryByLabelText("Soon")).toBeNull()
})
