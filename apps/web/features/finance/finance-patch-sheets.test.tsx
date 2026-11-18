import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import * as financeApi from "@saturn/api/gen/saturn/finance/v1/finance"
import * as hooks from "@saturn/hooks"
import { CreateAccountSheet } from "./components/create-account-sheet"
import { CreateRecurringTransactionSheet } from "./components/create-recurring-transaction-sheet"
import { EditBudgetSheet } from "./components/edit-budget-sheet"
import { toast } from "@/components/ui/toast"

vi.mock("@saturn/api/gen/saturn/finance/v1/finance", () => ({
  useCreateAccountMutation: vi.fn(),
  useUpdateAccountMutation: vi.fn(),
  useCreateRecurringTransactionMutation: vi.fn(),
  useUpdateRecurringTransactionMutation: vi.fn(),
  useUpdateBudgetMutation: vi.fn(),
  useListCurrenciesQuery: vi.fn(),
  useListAccountsQuery: vi.fn(),
  useListInstitutionsQuery: vi.fn(),
  useCreateInstitutionMutation: vi.fn(),
}))

vi.mock("@saturn/hooks", async () => {
  const actual = await vi.importActual<typeof hooks>("@saturn/hooks")
  return {
    ...actual,
    invalidateFinanceQueries: vi.fn().mockResolvedValue(undefined),
    useTimezone: () => ({
      timezone: "UTC",
      now: () => new Date("2026-04-01T12:00:00.000Z"),
      formatDate: () => "Apr 1, 2026",
      formatDateTime: () => "Apr 1, 2026, 12:00 PM",
    }),
  }
})

vi.mock("@/hooks/use-currency-conversion", () => ({
  useCurrencyConversionPreview: () => ({
    getConversionPreview: () => null,
  }),
}))

vi.mock("@/components/ui/date-picker", () => ({
  DatePicker: ({
    date,
    setDate,
  }: {
    date?: Date
    setDate: (d?: Date) => void
  }) => (
    <button
      type="button"
      data-testid="mock-date-picker"
      onClick={() => setDate(new Date(2026, 4, 20))}
    >
      {date ? date.toISOString().slice(0, 10) : "Pick a date"}
    </button>
  ),
}))

