import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router-dom"
import { CreateTransactionSheet } from "./create-transaction-sheet"

vi.mock("@saturn/api/gen/saturn/finance/v1/finance", () => ({
  useListAccountsQuery: () => ({ data: { accounts: [] }, isLoading: false }),
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
  useCreateExpenseMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
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
})
