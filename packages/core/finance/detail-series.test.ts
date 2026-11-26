import { expect, it } from "vitest"
import {
  accountTrajectory,
  borrowingTrajectory,
  budgetBurn,
  budgetHistory,
  cashFlowBuckets,
} from "./detail-series"
const range = {
  start: "2025-03-08",
  end: "2025-03-10",
  timezone: "America/New_York",
}
const tx = (
  type: string,
  amount: number,
  metadata: Record<string, string> = {}
) => ({ type, amount, metadata, transactionDate: "2025-03-10T03:30:00Z" })
const entries = [
  tx("EXPENSE", 40, { account_impact_amount: "60" }),
  tx("TRANSFER_IN", 10),
  tx("BALANCE_ADJUSTMENT", -5),
]
it.each([
  ["BANK", 155],
  ["CREDIT_CARD", 55],
] as const)("walks %s balances across DST", (type, opening) => {
  expect(
    accountTrajectory({ type, currentBalance: 100 }, entries, range).map(
      (p) => p.value
    )
  ).toEqual([opening, 100, 100])
})
it("buckets opposing flows without netting same-day entries or including adjustments", () => {
  expect(cashFlowBuckets(entries, range, "week")).toEqual([
    { date: "2025-03-03", inflow: 10, outflow: -60 },
    { date: "2025-03-10", inflow: 0, outflow: 0 },
  ])
  expect(cashFlowBuckets(entries, range, "month")).toEqual([
    { date: "2025-03-01", inflow: 10, outflow: -60 },
  ])
})
it("stops actual spend today but projects ideal pace through period end", () => {
  expect(
    budgetBurn(entries, range, 90, "2025-03-09").map(({ spent, ideal }) => [
      spent,
      ideal,
    ])
  ).toEqual([
    [0, 30],
    [40, 60],
    [null, 90],
  ])
})
it("orders and limits history", () => {
  expect(
    budgetHistory(
      Array.from({ length: 8 }, (_, i) => ({
        startDate: `2025-01-0${8 - i}`,
        spentAmount: "15",
        limitAmount: "20",
      }))
    ).map((p) => p.date)
  ).toEqual(Array.from({ length: 6 }, (_, i) => `2025-01-0${i + 3}`))
})
it.each([
  ["LENT", 105],
  ["BORROWED", 125],
] as const)(
  "walks %s principal and projects zero at due date",
  (direction, opening) => {
    const result = borrowingTrajectory(
      { direction, remainingAmount: 100, dueAt: "2025-03-18" },
      [
        tx("INCOME", 20, { borrowing_role: "REPAYMENT" }),
        tx("EXPENSE", 5, { borrowing_role: "DISBURSEMENT" }),
        tx("EXPENSE", 10, { borrowing_role: "ADJUSTMENT" }),
      ],
      range
    )
    expect(result.points.map((p) => p.value)).toEqual([opening, 100, 100])
    expect(result.projection).toEqual([
      { date: "2025-03-10", value: 100 },
      { date: "2025-03-18", value: 0 },
    ])
  }
)

it("removes future principal changes before reconstructing the closing balance and projection", () => {
  const result = borrowingTrajectory(
    { remainingAmount: 70, direction: "BORROWED", dueAt: "2025-04-01" },
    [
      {
        ...tx("EXPENSE", 50, { borrowing_role: "REPAYMENT" }),
        transactionDate: "2025-03-11T04:00:00Z",
      },
      {
        ...tx("INCOME", 20, { borrowing_role: "ADJUSTMENT" }),
        transactionDate: "2025-03-12",
      },
      {
        ...tx("EXPENSE", 10, { borrowing_role: "REPAYMENT" }),
        transactionDate: "2025-03-11T03:59:59Z",
      },
    ],
    range
  )
  expect(result.points.map((p) => p.value)).toEqual([110, 110, 100])
  expect(result.projection[0].value).toBe(100)
})
it("converts each expense to period currency before accumulating", () => {
  const foreign = {
    ...tx("EXPENSE", 9000),
    currency: "JPY",
    amountInBase: "35",
  }
  const result = budgetBurn([foreign, foreign], range, 100, range.end, {
    currency: "EUR",
    exchangeRateToBase: 2,
  })
  expect(result.at(-1)?.spent).toBe(36)
})
