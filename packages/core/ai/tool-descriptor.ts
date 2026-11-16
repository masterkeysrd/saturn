export type ToolDomain =
  | "finance"
  | "calendar"
  | "mail"
  | "workflows"
  | "space"
  | "agent"
  | "mcp"
  | "general"

export type ToolDisplayStatus =
  | "running"
  | "completed"
  | "error"
  | "awaiting_approval"
  | "rejected"
  | "cancelled"

export type ThreadStreamPhase =
  | "idle"
  | "connecting"
  | "thinking"
  | "tool_running"
  | "generating"
  | "awaiting_approval"

export interface ToolDescriptor {
  toolName: string
  domain: ToolDomain
  domainLabel: string
  serverName?: string
  label: string
  activeLabel: string
  completedLabel: string
  summary?: string
}

export interface DescribeToolCallInput {
  toolName: string
  mcpServerName?: string
  arguments?: Record<string, unknown>
  result?: Record<string, unknown>
}

interface KnownToolMeta {
  domain: ToolDomain
  label: string
  activeLabel: string
  completedLabel: string
  countKeys?: string[]
}

const DOMAIN_LABELS: Record<ToolDomain, string> = {
  finance: "Finance",
  calendar: "Calendar",
  mail: "Mail",
  workflows: "Workflows",
  space: "Workspace",
  agent: "Agent",
  mcp: "MCP",
  general: "Tool",
}

const KNOWN_TOOLS: Record<string, KnownToolMeta> = {
  // Space
  space_get_context: {
    domain: "space",
    label: "Workspace Context",
    activeLabel: "Reading workspace context…",
    completedLabel: "Read workspace context",
  },
  space_context: {
    domain: "space",
    label: "Workspace Context",
    activeLabel: "Reading workspace context…",
    completedLabel: "Read workspace context",
  },

  // Finance
  finance_list_accounts: {
    domain: "finance",
    label: "List Accounts",
    activeLabel: "Checking accounts…",
    completedLabel: "Checked accounts",
    countKeys: ["accounts"],
  },
  finance_accounts: {
    domain: "finance",
    label: "Accounts",
    activeLabel: "Reading accounts…",
    completedLabel: "Read accounts",
    countKeys: ["accounts"],
  },
  finance_list_budgets: {
    domain: "finance",
    label: "List Budgets",
    activeLabel: "Checking budgets…",
    completedLabel: "Checked budgets",
    countKeys: ["budgets"],
  },
  finance_budgets: {
    domain: "finance",
    label: "Budgets",
    activeLabel: "Reading budgets…",
    completedLabel: "Read budgets",
    countKeys: ["budgets"],
  },
  finance_list_transactions: {
    domain: "finance",
    label: "List Transactions",
    activeLabel: "Searching transactions…",
    completedLabel: "Searched transactions",
    countKeys: ["transactions"],
  },
  finance_get_insights: {
    domain: "finance",
    label: "Spending Insights",
    activeLabel: "Analyzing spending insights…",
    completedLabel: "Analyzed spending insights",
  },
  finance_list_inbox_items: {
    domain: "finance",
    label: "Finance Inbox",
    activeLabel: "Checking finance inbox…",
    completedLabel: "Checked finance inbox",
    countKeys: ["items", "inbox_items", "inboxItems"],
  },
  finance_list_borrowings: {
    domain: "finance",
    label: "List Borrowings",
    activeLabel: "Checking borrowings…",
    completedLabel: "Checked borrowings",
    countKeys: ["borrowings"],
  },
  finance_list_recurring: {
    domain: "finance",
    label: "Recurring Transactions",
    activeLabel: "Checking recurring items…",
    completedLabel: "Checked recurring items",
    countKeys: ["recurring"],
  },
  finance_create_transaction: {
    domain: "finance",
    label: "Create Transaction",
    activeLabel: "Recording transaction…",
    completedLabel: "Recorded transaction",
  },
  finance_create_expense: {
    domain: "finance",
    label: "Create Expense",
    activeLabel: "Recording expense…",
    completedLabel: "Recorded expense",
  },
  finance_create_transfer: {
    domain: "finance",
    label: "Create Transfer",
    activeLabel: "Recording transfer…",
    completedLabel: "Recorded transfer",
  },
  finance_create_inbox_item: {
    domain: "finance",
    label: "Stage Inbox Item",
    activeLabel: "Staging inbox item…",
    completedLabel: "Staged inbox item",
  },

  // Calendar
  calendar_list_calendars: {
    domain: "calendar",
    label: "List Calendars",
    activeLabel: "Checking calendars…",
    completedLabel: "Checked calendars",
    countKeys: ["calendars"],
  },
  calendar_list_events: {
    domain: "calendar",
    label: "List Events",
    activeLabel: "Checking calendar events…",
    completedLabel: "Checked calendar events",
    countKeys: ["events"],
  },
  calendar_create_event: {
    domain: "calendar",
    label: "Create Event",
    activeLabel: "Scheduling event…",
    completedLabel: "Scheduled event",
  },
  calendar_update_event: {
    domain: "calendar",
    label: "Update Event",
    activeLabel: "Updating event…",
    completedLabel: "Updated event",
  },
  calendar_delete_event: {
    domain: "calendar",
    label: "Delete Event",
    activeLabel: "Deleting event…",
    completedLabel: "Deleted event",
  },

  // Mail
  mail_list_threads: {
    domain: "mail",
    label: "Search Mail",
    activeLabel: "Searching mail threads…",
    completedLabel: "Searched mail threads",
    countKeys: ["threads"],
  },
  mail_get_thread: {
    domain: "mail",
    label: "Read Email Thread",
    activeLabel: "Reading email thread…",
    completedLabel: "Read email thread",
    countKeys: ["messages"],
  },
  mail_create_draft: {
    domain: "mail",
    label: "Create Draft",
    activeLabel: "Drafting email…",
    completedLabel: "Drafted email",
  },
  mail_archive_thread: {
    domain: "mail",
    label: "Archive Thread",
    activeLabel: "Archiving email thread…",
    completedLabel: "Archived email thread",
  },
  mail_send_message: {
    domain: "mail",
    label: "Send Email",
    activeLabel: "Sending email…",
    completedLabel: "Sent email",
  },

  // Workflows
  workflows_list_flows: {
    domain: "workflows",
    label: "List Workflows",
    activeLabel: "Checking workflows…",
    completedLabel: "Checked workflows",
    countKeys: ["flows"],
  },
  workflows_get_flow_run: {
    domain: "workflows",
    label: "Workflow Run Details",
    activeLabel: "Inspecting workflow run…",
    completedLabel: "Inspected workflow run",
    countKeys: ["step_runs", "stepRuns"],
  },
  workflows_execute_flow: {
    domain: "workflows",
    label: "Run Workflow",
    activeLabel: "Running workflow…",
    completedLabel: "Triggered workflow",
  },
}

