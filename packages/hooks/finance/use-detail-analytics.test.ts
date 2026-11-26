import { it, expect, vi, afterEach } from "vitest"
import { renderHook } from "@testing-library/react"
import { useBorrowingAnalytics } from "./use-detail-analytics"
import type { Borrowing } from "@saturn/api/saturn/finance/v1/finance"
const { entries } = vi.hoisted(() => ({
  entries: vi.fn(() => ({
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
  entries.mockClear()
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
