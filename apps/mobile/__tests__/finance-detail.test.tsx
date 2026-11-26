import React from "react"
import { vi, it, expect, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import { TransactionListItem } from "../components/finance/transaction-list-item"
import { CardAccountItem } from "../components/finance/card-account-item"
import type {
  Account,
  Transaction,
} from "@saturn/api/saturn/finance/v1/finance"

const { hapticsLight } = vi.hoisted(() => ({ hapticsLight: vi.fn() }))

vi.mock("react-native", () => ({
  StyleSheet: { absoluteFill: {} },
  Image: () => null,
  Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
  View: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  TouchableOpacity: ({
    children,
    onPress,
  }: {
    children: React.ReactNode
    onPress: () => void
  }) => <button onClick={onPress}>{children}</button>,
}))
vi.mock("expo-linear-gradient", () => ({
  LinearGradient: () => null,
}))
vi.mock("lucide-react-native", () => ({
  ArrowUpRight: () => null,
  ArrowDownLeft: () => null,
  Repeat: () => null,
  Coins: () => null,
  ReceiptText: () => null,
  Landmark: () => null,
  CreditCard: () => null,
  Wallet: () => null,
}))
vi.mock("../lib/haptics", () => ({
  haptics: { light: hapticsLight, selection: vi.fn() },
}))
vi.mock("../lib/theme", () => ({
  useTheme: () => ({ colors: {}, getBudgetColors: () => ({}) }),
  useThemedStyles: () => ({}),
}))
vi.mock("../lib/budget-icons", () => ({ BudgetCategoryIcon: () => null }))
vi.mock("../components/ui/typography", () => ({ MonoAmount: "span" }))
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  hapticsLight.mockClear()
})
it.each([
  ["INCOME", "4590", "USD", "+$45.90"],
  ["EXPENSE", "12450", "USD", "-$124.50"],
  ["TRANSFER_IN", "1200", "USD", "+$12.00"],
  ["TRANSFER_OUT", "1200", "USD", "-$12.00"],
  ["BALANCE_ADJUSTMENT", "-1200", "USD", "-$12.00"],
  ["BALANCE_ADJUSTMENT", "1200", "USD", "+$12.00"],
])(
  "shows the signed ledger amount for %s %s (%s)",
  (type, amount, currency, label) => {
    render(
      <TransactionListItem
        item={
          {
            type,
            amount,
            currency,
            transactionDate: "2026-02-01",
          } as Transaction
        }
      />
    )
    expect(screen.getByText(label)).toBeTruthy()
  }
)
it("preserves a leading + on positive INCOME and TRANSFER_IN even when Intl.NumberFormat drops signDisplay (iOS Hermes)", () => {
  const OriginalNumberFormat = Intl.NumberFormat
  vi.spyOn(Intl, "NumberFormat").mockImplementation(function MockNumberFormat(
    locale?: string | string[],
    options?: Intl.NumberFormatOptions
  ) {
    const { signDisplay: _ignored, ...rest } = options ?? {}
    return new OriginalNumberFormat(locale, rest)
  } as unknown as typeof Intl.NumberFormat)

  const { rerender } = render(
    <TransactionListItem
      item={
        {
          type: "INCOME",
          description: "Refund - Amazon.com",
          amount: "4590",
          currency: "DOP",
          transactionDate: "2026-02-01",
        } as Transaction
      }
    />
  )
  expect(screen.getByText(/^\+DOP\s*45\.90$/)).toBeTruthy()

  rerender(
    <TransactionListItem
      item={
        {
          type: "TRANSFER_IN",
          description: "From Savings",
          amount: "12000",
          currency: "DOP",
          transactionDate: "2026-02-01",
        } as Transaction
      }
    />
  )
  expect(screen.getByText(/^\+DOP\s*120\.00$/)).toBeTruthy()
})
it("omits holder name and disables press haptics in CardAccountItem when hideHolderName is true and onPress is omitted", () => {
  const acc = {
    id: "acc-1",
    name: "Checking",
    type: "BANK",
    currency: "DOP",
    currentBalance: "4325000",
    isActive: true,
  } as Account

  const { rerender } = render(<CardAccountItem acc={acc} hideHolderName />)
  expect(screen.queryByText("Name")).toBeNull()
  expect(screen.queryByRole("button")).toBeNull()

  const onPress = vi.fn()
  rerender(<CardAccountItem acc={acc} onPress={onPress} />)
  expect(screen.getByText("Name")).toBeTruthy()
  fireEvent.click(screen.getByRole("button"))
  expect(hapticsLight).toHaveBeenCalledOnce()
  expect(onPress).toHaveBeenCalledOnce()
})
it("identifies a disbursement and forwards a tap to its detail action", () => {
  const onPress = vi.fn()
  render(
    <TransactionListItem
      item={
        {
          type: "EXPENSE",
          budgetId: "",
          periodId: "",
          description: "Loan",
          effectiveDate: "2026-02-01",
          amount: "900",
          currency: "USD",
          transactionDate: "2026-02-01",
          metadata: { borrowing_id: "loan", borrowing_role: "DISBURSEMENT" },
        } as Transaction
      }
      onPress={onPress}
    />
  )
  fireEvent.click(screen.getByText("Additional disbursement"))
  expect(onPress).toHaveBeenCalledOnce()
})