describe("Finance usePatch Editors", () => {
  let queryClient: QueryClient
  const mutateUpdateAccount = vi.fn()
  const mutateCreateAccount = vi.fn()
  const mutateUpdateRecurring = vi.fn()
  const mutateCreateRecurring = vi.fn()
  const mutateUpdateBudget = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })

    vi.mocked(financeApi.useListCurrenciesQuery).mockReturnValue({
      data: { currencies: [{ code: "USD", name: "US Dollar" }] },
    } as never)

    vi.mocked(financeApi.useListAccountsQuery).mockReturnValue({
      data: { accounts: [] },
    } as never)

    vi.mocked(financeApi.useListInstitutionsQuery).mockReturnValue({
      data: { institutions: [] },
    } as never)

    vi.mocked(financeApi.useCreateInstitutionMutation).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never)

    vi.mocked(financeApi.useCreateAccountMutation).mockReturnValue({
      mutateAsync: mutateCreateAccount,
      isPending: false,
    } as never)

    vi.mocked(financeApi.useUpdateAccountMutation).mockReturnValue({
      mutateAsync: mutateUpdateAccount,
      isPending: false,
    } as never)

    vi.mocked(financeApi.useCreateRecurringTransactionMutation).mockReturnValue(
      {
        mutateAsync: mutateCreateRecurring,
        isPending: false,
      } as never
    )

    vi.mocked(financeApi.useUpdateRecurringTransactionMutation).mockReturnValue(
      {
        mutateAsync: mutateUpdateRecurring,
        isPending: false,
      } as never
    )

    vi.mocked(financeApi.useUpdateBudgetMutation).mockReturnValue({
      mutateAsync: mutateUpdateBudget,
      isPending: false,
    } as never)
  })

  afterEach(() => {
    cleanup()
  })

  it("CreateAccountSheet sends snake_case updateMask, version, and full merged account fields when editing name only", async () => {
    mutateUpdateAccount.mockResolvedValue({
      id: "acc_1",
      name: "Chase Reserve",
    })
    const refetchAccounts = vi.fn()
    const onOpenChange = vi.fn()

    const editAccount: financeApi.Account = {
      id: "acc_1",
      name: "Chase Operating",
      lastFour: "4242",
      type: "CREDIT_CARD",
      currency: "USD",
      initialBalance: "-10000",
      currentBalance: "-10000",
      creditLimit: "500000",
      isDefault: true,
      isActive: true,
      color: "emerald",
      institutionId: "ins_1",
      notes: "Primary business card",
      version: "7",
    }

    render(
      <QueryClientProvider client={queryClient}>
        <CreateAccountSheet
          open={true}
          onOpenChange={onOpenChange}
          spaceId="spc_1"
          baseCurrency="USD"
          editAccount={editAccount}
          refetchAccounts={refetchAccounts}
        />
      </QueryClientProvider>
    )

    const nameInput = screen.getByPlaceholderText(
      "e.g. Chase Operating, Petty Cash"
    )
    fireEvent.change(nameInput, { target: { value: "Chase Reserve" } })

    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }))

    await waitFor(() => {
      expect(mutateUpdateAccount).toHaveBeenCalledTimes(1)
    })

    const call = mutateUpdateAccount.mock.calls[0][0]
    expect(call.id).toBe("acc_1")
    expect(call.req.version).toBe("7")
    expect(call.req.updateMask).toEqual({ paths: ["name"] })
    expect(call.req.account).toMatchObject({
      id: "acc_1",
      name: "Chase Reserve",
      isActive: true,
      isDefault: true,
      creditLimit: "500000",
      color: "emerald",
      lastFour: "4242",
      institutionId: "ins_1",
      notes: "Primary business card",
    })
    expect(hooks.invalidateFinanceQueries).toHaveBeenCalledWith(queryClient)
  })

  it("CreateRecurringTransactionSheet retains executionState.nextDueDate and maps next_due_date in updateMask", async () => {
    mutateUpdateRecurring.mockResolvedValue({
      id: "rec_1",
      name: "Office Rent",
    })
    const refetchTransactions = vi.fn()
    const onOpenChange = vi.fn()

    const editTransaction: financeApi.RecurringTransaction = {
      id: "rec_1",
      type: "EXPENSE",
      budgetId: "bgt_1",
      accountId: "acc_1",
      name: "Office Rent",
      amount: "150000",
      currency: "USD",
      interval: "MONTHLY",
      isVariable: false,
      status: "ACTIVE",
      gracePeriodDays: 3,
      version: "4",
      executionState: {
        nextDueDate: "2026-04-01T12:00:00Z",
      },
    }

    render(
      <QueryClientProvider client={queryClient}>
        <CreateRecurringTransactionSheet
          open={true}
          onOpenChange={onOpenChange}
          spaceId="spc_1"
          baseCurrency="USD"
          budgets={[
            {
              id: "bgt_1",
              name: "Rent",
              limitAmount: "200000",
              currency: "USD",
              interval: "MONTHLY",
              status: "ACTIVE",
              icon: "home",
              color: "indigo",
            },
          ]}
          editTransaction={editTransaction}
          refetchTransactions={refetchTransactions}
        />
      </QueryClientProvider>
    )

    fireEvent.click(screen.getByTestId("mock-date-picker"))
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }))

    await waitFor(() => {
      expect(mutateUpdateRecurring).toHaveBeenCalledTimes(1)
    })

    const call = mutateUpdateRecurring.mock.calls[0][0]
    expect(call.id).toBe("rec_1")
    expect(call.req.version).toBe("4")
    expect(call.req.updateMask).toEqual({ paths: ["next_due_date"] })
    expect(call.req.recurringTransaction.executionState).toEqual({
      nextDueDate: "2026-05-20T12:00:00Z",
    })
    expect(call.req.recurringTransaction).not.toHaveProperty("nextDueDate")
    expect(hooks.invalidateFinanceQueries).toHaveBeenCalledWith(queryClient)
  })

  it("EditBudgetSheet sends updated limitAmount in cents instead of stale limitAmount", async () => {
    mutateUpdateBudget.mockResolvedValue({
      id: "bgt_1",
      name: "Groceries",
      limitAmount: "35000",
    })

    const activeBudget: financeApi.Budget = {
      id: "bgt_1",
      name: "Groceries",
      limitAmount: "20000",
      currency: "USD",
      interval: "MONTHLY",
      status: "ACTIVE",
      icon: "shopping-cart",
      color: "indigo",
      version: "2",
    }

    render(
      <QueryClientProvider client={queryClient}>
        <EditBudgetSheet
          open={true}
          onOpenChange={vi.fn()}
          spaceId="spc_1"
          baseCurrency="USD"
          activeBudget={activeBudget}
          refetchBudgets={vi.fn()}
        />
      </QueryClientProvider>
    )

    const limitInput = screen.getByPlaceholderText("0.00")
    fireEvent.change(limitInput, { target: { value: "350" } })
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }))

    await waitFor(() => {
      expect(mutateUpdateBudget).toHaveBeenCalledTimes(1)
    })

    const call = mutateUpdateBudget.mock.calls[0][0]
    expect(call.id).toBe("bgt_1")
    expect(call.req.version).toBe("2")
    expect(call.req.updateMask).toEqual({ paths: ["limit_amount"] })
    expect(call.req.budget.limitAmount).toBe("35000")
    expect(call.req.budget).not.toHaveProperty("limit")
    expect(hooks.invalidateFinanceQueries).toHaveBeenCalledWith(queryClient)
  })

  it("EditBudgetSheet allows submitting when only propagation changes without throwing No fields modified", async () => {
    const toastAddSpy = vi.spyOn(toast, "add")
    mutateUpdateBudget.mockResolvedValue({
      id: "bgt_1",
      name: "Groceries",
      limitAmount: "20000",
    })

    const activeBudget: financeApi.Budget = {
      id: "bgt_1",
      name: "Groceries",
      limitAmount: "20000",
      currency: "USD",
      interval: "MONTHLY",
      status: "ACTIVE",
      icon: "shopping-cart",
      color: "indigo",
      version: "2",
    }

    render(
      <QueryClientProvider client={queryClient}>
        <EditBudgetSheet
          open={true}
          onOpenChange={vi.fn()}
          spaceId="spc_1"
          baseCurrency="USD"
          activeBudget={activeBudget}
          refetchBudgets={vi.fn()}
        />
      </QueryClientProvider>
    )

    const trigger = screen.getByLabelText("Limit Propagation Rule")
    fireEvent.click(trigger)
    const option = await screen.findByRole("option", {
      name: /Current Period Only/i,
    })
    fireEvent.pointerDown(option)
    fireEvent.mouseUp(option)
    fireEvent.click(option)
    expect(trigger.textContent).toContain("Current Period Only")

    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }))

    await waitFor(() => {
      expect(mutateUpdateBudget).toHaveBeenCalledTimes(1)
    })

    const call = mutateUpdateBudget.mock.calls[0][0]
    expect(call.req.propagation).toBe("LIMIT_PROPAGATION_CURRENT_PERIOD")
    expect(call.req.updateMask).toEqual({ paths: ["limit_amount"] })
    expect(call.req.budget.limitAmount).toBe("20000")
    expect(toastAddSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "error" })
    )
  })
})
