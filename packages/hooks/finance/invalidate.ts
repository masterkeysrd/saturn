import type { QueryClient } from "@tanstack/react-query"

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
