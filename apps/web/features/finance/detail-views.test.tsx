import { it, expect, vi, afterEach } from "vitest"
import {
  within,
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { DetailChart } from "./components/detail-chart"
import { CopilotEntityIcon } from "../ai/components/copilot-entity-pill"
import Account from "./account-detail-view"
import Budget from "./budget-detail-view"
import Borrowing from "./borrowing-detail-view"
const { list, overrides, history, mutate } = vi.hoisted(() => ({
  mutate: vi.fn(),
  overrides: {
    isDefault: false,
    isActive: true,
    interval: "MONTHLY",
    budgetCurrency: "USD",
    budgetDefaultAccountId: "",
    borrowingCurrency: "USD",
    borrowingDirection: "BORROWED",
    borrowingNotes: "",
    exchangeRates: [] as {
      fromCurrency: string
      toCurrency: string
      rate: number
      rateDate: string
    }[],
    exchangeRateToBase: 0,
    remaining: "600",
    spent: "600",
    periodError: false,
    periodLoading: false,
    error: "",
  },
  history: vi.fn(async () => ({
    startDate: "2025-01-01",
    endDate: "2025-01-31",
    spentAmount: "400",
    limitAmount: "1000",
  })),
  list: vi.fn(async (req: { pageSize?: number }) => ({
    nextPageToken: req.pageSize === 40 ? "more" : undefined,
    transactions: [
      {
        id: "tx",
        description: "Outgoing transfer",
        type: "TRANSFER_OUT",
        amount: "1000",
        currency: "USD",
        transactionDate: "2025-02-01",
      },
      ...(req.pageSize === 40
        ? [
            {
              id: "second",
              description: "Second entry",
              budgetId: "b",
              type: "EXPENSE",
              amount: "50",
              currency: "USD",
              transactionDate: "2025-02-01",
            },
            {
              id: "third",
              description: "Third entry",
              type: "INCOME",
              amount: "70",
              currency: "USD",
              transactionDate: "2025-01-28",
            },
          ]
        : []),
    ],
  })),
}))
vi.mock("@/features/space/use-space", () => ({
  useSpacePermissions: () => ({ spaceId: "s", isWritable: true }),
}))
vi.mock(
  "@saturn/api/gen/saturn/finance/v1/finance",
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    listTransactions: list,
    useGetAccountQuery: () => ({
      data: {
        id: "a",
        name: "Checking",
        type: "BANK",
        currency: "USD",
        currentBalance: "-5000",
        isActive: overrides.isActive,
        isDefault: overrides.isDefault,
      },
    }),
    useGetBudgetQuery: () => ({
      data: {
        id: "b",
        name: "Meals",
        currency: overrides.budgetCurrency,
        defaultAccountId: overrides.budgetDefaultAccountId || undefined,
        status: "PAUSED",
        interval: overrides.interval,
      },
    }),
    useGetBorrowingQuery: () => ({
      data: {
        id: "l",
        counterparty: "Alex",
        currency: overrides.borrowingCurrency,
        direction: overrides.borrowingDirection,
        dueAt: "2099-03-01",
        accountId: "bank",
        establishedAt: "2025-02-01",
        notes: overrides.borrowingNotes || undefined,
        remainingAmount: overrides.remaining,
        totalAmount: "1000",
      },
    }),
    useGetBudgetPeriodQuery: ({ date }: { date: string }) => {
      const stepped = date.startsWith("2025-01")
      if (stepped && overrides.periodError) {
        return { data: undefined, isLoading: false, isError: true }
      }
      if (stepped && overrides.periodLoading) {
        return { data: undefined, isLoading: true, isError: false }
      }
      return {
        data: {
          startDate: stepped ? "2025-01-01" : "2025-02-01",
          endDate: stepped ? "2025-01-31" : "2025-02-28",
          spentAmount: overrides.spent,
          limitAmount: "1000",
          exchangeRateToBase: overrides.exchangeRateToBase || undefined,
        },
        isLoading: false,
        isError: false,
      }
    },
    getBudgetPeriod: history,
    useUpdateAccountMutation: () => ({
      mutate,
      isError: !!overrides.error,
      error: new Error(overrides.error),
    }),
    useDeleteBorrowingMutation: () => ({
      mutate,
      isError: !!overrides.error,
      error: new Error(overrides.error),
    }),
    useGetSettingsQuery: () => ({ data: { baseCurrency: "USD" } }),
    useListAccountsQuery: () => ({
      data: { accounts: [{ id: "bank", name: "Linked account" }] },
    }),
    useListBudgetsQuery: () => ({
      data: { budgets: [{ id: "b", name: "Meals", color: "teal" }] },
    }),
    useListExchangeRatesQuery: () => ({
      data: { exchangeRates: overrides.exchangeRates },
    }),
    useListTransactionEventsQuery: () => ({ data: { events: [] } }),
  })
)
afterEach(() => {
  cleanup()
  Object.assign(overrides, {
    isDefault: false,
    isActive: true,
    interval: "MONTHLY",
    budgetCurrency: "USD",
    budgetDefaultAccountId: "",
    borrowingCurrency: "USD",
    borrowingDirection: "BORROWED",
    borrowingNotes: "",
    exchangeRates: [],
    exchangeRateToBase: 0,
    remaining: "600",
    spent: "600",
    periodError: false,
    periodLoading: false,
    error: "",
  })
  list.mockClear()
  history.mockClear()
})
function page(kind: "account" | "budget" | "borrowing") {
  const Component = { account: Account, budget: Budget, borrowing: Borrowing }[
    kind
  ]
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter initialEntries={["/entity/id"]}>
        <Routes>
          <Route path={`/entity/:${kind}Id`} element={<Component />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}
it("opens the account ledger inspector and switches between running balance and cash flow", async () => {
  page("account")
  expect(screen.getByRole("heading", { name: "Checking" })).toBeTruthy()
  expect(
    screen.getByRole("tab", { name: /Transactions/, selected: true })
  ).toBeTruthy()
  expect(screen.queryByRole("button", { name: "Running balance" })).toBeNull()
  fireEvent.keyDown(
    await screen.findByRole("button", { name: /Outgoing transfer/ }),
    { key: "Enter" }
  )
  expect(
    screen
      .getByRole("button", { name: /Outgoing transfer/ })
      .getAttribute("aria-pressed")
  ).toBe("true")
  expect(await screen.findByRole("complementary")).toBeTruthy()
  expect(screen.getAllByText("-$10.00").length).toBeGreaterThan(0)
  fireEvent.click(screen.getByRole("tab", { name: "Analytics" }))
  expect(
    await screen.findByRole("button", { name: "Running balance" })
  ).toBeTruthy()
  fireEvent.click(screen.getByRole("button", { name: "Inflow and outflow" }))
  expect(
    await screen.findByRole("group", { name: "Inflow and outflow" })
  ).toBeTruthy()
})
it("scopes the budget ledger when stepping back and promotes Resume", async () => {
  page("budget")
  const progress = screen.getByRole("progressbar", { name: "Meals" })
  expect(progress.getAttribute("aria-valuemin")).toBe("0")
  expect(progress.getAttribute("aria-valuemax")).toBe("1000")
  expect(progress.getAttribute("aria-valuenow")).toBe("600")
  expect(screen.getByRole("button", { name: "Resume Budget" })).toBeTruthy()
  fireEvent.click(screen.getByRole("button", { name: "Previous period" }))
  await waitFor(() =>
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({
        budgetId: "id",
        startDate: "2025-01-01",
        endDate: "2025-01-31",
      })
    )
  )
  expect(screen.getByText("Closed under budget by $4.00")).toBeTruthy()
  fireEvent.click(screen.getByRole("button", { name: "Current Period" }))
  expect(screen.queryByRole("button", { name: "Current Period" })).toBeNull()
})
it("opens a borrowing agreement on Transactions, shows header identity, and inspects paydown in Analytics", async () => {
  overrides.borrowingNotes = "Monthly installments"
  page("borrowing")
  const heading = screen.getByRole("heading", { name: "Alex" })
  expect(heading).toBeTruthy()
  expect(
    heading.previousElementSibling?.classList.contains("text-destructive")
  ).toBe(true)
  expect(heading.previousElementSibling?.querySelector("svg")).toBeTruthy()
  expect(screen.getByText("USD")).toBeTruthy()
  expect(screen.getByText("Linked account")).toBeTruthy()
  expect(screen.getByText("Monthly installments").closest("p")).toBeTruthy()
  expect(
    screen.getByRole("tab", { name: /Transactions/, selected: true })
  ).toBeTruthy()
  expect(
    screen.queryByRole("group", { name: "Remaining principal" })
  ).toBeNull()
  expect(
    screen
      .getByRole("progressbar")
      .firstElementChild?.classList.contains("bg-primary")
  ).toBe(true)
  expect(
    screen.getByRole("button", { name: "Additional disbursement" })
  ).toBeTruthy()
  fireEvent.click(screen.getByRole("tab", { name: "Analytics" }))
  expect(await screen.findByText("Target pace")).toBeTruthy()
  expect(
    await screen.findByRole("group", { name: "Remaining principal" })
  ).toBeTruthy()
})

