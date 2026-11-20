import type {
  Flow,
  Flow_StepNode,
  Flow_Trigger,
} from "@saturn/api/gen/saturn/platform/workflow/v1/workflow"

export type WorkflowTemplateId =
  "receiptEmail" | "scheduledBill" | "morningBriefing" | "anomalyAlert"

export type WorkflowTemplateCategoryKey =
  | "categoryFinanceMail"
  | "categoryFinanceCalendar"
  | "categoryDailyPulse"
  | "categoryFinance"

export type WorkflowTemplateIcon = "receipt" | "calendar" | "sunrise" | "alert"

export interface WorkflowTemplate {
  id: WorkflowTemplateId
  categoryKey: WorkflowTemplateCategoryKey
  icon: WorkflowTemplateIcon
  flow: Flow
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "receiptEmail",
    categoryKey: "categoryFinanceMail",
    icon: "receipt",
    flow: {
      name: "Receipt Email to Finance Inbox",
      description:
        "Extracts receipt fields from inbound emails and stages valid receipts in Finance Inbox.",
      isEnabled: true,
      config: {},
      triggers: [
        {
          name: "Inbound Email Sync",
          type: "event",
          isEnabled: true,
          config: {
            topic: "mail.message.received",
            filter: "trigger.data.message.body_plain != ''",
          },
        },
      ],
      steps: [
        {
          id: "extract_receipt",
          name: "Extract Receipt Fields",
          type: "llm.generate",
          sources: {},
          cases: [],
          default: [],
          steps: [],
          inputs: {
            system:
              "You extract structured receipt fields from email messages. Set is_receipt to true only when the email represents a purchase receipt or invoice.",
            prompt:
              "Subject: {{ trigger.data.message.subject }}\n\nBody:\n{{ trigger.data.message.body_plain }}",
            output_schema: {
              type: "object",
              properties: {
                is_receipt: {
                  type: "boolean",
                  description: "Whether this email is a receipt or invoice",
                },
                vendor: { type: "string", description: "Merchant name" },
                amount_cents: {
                  type: "integer",
                  description: "Total amount in cents",
                },
                currency: {
                  type: "string",
                  description: "3-letter currency code",
                },
                date: {
                  type: "string",
                  description: "Receipt date (YYYY-MM-DD)",
                },
              },
              required: [
                "is_receipt",
                "vendor",
                "amount_cents",
                "currency",
                "date",
              ],
            },
          },
        },
        {
          id: "is_valid_receipt",
          name: "Is Valid Receipt",
          type: "switch",
          sources: {},
          cases: [
            {
              name: "valid_receipt",
              condition:
                "steps.extract_receipt.is_receipt == true && steps.extract_receipt.amount_cents > 0",
              steps: [
                {
                  id: "stage_finance_inbox",
                  name: "Stage in Finance Inbox",
                  type: "finance.create_inbox_item",
                  sources: {},
                  cases: [],
                  default: [],
                  steps: [],
                  inputs: {
                    idempotency_key: "{{ 'mail:' + trigger.data.message.id }}",
                    doc_type: "receipt",
                    vendor: "{{ steps.extract_receipt.vendor }}",
                    amount_cents: "{{ steps.extract_receipt.amount_cents }}",
                    currency:
                      "{{ steps.extract_receipt.?currency.orValue('USD') }}",
                    date: "{{ steps.extract_receipt.date }}",
                    raw_payload:
                      "{{ trigger.data.message.?body_plain.orValue('') }}",
                  },
                },
              ],
            },
          ],
          default: [],
          steps: [],
          inputs: {},
        },
      ],
    },
  },
  {
    id: "scheduledBill",
    categoryKey: "categoryFinanceCalendar",
    icon: "calendar",
    flow: {
      name: "Scheduled Bill Calendar Reminder",
      description:
        "Creates an all-day due-date reminder on your primary calendar when a scheduled bill is created.",
      isEnabled: true,
      config: {},
      triggers: [
        {
          name: "Scheduled Bill Created",
          type: "event",
          isEnabled: true,
          config: {
            topic: "finance.scheduled_transaction.created",
          },
        },
      ],
      steps: [
        {
          id: "create_reminder",
          name: "Create Due-Date Reminder",
          type: "calendar.upsert_event",
          sources: {},
          cases: [],
          default: [],
          steps: [],
          inputs: {
            external_ref:
              "{{ 'bill:' + trigger.data.scheduled_transaction.id }}",
            calendar_id: "primary",
            title:
              "{{ 'Bill Due: ' + trigger.data.scheduled_transaction.currency + ' ' + string(trigger.data.scheduled_transaction.amount / 100) }}",
            description:
              "{{ 'Scheduled ' + trigger.data.scheduled_transaction.type + ' (' + trigger.data.scheduled_transaction.source_type + ')' }}",
            is_all_day: true,
            start_date:
              "{{ trigger.data.scheduled_transaction.due_date.split('T')[0] }}",
            end_date:
              "{{ trigger.data.scheduled_transaction.due_date.split('T')[0] }}",
          },
        },
        {
          id: "return_reminder",
          name: "Return Reminder Output",
          type: "output",
          sources: {},
          cases: [],
          default: [],
          steps: [],
          inputs: {
            value: "{{ steps.create_reminder }}",
          },
        },
      ],
    },
  },
  {
    id: "morningBriefing",
    categoryKey: "categoryDailyPulse",
    icon: "sunrise",
    flow: {
      name: "Weekday Morning Briefing Draft",
      description:
        "Summarizes workspace cash balances every weekday morning and saves a Mail draft.",
      isEnabled: true,
      config: {},
      triggers: [
        {
          name: "Weekday 7 AM Schedule",
          type: "schedule",
          isEnabled: true,
          config: {
            cron: "0 7 * * 1-5",
          },
        },
      ],
      steps: [
        {
          id: "draft_briefing",
          name: "Draft Daily Agenda & Cash Summary",
          type: "llm.generate",
          sources: {
            accounts: {
              loader: "finance.accounts",
              params: {},
              required: false,
            },
          },
          cases: [],
          default: [],
          steps: [],
          inputs: {
            system:
              "You prepare a crisp weekday morning financial briefing summarizing active account balances and priorities.",
            prompt:
              "Current accounts:\n{{ toJSON(sources.accounts) }}\n\nWrite a concise plain-text morning briefing.",
          },
        },
        {
          id: "save_briefing_draft",
          name: "Save Morning Briefing Draft",
          type: "mail.create_draft",
          sources: {},
          cases: [],
          default: [],
          steps: [],
          inputs: {
            connected_account_id: "",
            to: [],
            subject: "Weekday Morning Briefing",
            body_text: "{{ steps.draft_briefing.text }}",
          },
        },
      ],
    },
  },
  {
    id: "anomalyAlert",
    categoryKey: "categoryFinance",
    icon: "alert",
    flow: {
      name: "Large Expense Anomaly Alert",
      description:
        "Detects high-value expense transactions, summarizes the charge, and creates a Mail alert draft.",
      isEnabled: true,
      config: {},
      triggers: [
        {
          name: "Transaction Created",
          type: "event",
          isEnabled: true,
          config: {
            topic: "finance.transaction.created",
          },
        },
      ],
      steps: [
        {
          id: "check_high_value_outflow",
          name: "Check High-Value Outflow",
          type: "switch",
          sources: {},
          cases: [
            {
              name: "high_value_expense",
              condition:
                "trigger.data.transaction.type == 'EXPENSE' && trigger.data.transaction.amount >= 50000",
              steps: [
                {
                  id: "summarize_charge",
                  name: "Summarize Unusual Charge",
                  type: "llm.generate",
                  sources: {},
                  cases: [],
                  default: [],
                  steps: [],
                  inputs: {
                    system:
                      "You write concise finance anomaly alerts explaining large expense transactions and recommended verification checks.",
                    prompt:
                      "Summarize this high-value expense transaction:\n{{ toJSON(trigger.data.transaction) }}",
                  },
                },
                {
                  id: "draft_alert_memo",
                  name: "Draft Alert Memo",
                  type: "mail.create_draft",
                  sources: {},
                  cases: [],
                  default: [],
                  steps: [],
                  inputs: {
                    connected_account_id: "",
                    to: [],
                    subject:
                      "{{ 'High-Value Expense Alert: ' + trigger.data.transaction.currency + ' ' + string(trigger.data.transaction.amount / 100) }}",
                    body_text: "{{ steps.summarize_charge.text }}",
                  },
                },
              ],
            },
          ],
          default: [],
          steps: [],
          inputs: {},
        },
      ],
    },
  },
]

