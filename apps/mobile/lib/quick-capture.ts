export type SpaceRole = "owner" | "admin" | "member" | "viewer"

export type TransactionFlowType =
  "EXPENSE" | "INCOME" | "TRANSFER" | "SCHEDULED" | "BORROWING"

const VALID_TRANSACTION_TYPES: ReadonlySet<TransactionFlowType> = new Set([
  "EXPENSE",
  "INCOME",
  "TRANSFER",
  "SCHEDULED",
  "BORROWING",
])

export function resolveTransactionFlowType(
  type?: string,
  tab?: string
): TransactionFlowType {
  const candidate = (type || tab || "").trim().toUpperCase()
  if (VALID_TRANSACTION_TYPES.has(candidate as TransactionFlowType)) {
    return candidate as TransactionFlowType
  }
  return "EXPENSE"
}

export function canWriteWorkspace(role?: string): boolean {
  return role === "owner" || role === "admin" || role === "member"
}

export type QuickCaptureIconKey =
  | "expense"
  | "income"
  | "transfer"
  | "scheduled"
  | "account"
  | "budget"
  | "inbox"
  | "event"
  | "mail"
  | "ai"

export interface QuickCaptureRouteDescriptor {
  id: string
  label: string
  description: string
  route: string
  iconKey: QuickCaptureIconKey
  tone: "destructive" | "success" | "primary" | "accent" | "warning"
}

export function getOverviewQuickCaptureActions(
  role?: string
): QuickCaptureRouteDescriptor[] {
  const writable = canWriteWorkspace(role)
  const actions: QuickCaptureRouteDescriptor[] = []

  if (writable) {
    actions.push(
      {
        id: "record-expense",
        label: "Record Expense",
        description: "Log an outgoing spend or purchase",
        route: "/modal/add-transaction?type=EXPENSE",
        iconKey: "expense",
        tone: "destructive",
      },
      {
        id: "record-income",
        label: "Record Income",
        description: "Log salary, payout, or deposit",
        route: "/modal/add-transaction?type=INCOME",
        iconKey: "income",
        tone: "success",
      },
      {
        id: "transfer-funds",
        label: "Transfer Funds",
        description: "Move money between accounts",
        route: "/modal/add-transaction?type=TRANSFER",
        iconKey: "transfer",
        tone: "primary",
      },
      {
        id: "new-calendar-event",
        label: "New Calendar Event",
        description: "Schedule a meeting or reminder",
        route: "/modal/manage-event",
        iconKey: "event",
        tone: "accent",
      }
    )
  }

  actions.push(
    {
      id: "compose-email",
      label: "Compose Email",
      description: "Write and send a new message",
      route: "/modal/compose-mail",
      iconKey: "mail",
      tone: "primary",
    },
    {
      id: "ask-saturn-ai",
      label: "Ask Saturn AI",
      description: "Chat with your workspace assistant",
      route: "/(app)/ai",
      iconKey: "ai",
      tone: "accent",
    }
  )

  return actions
}

export function getFinanceQuickCaptureActions(
  role?: string
): QuickCaptureRouteDescriptor[] {
  if (!canWriteWorkspace(role)) {
    return []
  }

  return [
    {
      id: "finance-record-expense",
      label: "Record Expense",
      description: "Log an outgoing spend or purchase",
      route: "/modal/add-transaction?type=EXPENSE",
      iconKey: "expense",
      tone: "destructive",
    },
    {
      id: "finance-record-income",
      label: "Record Income",
      description: "Log salary, payout, or deposit",
      route: "/modal/add-transaction?type=INCOME",
      iconKey: "income",
      tone: "success",
    },
    {
      id: "finance-transfer-funds",
      label: "Transfer Funds",
      description: "Move money between accounts",
      route: "/modal/add-transaction?type=TRANSFER",
      iconKey: "transfer",
      tone: "primary",
    },
    {
      id: "finance-confirm-scheduled",
      label: "Confirm Scheduled Bill",
      description: "Review and post a pending recurring bill",
      route: "/modal/add-transaction?type=SCHEDULED",
      iconKey: "scheduled",
      tone: "warning",
    },
    {
      id: "finance-new-account",
      label: "New Account",
      description: "Add a bank, card, or cash account",
      route: "/modal/manage-account",
      iconKey: "account",
      tone: "success",
    },
    {
      id: "finance-new-budget",
      label: "New Budget",
      description: "Create a spending category budget",
      route: "/modal/manage-budget",
      iconKey: "budget",
      tone: "accent",
    },
    {
      id: "finance-review-queue",
      label: "Review Queue",
      description: "Triage pending receipts, invoices, and bank alerts",
      route: "/(app)/finance/inbox",
      iconKey: "inbox",
      tone: "primary",
    },
  ]
}
