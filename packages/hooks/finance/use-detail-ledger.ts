import { SaturnApiError } from "@saturn/api"
import { useQuery, useInfiniteQuery } from "@tanstack/react-query"
import {
  listTransactions,
  getBudgetPeriod,
  type ListTransactionsRequest,
  type BudgetPeriod,
  type Transaction,
} from "@saturn/api/saturn/finance/v1/finance"
import { useTimezone } from "../timezone/use-timezone"

export function useDetailLedger(
  space: string | undefined,
  req: ListTransactionsRequest,
  enabled = true
) {
  return useInfiniteQuery({
    queryKey: ["/api/v1/finance/transactions", "ledger", space, req],
    enabled: !!space && enabled,
    initialPageParam: "",
    queryFn: ({ pageParam }) =>
      listTransactions({
        ...req,
        view: "FULL",
        pageSize: 40,
        pageToken: pageParam,
      }),
    getNextPageParam: (last) => last.nextPageToken || undefined,
  })
}
export function useChartEntries(
  space: string | undefined,
  req: ListTransactionsRequest,
  enabled: boolean
) {
  return useQuery({
    queryKey: ["/api/v1/finance/transactions", "chart", space, req],
    enabled: !!space && enabled,
    queryFn: async () => {
      const entries: Transaction[] = []
      let pageToken: string | undefined
      do {
        const page = await listTransactions({
          ...req,
          view: "FULL",
          pageSize: 100,
          pageToken,
        })
        entries.push(...(page.transactions || []))
        pageToken = page.nextPageToken
      } while (pageToken)
      return entries
    },
  })
}
export function useBudgetHistory(
  space: string | undefined,
  id: string | undefined,
  current: BudgetPeriod | undefined,
  oneTime: boolean
) {
  const tz = useTimezone()
  return useQuery({
    queryKey: [
      `/api/v1/finance/budgets/${id}/period`,
      "history",
      space,
      current,
    ],
    enabled: !oneTime && !!space && !!current?.startDate && !!id,
    queryFn: async () => {
      const periods: BudgetPeriod[] = [current!]
      while (periods.length < 6) {
        const start = periods[0].startDate!
        const date = new Date(+tz.startOfDay(start) - 1).toISOString()
        let previous: BudgetPeriod
        try {
          previous = await getBudgetPeriod(id!, { budgetId: id!, date })
        } catch (error) {
          if (error instanceof SaturnApiError && error.status === 404) break
          throw error
        }
        if (!previous.startDate || previous.startDate >= start) break
        periods.unshift(previous)
      }
      return periods
    },
  })
}