async function openActions() {
  const trigger = screen.getByRole("button", { name: "Actions" })
  fireEvent.keyDown(trigger, { key: "ArrowDown" })
  return screen.findByRole("menu")
}
it("hides balance-changing actions but keeps Edit for an archived account", async () => {
  overrides.isActive = false
  page("account")
  for (const name of [/^record transaction$/i, /^transfer$/i, /^adjust\b/i]) {
    expect(screen.queryByRole("button", { name })).toBeNull()
  }
  expect(
    within(await openActions()).getByRole("menuitem", { name: "Edit" })
  ).toBeTruthy()
})
it("hides the archive action for a default account", async () => {
  overrides.isDefault = true
  page("account")
  expect(
    within(await openActions()).queryByRole("menuitem", { name: /archive/i })
  ).toBeNull()
})
it.each([
  ["account", "Archive account"],
  ["borrowing", "Delete"],
] as const)("requires confirmation before mutating %s", async (kind, label) => {
  mutate.mockClear()
  page(kind)
  const confirm = async () => {
    fireEvent.click(
      within(await openActions()).getByRole("menuitem", { name: label })
    )
    return screen.findByRole("alertdialog")
  }
  const dialog = await confirm()
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }))
  expect(mutate).not.toHaveBeenCalled()
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
  fireEvent.click(within(await confirm()).getByRole("button", { name: label }))
  expect(mutate).toHaveBeenCalledOnce()
})
it.each(["account", "borrowing"] as const)(
  "preserves the mutation error message on %s",
  (kind) => {
    overrides.error = "Record was changed by another user"
    page(kind)
    expect(screen.getByRole("alert").textContent).toBe(overrides.error)
  }
)
it("never displays a negative settled amount after a principal increase", () => {
  overrides.remaining = "2000"
  page("borrowing")
  expect(screen.getByText("$0.00")).toBeTruthy()
  expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe(
    "0"
  )
})
it("does not request or render one-time history", async () => {
  overrides.interval = "ONE_TIME"
  page("budget")
  fireEvent.click(screen.getByRole("tab", { name: "Analytics" }))
  await screen.findByRole("group", {
    name: "Cumulative spending vs. ideal pace",
  })
  expect(history).not.toHaveBeenCalled()
  expect(
    screen.queryByRole("group", { name: "Spending vs. limit by period" })
  ).toBeNull()
})
it("omits the history chart while loading and on failure", async () => {
  let reject!: (error: Error) => void
  history.mockImplementationOnce(
    () =>
      new Promise((_, fail) => {
        reject = fail
      })
  )
  page("budget")
  fireEvent.click(screen.getByRole("tab", { name: "Analytics" }))
  await waitFor(() => expect(history).toHaveBeenCalled())
  expect(
    screen.queryByRole("group", { name: "Spending vs. limit by period" })
  ).toBeNull()
  reject(new Error("offline"))
  await screen.findByRole("alert")
  expect(
    screen.queryByRole("group", { name: "Spending vs. limit by period" })
  ).toBeNull()
})
it("renders the only observed value as a visible dot", () => {
  const { container } = render(
    <DetailChart
      points={[
        { date: "2025-03-01", value: 0 },
        { date: "2025-03-02", value: null },
      ]}
      title="Burn"
    />
  )
  expect(
    Number(container.querySelector("circle")?.getAttribute("r"))
  ).toBeGreaterThan(0)
})
it("uses the borrowing icon in the Copilot pill", () => {
  const { container } = render(<CopilotEntityIcon kind="borrowing" />)
  expect(container.querySelector(".lucide-hand-coins")).toBeTruthy()
})

