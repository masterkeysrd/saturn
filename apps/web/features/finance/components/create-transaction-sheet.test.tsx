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
import { TimezoneProvider } from "@saturn/hooks"
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
  useListScheduledTransactionsQuery: () => ({
    data: {
      scheduledTransactions: [
        {
          id: "st_1",
          type: "EXPENSE",
          amount: "1500",
          currency: "USD",
          dueDate: "2026-04-20T00:00:00Z",
          recurringTransaction: {
            interval: "MONTHLY",
            name: "Spotify Premium",
          },
        },
      ],
    },
    isLoading: false,
  }),
  useListRecurringTransactionsQuery: () => ({
    data: { recurringTransactions: [] },
    isLoading: false,
  }),
  useConfirmScheduledTransactionMutation: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useListBorrowingsQuery: () => ({
    data: {
      borrowings: [
        {
          id: "brw_1",
          direction: "BORROWED",
          counterparty: "Bob Dylan",
          totalAmount: "100000",
          remainingAmount: "50000",
          currency: "USD",
          status: "ACTIVE",
          notes: "Studio equipment loan",
        },
      ],
    },
    isLoading: false,
  }),
  useLogBorrowingTransactionMutation: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
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

  it("renders localized text in Spanish under locale='es-ES'", async () => {
    mockCreateExpenseMutateAsync.mockResolvedValue({ id: "txn_new" })
    const onOpenChange = vi.fn()

    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <TimezoneProvider timezone="UTC" locale="es-ES">
            <CreateTransactionSheet
              open={true}
              onOpenChange={onOpenChange}
              spaceId="spc_1"
              baseCurrency="USD"
              budgets={[
                {
                  id: "bgt_1",
                  name: "Alimentos",
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
                  name: "Cuenta Corriente",
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
              ]}
            />
          </TimezoneProvider>
        </QueryClientProvider>
      </MemoryRouter>
    )

    // Selection drawer in Spanish
    expect(screen.getByText("Registrar transacción")).toBeTruthy()
    expect(screen.getByText("Gasto independiente")).toBeTruthy()
    expect(screen.getByText("Ingreso independiente")).toBeTruthy()
    expect(
      screen.getByText("Confirmar factura / ingreso programado")
    ).toBeTruthy()
    expect(screen.getByText("Pago de préstamo / deuda personal")).toBeTruthy()
    expect(
      screen.getByText("Realizar transferencia entre cuentas")
    ).toBeTruthy()

    // Transition to standalone expense form in Spanish
    fireEvent.click(screen.getByText("Gasto independiente"))
    expect(screen.getByText("Registrar gasto independiente")).toBeTruthy()
    expect(screen.getByText("Importe")).toBeTruthy()
    expect(screen.getByText("Presupuesto")).toBeTruthy()
    expect(
      screen.getByRole("button", { name: "Guardar gasto independiente" })
    ).toBeTruthy()

    // Fill and submit expense
    const amountInput = screen.getByPlaceholderText("0.00")
    const descInput = screen.getByPlaceholderText(/Amazon Web Services/i)
    fireEvent.change(amountInput, { target: { value: "30.00" } })
    fireEvent.change(descInput, { target: { value: "Comida" } })

    fireEvent.click(
      screen.getByRole("button", { name: "Guardar gasto independiente" })
    )

    await waitFor(() => {
      expect(mockCreateExpenseMutateAsync).toHaveBeenCalledTimes(1)
    })

    // Receipt review in Spanish
    expect(screen.getByText("Gasto registrado")).toBeTruthy()
    expect(screen.getByText("Comida")).toBeTruthy()
    expect(screen.getByText("Alimentos")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Listo" })).toBeTruthy()
    expect(
      screen.getByRole("button", { name: "Agregar otro gasto" })
    ).toBeTruthy()
  })

  it("renders scheduled bill/income selector and confirmation form in Spanish under locale='es-ES'", async () => {
    const onOpenChange = vi.fn()

    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <TimezoneProvider timezone="UTC" locale="es-ES">
            <CreateTransactionSheet
              open={true}
              onOpenChange={onOpenChange}
              spaceId="spc_1"
              baseCurrency="USD"
            />
          </TimezoneProvider>
        </QueryClientProvider>
      </MemoryRouter>
    )

    // Click "Confirmar factura / ingreso programado"
    fireEvent.click(screen.getByText("Confirmar factura / ingreso programado"))

    // Scheduled transaction selector rendered in Spanish
    expect(screen.getByText("← Volver a tipos")).toBeTruthy()
    expect(screen.getByText("Gestionar plantillas")).toBeTruthy()
    expect(
      screen.getByPlaceholderText("Buscar elementos programados...")
    ).toBeTruthy()
    expect(screen.getByText("Spotify Premium")).toBeTruthy()
    expect(screen.getByText(/Vence/i)).toBeTruthy()

    // Select the scheduled transaction -> transitions to ConfirmScheduledForm
    fireEvent.click(screen.getByText("Spotify Premium"))
    expect(screen.getByText("Volver a elementos programados")).toBeTruthy()
    expect(screen.getByText("Objetivo programado")).toBeTruthy()
    expect(screen.getByText("Importe real")).toBeTruthy()
    expect(screen.getByText("Cuenta de pago")).toBeTruthy()
    expect(screen.getByText("Categoría de presupuesto")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Confirmar pago" })).toBeTruthy()
  })

  it("renders borrowing selector and payment form in Spanish under locale='es-ES'", async () => {
    const onOpenChange = vi.fn()

    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <TimezoneProvider timezone="UTC" locale="es-ES">
            <CreateTransactionSheet
              open={true}
              onOpenChange={onOpenChange}
              spaceId="spc_1"
              baseCurrency="USD"
            />
          </TimezoneProvider>
        </QueryClientProvider>
      </MemoryRouter>
    )

    // Click "Pago de préstamo / deuda personal"
    fireEvent.click(screen.getByText("Pago de préstamo / deuda personal"))

    // Borrowing selector rendered in Spanish
    expect(screen.getByText("Seleccionar acuerdo de préstamo")).toBeTruthy()
    expect(screen.getByText("← Volver a tipos")).toBeTruthy()
    expect(screen.getByText("Gestionar préstamos")).toBeTruthy()
    expect(
      screen.getByPlaceholderText("Buscar por contraparte o descripción...")
    ).toBeTruthy()
    expect(screen.getByText("Bob Dylan")).toBeTruthy()
    expect(screen.getByText("Pediste prestado")).toBeTruthy()
    expect(screen.getByText("Restante")).toBeTruthy()

    // Select the borrowing agreement -> transitions to CreateBorrowingTransactionForm
    fireEvent.click(screen.getByText("Bob Dylan"))
    expect(screen.getByText("Registrar transacción de préstamo")).toBeTruthy()
    expect(screen.getByText("Volver a registros de deuda")).toBeTruthy()
    expect(screen.getByText("Acuerdo de préstamo / deuda")).toBeTruthy()
    expect(screen.getByText("Acción de la transacción")).toBeTruthy()
    expect(screen.getByText("Realizar reembolso")).toBeTruthy()
    expect(screen.getByText("Disposición adicional del préstamo")).toBeTruthy()
    expect(screen.getByText("Importe")).toBeTruthy()
    expect(screen.getByText("Cuenta bancaria")).toBeTruthy()
    expect(screen.getByText("Notas / Referencia")).toBeTruthy()
    expect(
      screen.getByRole("button", { name: "Registrar transacción" })
    ).toBeTruthy()
  })
})
