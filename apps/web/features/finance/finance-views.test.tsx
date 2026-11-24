import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { TimezoneProvider } from "@saturn/hooks"
import * as financeApi from "@saturn/api/gen/saturn/finance/v1/finance"
import * as spaceHooks from "@/features/space/use-space"
import { CurrencyCombobox } from "./components/currency-combobox"
import { BudgetPeriodProgress } from "./components/budget-period-progress"
import { AccountsView } from "./accounts-view"
import { BudgetsView } from "./budgets-view"
import { TransactionsView } from "./transactions-view"
import { InsightsView } from "./insights-view"
import { InboxView } from "./inbox-view"

const mockNavigate = vi.fn()

vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>("react-router-dom")
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock("@saturn/api/gen/saturn/finance/v1/finance", () => ({
  useListCurrenciesQuery: vi.fn(),
  useGetSettingsQuery: vi.fn(),
  useListBudgetsQuery: vi.fn(),
  useListAccountsQuery: vi.fn(),
  useListExchangeRatesQuery: vi.fn(),
  useListTransactionsQuery: vi.fn(),
  useListTransactionEventsQuery: vi.fn(),
  useListInboxItemsQuery: vi.fn(),
  useListInstitutionsQuery: vi.fn(),
  useListTransfersQuery: vi.fn(),
  useGetInsightsQuery: vi.fn(),
  useSetupMutation: vi.fn(),
  useDeleteBudgetMutation: vi.fn(),
  useUpdateBudgetMutation: vi.fn(),
  useDeleteTransactionMutation: vi.fn(),
  useCreateBudgetMutation: vi.fn(),
  useUpdateAccountMutation: vi.fn(),
  useCreateAccountMutation: vi.fn(),
  useDeleteAccountMutation: vi.fn(),
  useAdjustAccountBalanceMutation: vi.fn(),
  useCreateInstitutionMutation: vi.fn(),
  useCreateExpenseMutation: vi.fn(),
  useUpdateExpenseMutation: vi.fn(),
  useCreateIncomeMutation: vi.fn(),
  useUpdateIncomeMutation: vi.fn(),
  useCreateTransferMutation: vi.fn(),
  useApproveInboxItemMutation: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useDiscardInboxItemMutation: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useUpdateInboxItemMutation: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useListScheduledTransactionsQuery: () => ({
    data: { scheduledTransactions: [] },
    isLoading: false,
  }),
  useListBorrowingsQuery: () => ({
    data: { borrowings: [] },
    isLoading: false,
  }),
}))

vi.mock("@/features/space/use-space", () => ({
  useActiveSpaceContext: vi.fn(),
  useSpacePermissions: vi.fn(),
  resolveSpacePath: (url: string, spaceId: string, requiresSpace = false) =>
    requiresSpace && spaceId ? `/space/${spaceId}${url}` : url,
}))

vi.mock("@saturn/hooks/ai", () => ({
  useRegisterCopilotView: vi.fn(),
  useCopilotAttachment: () => ({
    isCopilotOpen: false,
    pinnedItems: [],
    attachItem: vi.fn(),
    detachItem: vi.fn(),
    toggleItem: vi.fn(),
    isPinned: () => false,
  }),
}))

function wrapWithProviders(
  ui: React.ReactElement,
  initialEntries: string[] = ["/space/spc_1/finance"],
  locale = "en-US"
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <TimezoneProvider timezone="UTC" locale={locale}>
        <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
      </TimezoneProvider>
    </QueryClientProvider>
  )
}