it("groups ledger days, marks partial counts and debounces search and clear", async () => {
  page("account")
  await screen.findByText("3+")
  const days = screen.getAllByRole("heading", { level: 3, name: /2025/ })
  expect(days).toHaveLength(2)
  const firstDay = within(
    screen.getByRole("region", { name: days[0].textContent! })
  )
  expect(firstDay.getByText("Meals")).toBeTruthy()
  expect(firstDay.getByText("Net")).toBeTruthy()
  expect(firstDay.getByText("-$10.50")).toBeTruthy()
  expect(
    within(
      screen.getByRole("region", { name: days[1].textContent! })
    ).getByText("Third entry")
  ).toBeTruthy()
  const input = screen.getByRole("textbox")
  list.mockClear()
  fireEvent.change(input, { target: { value: "ren" } })
  fireEvent.change(input, { target: { value: "rent" } })
  expect(list).not.toHaveBeenCalled()
  await waitFor(() =>
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ searchQuery: "rent" })
    )
  )
  expect(list).not.toHaveBeenCalledWith(
    expect.objectContaining({ searchQuery: "ren" })
  )
  fireEvent.click(screen.getByRole("button", { name: /clear/i }))
  expect((input as HTMLInputElement).value).toBe("")
  await waitFor(() =>
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ searchQuery: "" })
    )
  )
})
it("places the category tile before the title and marks overspending", () => {
  overrides.spent = "1200"
  page("budget")
  expect(
    screen
      .getByRole("heading", { name: "Meals" })
      .previousElementSibling?.querySelector("svg")
  ).toBeTruthy()
  expect(screen.getByText("$2.00").classList.contains("text-destructive")).toBe(
    true
  )
})
it("rests on the latest observation while keeping the chosen bar outlined", () => {
  render(
    <DetailChart
      title="History"
      currency="USD"
      bars
      onSelect={vi.fn()}
      activeDate="2025-03-01"
      points={[
        { date: "2025-03-01", value: 100 },
        { date: "2025-03-02", value: 200 },
        { date: "2025-03-03", value: null },
      ]}
    />
  )
  const output = screen.getByRole("status")
  const first = screen.getAllByRole("button")[0]
  expect(first.getAttribute("aria-pressed")).toBe("true")
  expect(first.previousElementSibling?.hasAttribute("stroke")).toBe(true)
  expect(output.textContent).toContain("$2.00")
  fireEvent.mouseEnter(first)
  expect(output.textContent).toContain("$1.00")
  fireEvent.mouseLeave(screen.getByRole("group"))
  expect(output.textContent).toContain("$2.00")
})

