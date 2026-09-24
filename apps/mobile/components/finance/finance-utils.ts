import { QueryClient } from "@tanstack/react-query"

export {
  getCurrencySymbol,
  formatInterval,
  getScheduledDisplayName,
  formatAmount,
  formatCents,
  toCentsString,
} from "@saturn/core"

export async function invalidateFinanceQueries(queryClient: QueryClient) {
  await queryClient.invalidateQueries({
    predicate: (query) => {
      const firstKey = query.queryKey[0]
      return (
        typeof firstKey === "string" && firstKey.startsWith("/api/v1/finance")
      )
    },
  })
}