describe("Phase 2 Web Finance Views", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date("2026-04-16T12:00:00Z"))
    window.HTMLElement.prototype.scrollIntoView = vi.fn()
    globalThis.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }

    vi.mocked(spaceHooks.useActiveSpaceContext).mockReturnValue({
      spaceId: "spc_1",
      spaceName: "Personal",
      spaceRole: "owner",
      timezone: "UTC",
      activeSpace: null,
      userPreferences: {
        regional: { locale: "en-US", hourCycle: "h12", weekStartsOn: 0 },
        mail: { autoLoadRemoteContent: false },
        calendar: { webView: "month", mobileView: "agenda" },
      },
      updateUserPreferences: vi.fn(),
      switchSpace: vi.fn(),
      clearActiveSpace: vi.fn(),
      isLoading: false,
    })

    vi.mocked(spaceHooks.useSpacePermissions).mockReturnValue({
      spaceId: "spc_1",
      spaceRole: "owner",
      isWritable: true,
      canManageSpace: true,
    })

    vi.mocked(financeApi.useGetSettingsQuery).mockReturnValue({
      data: { baseCurrency: "USD" },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as never)

    vi.mocked(financeApi.useListCurrenciesQuery).mockReturnValue({
      data: {
        currencies: [
          { code: "USD", name: "US Dollar" },
          { code: "EUR", name: "Euro" },
          { code: "DOP", name: "Dominican Peso" },
        ],
      },
    } as never)

    vi.mocked(financeApi.useListExchangeRatesQuery).mockReturnValue({
      data: { exchangeRates: [] },
    } as never)

    vi.mocked(financeApi.useListAccountsQuery).mockReturnValue({
      data: {
        accounts: [
          {
            id: "acc_1",
            name: "Main Checking",
            type: "BANK",
            currency: "USD",
            isActive: true,
          },
        ],
      },
    } as never)

    vi.mocked(financeApi.useListInstitutionsQuery).mockReturnValue({
      data: { institutions: [] },
    } as never)

    vi.mocked(financeApi.useListTransfersQuery).mockReturnValue({
      data: { transfers: [] },
      refetch: vi.fn(),
    } as never)

    vi.mocked(financeApi.useListInboxItemsQuery).mockReturnValue({
      data: { inboxItems: [] },
    } as never)

    vi.mocked(financeApi.useListTransactionsQuery).mockReturnValue({
      data: { transactions: [] },
      isLoading: false,
      refetch: vi.fn(),
    } as never)

    vi.mocked(financeApi.useListTransactionEventsQuery).mockReturnValue({
      data: { events: [] },
      isLoading: false,
    } as never)

    vi.mocked(financeApi.useDeleteBudgetMutation).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never)

    vi.mocked(financeApi.useUpdateBudgetMutation).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never)

    vi.mocked(financeApi.useDeleteTransactionMutation).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never)

    vi.mocked(financeApi.useCreateBudgetMutation).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never)

    vi.mocked(financeApi.useUpdateAccountMutation).mockReturnValue({
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      isPending: false,
    } as never)

    vi.mocked(financeApi.useCreateAccountMutation).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never)

    vi.mocked(financeApi.useDeleteAccountMutation).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never)

    vi.mocked(financeApi.useAdjustAccountBalanceMutation).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never)

    vi.mocked(financeApi.useCreateInstitutionMutation).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never)

    vi.mocked(financeApi.useCreateExpenseMutation).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never)

    vi.mocked(financeApi.useUpdateExpenseMutation).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never)

    vi.mocked(financeApi.useCreateIncomeMutation).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never)

    vi.mocked(financeApi.useUpdateIncomeMutation).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never)

    vi.mocked(financeApi.useCreateTransferMutation).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never)
  })

  afterEach(() => {
    vi.useRealTimers()
    cleanup()
  })

  it("CurrencyCombobox searches by name/code and updates selection", async () => {
    const onValueChange = vi.fn()
    wrapWithProviders(
      <CurrencyCombobox value="USD" onValueChange={onValueChange} />
    )

    fireEvent.click(screen.getByRole("combobox"))

    const searchInput = await screen.findByPlaceholderText(
      /Search currency code or name/i
    )
    fireEvent.change(searchInput, { target: { value: "Dominican" } })

    const dopItem = await screen.findByText("Dominican Peso")
    fireEvent.click(dopItem)

    expect(onValueChange).toHaveBeenCalledWith("DOP")
  })

  it("BudgetPeriodProgress renders Today pace tick for recurring budgets and omits it for ONE_TIME", () => {
    const recurringBudget: financeApi.Budget = {
      id: "bgt_1",
      name: "Groceries",
      limitAmount: "100000",
      currency: "USD",
      interval: "MONTHLY",
      status: "ACTIVE",
      icon: "shopping-cart",
      color: "teal",
      currentPeriod: {
        startDate: "2026-04-01T00:00:00Z",
        endDate: "2026-04-30T23:59:59Z",
        spentAmount: "40000",
        spentInBase: "40000",
        limitInBase: "100000",
        baseCurrency: "USD",
        exchangeRateToBase: 1,
      },
    }

    const { rerender } = wrapWithProviders(
      <BudgetPeriodProgress budget={recurringBudget} />
    )

    const tick = screen.getByTestId("budget-pace-tick")
    expect(tick).toBeTruthy()
    expect(tick.getAttribute("aria-label")).toMatch(/Today pace marker at 5\d%/)

    const oneTimeBudget: financeApi.Budget = {
      ...recurringBudget,
      id: "bgt_2",
      interval: "ONE_TIME",
    }

    rerender(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <TimezoneProvider timezone="UTC" locale="en-US">
          <BudgetPeriodProgress budget={oneTimeBudget} />
        </TimezoneProvider>
      </QueryClientProvider>
    )

    expect(screen.queryByTestId("budget-pace-tick")).toBeNull()

    const pastCurrentYearBudget: financeApi.Budget = {
      ...recurringBudget,
      id: "bgt_3",
      currentPeriod: {
        startDate: "2026-03-01T00:00:00Z",
        endDate: "2026-03-31T23:59:59Z",
        spentAmount: "40000",
        spentInBase: "40000",
        limitInBase: "100000",
        baseCurrency: "USD",
        exchangeRateToBase: 1,
      },
    }

    rerender(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <TimezoneProvider timezone="UTC" locale="en-US">
          <BudgetPeriodProgress budget={pastCurrentYearBudget} />
        </TimezoneProvider>
      </QueryClientProvider>
    )

    expect(screen.getByText(/Mar 1 - Mar 31/)).toBeTruthy()
    expect(screen.queryByText(/2026/)).toBeNull()
  })

  it("BudgetsView renders Period Summary KPIs and switches between Grid and Table layouts", () => {
    vi.mocked(financeApi.useListBudgetsQuery).mockReturnValue({
      data: {
        budgets: [
          {
            id: "bgt_1",
            name: "Dining Out",
            limitAmount: "50000",
            currency: "USD",
            interval: "MONTHLY",
            status: "ACTIVE",
            icon: "utensils",
            color: "teal",
            defaultAccountId: "acc_1",
            currentPeriod: {
              startDate: "2026-04-01T00:00:00Z",
              endDate: "2026-04-30T23:59:59Z",
              spentAmount: "20000",
              spentInBase: "20000",
              limitInBase: "50000",
              baseCurrency: "USD",
              exchangeRateToBase: 1,
            },
          },
        ],
      },
    } as never)

    wrapWithProviders(<BudgetsView />, ["/space/spc_1/finance/budgets"])

    expect(screen.getByText("Total Budgeted")).toBeTruthy()
    expect(screen.getByText("Total Spent")).toBeTruthy()
    expect(screen.getByText("Remaining & Pace")).toBeTruthy()
    expect(screen.queryByText("Base Workspace Currency")).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Table view" }))
    expect(screen.getByRole("table")).toBeTruthy()
    expect(screen.getByText("Dining Out")).toBeTruthy()
  })

  it("TransactionsView defaults to This Month, steps months, picks from month grid, toggles faceted + Filter chips, and omits dates for All Time", async () => {
    vi.mocked(financeApi.useListBudgetsQuery).mockReturnValue({
      data: {
        budgets: [
          {
            id: "bgt_1",
            name: "Groceries",
            limitAmount: "50000",
            currency: "USD",
            interval: "MONTHLY",
            status: "ACTIVE",
            icon: "shopping-cart",
            color: "teal",
          },
        ],
      },
      refetch: vi.fn(),
    } as never)

    const allMockTransactions: financeApi.Transaction[] = [
      {
        id: "txn_today",
        type: "EXPENSE",
        budgetId: "bgt_1",
        periodId: "per_1",
        amount: "2500",
        amountInBase: "2500",
        currency: "USD",
        description: "Whole Foods Market",
        transactionDate: "2026-04-16T10:00:00Z",
        effectiveDate: "2026-04-16T10:00:00Z",
        accountId: "acc_1",
        metadata: {},
      },
      {
        id: "txn_old",
        type: "EXPENSE",
        budgetId: "bgt_1",
        periodId: "per_1",
        amount: "9000",
        amountInBase: "9000",
        currency: "USD",
        description: "Old March Receipt",
        transactionDate: "2026-03-10T10:00:00Z",
        effectiveDate: "2026-03-10T10:00:00Z",
        accountId: "acc_1",
        metadata: {},
      },
    ]

    vi.mocked(financeApi.useListTransactionsQuery).mockImplementation(
      (req) =>
        ({
          data: {
            transactions: allMockTransactions.filter((t) => {
              const ts = new Date(t.transactionDate || "").getTime()
              if (req.startDate && ts < new Date(req.startDate).getTime()) {
                return false
              }
              if (req.endDate && ts > new Date(req.endDate).getTime()) {
                return false
              }
              return true
            }),
          },
          isLoading: false,
          refetch: vi.fn(),
        }) as never
    )

    vi.mocked(financeApi.useListTransactionEventsQuery).mockReturnValue({
      data: {
        events: [
          {
            id: "evt_1",
            eventType: "MANUAL_EDIT",
            createTime: "2026-04-16T10:05:00Z",
            metadata: JSON.stringify({ source: "web" }),
          },
        ],
      },
      isLoading: false,
    } as never)

    wrapWithProviders(<TransactionsView />, [
      "/space/spc_1/finance/transactions",
    ])

    // Defaults to This Month (April 2026) with RFC3339 startDate/endDate
    const initialCall = vi.mocked(financeApi.useListTransactionsQuery).mock
      .calls[0]?.[0]
    expect(initialCall?.startDate).toBe("2026-04-01T00:00:00.000Z")
    expect(initialCall?.endDate).toBe("2026-04-30T23:59:59.999Z")
    expect(screen.getByText("April 2026")).toBeTruthy()
    expect(screen.getByText("Whole Foods Market")).toBeTruthy()
    expect(screen.queryByText("Old March Receipt")).toBeNull()
    expect(screen.getByText("Today")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Reset" })).toBeNull()

    // Click row to open in-flow WorkspaceInspectorPanel
    fireEvent.click(screen.getByText("Whole Foods Market"))
    const inspector = await screen.findByRole("complementary")
    expect(inspector).toBeTruthy()
    expect(screen.getByText("Audit trail & events")).toBeTruthy()
    expect(screen.getByText("Manual Modification")).toBeTruthy()

    // Step backward to March 2026 via Previous month button
    fireEvent.click(screen.getByRole("button", { name: "Previous month" }))
    await waitFor(() => {
      expect(screen.getByText("March 2026")).toBeTruthy()
      const call = vi
        .mocked(financeApi.useListTransactionsQuery)
        .mock.calls.at(-1)?.[0]
      expect(call?.startDate).toBe("2026-03-01T00:00:00.000Z")
      expect(call?.endDate).toBe("2026-03-31T23:59:59.999Z")
    })
    expect(screen.getByText("Old March Receipt")).toBeTruthy()
    expect(screen.queryByText("Whole Foods Market")).toBeNull()

    // Open period picker popover and select Jan from the quick month grid
    fireEvent.click(screen.getByRole("button", { name: "Select period" }))
    const janBtn = await screen.findByRole("button", { name: "Jan" })
    fireEvent.click(janBtn)
    await waitFor(() => {
      expect(screen.getByText("January 2026")).toBeTruthy()
      const call = vi
        .mocked(financeApi.useListTransactionsQuery)
        .mock.calls.at(-1)?.[0]
      expect(call?.startDate).toBe("2026-01-01T00:00:00.000Z")
      expect(call?.endDate).toBe("2026-01-31T23:59:59.999Z")
    })

    // Switch to All Time and verify startDate/endDate are undefined (omitted from GET params)
    fireEvent.click(screen.getByRole("button", { name: "Select period" }))
    const allTimeBtn = await screen.findByRole("button", { name: "All Time" })
    fireEvent.click(allTimeBtn)
    await waitFor(() => {
      expect(screen.getByText("All Time")).toBeTruthy()
      const call = vi
        .mocked(financeApi.useListTransactionsQuery)
        .mock.calls.at(-1)?.[0]
      expect(call?.startDate).toBeUndefined()
      expect(call?.endDate).toBeUndefined()
    })

    // Add Type: Expense via the slim + Filter faceted popover
    fireEvent.click(screen.getByRole("button", { name: "Filter transactions" }))
    const typeDimension = await screen.findByRole("option", { name: /^Type/i })
    fireEvent.click(typeDimension)
    const expenseOption = await screen.findByRole("option", { name: "Expense" })
    fireEvent.click(expenseOption)

    await waitFor(() => {
      const call = vi
        .mocked(financeApi.useListTransactionsQuery)
        .mock.calls.at(-1)?.[0]
      expect(call?.types).toEqual(["EXPENSE"])
    })
    expect(
      screen.getByRole("button", { name: "Remove type filter" })
    ).toBeTruthy()

    // Remove the active filter chip
    fireEvent.click(screen.getByRole("button", { name: "Remove type filter" }))
    await waitFor(() => {
      const call = vi
        .mocked(financeApi.useListTransactionsQuery)
        .mock.calls.at(-1)?.[0]
      expect(call?.types).toBeUndefined()
    })
    expect(
      screen.queryByRole("button", { name: "Remove type filter" })
    ).toBeNull()
  })

  it("InsightsView defaults to This Month, steps months, switches to All Time with empty strings, and drills down via SVG chart", async () => {
    vi.mocked(financeApi.useGetInsightsQuery).mockReturnValue({
      data: {
        spent: {
          totalLimit: "100000",
          totalSpent: "45000",
          remainingBudget: "55000",
          burnRate: 1500,
          trend: [
            {
              label: "Apr 2026",
              startDate: "2026-04-01T00:00:00Z",
              amountInBase: "45000",
              transactionCount: 3,
              contributions: [
                {
                  budgetId: "bgt_1",
                  budgetName: "Groceries",
                  budgetColor: "teal",
                  amountInBase: "45000",
                  amountInLocal: "45000",
                  localCurrency: "USD",
                  contributionPercentage: 100,
                },
              ],
            },
          ],
          distributions: [
            {
              budgetId: "bgt_1",
              budgetName: "Groceries",
              budgetColor: "teal",
              budgetIcon: "shopping-cart",
              limit: "100000",
              spent: "45000",
              spentInBase: "45000",
              usagePercentage: 45,
            },
          ],
          topExpenses: [],
        },
        income: {
          totalIncome: "120000",
          trend: [
            {
              label: "Apr 2026",
              startDate: "2026-04-01T00:00:00Z",
              amountInBase: "120000",
              transactionCount: 1,
              contributions: [],
            },
          ],
          distributions: [],
          topIncomes: [],
        },
      },
      isLoading: false,
      isPending: false,
      error: null,
    } as never)

    wrapWithProviders(<InsightsView />, ["/space/spc_1/finance"])

    const firstCallArgs = vi.mocked(financeApi.useGetInsightsQuery).mock
      .calls[0]?.[0]
    expect(firstCallArgs?.granularity).toBe("DAILY")
    expect(firstCallArgs?.startDate).toBe("2026-04-01T00:00:00.000Z")
    expect(firstCallArgs?.endDate).toBe("2026-04-30T23:59:59.999Z")
    expect(screen.getByText("April 2026")).toBeTruthy()

    // Verify native SVG chart renders with accessible role
    expect(
      screen.getByRole("img", { name: /Cash flow comparison chart/i })
    ).toBeTruthy()

    // Click period bar group to drill down to TransactionsView
    const periodBar = screen.getByRole("button", { name: /Apr 2026/i })
    fireEvent.click(periodBar)

    expect(mockNavigate).toHaveBeenCalledWith(
      "/space/spc_1/finance/transactions?dateFrom=2026-04-01&dateTo=2026-04-01"
    )

    // Step backward to March 2026 via Previous month button
    fireEvent.click(screen.getByRole("button", { name: "Previous month" }))
    await waitFor(() => {
      expect(screen.getByText("March 2026")).toBeTruthy()
      const call = vi
        .mocked(financeApi.useGetInsightsQuery)
        .mock.calls.at(-1)?.[0]
      expect(call?.startDate).toBe("2026-03-01T00:00:00.000Z")
      expect(call?.endDate).toBe("2026-03-31T23:59:59.999Z")
      expect(call?.granularity).toBe("DAILY")
    })

    // Switch to All Time preset inside period picker and verify empty startDate/endDate
    fireEvent.click(screen.getByRole("button", { name: "Select period" }))
    const allTimeBtn = await screen.findByRole("button", { name: "All Time" })
    fireEvent.click(allTimeBtn)
    await waitFor(() => {
      const latestCall = vi
        .mocked(financeApi.useGetInsightsQuery)
        .mock.calls.at(-1)?.[0]
      expect(latestCall?.startDate).toBe("")
      expect(latestCall?.endDate).toBe("")
      expect(latestCall?.granularity).toBe("MONTHLY")
    })
  })

  it("InsightsView renders localized text in Spanish under locale='es-ES'", async () => {
    vi.mocked(financeApi.useGetInsightsQuery).mockReturnValue({
      data: {
        spent: {
          totalLimit: "100000",
          totalSpent: "45000",
          remainingBudget: "55000",
          burnRate: 1500,
          trend: [
            {
              label: "Abr 2026",
              startDate: "2026-04-01T00:00:00Z",
              amountInBase: "45000",
              transactionCount: 3,
              contributions: [
                {
                  budgetId: "bgt_1",
                  budgetName: "Alimentos",
                  budgetColor: "teal",
                  amountInBase: "45000",
                  amountInLocal: "45000",
                  localCurrency: "USD",
                  contributionPercentage: 100,
                },
              ],
            },
          ],
          distributions: [
            {
              budgetId: "bgt_1",
              budgetName: "Alimentos",
              budgetColor: "teal",
              budgetIcon: "shopping-cart",
              limit: "100000",
              spent: "45000",
              spentInBase: "45000",
              usagePercentage: 45,
            },
          ],
          topExpenses: [
            {
              transactionId: "txn_1",
              description: "Supermercado",
              amount: "45000",
              amountInBase: "45000",
              currency: "USD",
              budgetName: "Alimentos",
              transactionDate: "2026-04-10T12:00:00Z",
            },
          ],
        },
        income: {
          totalIncome: "120000",
          trend: [
            {
              label: "Abr 2026",
              startDate: "2026-04-01T00:00:00Z",
              amountInBase: "120000",
              transactionCount: 1,
              contributions: [
                {
                  accountId: "acc_1",
                  accountName: "Nómina",
                  amountInBase: "120000",
                  amountInLocal: "120000",
                  localCurrency: "USD",
                  contributionPercentage: 100,
                },
              ],
            },
          ],
          distributions: [
            {
              name: "Nómina Principal",
              amount: "120000",
              percentage: 100,
            },
          ],
          topIncomes: [
            {
              transactionId: "txn_inc_1",
              description: "Salario mensual",
              amount: "120000",
              amountInBase: "120000",
              currency: "USD",
              transactionDate: "2026-04-01T12:00:00Z",
            },
          ],
        },
      },
      isLoading: false,
      isPending: false,
      error: null,
    } as never)

    wrapWithProviders(<InsightsView />, ["/space/spc_1/finance"], "es-ES")

    // Page title and layout
    expect(screen.getAllByText("Análisis").length).toBeGreaterThan(0)
    expect(
      screen.getByText(
        "Tendencias financieras, ritmo del flujo de caja y distribución de categorías."
      )
    ).toBeTruthy()

    // Stream tabs in Spanish
    expect(screen.getByRole("tab", { name: /Flujo de caja/i })).toBeTruthy()
    expect(screen.getByRole("tab", { name: /Gastos/i })).toBeTruthy()
    expect(screen.getByRole("tab", { name: /Ingresos/i })).toBeTruthy()

    // Cash flow metrics in Spanish
    expect(screen.getByText("Ahorro neto")).toBeTruthy()
    expect(screen.getByText("Tasa de ahorro")).toBeTruthy()
    expect(screen.getByText("Ingreso total")).toBeTruthy()
    expect(screen.getByText("Gasto total")).toBeTruthy()

    // Chart header & granularity buttons in Spanish
    expect(screen.getByText("Comparación de flujo de caja")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Diario" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Semanal" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Mensual" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Anual" })).toBeTruthy()

    // Native SVG chart in Spanish
    expect(
      screen.getByRole("img", {
        name: /Gráfico comparativo de flujo de caja/i,
      })
    ).toBeTruthy()

    // Switch to Gastos tab
    fireEvent.click(screen.getByRole("tab", { name: /Gastos/i }))
    expect(screen.getByText("Límite activo")).toBeTruthy()
    expect(screen.getByText("Restante")).toBeTruthy()
    expect(screen.getByText("Ritmo de gasto diario")).toBeTruthy()
    expect(screen.getByText("Asignaciones de presupuesto")).toBeTruthy()
    expect(screen.getByText("Mayores gastos")).toBeTruthy()
    expect(screen.getByText("Supermercado")).toBeTruthy()

    // Switch to Ingresos tab
    fireEvent.click(screen.getByRole("tab", { name: /Ingresos/i }))
    expect(screen.getByText("Principal fuente de ingresos")).toBeTruthy()
    expect(screen.getByText("Desglose de fuentes de ingresos")).toBeTruthy()
    expect(screen.getByText("Mayores ingresos")).toBeTruthy()
    expect(screen.getByText("Salario mensual")).toBeTruthy()
  })

  it("TransactionsView renders localized text in Spanish under locale='es-ES'", async () => {
    vi.mocked(financeApi.useListTransactionsQuery).mockReturnValue({
      data: {
        transactions: [
          {
            id: "txn_1",
            description: "Supermercado El Sol",
            amount: "4500",
            currency: "USD",
            type: "EXPENSE",
            transactionDate: "2026-04-16T10:00:00Z",
            budgetId: "bgt_1",
            accountId: "acc_1",
            metadata: { recurring_transaction_id: "rec_1" },
          },
        ],
        nextPageToken: "",
      },
      isLoading: false,
    } as never)

    vi.mocked(financeApi.useListTransactionEventsQuery).mockReturnValue({
      data: {
        events: [
          {
            id: "evt_1",
            eventType: "MANUAL_EDIT",
            createTime: "2026-04-16T10:05:00Z",
            metadata: JSON.stringify({ source: "web" }),
          },
        ],
      },
      isLoading: false,
    } as never)

    wrapWithProviders(
      <TransactionsView />,
      ["/space/spc_1/finance/transactions"],
      "es-ES"
    )

    // Page layout and title in Spanish
    expect(screen.getAllByText("Transacciones").length).toBeGreaterThan(0)
    expect(
      screen.getByText(
        "Consulta el historial del libro mayor, revisa conversiones de cambio y gestiona gastos."
      )
    ).toBeTruthy()

    // Top summary stats in Spanish
    expect(screen.getByText("Ingreso total")).toBeTruthy()
    expect(screen.getByText("Gasto total")).toBeTruthy()
    expect(screen.getByText("Prom. por gasto")).toBeTruthy()

    // Search and filter button in Spanish
    expect(screen.getByPlaceholderText("Buscar descripción…")).toBeTruthy()
    expect(
      screen.getByRole("button", { name: "Filtrar transacciones" })
    ).toBeTruthy()
    expect(screen.getByText("Filtrar")).toBeTruthy()

    // Transaction item badges in Spanish
    expect(screen.getByText("Supermercado El Sol")).toBeTruthy()
    expect(screen.getByText("Recurrente")).toBeTruthy()
    expect(screen.getByText("Gasto")).toBeTruthy()
    expect(screen.getByText("Neto")).toBeTruthy()

    // Click row to open Inspector panel in Spanish
    fireEvent.click(screen.getByText("Supermercado El Sol"))
    const inspector = await screen.findByRole("complementary")
    expect(inspector).toBeTruthy()
    expect(screen.getByText("Registro de auditoría y eventos")).toBeTruthy()
    expect(screen.getByText("Modificación manual")).toBeTruthy()
    expect(screen.getByText("Fecha de transacción")).toBeTruthy()
  })

  it("InboxView renders localized text in Spanish under locale='es-ES'", async () => {
    vi.mocked(financeApi.useListInboxItemsQuery).mockReturnValue({
      data: {
        inboxItems: [
          {
            id: "inb_1",
            docType: "RECEIPT",
            amount: "7500",
            currency: "USD",
            vendorName: "GitHub Enterprise",
            status: "PENDING",
            transactionDate: "2026-04-16T12:00:00Z",
          },
        ],
        nextPageToken: "",
      },
      isLoading: false,
      refetch: vi.fn(),
    } as never)

    wrapWithProviders(<InboxView />, ["/space/spc_1/finance/inbox"], "es-ES")

    // Layout and page header in Spanish
    expect(screen.getAllByText("Bandeja de revisión").length).toBeGreaterThan(0)
    expect(
      screen.getByText(
        "Verifica extractos bancarios, recibos y facturas pendientes en paralelo para revisar y registrar en el libro mayor."
      )
    ).toBeTruthy()

    // Left master panel in Spanish
    expect(screen.getByText("Elementos en cola (1)")).toBeTruthy()
    expect(
      screen.getByPlaceholderText("Buscar elementos en cola...")
    ).toBeTruthy()
    expect(screen.getAllByText("GitHub Enterprise").length).toBeGreaterThan(0)

    // Right detail panel in Spanish
    expect(screen.getByText("Clasificación del documento")).toBeTruthy()
    expect(
      screen.getByText("Vincular a transacción existente (Opcional)")
    ).toBeTruthy()
    expect(screen.getByText("Proveedor / Descripción")).toBeTruthy()
    expect(screen.getByText("Ajuste de importe")).toBeTruthy()
    expect(
      screen.getByRole("button", { name: "Descartar documento" })
    ).toBeTruthy()
    expect(screen.getByRole("button", { name: "Omitir" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Registrar gasto" })).toBeTruthy()
  })

  it("uses @container and container-query grids on BudgetsView, AccountsView, and TransactionsView when inspectors open", async () => {
    vi.mocked(financeApi.useListBudgetsQuery).mockReturnValue({
      data: {
        budgets: [
          {
            id: "bgt_1",
            name: "Dining Out",
            limitAmount: "50000",
            currency: "USD",
            interval: "MONTHLY",
            status: "ACTIVE",
            icon: "utensils",
            color: "teal",
            defaultAccountId: "acc_1",
            currentPeriod: {
              startDate: "2026-04-01T00:00:00Z",
              endDate: "2026-04-30T23:59:59Z",
              spentAmount: "20000",
              spentInBase: "20000",
              limitInBase: "50000",
              baseCurrency: "USD",
              exchangeRateToBase: 1,
            },
          },
        ],
      },
      refetch: vi.fn(),
    } as never)

    const { container: budgetsContainer, unmount: unmountBudgets } =
      wrapWithProviders(<BudgetsView />, ["/space/spc_1/finance/budgets"])

    const budgetsPane = budgetsContainer.querySelector(".\\@container")
    expect(budgetsPane).toBeTruthy()
    expect(budgetsPane?.className).toContain("min-w-0")
    expect(budgetsPane?.className).toContain("flex-1")
    expect(budgetsPane?.parentElement?.className).toContain("lg:items-start")
    expect(budgetsContainer.querySelector(".\\@xl\\:grid-cols-3")).toBeTruthy()
    expect(
      budgetsContainer.querySelector(
        ".\\@xl\\:grid-cols-2.\\@4xl\\:grid-cols-3"
      )
    ).toBeTruthy()

    fireEvent.click(screen.getByText("Dining Out"))
    expect(await screen.findByRole("complementary")).toBeTruthy()
    expect(budgetsContainer.querySelector(".\\@container")).toBeTruthy()
    expect(
      budgetsContainer.querySelector(
        ".\\@xl\\:grid-cols-2.\\@4xl\\:grid-cols-3"
      )
    ).toBeTruthy()
    unmountBudgets()

    vi.mocked(financeApi.useListAccountsQuery).mockReturnValue({
      data: {
        accounts: [
          {
            id: "acc_1",
            name: "Main Checking",
            type: "BANK",
            currency: "USD",
            currentBalance: "150000",
            isActive: true,
          },
        ],
      },
      refetch: vi.fn(),
    } as never)

    const { container: accountsContainer, unmount: unmountAccounts } =
      wrapWithProviders(<AccountsView />, ["/space/spc_1/finance/accounts"])

    const accountsPane = accountsContainer.querySelector(".\\@container")
    expect(accountsPane).toBeTruthy()
    expect(accountsPane?.className).toContain("min-w-0")
    expect(accountsPane?.className).toContain("flex-1")
    expect(accountsPane?.parentElement?.className).toContain("lg:items-start")
    expect(
      accountsContainer.querySelector(
        ".\\@md\\:grid-cols-2.\\@4xl\\:grid-cols-4"
      )
    ).toBeTruthy()
    expect(
      accountsContainer.querySelector(
        ".\\@xl\\:grid-cols-2.\\@4xl\\:grid-cols-3"
      )
    ).toBeTruthy()

    fireEvent.click(screen.getAllByText("Main Checking")[0])
    expect(await screen.findByRole("complementary")).toBeTruthy()
    expect(accountsContainer.querySelector(".\\@container")).toBeTruthy()
    expect(
      accountsContainer.querySelector(
        ".\\@md\\:grid-cols-2.\\@4xl\\:grid-cols-4"
      )
    ).toBeTruthy()
    unmountAccounts()

    vi.mocked(financeApi.useListTransactionsQuery).mockReturnValue({
      data: {
        transactions: [
          {
            id: "txn_1",
            type: "EXPENSE",
            budgetId: "bgt_1",
            amount: "2500",
            amountInBase: "2500",
            currency: "USD",
            description: "Whole Foods Market",
            transactionDate: "2026-04-16T10:00:00Z",
            effectiveDate: "2026-04-16T10:00:00Z",
            accountId: "acc_1",
            metadata: {},
          },
        ],
      },
      isLoading: false,
      refetch: vi.fn(),
    } as never)

    const { container: txContainer } = wrapWithProviders(<TransactionsView />, [
      "/space/spc_1/finance/transactions",
    ])

    const txPane = txContainer.querySelector(".\\@container")
    expect(txPane).toBeTruthy()
    expect(txPane?.className).toContain("min-w-0")
    expect(txPane?.className).toContain("flex-1")
    expect(txPane?.parentElement?.className).toContain("lg:items-start")
    expect(
      txContainer.querySelector(".grid-cols-2.\\@3xl\\:grid-cols-4")
    ).toBeTruthy()

    fireEvent.click(screen.getByText("Whole Foods Market"))
    expect(await screen.findByRole("complementary")).toBeTruthy()
    expect(txContainer.querySelector(".\\@container")).toBeTruthy()
    expect(
      txContainer.querySelector(".grid-cols-2.\\@3xl\\:grid-cols-4")
    ).toBeTruthy()
  })
})