it("passes period bounds and removable facets to the account ledger", async () => {
  HTMLElement.prototype.scrollIntoView = vi.fn()
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    }
  )
  page("account")
  const requested = (req: object) =>
    waitFor(() =>
      expect(list).toHaveBeenCalledWith(
        expect.objectContaining({ accountId: "id", pageSize: 40, ...req })
      )
    )
  await requested({ startDate: undefined, endDate: undefined })
  fireEvent.click(screen.getByRole("button", { name: "Previous month" }))
  await requested({
    startDate: expect.stringMatching(/T/),
    endDate: expect.stringMatching(/T/),
  })
  for (const [facet, value] of [
    ["Type", "Expense"],
    ["Budget", "Meals"],
  ]) {
    fireEvent.click(screen.getByRole("button", { name: "Filter transactions" }))
    fireEvent.click(await screen.findByRole("option", { name: facet }))
    fireEvent.click(await screen.findByRole("option", { name: value }))
  }
  await requested({ types: ["EXPENSE"], budgetId: "b" })
  list.mockClear()
  fireEvent.click(screen.getByRole("button", { name: "Remove type filter" }))
  await requested({ types: undefined, budgetId: "b" })
  fireEvent.click(screen.getByRole("button", { name: "Remove budget filter" }))
  await requested({ types: undefined, budgetId: undefined })
})

