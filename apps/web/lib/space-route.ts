const PRESERVED_MODULE_ROOTS = [
  "/finance/transactions",
  "/finance/accounts",
  "/finance/budgets",
  "/finance/inbox",
  "/finance/reconcile",
  "/finance/recurring",
  "/finance/rates",
  "/finance/borrowings",
  "/finance/settings",
  "/finance",
  "/calendar",
  "/mail",
  "/workflows/runs",
  "/workflows",
  "/ai/chat",
  "/ai/agents",
  "/ai/models",
  "/ai/mcp",
  "/ai/runs",
] as const

export function resolveNextSpaceRoute(
  pathname: string,
  nextSpaceId: string
): string | null {
  const match = pathname.match(/^\/space\/[^/]+(\/.*)?$/)
  if (!match) {
    return null
  }

  const rest = match[1] || ""
  for (const root of PRESERVED_MODULE_ROOTS) {
    if (rest === root || rest.startsWith(`${root}/`)) {
      return `/space/${nextSpaceId}${root}`
    }
  }

  return `/space/${nextSpaceId}/finance`
}
