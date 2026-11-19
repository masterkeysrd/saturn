import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router-dom"
import { CreateTransactionSheet } from "./create-transaction-sheet"

const mockCreateExpenseMutateAsync = vi.fn()

vi.mock("@saturn/api/gen/saturn/finance/v1/finance", () => ({
  useListAccountsQuery: () => ({
    data: {
      accounts: [
        {
          id: "acc_1",
          name: "Checking",
          type: "BANK",
          currency: "USD",
          color: "teal",
          isActive: true,
          isDefault: true,
        },
        {
          id: "acc_2",
          name: "Savings",
          type: "BANK",
          currency: "USD",
          color: "blue",
          isActive: true,
          isDefault: false,
        },
      ],
    },
    isLoading: false,
  }),
  useListCurrenciesQuery: () => ({
    data: { currencies: [{ code: "USD", name: "US Dollar" }] },
    isLoading: false,
  }),
  useListExchangeRatesQuery: () => ({
    data: { exchangeRates: [] },
    isLoading: false,
  }),
  useListInstitutionsQuery: () => ({
    data: { institutions: [] },
    isLoading: false,
  }),
  useCreateExpenseMutation: () => ({
    mutateAsync: mockCreateExpenseMutateAsync,
    isPending: false,
  }),
  useUpdateExpenseMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateIncomeMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateIncomeMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateTransferMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

vi.mock("@saturn/hooks", async () => {
  const actual =
    await vi.importActual<typeof import("@saturn/hooks")>("@saturn/hooks")
  return {
    ...actual,
    invalidateFinanceQueries: vi.fn().mockResolvedValue(undefined),
  }
})

describe("CreateTransactionSheet", () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  afterEach(() => {
    cleanup()
  })

  it("keeps the same DialogContent instance mounted when transitioning between type list and form", () => {
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <CreateTransactionSheet
            open={true}
            onOpenChange={vi.fn()}
            spaceId="spc_1"
            baseCurrency="USD"
          />
        </QueryClientProvider>
      </MemoryRouter>
    )

    const initialDialog = document.querySelector('[data-slot="dialog-content"]')
    expect(initialDialog).toBeTruthy()
    expect(screen.getByText("Record Transaction")).toBeTruthy()

    fireEvent.click(screen.getByText("Standalone Expense"))

    const expenseDialog = document.querySelector('[data-slot="dialog-content"]')
    expect(screen.getByText("Record Standalone Expense")).toBeTruthy()
    expect(expenseDialog).toBe(initialDialog)
  })

  it("shows a post-submit receipt review step with Add another and Done inside the same persistent dialog", async () => {
    localStorage.setItem("saturn:last-account:spc_1", "acc_2")
    mockCreateExpenseMutateAsync.mockResolvedValue({ id: "txn_new" })
    const onOpenChange = vi.fn()

    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <CreateTransactionSheet
            open={true}
            onOpenChange={onOpenChange}
            spaceId="spc_1"
            baseCurrency="USD"
            budgets={[
              {
                id: "bgt_1",
                name: "Groceries",
                limitAmount: "50000",
                currency: "USD",
                interval: "MONTHLY",
                status: "ACTIVE",
                icon: "shopping-cart",
                color: "teal",
                defaultAccountId: "acc_1",
              },
            ]}
            accounts={[
              {
                id: "acc_1",
                name: "Checking",
                type: "BANK",
                currency: "USD",
                initialBalance: "0",
                creditLimit: "0",
                lastFour: "1234",
                notes: "",
                isActive: true,
                isDefault: true,
                color: "teal",
              },
              {
                id: "acc_2",
                name: "Savings",
                type: "BANK",
                currency: "USD",
                initialBalance: "0",
                creditLimit: "0",
                lastFour: "5678",
                notes: "",
                isActive: true,
                isDefault: false,
                color: "blue",
              },
            ]}
            preselectedBudgetId="bgt_1"
          />
        </QueryClientProvider>
      </MemoryRouter>
    )

    const initialDialog = document.querySelector('[data-slot="dialog-content"]')
    expect(
      screen.queryByRole("button", { name: /Save & Add Another/i })
    ).toBeNull()

    const amountInput = screen.getByPlaceholderText("0.00") as HTMLInputElement
    const descInput = screen.getByPlaceholderText(
      /Amazon Web Services/i
    ) as HTMLInputElement

    fireEvent.change(amountInput, { target: { value: "42.50" } })
    fireEvent.change(descInput, { target: { value: "Coffee beans" } })

    fireEvent.click(
      screen.getByRole("button", { name: /Save Standalone Expense/i })
    )

    await waitFor(() => {
      expect(mockCreateExpenseMutateAsync).toHaveBeenCalledTimes(1)
    })

    expect(mockCreateExpenseMutateAsync).toHaveBeenCalledWith({
      expense: expect.objectContaining({
        budgetId: "bgt_1",
        accountId: "acc_2",
        amount: "4250",
        description: "Coffee beans",
      }),
    })

    // Transitions inside the same persistent dialog to the Deel-style receipt review step
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
    expect(screen.getByText("Expense Recorded")).toBeTruthy()
    expect(screen.getByText("Coffee beans")).toBeTruthy()
    expect(screen.getByText("Groceries")).toBeTruthy()
    expect(screen.getByText("Savings")).toBeTruthy()
    expect(document.querySelector('[data-slot="dialog-content"]')).toBe(
      initialDialog
    )

    // Clicking "Add another expense" returns to a clean form preserving account & budget
    fireEvent.click(
      screen.getByRole("button", { name: /Add another expense/i })
    )

    const nextAmountInput = screen.getByPlaceholderText(
      "0.00"
    ) as HTMLInputElement
    const nextDescInput = screen.getByPlaceholderText(
      /Amazon Web Services/i
    ) as HTMLInputElement
    expect(nextAmountInput.value).toBe("")
    expect(nextDescInput.value).toBe("")

    // Record a second item and verify "2 recorded" session badge + Done closes dialog
    fireEvent.change(nextAmountInput, { target: { value: "15.00" } })
    fireEvent.change(nextDescInput, { target: { value: "Bakery" } })
    fireEvent.click(
      screen.getByRole("button", { name: /Save Standalone Expense/i })
    )

    await waitFor(() => {
      expect(screen.getByText("2 recorded")).toBeTruthy()
    })

    fireEvent.click(screen.getByRole("button", { name: "Done" }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