it("displays hydrated archived account pills on budget detail rows", async () => {
  const prevImpl = list.getMockImplementation()
  list.mockImplementation(async () => ({
    nextPageToken: undefined,
    transactions: [
      {
        id: "archived-tx",
        description: "Old card charge",
        type: "EXPENSE",
        amount: "2500",
        currency: "USD",
        accountId: "archived-acc",
        account: { id: "archived-acc", name: "Archived Card" },
        transactionDate: "2025-02-02T12:00:00Z",
      } as never,
    ],
  }))
  try {
    page("budget")
    expect(await screen.findByText("Archived Card")).toBeTruthy()
  } finally {
    if (prevImpl) list.mockImplementation(prevImpl)
  }
})

it("opens budget detail on Transactions, switches to Analytics, and preserves tab when selecting a history bar", async () => {
  overrides.budgetCurrency = "EUR"
  overrides.budgetDefaultAccountId = "bank"
  overrides.exchangeRateToBase = 1.25
  page("budget")
  expect(
    screen.getByRole("tab", { name: /Transactions/, selected: true })
  ).toBeTruthy()
  expect(screen.getByText("EUR")).toBeTruthy()
  expect(screen.getByText("Default Account: Linked account")).toBeTruthy()
  expect(screen.getByText("$5.00")).toBeTruthy()
  expect(
    screen.queryByRole("group", {
      name: "Cumulative spending vs. ideal pace",
    })
  ).toBeNull()
  fireEvent.click(screen.getByRole("tab", { name: "Analytics" }))
  expect(
    await screen.findByRole("group", {
      name: "Cumulative spending vs. ideal pace",
    })
  ).toBeTruthy()
  const historyGroup = await screen.findByRole("group", {
    name: "Spending vs. limit by period",
  })
  const bars = within(historyGroup).getAllByRole("button")
  expect(bars).toHaveLength(2)
  expect(bars[1].getAttribute("aria-pressed")).toBe("true")
  fireEvent.click(bars[0])
  await waitFor(() => expect(bars[0].getAttribute("aria-pressed")).toBe("true"))
  expect(
    screen.getByRole("tab", { name: "Analytics", selected: true })
  ).toBeTruthy()
  expect(screen.getByText("Closed summary")).toBeTruthy()
})

