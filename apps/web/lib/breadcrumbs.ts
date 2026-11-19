export interface BreadcrumbSegment {
  label: string
  to?: string
}

const SETTINGS_LABELS: Record<string, string> = {
  account: "Account",
  security: "Security",
  credentials: "Logins & MFA",
  spaces: "Workspaces",
  finance: "Finance",
  preferences: "Preferences",
  "connected-accounts": "Connected Accounts",
  "api-keys": "API Keys",
}

const ADMIN_LABELS: Record<string, string> = {
  users: "Users",
  scheduler: "Scheduler",
  messages: "Message Queue",
  backups: "Database Backups",
  security: "Security Audit",
}

export function resolveBreadcrumbs(pathname: string): BreadcrumbSegment[] {
  if (pathname === "/" || pathname === "") {
    return [{ label: "Overview" }]
  }

  if (pathname.startsWith("/settings")) {
    const rest = pathname.slice("/settings".length).replace(/^\/+/, "")
    if (!rest) {
      return [{ label: "Settings" }]
    }
    const parts = rest.split("/").filter(Boolean)
    const leaf =
      SETTINGS_LABELS[parts[parts.length - 1]] || parts[parts.length - 1]
    return [{ label: "Settings", to: "/settings/account" }, { label: leaf }]
  }

  if (pathname.startsWith("/admin")) {
    const parts = pathname.slice("/admin".length).split("/").filter(Boolean)
    const leaf = parts[0] ? ADMIN_LABELS[parts[0]] || parts[0] : "Users"
    return [{ label: "Admin", to: "/admin/users" }, { label: leaf }]
  }

  const spaceMatch = pathname.match(/^\/space\/([^/]+)(\/.*)?$/)
  if (spaceMatch) {
    const spaceId = spaceMatch[1]
    const rest = spaceMatch[2] || ""

    if (rest.startsWith("/finance")) {
      const sub = rest.slice("/finance".length).replace(/^\/+/, "")
      const financeRoot: BreadcrumbSegment = {
        label: "Finance",
        to: `/space/${spaceId}/finance`,
      }
      if (!sub) return [financeRoot, { label: "Insights" }]
      if (sub.startsWith("transactions"))
        return [financeRoot, { label: "Transactions" }]
      if (sub.startsWith("inbox"))
        return [financeRoot, { label: "Review Queue" }]
      if (sub.startsWith("accounts"))
        return [financeRoot, { label: "Accounts" }]
      if (sub.startsWith("budgets")) return [financeRoot, { label: "Budgets" }]
      if (sub.startsWith("recurring"))
        return [financeRoot, { label: "Recurring" }]
      if (sub.startsWith("borrowings"))
        return [financeRoot, { label: "Borrowings" }]
      if (sub.startsWith("reconcile"))
        return [financeRoot, { label: "Reconciliation" }]
      if (sub.startsWith("rates"))
        return [financeRoot, { label: "Exchange Rates" }]
      return [financeRoot]
    }

    if (rest.startsWith("/mail")) {
      return [{ label: "Mail" }]
    }
    if (rest.startsWith("/calendar")) {
      return [{ label: "Calendar" }]
    }
    if (rest.startsWith("/workflows")) {
      const sub = rest.slice("/workflows".length).replace(/^\/+/, "")
      const wfRoot: BreadcrumbSegment = {
        label: "Workflows",
        to: `/space/${spaceId}/workflows`,
      }
      if (!sub) return [wfRoot, { label: "Studio" }]
      if (sub === "new") return [wfRoot, { label: "New Flow" }]
      if (sub.startsWith("runs")) return [wfRoot, { label: "Run History" }]
      return [wfRoot, { label: "Editor" }]
    }
    if (rest.startsWith("/ai")) {
      const sub = rest.slice("/ai".length).replace(/^\/+/, "")
      if (sub.startsWith("chat")) return [{ label: "Copilot" }]
      const aiRoot: BreadcrumbSegment = {
        label: "AI Studio",
        to: `/space/${spaceId}/ai/agents`,
      }
      if (sub.startsWith("agents")) return [aiRoot, { label: "Agents" }]
      if (sub.startsWith("models"))
        return [aiRoot, { label: "Models & Providers" }]
      if (sub.startsWith("mcp")) return [aiRoot, { label: "MCP Servers" }]
      if (sub.startsWith("runs")) return [aiRoot, { label: "Execution Runs" }]
      return [aiRoot]
    }

    return [{ label: "Overview" }]
  }

  return []
}
