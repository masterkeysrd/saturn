import { getTimezoneParts, type DateInput } from "../timezone"

type Amount = string | number
interface Entry {
  type?: string
  currency?: string
  amountInBase?: Amount
  amount?: Amount
  transactionDate?: string
  metadata?: Record<string, string>
}
export interface SeriesRange {
  start: DateInput
  end: DateInput
  timezone: string
}
const DAY = 86400000
function ordinal(date: DateInput, zone: string) {
  const p = getTimezoneParts(date, zone)
  return p ? Date.UTC(p.year, p.month - 1, p.day) / DAY : NaN
}
const key = (n: number) => new Date(n * DAY).toISOString().slice(0, 10)
export function signedTransactionAmount(
  tx: Entry,
  amount = Number(tx.amount || 0)
) {
  switch (tx.type) {
    case "EXPENSE":
    case "TRANSFER_OUT":
      return -Math.abs(amount)
    case "INCOME":
    case "TRANSFER_IN":
      return Math.abs(amount)
    case "BALANCE_ADJUSTMENT":
      return amount
    default:
      return 0
  }
}
function accountFlow(tx: Entry) {
  return signedTransactionAmount(
    tx,
    Number(tx.metadata?.account_impact_amount || tx.amount || 0)
  )
}
function daily(
  entries: readonly Entry[],
  range: SeriesRange,
  delta: (tx: Entry) => number
) {
  const start = ordinal(range.start, range.timezone),
    end = ordinal(range.end, range.timezone)
  const sums = new Map<number, number>()
  for (const tx of entries) {
    const day = ordinal(tx.transactionDate, range.timezone)
    if (day >= start && day <= end)
      sums.set(day, (sums.get(day) || 0) + delta(tx))
  }
  return Array.from({ length: Math.max(0, end - start + 1) }, (_, i) => ({
    date: key(start + i),
    delta: sums.get(start + i) || 0,
  }))
}
function backward(days: ReturnType<typeof daily>, balance: number) {
  return days
    .reverse()
    .map(({ date, delta }) => {
      const value = balance
      balance -= delta
      return { date, value, delta }
    })
    .reverse()
}
export function accountTrajectory(
  account: { type?: string; currentBalance?: Amount },
  entries: readonly Entry[],
  range: SeriesRange
) {
  return backward(
    daily(
      entries,
      range,
      (tx) =>
        accountFlow(tx) *
        (account.type === "CREDIT_CARD" && tx.type !== "BALANCE_ADJUSTMENT"
          ? -1
          : 1)
    ),
    Number(account.currentBalance || 0)
  )
}
export function cashFlowBuckets(
  entries: readonly Entry[],
  range: SeriesRange,
  interval: "month" | "week",
  weekStartsOn: 0 | 1 = 1
) {
  const buckets = new Map<
    string,
    { date: string; inflow: number; outflow: number }
  >()
  function bucket(n: number) {
    const d = new Date(n * DAY)
    const date =
      interval === "month"
        ? key(n).slice(0, 7) + "-01"
        : key(n - ((d.getUTCDay() - weekStartsOn + 7) % 7))
    let b = buckets.get(date)
    if (!b) {
      b = { date, inflow: 0, outflow: 0 }
      buckets.set(date, b)
    }
    return b
  }
  const start = ordinal(range.start, range.timezone),
    end = ordinal(range.end, range.timezone)
  for (let n = start; n <= end; n++) bucket(n)
  for (const tx of entries) {
    const n = ordinal(tx.transactionDate, range.timezone)
    if (!(n >= start && n <= end) || tx.type === "BALANCE_ADJUSTMENT") continue
    const flow = accountFlow(tx)
    bucket(n)[flow < 0 ? "outflow" : "inflow"] += flow
  }
  return [...buckets.values()]
}
export function budgetBurn(
  entries: readonly Entry[],
  range: SeriesRange,
  limit: number,
  today: DateInput,
  period?: { currency?: string; exchangeRateToBase?: number }
) {
  let spent = 0
  const elapsed =
    ordinal(today, range.timezone) - ordinal(range.start, range.timezone)
  const days = daily(entries, range, (tx) => {
    if (tx.type !== "EXPENSE") return 0
    if (!period?.currency || !tx.currency || tx.currency === period.currency)
      return Number(tx.amount || 0)
    return period.exchangeRateToBase
      ? Math.round(Number(tx.amountInBase || 0) / period.exchangeRateToBase)
      : 0
  })
  return days.map(({ date, delta }, i) => ({
    date,
    spent: i <= elapsed ? (spent += delta) : null,
    ideal: Math.round((limit * (i + 1)) / days.length),
    limit,
  }))
}
export function budgetHistory(
  periods: readonly {
    startDate?: string
    spentAmount?: Amount
    limitAmount?: Amount
  }[]
) {
  return periods
    .filter((p) => p.startDate)
    .map((p) => ({
      date: p.startDate!,
      spent: Number(p.spentAmount || 0),
      limit: Number(p.limitAmount || 0),
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-6)
}
export function borrowingTrajectory(
  borrowing: { direction?: string; remainingAmount?: Amount; dueAt?: string },
  entries: readonly Entry[],
  range: SeriesRange
) {
  const end = ordinal(range.end, range.timezone)
  const due = ordinal(borrowing.dueAt, range.timezone)
  const delta = (tx: Entry) => {
    const amount = Number(tx.metadata?.borrowing_amount || tx.amount || 0)
    switch (tx.metadata?.borrowing_role) {
      case "REPAYMENT":
        return -amount
      case "INITIAL_FUNDING":
      case "DISBURSEMENT":
        return amount
      case "ADJUSTMENT":
        return tx.type ===
          (borrowing.direction === "LENT" ? "EXPENSE" : "INCOME")
          ? amount
          : -amount
      default:
        return 0
    }
  }
  const balance = entries.reduce(
    (remaining, tx) =>
      ordinal(tx.transactionDate, range.timezone) > end
        ? remaining - delta(tx)
        : remaining,
    Number(borrowing.remainingAmount || 0)
  )
  const points = backward(daily(entries, range, delta), balance)
  return {
    points,
    projection:
      due > end && balance > 0
        ? [
            { date: key(end), value: balance },
            { date: key(due), value: 0 },
          ]
        : [],
  }
}

export const accountLedgerTypes = {
  all: [],
  expenses: ["EXPENSE"],
  income: ["INCOME"],
  transfers: ["TRANSFER_IN", "TRANSFER_OUT"],
  adjustments: ["BALANCE_ADJUSTMENT"],
} as const
export type AccountLedgerFilter = keyof typeof accountLedgerTypes
export const accountLedgerFilters = Object.keys(
  accountLedgerTypes
) as AccountLedgerFilter[]
