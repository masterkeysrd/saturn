export const DASHBOARD_WIDGET_IDS = [
  "ai_quick_ask",
  "net_worth",
  "budget_pace",
  "upcoming_bills",
  "today_schedule",
  "priority_mail",
  "workflow_runs",
] as const

export type DashboardWidgetId = (typeof DASHBOARD_WIDGET_IDS)[number]

export type DashboardWidgetSpan = "standard" | "wide"

export type DashboardWidgetCategory =
  "ai" | "finance" | "productivity" | "automation"

export interface DashboardWidgetDefinition {
  id: DashboardWidgetId
  title: string
  description: string
  span: DashboardWidgetSpan
  category: DashboardWidgetCategory
}

export const DEFAULT_DASHBOARD_WIDGETS: readonly DashboardWidgetId[] = [
  "ai_quick_ask",
  "net_worth",
  "budget_pace",
  "today_schedule",
  "priority_mail",
]

export const DASHBOARD_WIDGET_CATALOG: readonly DashboardWidgetDefinition[] = [
  {
    id: "ai_quick_ask",
    title: "AI Quick Ask",
    description:
      "Compact copilot omnibar with one-click prompts across your Space.",
    span: "wide",
    category: "ai",
  },
  {
    id: "net_worth",
    title: "Net Worth & Liquid Cash",
    description:
      "Total net worth, assets, and liabilities converted to your base currency.",
    span: "standard",
    category: "finance",
  },
  {
    id: "budget_pace",
    title: "Monthly Budget Pace",
    description:
      "Aggregate spending vs. budget with an elapsed-month pace marker.",
    span: "standard",
    category: "finance",
  },
  {
    id: "upcoming_bills",
    title: "Upcoming Bills",
    description: "Scheduled inflows and outflows due over the next 14 days.",
    span: "standard",
    category: "finance",
  },
  {
    id: "today_schedule",
    title: "Today's Schedule",
    description:
      "Localized timeline of today's calendar events and meeting links.",
    span: "standard",
    category: "productivity",
  },
  {
    id: "priority_mail",
    title: "Priority Mail",
    description:
      "Inbox unread count and top threads with quick one-click archive.",
    span: "standard",
    category: "productivity",
  },
  {
    id: "workflow_runs",
    title: "Workflow Runs",
    description:
      "Recent automation executions, completion statuses, and error alerts.",
    span: "standard",
    category: "automation",
  },
]

export const DASHBOARD_WIDGET_MAP: Readonly<
  Record<DashboardWidgetId, DashboardWidgetDefinition>
> = Object.fromEntries(
  DASHBOARD_WIDGET_CATALOG.map((w) => [w.id, w])
) as Record<DashboardWidgetId, DashboardWidgetDefinition>

export interface DashboardPreset {
  id: "default" | "finance" | "comms" | "automation"
  label: string
  description: string
  widgets: readonly DashboardWidgetId[]
}

export const DASHBOARD_PRESETS: readonly DashboardPreset[] = [
  {
    id: "default",
    label: "Life OS Default",
    description: "Balanced pulse across AI, finance, schedule, and mail.",
    widgets: [
      "ai_quick_ask",
      "net_worth",
      "budget_pace",
      "today_schedule",
      "priority_mail",
    ],
  },
  {
    id: "finance",
    label: "Finance Focus",
    description: "Cash flow, net worth, budget pacing, and upcoming bills.",
    widgets: ["net_worth", "budget_pace", "upcoming_bills", "ai_quick_ask"],
  },
  {
    id: "comms",
    label: "Daily Comms",
    description: "Schedule, priority inbox threads, and AI assistant.",
    widgets: ["ai_quick_ask", "today_schedule", "priority_mail"],
  },
  {
    id: "automation",
    label: "Automation Ops",
    description: "Workflow execution history, priority mail, and copilot.",
    widgets: ["workflow_runs", "ai_quick_ask", "priority_mail"],
  },
]

const WIDGET_ID_SET = new Set<string>(DASHBOARD_WIDGET_IDS)

export function isDashboardWidgetId(value: string): value is DashboardWidgetId {
  return WIDGET_ID_SET.has(value)
}

export function normalizeDashboardWidgets(
  widgets?: readonly string[] | null
): DashboardWidgetId[] {
  if (!widgets || widgets.length === 0) {
    return [...DEFAULT_DASHBOARD_WIDGETS]
  }

  const seen = new Set<DashboardWidgetId>()
  const normalized: DashboardWidgetId[] = []

  for (const item of widgets) {
    if (isDashboardWidgetId(item) && !seen.has(item)) {
      seen.add(item)
      normalized.push(item)
    }
  }

  if (normalized.length === 0) {
    return [...DEFAULT_DASHBOARD_WIDGETS]
  }

  return normalized
}