it("filters budget detail expenses by Account via + Filter popover and removes the chip", async () => {
  HTMLElement.prototype.scrollIntoView = vi.fn()
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    }
  )
  page("budget")
  const requested = (req: object) =>
    waitFor(() =>
      expect(list).toHaveBeenCalledWith(
        expect.objectContaining({
          budgetId: "id",
          types: ["EXPENSE"],
          pageSize: 40,
          ...req,
        })
      )
    )
  await requested({ accountId: undefined })
  fireEvent.click(screen.getByRole("button", { name: "Filter transactions" }))
  fireEvent.click(await screen.findByRole("option", { name: /Linked account/ }))
  await requested({ accountId: "bank" })
  list.mockClear()
  fireEvent.click(screen.getByRole("button", { name: "Remove account filter" }))
  await requested({ accountId: undefined })
})

it("keeps budget header mounted on stepped period error and recovers to current period", async () => {
  overrides.periodError = true
  page("budget")
  expect(screen.getByRole("heading", { name: "Meals" })).toBeTruthy()
  fireEvent.click(screen.getByRole("button", { name: "Previous period" }))
  const alert = await screen.findByRole("alert")
  expect(screen.getByRole("heading", { name: "Meals" })).toBeTruthy()
  expect(screen.queryByRole("progressbar", { name: "Meals" })).toBeNull()
  fireEvent.click(within(alert).getByRole("button", { name: "Current Period" }))
  expect(await screen.findByRole("progressbar", { name: "Meals" })).toBeTruthy()
  expect(screen.queryByRole("alert")).toBeNull()
})

it("renders cross-currency remaining preview and emerald LENT styling on borrowing detail", () => {
  overrides.borrowingCurrency = "EUR"
  overrides.borrowingDirection = "LENT"
  overrides.exchangeRates = [
    {
      fromCurrency: "EUR",
      toCurrency: "USD",
      rate: 1.25,
      rateDate: "2025-02-01",
    },
  ]
  page("borrowing")
  const heading = screen.getByRole("heading", { name: "Alex" })
  expect(
    heading.previousElementSibling?.classList.contains("text-success")
  ).toBe(true)
  expect(screen.getByText("EUR")).toBeTruthy()
  expect(screen.getByText("$7.50")).toBeTruthy()
  expect(
    screen
      .getByRole("progressbar")
      .firstElementChild?.classList.contains("bg-success")
  ).toBe(true)
})

it("filters borrowing detail transactions by Account via + Filter popover and removes the chip", async () => {
  HTMLElement.prototype.scrollIntoView = vi.fn()
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    }
  )
  page("borrowing")
  const requested = (req: object) =>
    waitFor(() =>
      expect(list).toHaveBeenCalledWith(
        expect.objectContaining({
          borrowingId: "id",
          pageSize: 40,
          ...req,
        })
      )
    )
  await requested({ accountId: undefined })
  fireEvent.click(screen.getByRole("button", { name: "Filter transactions" }))
  fireEvent.click(await screen.findByRole("option", { name: /Linked account/ }))
  await requested({ accountId: "bank" })
  list.mockClear()
  fireEvent.click(screen.getByRole("button", { name: "Remove account filter" }))
  await requested({ accountId: undefined })
})

it("clears inspected budget transaction when stepping periods and stays closed on return", async () => {
  page("budget")
  fireEvent.click(
    await screen.findByRole("button", { name: /Outgoing transfer/ })
  )
  expect(await screen.findByRole("complementary")).toBeTruthy()
  fireEvent.click(screen.getByRole("button", { name: "Previous period" }))
  await waitFor(() => expect(screen.queryByRole("complementary")).toBeNull())
  fireEvent.click(screen.getByRole("button", { name: "Current Period" }))
  await screen.findByRole("button", { name: /Outgoing transfer/ })
  expect(screen.queryByRole("complementary")).toBeNull()
})

it("escalates budget progress bar fill to warning at 85% spend", () => {
  overrides.spent = "900"
  page("budget")
  const fill = screen.getByRole("progressbar", { name: "Meals" })
    .firstElementChild as HTMLElement
  expect(fill.style.backgroundColor).toBe("var(--warning)")
})
