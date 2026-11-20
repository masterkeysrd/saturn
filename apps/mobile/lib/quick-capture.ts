import type { TranslationKey } from "@saturn/i18n"

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
  label: TranslationKey
  description: TranslationKey
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
        label: "dashboard.quickAction.recordExpense",
        description: "dashboard.quickAction.recordExpenseDesc",
        route: "/modal/add-transaction?type=EXPENSE",
        iconKey: "expense",
        tone: "destructive",
      },
      {
        id: "record-income",
        label: "dashboard.quickAction.recordIncome",
        description: "dashboard.quickAction.recordIncomeDesc",
        route: "/modal/add-transaction?type=INCOME",
        iconKey: "income",
        tone: "success",
      },
      {
        id: "transfer-funds",
        label: "dashboard.quickAction.transferFunds",
        description: "dashboard.quickAction.transferFundsDesc",
        route: "/modal/add-transaction?type=TRANSFER",
        iconKey: "transfer",
        tone: "primary",
      },
      {
        id: "new-calendar-event",
        label: "dashboard.quickAction.newEvent",
        description: "dashboard.quickAction.newEventDesc",
        route: "/modal/manage-event",
        iconKey: "event",
        tone: "accent",
      }
    )
  }

  actions.push(
    {
      id: "compose-email",
      label: "dashboard.quickAction.composeEmail",
      description: "dashboard.quickAction.composeEmailDesc",
      route: "/modal/compose-mail",
      iconKey: "mail",
      tone: "primary",
    },
    {
      id: "ask-saturn-ai",
      label: "dashboard.quickAction.askAi",
      description: "dashboard.quickAction.askAiDesc",
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
      label: "dashboard.quickAction.recordExpense",
      description: "dashboard.quickAction.recordExpenseDesc",
      route: "/modal/add-transaction?type=EXPENSE",
      iconKey: "expense",
      tone: "destructive",
    },
    {
      id: "finance-record-income",
      label: "dashboard.quickAction.recordIncome",
      description: "dashboard.quickAction.recordIncomeDesc",
      route: "/modal/add-transaction?type=INCOME",
      iconKey: "income",
      tone: "success",
    },
    {
      id: "finance-transfer-funds",
      label: "dashboard.quickAction.transferFunds",
      description: "dashboard.quickAction.transferFundsDesc",
      route: "/modal/add-transaction?type=TRANSFER",
      iconKey: "transfer",
      tone: "primary",
    },
    {
      id: "finance-confirm-scheduled",
      label: "dashboard.quickAction.confirmScheduled",
      description: "dashboard.quickAction.confirmScheduledDesc",
      route: "/modal/add-transaction?type=SCHEDULED",
      iconKey: "scheduled",
      tone: "warning",
    },
    {
      id: "finance-new-account",
      label: "dashboard.quickAction.newAccount",
      description: "dashboard.quickAction.newAccountDesc",
      route: "/modal/manage-account",
      iconKey: "account",
      tone: "success",
    },
    {
      id: "finance-new-budget",
      label: "dashboard.quickAction.newBudget",
      description: "dashboard.quickAction.newBudgetDesc",
      route: "/modal/manage-budget",
      iconKey: "budget",
      tone: "accent",
    },
    {
      id: "finance-review-queue",
      label: "dashboard.quickAction.reviewQueue",
      description: "dashboard.quickAction.reviewQueueDesc",
      route: "/(app)/finance/inbox",
      iconKey: "inbox",
      tone: "primary",
    },
  ]
}
