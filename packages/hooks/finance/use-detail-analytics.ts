import { useState } from "react"
import {
  accountTrajectory,
  cashFlowBuckets,
  budgetBurn,
  budgetHistory,
  borrowingTrajectory,
  type DetailChartPoint,
} from "@saturn/core"
import type {
  Account,
  Borrowing,
  Budget,
  BudgetPeriod,
} from "@saturn/api/saturn/finance/v1/finance"
import { useTimezone } from "../timezone/use-timezone"
import { useChartEntries, useBudgetHistory } from "./use-detail-ledger"
export type ChartPeriod = "30D" | "90D" | "YTD" | "1Y"
export function useAccountAnalytics(
  space: string | undefined,
  account?: Account
) {
  const tz = useTimezone(),
    [period, setPeriod] = useState<ChartPeriod>("30D"),
    [mode, setMode] = useState<"balance" | "flow">("balance"),
    [interval, setInterval] = useState<"week" | "month">("week")
  const today = tz.now(),
    end = tz.endOfDay(today).toISOString(),
    parts = tz.parts(today)!
  const daysBack = period === "30D" ? 29 : period === "90D" ? 89 : 364
  const start = tz
    .startOfDay(
      period === "YTD"
        ? `${parts.year}-01-01`
        : new Date(Date.UTC(parts.year, parts.month - 1, parts.day - daysBack))
            .toISOString()
            .slice(0, 10)
    )
    .toISOString()
  const start30 = tz
    .startOfDay(
      new Date(Date.UTC(parts.year, parts.month - 1, parts.day - 29))
        .toISOString()
        .slice(0, 10)
    )
    .toISOString()
  const query = useChartEntries(
    space,
    {
      accountId: account?.id,
      startDate: start < start30 ? start : start30,
      endDate: end,
    },
    !!account?.id
  )
  const rows = query.data || [],
    range = { start, end, timezone: tz.timezone },
    balance = accountTrajectory(account || {}, rows, range),
    flows = cashFlowBuckets(rows, range, interval, tz.weekStartsOn),
    recent = cashFlowBuckets(rows, { ...range, start: start30 }, "month")
  return {
    query,
    period,
    setPeriod,
    mode,
    setMode,
    interval,
    setInterval,
    net: balance.reduce((sum, p) => sum + p.delta, 0),
    inflow: recent.reduce((sum, p) => sum + p.inflow, 0),
    outflow: recent.reduce((sum, p) => sum + p.outflow, 0),
    points:
      mode === "balance"
        ? balance.map((p) => ({
            ...p,
            ceiling:
              account?.type === "CREDIT_CARD" && Number(account.creditLimit) > 0
                ? Number(account.creditLimit)
                : undefined,
          }))
        : flows.map((p) => ({
            date: p.date,
            value: p.inflow,
            comparison: p.outflow,
          })),
  }
}
export function useBudgetAnalytics(
  space: string | undefined,
  budget: Budget | undefined,
  period: BudgetPeriod | undefined,
  current: BudgetPeriod | undefined
) {
  const tz = useTimezone(),
    start = period?.startDate,
    end = period?.endDate
  const query = useChartEntries(
    space,
    {
      budgetId: budget?.id,
      startDate: start,
      endDate: end,
      types: ["EXPENSE"],
    },
    !!(budget?.id && start && end)
  )
  const history = useBudgetHistory(
    space,
    budget?.id,
    current,
    budget?.interval === "ONE_TIME"
  )
  const lifetime = budget?.interval === "ONE_TIME"
  const now = tz.now()
  const first = lifetime
    ? (query.data || []).reduce(
        (earliest, tx) =>
          tx.transactionDate && tx.transactionDate < earliest
            ? tx.transactionDate
            : earliest,
        budget.createTime || now.toISOString()
      )
    : start
  return {
    query,
    history,
    burn: budgetBurn(
      query.data || [],
      { start: first, end: lifetime ? now : end, timezone: tz.timezone },
      Number(period?.limitAmount || 0),
      now,
      period
    ).map((p) => ({
      date: p.date,
      value: p.spent,
      comparison: lifetime ? undefined : p.ideal,
      ceiling: p.limit,
    })),
    periods: budgetHistory(history.data || []).map((p) => ({
      date: p.date,
      value: p.spent,
      ceiling: p.limit,
    })),
  }
}
export function useBorrowingAnalytics(
  space: string | undefined,
  borrowing?: Borrowing
) {
  const tz = useTimezone(),
    end = tz.endOfDay(tz.now()).toISOString(),
    established = borrowing?.establishedAt,
    firstDay = established ? tz.startOfDay(established).toISOString() : end,
    start = firstDay < end ? firstDay : end
  const query = useChartEntries(
    space,
    { borrowingId: borrowing?.id },
    !!borrowing?.id
  )
  const { points, projection } = borrowingTrajectory(
    borrowing || {},
    query.data || [],
    { start, end, timezone: tz.timezone }
  )
  const result: DetailChartPoint[] = points.map((p) => ({ ...p }))
  if (projection.length && result.length) {
    result[result.length - 1].comparison = projection[0].value
    result.push({ ...projection[1], value: null, comparison: 0 })
  }
  return { query, points: result }
}
