import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  formatCurrencyCents,
  humanizeFieldLabel,
  isPlainRecord,
  stripHtmlTags,
} from "@saturn/core"
import { useTimezone } from "@saturn/hooks"
import type {
  ListAccountsResponse,
  ListBudgetsResponse,
} from "@saturn/api/saturn/finance/v1/finance"
import { CodeBlock } from "@/components/ai-elements/code-block"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  buildReadableFieldEntries,
  formatToolDateValue,
  formatToolTimeRange,
} from "../lib/tool-formatters"
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  CalendarIcon,
  Code2Icon,
  MailIcon,
  MapPinIcon,
  WorkflowIcon,
} from "lucide-react"

export interface ToolApprovalPreviewProps {
  toolName: string
  arguments?: Record<string, unknown>
  destructive?: boolean
}

function resolveAccountFromCache(
  queryClient: ReturnType<typeof useQueryClient>,
  accountId?: string
): { name: string; currency?: string } | undefined {
  if (!accountId) return undefined
  const cached = queryClient.getQueriesData<ListAccountsResponse>({
    queryKey: ["/api/v1/finance/accounts"],
  })
  for (const [, data] of cached) {
    const match = data?.accounts?.find((acc) => acc.id === accountId)
    if (match?.name) {
      return { name: match.name, currency: match.currency }
    }
  }
  return undefined
}

function resolveBudgetNameFromCache(
  queryClient: ReturnType<typeof useQueryClient>,
  budgetId?: string
): string | undefined {
  if (!budgetId) return undefined
  const cached = queryClient.getQueriesData<ListBudgetsResponse>({
    queryKey: ["/api/v1/finance/budgets"],
  })
  for (const [, data] of cached) {
    const match = data?.budgets?.find((b) => b.id === budgetId)
    if (match?.name) {
      return match.name
    }
  }
  return undefined
}

function asString(val: unknown): string | undefined {
  return typeof val === "string" && val.trim() ? val.trim() : undefined
}

function asNumber(val: unknown): number | undefined {
  return typeof val === "number" && Number.isFinite(val) ? val : undefined
}

function asStringArray(val: unknown): string[] {
  if (Array.isArray(val)) {
    return val
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean)
  }
  if (typeof val === "string" && val.trim()) {
    return val
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return []
}

function MetaRow({
  label,
  value,
  subId,
}: {
  label: string
  value: string
  subId?: string
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-xs">
      <span className="shrink-0 text-[11px] text-muted-foreground">
        {label}
      </span>
      <span className="min-w-0 truncate text-right font-medium text-foreground">
        {value}
        {subId && (
          <code className="ml-1.5 rounded bg-muted/70 px-1 py-0.5 font-mono text-[10px] font-normal text-muted-foreground">
            {subId}
          </code>
        )}
      </span>
    </div>
  )
}

function IdBadge({ label, id }: { label: string; id: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 text-xs">
      <span className="shrink-0 text-[11px] text-muted-foreground">
        {label}
      </span>
      <Badge
        variant="outline"
        className="max-w-full truncate font-mono text-[10px] font-normal"
      >
        {id}
      </Badge>
    </div>
  )
}

function formatScopeLabel(scope?: string): string | undefined {
  if (!scope) return undefined
  switch (scope.toUpperCase()) {
    case "THIS_EVENT":
      return "This Event"
    case "THIS_AND_FOLLOWING":
      return "This & Following"
    case "ALL_EVENTS":
      return "All Events"
    default:
      return humanizeFieldLabel(scope)
  }
}

