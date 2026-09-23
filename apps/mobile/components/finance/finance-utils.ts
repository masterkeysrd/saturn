import { QueryClient } from "@tanstack/react-query"

export function getCurrencySymbol(currencyCode: string): string {
  if (!currencyCode) return "$"
  try {
    const formatter = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currencyCode,
      currencyDisplay: "narrowSymbol",
    })
    const parts = formatter.formatToParts(0)
    const symbolPart = parts.find((p) => p.type === "currency")
    return symbolPart?.value || currencyCode
  } catch {
    return currencyCode
  }
}

export function formatInterval(interval?: string): string {
  if (!interval) return "Monthly"
  const clean = interval.replace("INTERVAL_", "").toLowerCase()
  return clean.charAt(0).toUpperCase() + clean.slice(1)
}

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
