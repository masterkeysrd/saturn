import { translate, type TranslationKey } from "@saturn/i18n"

export interface BreadcrumbSegment {
  label: string
  to?: string
}

const SETTINGS_ROUTE_KEYS: Record<string, TranslationKey> = {
  account: "settings.hub.navProfile",
  security: "settings.hub.navAccessSecurity",
  "security/credentials": "settings.hub.navCredentials",
  credentials: "settings.hub.navCredentials",
  "security/devices": "settings.hub.navSessions",
  devices: "settings.hub.navSessions",
  "security/activity": "settings.hub.navActivityLog",
  activity: "settings.hub.navActivityLog",
  "security/api-keys": "settings.hub.navPersonalKeys",
  "api-keys": "settings.hub.navWorkspaceKeys",
  "security/oauth-apps": "settings.hub.navPersonalOAuthApps",
  "oauth-apps": "settings.hub.navWorkspaceOAuthApps",
  spaces: "settings.hub.navWorkspaces",
  preferences: "settings.hub.navPreferences",
  finance: "settings.hub.navFinance",
  "connected-accounts": "settings.hub.navConnectedAccounts",
}

const ADMIN_ROUTE_KEYS: Record<string, TranslationKey> = {
  users: "nav.adminUsers",
  scheduler: "nav.adminScheduler",
  messages: "nav.adminMessages",
  backups: "nav.adminBackups",
  security: "nav.adminSecurity",
  "oauth-clients": "nav.oauthClients",
}

export function resolveBreadcrumbs(
  pathname: string,
  locale = "en-US"
): BreadcrumbSegment[] {
  if (pathname === "/" || pathname === "") {
    return [{ label: translate(locale, "nav.overview") }]
  }

  if (pathname.startsWith("/settings")) {
    const rest = pathname.slice("/settings".length).replace(/^\/+/, "")
    if (!rest) {
      return [{ label: translate(locale, "nav.settings") }]
    }
    const parts = rest.split("/").filter(Boolean)
    const leaf = parts[parts.length - 1]
    const key = SETTINGS_ROUTE_KEYS[rest] ?? SETTINGS_ROUTE_KEYS[leaf]
    return [
      { label: translate(locale, "nav.settings"), to: "/settings/account" },
      { label: key ? translate(locale, key) : leaf },
    ]
  }

  if (pathname.startsWith("/admin")) {
    const parts = pathname.slice("/admin".length).split("/").filter(Boolean)
    const section = parts[0] || "users"
    const key = ADMIN_ROUTE_KEYS[section]
    return [
      { label: translate(locale, "nav.group.admin"), to: "/admin/users" },
      { label: key ? translate(locale, key) : section },
    ]
  }

  const spaceMatch = pathname.match(/^\/space\/([^/]+)(\/.*)?$/)
  if (spaceMatch) {
    const spaceId = spaceMatch[1]
    const rest = spaceMatch[2] || ""

    if (rest.startsWith("/finance")) {
      const sub = rest.slice("/finance".length).replace(/^\/+/, "")
      const financeRoot: BreadcrumbSegment = {
        label: translate(locale, "nav.finance"),
        to: `/space/${spaceId}/finance`,
      }
      if (!sub)
        return [financeRoot, { label: translate(locale, "nav.insights") }]
      if (sub.startsWith("transactions"))
        return [financeRoot, { label: translate(locale, "nav.transactions") }]
      if (sub.startsWith("inbox"))
        return [financeRoot, { label: translate(locale, "nav.inbox") }]
      if (sub.startsWith("accounts"))
        return [financeRoot, { label: translate(locale, "nav.accounts") }]
      if (sub.startsWith("budgets"))
        return [financeRoot, { label: translate(locale, "nav.budgets") }]
      if (sub.startsWith("recurring"))
        return [financeRoot, { label: translate(locale, "nav.recurring") }]
      if (sub.startsWith("borrowings"))
        return [financeRoot, { label: translate(locale, "nav.borrowing") }]
      if (sub.startsWith("reconcile"))
        return [financeRoot, { label: translate(locale, "nav.reconciliation") }]
      if (sub.startsWith("rates"))
        return [financeRoot, { label: translate(locale, "nav.exchangeRates") }]
      return [financeRoot]
    }

    if (rest.startsWith("/mail")) {
      return [{ label: translate(locale, "nav.mail") }]
    }
    if (rest.startsWith("/calendar")) {
      return [{ label: translate(locale, "nav.calendar") }]
    }
    if (rest.startsWith("/workflows")) {
      const sub = rest.slice("/workflows".length).replace(/^\/+/, "")
      const wfRoot: BreadcrumbSegment = {
        label: translate(locale, "nav.workflows"),
        to: `/space/${spaceId}/workflows`,
      }
      if (!sub) return [wfRoot, { label: translate(locale, "nav.studio") }]
      if (sub === "new")
        return [wfRoot, { label: translate(locale, "workflows.newWorkflow") }]
      if (sub.startsWith("runs"))
        return [wfRoot, { label: translate(locale, "workflows.runHistory") }]
      return [wfRoot, { label: translate(locale, "nav.editor") }]
    }
    if (rest.startsWith("/ai")) {
      const sub = rest.slice("/ai".length).replace(/^\/+/, "")
      if (sub.startsWith("chat"))
        return [{ label: translate(locale, "nav.ai") }]
      const aiRoot: BreadcrumbSegment = {
        label: translate(locale, "nav.aiStudio"),
        to: `/space/${spaceId}/ai/agents`,
      }
      if (sub.startsWith("agents"))
        return [aiRoot, { label: translate(locale, "nav.agents") }]
      if (sub.startsWith("models"))
        return [aiRoot, { label: translate(locale, "nav.models") }]
      if (sub.startsWith("mcp"))
        return [aiRoot, { label: translate(locale, "nav.mcp") }]
      if (sub.startsWith("runs"))
        return [aiRoot, { label: translate(locale, "ai.runs.title") }]
      return [aiRoot]
    }

    return [{ label: translate(locale, "nav.overview") }]
  }

  return []
}
