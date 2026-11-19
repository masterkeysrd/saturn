import { translate } from "@saturn/i18n"

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

const SETTINGS_LABELS_ES: Record<string, string> = {
  account: "Cuenta",
  security: "Seguridad",
  credentials: "Accesos y 2FA",
  spaces: "Espacios de trabajo",
  finance: "Finanzas",
  preferences: "Preferencias",
  "connected-accounts": "Cuentas conectadas",
  "api-keys": "Claves API",
}

const ADMIN_LABELS: Record<string, string> = {
  users: "Users",
  scheduler: "Scheduler",
  messages: "Message Queue",
  backups: "Database Backups",
  security: "Security Audit",
}

const ADMIN_LABELS_ES: Record<string, string> = {
  users: "Usuarios",
  scheduler: "Planificador",
  messages: "Cola de mensajes",
  backups: "Copias de seguridad",
  security: "Auditoría de seguridad",
}

export function resolveBreadcrumbs(
  pathname: string,
  locale = "en-US"
): BreadcrumbSegment[] {
  const isEs = locale.toLowerCase().startsWith("es")
  const settingsMap = isEs ? SETTINGS_LABELS_ES : SETTINGS_LABELS
  const adminMap = isEs ? ADMIN_LABELS_ES : ADMIN_LABELS

  if (pathname === "/" || pathname === "") {
    return [{ label: translate(locale, "nav.overview") }]
  }

  if (pathname.startsWith("/settings")) {
    const rest = pathname.slice("/settings".length).replace(/^\/+/, "")
    if (!rest) {
      return [{ label: translate(locale, "nav.settings") }]
    }
    const parts = rest.split("/").filter(Boolean)
    const leaf = settingsMap[parts[parts.length - 1]] || parts[parts.length - 1]
    return [
      { label: translate(locale, "nav.settings"), to: "/settings/account" },
      { label: leaf },
    ]
  }

  if (pathname.startsWith("/admin")) {
    const parts = pathname.slice("/admin".length).split("/").filter(Boolean)
    const leaf = parts[0] ? adminMap[parts[0]] || parts[0] : adminMap.users
    return [
      { label: translate(locale, "nav.group.admin"), to: "/admin/users" },
      { label: leaf },
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
      if (!sub) return [wfRoot, { label: isEs ? "Estudio" : "Studio" }]
      if (sub === "new")
        return [wfRoot, { label: isEs ? "Nuevo flujo" : "New Flow" }]
      if (sub.startsWith("runs"))
        return [
          wfRoot,
          { label: isEs ? "Historial de ejecuciones" : "Run History" },
        ]
      return [wfRoot, { label: isEs ? "Editor" : "Editor" }]
    }
    if (rest.startsWith("/ai")) {
      const sub = rest.slice("/ai".length).replace(/^\/+/, "")
      if (sub.startsWith("chat"))
        return [{ label: translate(locale, "nav.ai") }]
      const aiRoot: BreadcrumbSegment = {
        label: isEs ? "Estudio IA" : "AI Studio",
        to: `/space/${spaceId}/ai/agents`,
      }
      if (sub.startsWith("agents"))
        return [aiRoot, { label: translate(locale, "nav.agents") }]
      if (sub.startsWith("models"))
        return [aiRoot, { label: translate(locale, "nav.models") }]
      if (sub.startsWith("mcp"))
        return [aiRoot, { label: translate(locale, "nav.mcp") }]
      if (sub.startsWith("runs"))
        return [aiRoot, { label: isEs ? "Ejecuciones" : "Execution Runs" }]
      return [aiRoot]
    }

    return [{ label: translate(locale, "nav.overview") }]
  }

  return []
}