export function ToolApprovalPreview({
  toolName,
  arguments: args,
  destructive = false,
}: ToolApprovalPreviewProps) {
  const [showRaw, setShowRaw] = useState(false)
  const tz = useTimezone()
  const queryClient = useQueryClient()

  if (!args || Object.keys(args).length === 0) {
    return null
  }

  const renderPreviewContent = () => {
    if (
      toolName === "finance_create_transaction" ||
      toolName === "finance_create_expense" ||
      toolName === "finance_update_transaction" ||
      toolName === "finance_log_borrowing_payment"
    ) {
      const txType = (
        asString(args.type) ??
        (toolName === "finance_create_expense" ? "EXPENSE" : "TRANSACTION")
      ).toUpperCase()
      const cents =
        asNumber(args.amount_cents) ??
        asNumber(args.amountCents) ??
        asNumber(args.amount)
      const currency = asString(args.currency)?.toUpperCase()
      const description = asString(args.description)
      const txDate = asString(args.transaction_date) ?? asString(args.date)
      const budgetId = asString(args.budget_id)
      const accountId = asString(args.account_id)
      const budgetName = resolveBudgetNameFromCache(queryClient, budgetId)
      const accountInfo = resolveAccountFromCache(queryClient, accountId)

      return (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <Badge
                variant="outline"
                className={cn(
                  "rounded-full px-2 py-0 text-[10px] font-semibold",
                  txType === "INCOME"
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-400"
                )}
              >
                {txType}
              </Badge>
              {description && (
                <span className="truncate text-xs font-medium text-foreground">
                  {description}
                </span>
              )}
            </div>
            {cents !== undefined && (
              <span className="font-mono text-sm font-semibold text-foreground tabular-nums">
                {formatCurrencyCents(
                  cents,
                  currency ?? accountInfo?.currency ?? "USD"
                )}
              </span>
            )}
          </div>

          {(txDate || budgetId || accountId) && (
            <div className="divide-y divide-border/40 border-t border-border/40 pt-1">
              {txDate && (
                <MetaRow label="Date" value={formatToolDateValue(txDate, tz)} />
              )}
              {budgetId &&
                (budgetName ? (
                  <MetaRow label="Budget" value={budgetName} />
                ) : (
                  <IdBadge label="Budget" id={budgetId} />
                ))}
              {accountId &&
                (accountInfo ? (
                  <MetaRow label="Account" value={accountInfo.name} />
                ) : (
                  <IdBadge label="Account" id={accountId} />
                ))}
            </div>
          )}
        </div>
      )
    }

    if (toolName === "finance_create_transfer") {
      const sourceId = asString(args.source_account_id)
      const destId = asString(args.destination_account_id)
      const sourceInfo = resolveAccountFromCache(queryClient, sourceId)
      const destInfo = resolveAccountFromCache(queryClient, destId)
      const sourceCents = asNumber(args.source_amount_cents)
      const destCents = asNumber(args.destination_amount_cents)
      const transferDate = asString(args.transfer_date)
      const notes = asString(args.notes)

      return (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Badge
              variant="outline"
              className="rounded-full border-sky-500/40 bg-sky-500/10 px-2 py-0 text-[10px] font-semibold text-sky-600 dark:text-sky-400"
            >
              TRANSFER
            </Badge>
            {sourceCents !== undefined && (
              <div className="flex items-center gap-1.5 font-mono text-sm font-semibold text-foreground tabular-nums">
                <span>
                  {formatCurrencyCents(sourceCents, sourceInfo?.currency)}
                </span>
                {destCents !== undefined && destCents !== sourceCents && (
                  <>
                    <ArrowRightIcon className="size-3 text-muted-foreground" />
                    <span>
                      {formatCurrencyCents(destCents, destInfo?.currency)}
                    </span>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="divide-y divide-border/40 border-t border-border/40 pt-1">
            {sourceId &&
              (sourceInfo ? (
                <MetaRow label="From Account" value={sourceInfo.name} />
              ) : (
                <IdBadge label="From Account" id={sourceId} />
              ))}
            {destId &&
              (destInfo ? (
                <MetaRow label="To Account" value={destInfo.name} />
              ) : (
                <IdBadge label="To Account" id={destId} />
              ))}
            {transferDate && (
              <MetaRow
                label="Date"
                value={formatToolDateValue(transferDate, tz)}
              />
            )}
            {notes && <MetaRow label="Notes" value={notes} />}
          </div>
        </div>
      )
    }

    if (toolName === "finance_create_inbox_item") {
      const docType = (asString(args.doc_type) ?? "RECEIPT").toUpperCase()
      const vendor = asString(args.vendor) ?? asString(args.vendor_name)
      const cents = asNumber(args.amount_cents)
      const currency = asString(args.currency)?.toUpperCase()
      const dateStr = asString(args.date)
      const accountId = asString(args.account_id)
      const accountInfo = resolveAccountFromCache(queryClient, accountId)
      const suggestedBudget = asString(args.suggested_budget)
      const budgetName = resolveBudgetNameFromCache(
        queryClient,
        suggestedBudget
      )

      return (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <Badge
                variant="secondary"
                className="rounded-full px-2 py-0 text-[10px] font-semibold"
              >
                {docType}
              </Badge>
              {vendor && (
                <span className="truncate text-xs font-medium text-foreground">
                  {vendor}
                </span>
              )}
            </div>
            {cents !== undefined && (
              <span className="font-mono text-sm font-semibold text-foreground tabular-nums">
                {formatCurrencyCents(
                  cents,
                  currency ?? accountInfo?.currency ?? "USD"
                )}
              </span>
            )}
          </div>

          {(dateStr || accountId || suggestedBudget) && (
            <div className="divide-y divide-border/40 border-t border-border/40 pt-1">
              {dateStr && (
                <MetaRow
                  label="Date"
                  value={formatToolDateValue(dateStr, tz)}
                />
              )}
              {accountId &&
                (accountInfo ? (
                  <MetaRow label="Account" value={accountInfo.name} />
                ) : (
                  <IdBadge label="Account" id={accountId} />
                ))}
              {suggestedBudget && (
                <MetaRow
                  label="Suggested Budget"
                  value={budgetName ?? suggestedBudget}
                />
              )}
            </div>
          )}
        </div>
      )
    }

    if (
      toolName === "mail_send_message" ||
      toolName === "mail_create_draft" ||
      toolName === "mail_update_draft"
    ) {
      const draftId = asString(args.draft_id)
      const toList = asStringArray(args.to)
      const ccList = asStringArray(args.cc)
      const bccList = asStringArray(args.bcc)
      const subject = asString(args.subject)
      const rawBody =
        asString(args.body_text) ??
        (asString(args.body_html)
          ? stripHtmlTags(asString(args.body_html)!)
          : undefined)
      const snippet =
        rawBody && rawBody.length > 220 ? `${rawBody.slice(0, 220)}…` : rawBody
      const mode = asString(args.mode)

      return (
        <div className="space-y-2 text-xs">
          {draftId && <IdBadge label="Draft ID" id={draftId} />}
          {toList.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">To:</span>
              {toList.map((addr) => (
                <Badge
                  key={addr}
                  variant="secondary"
                  className="rounded-full px-2 py-0 text-[11px] font-normal"
                >
                  {addr}
                </Badge>
              ))}
            </div>
          )}
          {ccList.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">Cc:</span>
              {ccList.map((addr) => (
                <Badge
                  key={addr}
                  variant="outline"
                  className="rounded-full px-2 py-0 text-[11px] font-normal"
                >
                  {addr}
                </Badge>
              ))}
            </div>
          )}
          {bccList.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">Bcc:</span>
              {bccList.map((addr) => (
                <Badge
                  key={addr}
                  variant="outline"
                  className="rounded-full px-2 py-0 text-[11px] font-normal"
                >
                  {addr}
                </Badge>
              ))}
            </div>
          )}
          {subject && (
            <div className="flex items-center gap-1.5 border-t border-border/40 pt-1.5 font-medium text-foreground">
              <MailIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 truncate">{subject}</span>
              {mode && mode !== "new" && (
                <Badge
                  variant="outline"
                  className="ml-auto shrink-0 rounded-full px-1.5 py-0 text-[10px]"
                >
                  {humanizeFieldLabel(mode)}
                </Badge>
              )}
            </div>
          )}
          {snippet && (
            <p className="border-t border-border/40 pt-1.5 text-xs whitespace-pre-wrap text-muted-foreground">
              {snippet}
            </p>
          )}
        </div>
      )
    }

    if (toolName === "mail_archive_thread") {
      const threadId = asString(args.id)
      return (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            Remove email conversation from inbox.
          </p>
          {threadId && <IdBadge label="Thread ID" id={threadId} />}
        </div>
      )
    }

    if (
      toolName === "calendar_create_event" ||
      toolName === "calendar_update_event"
    ) {
      const title = asString(args.title)
      const isAllDay = Boolean(
        args.is_all_day || (args.start_date && !args.start_time)
      )
      const range = formatToolTimeRange(tz, {
        isAllDay,
        startTime: asString(args.start_time),
        endTime: asString(args.end_time),
        startDate: asString(args.start_date),
        endDate: asString(args.end_date),
      })
      const location = asString(args.location)
      const attendees = asStringArray(args.attendees)
      const description = asString(args.description)
      const eventId = asString(args.id)
      const calendarId = asString(args.calendar_id)

      return (
        <div className="space-y-2 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {title && (
              <div className="flex min-w-0 items-center gap-1.5 font-medium text-foreground">
                <CalendarIcon className="size-3.5 shrink-0 text-sky-500" />
                <span className="truncate">{title}</span>
              </div>
            )}
            {isAllDay && (
              <Badge
                variant="secondary"
                className="rounded-full px-2 py-0 text-[10px]"
              >
                All-day
              </Badge>
            )}
          </div>

          <div className="divide-y divide-border/40 border-t border-border/40 pt-1">
            {range && <MetaRow label="When" value={range} />}
            {location && (
              <div className="flex items-baseline justify-between gap-3 py-1">
                <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                  <MapPinIcon className="size-3" />
                  Location
                </span>
                <span className="min-w-0 truncate text-right font-medium text-foreground">
                  {location}
                </span>
              </div>
            )}
            {attendees.length > 0 && (
              <div className="flex flex-wrap items-center gap-1 py-1.5">
                <span className="mr-1 text-[11px] text-muted-foreground">
                  Attendees:
                </span>
                {attendees.map((att) => (
                  <Badge
                    key={att}
                    variant="outline"
                    className="rounded-full px-2 py-0 text-[10px] font-normal"
                  >
                    {att}
                  </Badge>
                ))}
              </div>
            )}
            {eventId && <IdBadge label="Event ID" id={eventId} />}
            {calendarId && <IdBadge label="Calendar" id={calendarId} />}
            {description && (
              <p className="pt-1.5 text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
      )
    }

    if (toolName === "calendar_delete_event") {
      const eventId = asString(args.id)
      const scope = formatScopeLabel(asString(args.scope))
      return (
        <div className="space-y-2 text-xs">
          <div className="flex items-center gap-1.5 text-destructive">
            <AlertTriangleIcon className="size-3.5 shrink-0" />
            <span className="font-medium">
              This will permanently delete the calendar event.
            </span>
          </div>
          <div className="divide-y divide-border/40 border-t border-border/40 pt-1">
            {eventId && <IdBadge label="Event ID" id={eventId} />}
            {scope && <MetaRow label="Scope" value={scope} />}
          </div>
        </div>
      )
    }

    if (toolName === "workflows_execute_flow") {
      const flowId = asString(args.id)
      const isAsync = Boolean(args.async)
      const inputObj = isPlainRecord(args.input) ? args.input : undefined
      const inputEntries = inputObj
        ? buildReadableFieldEntries(inputObj, tz)
        : []

      return (
        <div className="space-y-2 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 font-medium text-foreground">
              <WorkflowIcon className="size-3.5 shrink-0 text-amber-500" />
              <span>Execute Workflow</span>
            </div>
            {isAsync && (
              <Badge
                variant="secondary"
                className="rounded-full px-2 py-0 text-[10px]"
              >
                Async
              </Badge>
            )}
          </div>
          <div className="divide-y divide-border/40 border-t border-border/40 pt-1">
            {flowId && <IdBadge label="Workflow" id={flowId} />}
            {inputEntries.map((entry) => (
              <MetaRow
                key={entry.key}
                label={entry.label}
                value={entry.displayValue}
              />
            ))}
          </div>
        </div>
      )
    }

    const entries = buildReadableFieldEntries(args, tz)
    if (entries.length === 0) return null

    return (
      <div className="divide-y divide-border/40">
        {entries.map((entry) => (
          <div
            key={entry.key}
            className="flex items-baseline justify-between gap-3 py-1 text-xs"
          >
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {entry.label}
            </span>
            <span
              className={cn(
                "min-w-0 text-right font-medium break-words text-foreground",
                entry.isMono && "font-mono text-[11px] font-normal"
              )}
            >
              {entry.displayValue}
            </span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div
      className={cn(
        "mt-2.5 border-t pt-2.5",
        destructive ? "border-destructive/25" : "border-border/40"
      )}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
          Action Preview
        </span>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => setShowRaw((prev) => !prev)}
          aria-label="Toggle raw JSON"
          aria-pressed={showRaw}
          className="h-5 cursor-pointer gap-1 rounded px-1.5 font-mono text-[10px] text-muted-foreground hover:text-foreground"
        >
          <Code2Icon className="size-3" />
          {"{ } Raw"}
        </Button>
      </div>

      {showRaw ? (
        <CodeBlock
          code={JSON.stringify(args, null, 2)}
          language="json"
          className="rounded-lg border-border/40 text-[11px]"
        />
      ) : (
        renderPreviewContent()
      )}
    </div>
  )
}