function titleCaseSegment(raw: string): string {
  return raw
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function inferDomain(toolName: string): ToolDomain {
  if (toolName.startsWith("finance_")) return "finance"
  if (toolName.startsWith("calendar_")) return "calendar"
  if (toolName.startsWith("mail_")) return "mail"
  if (toolName.startsWith("workflows_")) return "workflows"
  if (toolName.startsWith("space_")) return "space"
  if (toolName.startsWith("agent__")) return "agent"
  if (toolName.startsWith("mcp__")) return "mcp"
  return "general"
}

function formatAmountSummary(
  args: Record<string, unknown>
): string | undefined {
  const centsRaw = args.amount_cents ?? args.amountCents ?? args.amount
  if (typeof centsRaw !== "number" || !Number.isFinite(centsRaw)) {
    return undefined
  }
  const currency =
    typeof args.currency === "string" && args.currency.trim()
      ? args.currency.trim().toUpperCase()
      : ""
  const major = (centsRaw / 100).toFixed(2)
  return currency ? `${major} ${currency}` : major
}

function extractSummary(
  args?: Record<string, unknown>,
  result?: Record<string, unknown>,
  countKeys?: string[]
): string | undefined {
  if (result) {
    if (
      typeof result.formatted_amount === "string" &&
      result.formatted_amount
    ) {
      const desc =
        typeof result.description === "string" ? result.description : undefined
      return desc
        ? `${result.formatted_amount} · ${desc}`
        : result.formatted_amount
    }
    if (typeof result.formattedAmount === "string" && result.formattedAmount) {
      return result.formattedAmount
    }

    const keysToCheck = [
      ...(countKeys ?? []),
      "accounts",
      "budgets",
      "transactions",
      "events",
      "threads",
      "messages",
      "flows",
      "items",
      "results",
    ]
    for (const key of keysToCheck) {
      const val = result[key]
      if (Array.isArray(val)) {
        const noun = val.length === 1 ? key.replace(/s$/, "") : key
        return `${val.length} ${noun}`
      }
    }

    const scalarResult =
      result.subject ?? result.title ?? result.name ?? result.status
    if (typeof scalarResult === "string" && scalarResult.trim()) {
      return scalarResult.trim().slice(0, 48)
    }
  }

  if (!args) return undefined

  const parts: string[] = []
  const amountText = formatAmountSummary(args)
  if (amountText) parts.push(amountText)

  for (const key of [
    "description",
    "title",
    "subject",
    "query",
    "q",
    "city",
    "name",
    "prompt",
  ]) {
    const val = args[key]
    if (typeof val === "string" && val.trim()) {
      parts.push(val.trim().slice(0, 40))
      break
    }
  }

  if (parts.length > 0) {
    return parts.join(" · ")
  }
  return undefined
}

export function describeToolCall({
  toolName,
  mcpServerName,
  arguments: args,
  result,
}: DescribeToolCallInput): ToolDescriptor {
  const known = KNOWN_TOOLS[toolName]
  if (known) {
    return {
      toolName,
      domain: known.domain,
      domainLabel: DOMAIN_LABELS[known.domain],
      serverName: mcpServerName,
      label: known.label,
      activeLabel: known.activeLabel,
      completedLabel: known.completedLabel,
      summary: extractSummary(args, result, known.countKeys),
    }
  }

  if (toolName.startsWith("agent__")) {
    const slug = toolName.slice("agent__".length)
    const agentLabel = titleCaseSegment(slug) || "Agent"
    return {
      toolName,
      domain: "agent",
      domainLabel: DOMAIN_LABELS.agent,
      serverName: mcpServerName,
      label: agentLabel,
      activeLabel: `Consulting ${agentLabel}…`,
      completedLabel: `Consulted ${agentLabel}`,
      summary: extractSummary(args, result),
    }
  }

  if (toolName.startsWith("mcp__")) {
    const rest = toolName.slice("mcp__".length)
    const sepIdx = rest.indexOf("__")
    const serverSlug = sepIdx >= 0 ? rest.slice(0, sepIdx) : ""
    const rawOp = sepIdx >= 0 ? rest.slice(sepIdx + 2) : rest
    const opLabel = titleCaseSegment(rawOp) || toolName
    const resolvedServer =
      mcpServerName || (serverSlug ? titleCaseSegment(serverSlug) : undefined)
    return {
      toolName,
      domain: "mcp",
      domainLabel: resolvedServer ?? DOMAIN_LABELS.mcp,
      serverName: resolvedServer,
      label: opLabel,
      activeLabel: `Running ${opLabel}…`,
      completedLabel: `Ran ${opLabel}`,
      summary: extractSummary(args, result),
    }
  }

  const domain = inferDomain(toolName)
  const stripped =
    domain !== "general" ? toolName.slice(toolName.indexOf("_") + 1) : toolName
  const label = titleCaseSegment(stripped) || toolName

  return {
    toolName,
    domain,
    domainLabel: DOMAIN_LABELS[domain],
    serverName: mcpServerName,
    label,
    activeLabel: `Running ${label}…`,
    completedLabel: label,
    summary: extractSummary(args, result),
  }
}

export function getStreamPhaseLabel(
  phase: ThreadStreamPhase,
  options?: {
    activeToolName?: string
    activeServerName?: string
    hasCompletedTools?: boolean
  }
): string {
  switch (phase) {
    case "connecting":
      return "Starting turn…"
    case "thinking":
      return options?.hasCompletedTools
        ? "Reviewing tool results…"
        : "Thinking…"
    case "tool_running":
      if (options?.activeToolName) {
        return describeToolCall({
          toolName: options.activeToolName,
          mcpServerName: options.activeServerName,
        }).activeLabel
      }
      return "Running tool…"
    case "generating":
      return "Generating response…"
    case "awaiting_approval":
      return "Waiting for approval"
    default:
      return ""
  }
}

export function formatToolDuration(durationMs?: number): string | undefined {
  if (durationMs === undefined || durationMs <= 0) return undefined
  if (durationMs < 1000) return `${Math.round(durationMs)}ms`
  return `${(durationMs / 1000).toFixed(1)}s`
}