export function instantiateWorkflowTemplate(template: WorkflowTemplate): Flow {
  return JSON.parse(JSON.stringify(template.flow)) as Flow
}

function canonicalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalizeValue)
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(record).sort()) {
      const nextVal = record[key]
      if (nextVal !== undefined) {
        sorted[key] = canonicalizeValue(nextVal)
      }
    }
    return sorted
  }
  return value
}

function normalizeTrigger(trig: Flow_Trigger): Record<string, unknown> {
  return {
    id: trig.id ?? "",
    name: trig.name ?? "",
    type: trig.type ?? "",
    isEnabled: Boolean(trig.isEnabled),
    config: trig.config ?? {},
  }
}

function normalizeStep(step: Flow_StepNode): Record<string, unknown> {
  return {
    id: step.id ?? "",
    name: step.name ?? "",
    type: step.type ?? "",
    onError: step.onError ?? "fail",
    model: step.model ?? null,
    sources: step.sources ?? {},
    inputs: step.inputs ?? {},
    cases: (step.cases ?? []).map((sc) => ({
      name: sc.name ?? "",
      condition: sc.condition ?? "",
      steps: (sc.steps ?? []).map(normalizeStep),
    })),
    default: (step.default ?? []).map(normalizeStep),
    steps: (step.steps ?? []).map(normalizeStep),
  }
}

export function normalizeFlowSnapshot(flow: Flow): string {
  const snapshot = {
    name: flow.name ?? "",
    description: flow.description ?? "",
    isEnabled: Boolean(flow.isEnabled),
    config: flow.config ?? {},
    inputSchema: flow.inputSchema ?? null,
    triggers: (flow.triggers ?? []).map(normalizeTrigger),
    steps: (flow.steps ?? []).map(normalizeStep),
  }
  return JSON.stringify(canonicalizeValue(snapshot))
}
