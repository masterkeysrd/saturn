import { unwrapToolResult } from "./tool-formatting"

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
  isReadOnly: boolean
  isDestructive: boolean
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
  isReadOnly: boolean
  isDestructive?: boolean
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
    isReadOnly: true,
  },
  space_context: {
    domain: "space",
    label: "Workspace Context",
    activeLabel: "Reading workspace context…",
    completedLabel: "Read workspace context",
    isReadOnly: true,
  },

  // Finance
  finance_list_accounts: {
    domain: "finance",
    label: "List Accounts",
    activeLabel: "Checking accounts…",
    completedLabel: "Checked accounts",
    countKeys: ["accounts"],
    isReadOnly: true,
  },
  finance_accounts: {
    domain: "finance",
    label: "Accounts",
    activeLabel: "Reading accounts…",
    completedLabel: "Read accounts",
    countKeys: ["accounts"],
    isReadOnly: true,
  },
  finance_list_budgets: {
    domain: "finance",
    label: "List Budgets",
    activeLabel: "Checking budgets…",
    completedLabel: "Checked budgets",
    countKeys: ["budgets"],
    isReadOnly: true,
  },
  finance_budgets: {
    domain: "finance",
    label: "Budgets",
    activeLabel: "Reading budgets…",
    completedLabel: "Read budgets",
    countKeys: ["budgets"],
    isReadOnly: true,
  },
  finance_list_transactions: {
    domain: "finance",
    label: "List Transactions",
    activeLabel: "Searching transactions…",
    completedLabel: "Searched transactions",
    countKeys: ["transactions"],
    isReadOnly: true,
  },
  finance_get_insights: {
    domain: "finance",
    label: "Spending Insights",
    activeLabel: "Analyzing spending insights…",
    completedLabel: "Analyzed spending insights",
    isReadOnly: true,
  },
  finance_list_inbox_items: {
    domain: "finance",
    label: "Finance Inbox",
    activeLabel: "Checking finance inbox…",
    completedLabel: "Checked finance inbox",
    countKeys: ["items", "inbox_items", "inboxItems"],
    isReadOnly: true,
  },
  finance_list_borrowings: {
    domain: "finance",
    label: "List Borrowings",
    activeLabel: "Checking borrowings…",
    completedLabel: "Checked borrowings",
    countKeys: ["borrowings"],
    isReadOnly: true,
  },
  finance_list_recurring: {
    domain: "finance",
    label: "Recurring Transactions",
    activeLabel: "Checking recurring items…",
    completedLabel: "Checked recurring items",
    countKeys: ["recurring"],
    isReadOnly: true,
  },
  finance_create_transaction: {
    domain: "finance",
    label: "Create Transaction",
    activeLabel: "Recording transaction…",
    completedLabel: "Recorded transaction",
    isReadOnly: false,
  },
  finance_create_expense: {
    domain: "finance",
    label: "Create Expense",
    activeLabel: "Recording expense…",
    completedLabel: "Recorded expense",
    isReadOnly: false,
  },
  finance_create_transfer: {
    domain: "finance",
    label: "Create Transfer",
    activeLabel: "Recording transfer…",
    completedLabel: "Recorded transfer",
    isReadOnly: false,
  },
  finance_create_inbox_item: {
    domain: "finance",
    label: "Stage Inbox Item",
    activeLabel: "Staging inbox item…",
    completedLabel: "Staged inbox item",
    isReadOnly: false,
  },
  finance_update_transaction: {
    domain: "finance",
    label: "Update Transaction",
    activeLabel: "Updating transaction…",
    completedLabel: "Updated transaction",
    isReadOnly: false,
  },
  finance_delete_transaction: {
    domain: "finance",
    label: "Delete Transaction",
    activeLabel: "Deleting transaction…",
    completedLabel: "Deleted transaction",
    isReadOnly: false,
    isDestructive: true,
  },
  finance_list_transfers: {
    domain: "finance",
    label: "List Transfers",
    activeLabel: "Checking transfers…",
    completedLabel: "Checked transfers",
    countKeys: ["transfers"],
    isReadOnly: true,
  },
  finance_review_inbox_item: {
    domain: "finance",
    label: "Review Inbox Item",
    activeLabel: "Reviewing inbox item…",
    completedLabel: "Reviewed inbox item",
    isReadOnly: false,
  },
  finance_manage_budget: {
    domain: "finance",
    label: "Manage Budget",
    activeLabel: "Updating budget…",
    completedLabel: "Saved budget",
    isReadOnly: false,
  },
  finance_adjust_account_balance: {
    domain: "finance",
    label: "Adjust Balance",
    activeLabel: "Reconciling account balance…",
    completedLabel: "Adjusted account balance",
    isReadOnly: false,
  },
  finance_log_borrowing_payment: {
    domain: "finance",
    label: "Log Borrowing Payment",
    activeLabel: "Recording borrowing payment…",
    completedLabel: "Recorded borrowing payment",
    isReadOnly: false,
  },
  finance_list_scheduled: {
    domain: "finance",
    label: "Upcoming Scheduled",
    activeLabel: "Checking upcoming bills…",
    completedLabel: "Checked upcoming bills",
    countKeys: ["scheduled", "items"],
    isReadOnly: true,
  },
  finance_resolve_scheduled: {
    domain: "finance",
    label: "Resolve Scheduled Bill",
    activeLabel: "Resolving scheduled transaction…",
    completedLabel: "Resolved scheduled transaction",
    isReadOnly: false,
  },

  // Calendar
  calendar_list_calendars: {
    domain: "calendar",
    label: "List Calendars",
    activeLabel: "Checking calendars…",
    completedLabel: "Checked calendars",
    countKeys: ["calendars"],
    isReadOnly: true,
  },
  calendar_list_events: {
    domain: "calendar",
    label: "List Events",
    activeLabel: "Checking calendar events…",
    completedLabel: "Checked calendar events",
    countKeys: ["events"],
    isReadOnly: true,
  },
  calendar_create_event: {
    domain: "calendar",
    label: "Create Event",
    activeLabel: "Scheduling event…",
    completedLabel: "Scheduled event",
    isReadOnly: false,
  },
  calendar_update_event: {
    domain: "calendar",
    label: "Update Event",
    activeLabel: "Updating event…",
    completedLabel: "Updated event",
    isReadOnly: false,
  },
  calendar_delete_event: {
    domain: "calendar",
    label: "Delete Event",
    activeLabel: "Deleting event…",
    completedLabel: "Deleted event",
    isReadOnly: false,
    isDestructive: true,
  },
  calendar_respond_to_event: {
    domain: "calendar",
    label: "Respond to Invite",
    activeLabel: "Updating event RSVP…",
    completedLabel: "Updated event RSVP",
    isReadOnly: false,
  },

  // Mail
  mail_list_threads: {
    domain: "mail",
    label: "Search Mail",
    activeLabel: "Searching mail threads…",
    completedLabel: "Searched mail threads",
    countKeys: ["threads"],
    isReadOnly: true,
  },
  mail_get_thread: {
    domain: "mail",
    label: "Read Email Thread",
    activeLabel: "Reading email thread…",
    completedLabel: "Read email thread",
    countKeys: ["messages"],
    isReadOnly: true,
  },
  mail_list_drafts: {
    domain: "mail",
    label: "List Drafts",
    activeLabel: "Checking email drafts…",
    completedLabel: "Checked email drafts",
    countKeys: ["drafts"],
    isReadOnly: true,
  },
  mail_create_draft: {
    domain: "mail",
    label: "Create Draft",
    activeLabel: "Drafting email…",
    completedLabel: "Drafted email",
    isReadOnly: false,
  },
  mail_update_draft: {
    domain: "mail",
    label: "Update Draft",
    activeLabel: "Updating email draft…",
    completedLabel: "Updated email draft",
    isReadOnly: false,
  },
  mail_delete_draft: {
    domain: "mail",
    label: "Delete Draft",
    activeLabel: "Deleting email draft…",
    completedLabel: "Deleted email draft",
    isReadOnly: false,
    isDestructive: true,
  },
  mail_modify_thread: {
    domain: "mail",
    label: "Update Thread",
    activeLabel: "Updating email thread…",
    completedLabel: "Updated email thread",
    isReadOnly: false,
  },
  mail_archive_thread: {
    domain: "mail",
    label: "Archive Thread",
    activeLabel: "Archiving email thread…",
    completedLabel: "Archived email thread",
    isReadOnly: false,
  },
  mail_send_message: {
    domain: "mail",
    label: "Send Email",
    activeLabel: "Sending email…",
    completedLabel: "Sent email",
    isReadOnly: false,
    isDestructive: true,
  },

  // Workflows
  workflows_list_flows: {
    domain: "workflows",
    label: "List Workflows",
    activeLabel: "Checking workflows…",
    completedLabel: "Checked workflows",
    countKeys: ["flows"],
    isReadOnly: true,
  },
  workflows_list_flow_runs: {
    domain: "workflows",
    label: "List Workflow Runs",
    activeLabel: "Checking workflow runs…",
    completedLabel: "Checked workflow runs",
    countKeys: ["runs"],
    isReadOnly: true,
  },
  workflows_get_flow_run: {
    domain: "workflows",
    label: "Workflow Run Details",
    activeLabel: "Inspecting workflow run…",
    completedLabel: "Inspected workflow run",
    countKeys: ["step_runs", "stepRuns"],
    isReadOnly: true,
  },
  workflows_execute_flow: {
    domain: "workflows",
    label: "Run Workflow",
    activeLabel: "Running workflow…",
    completedLabel: "Triggered workflow",
    isReadOnly: false,
  },
  workflows_set_flow_enabled: {
    domain: "workflows",
    label: "Toggle Workflow",
    activeLabel: "Updating workflow state…",
    completedLabel: "Updated workflow state",
    isReadOnly: false,
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

function inferReadOnly(toolName: string): boolean {
  return /(?:^|_)(?:list|get|search)(?:_|$)/i.test(toolName)
}

function inferDestructive(toolName: string): boolean {
  return /(?:^|_)delete(?:_|$)/i.test(toolName)
}

export function describeToolCall({
  toolName,
  mcpServerName,
  arguments: args,
  result,
}: DescribeToolCallInput): ToolDescriptor {
  const unwrappedResult = unwrapToolResult(result)
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
      summary: extractSummary(args, unwrappedResult, known.countKeys),
      isReadOnly: known.isReadOnly,
      isDestructive: Boolean(known.isDestructive),
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
      summary: extractSummary(args, unwrappedResult),
      isReadOnly: false,
      isDestructive: false,
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
      summary: extractSummary(args, unwrappedResult),
      isReadOnly: inferReadOnly(rawOp),
      isDestructive: inferDestructive(rawOp),
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
    summary: extractSummary(args, unwrappedResult),
    isReadOnly: inferReadOnly(toolName),
    isDestructive: inferDestructive(toolName),
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
