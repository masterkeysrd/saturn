import { it, expect, vi, afterEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import {
  useAccountAnalytics,
  useBorrowingAnalytics,
} from "./use-detail-analytics"
import type { Account, Borrowing } from "@saturn/api/saturn/finance/v1/finance"
const { entries } = vi.hoisted(() => ({
  entries: vi.fn<() => { data: Record<string, unknown>[] }>(() => ({
    data: [
      {
        amount: "20",
        type: "INCOME",
        transactionDate: "2025-03-03T08:00:00Z",
        metadata: { borrowing_role: "DISBURSEMENT" },
      },
    ],
  })),
}))
vi.mock("./use-detail-ledger", () => ({ useChartEntries: entries }))
afterEach(() => {
  vi.useRealTimers()
  entries.mockReset()
  entries.mockImplementation(() => ({
    data: [
      {
        amount: "20",
        type: "INCOME",
        transactionDate: "2025-03-03T08:00:00Z",
        metadata: { borrowing_role: "DISBURSEMENT" },
      },
    ],
  }))
})
it.each([
  ["2025-03-03T18:00:00Z", "2025-03-03", 20],
  ["2025-04-01", "2025-03-04", 0],
] as const)(
  "fetches all activity for an agreement established at %s",
  (establishedAt, first, delta) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2025-03-04T12:00:00Z"))
    const { result } = renderHook(() =>
      useBorrowingAnalytics("space", {
        id: "l",
        establishedAt,
        remainingAmount: "20",
      } as Borrowing)
    )
    expect(entries).toHaveBeenCalledWith("space", { borrowingId: "l" }, true)
    expect(result.current.points[0]).toMatchObject({
      date: first,
      value: 20,
      delta,
    })
  }
)

it("computes periodInflow and periodOutflow over the selected range while keeping 30-day inflow/outflow intact", () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2025-05-15T12:00:00Z"))
  entries.mockImplementation(() => ({
    data: [
      {
        amount: "5000",
        type: "INCOME",
        transactionDate: "2025-05-10T10:00:00Z",
      },
      {
        amount: "1000",
        type: "EXPENSE",
        transactionDate: "2025-05-11T10:00:00Z",
      },
      {
        amount: "20000",
        type: "INCOME",
        transactionDate: "2025-03-10T10:00:00Z",
      },
      {
        amount: "4000",
        type: "EXPENSE",
        transactionDate: "2025-03-11T10:00:00Z",
      },
    ],
  }))

  const { result } = renderHook(() =>
    useAccountAnalytics("space", {
      id: "acc-1",
      type: "CHECKING",
      currentBalance: "20000",
    } as unknown as Account)
  )

  expect(result.current.period).toBe("30D")
  expect(result.current.inflow).toBe(5000)
  expect(result.current.outflow).toBe(-1000)
  expect(result.current.periodInflow).toBe(5000)
  expect(result.current.periodOutflow).toBe(-1000)
  expect(result.current.net).toBe(4000)

  act(() => {
    result.current.setPeriod("90D")
  })

  expect(result.current.inflow).toBe(5000)
  expect(result.current.outflow).toBe(-1000)
  expect(result.current.periodInflow).toBe(25000)
  expect(result.current.periodOutflow).toBe(-5000)
  expect(result.current.net).toBe(20000)
})
