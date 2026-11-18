import type { ReactNode } from "react"
import { Link } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import {
  formatCurrencyCents,
  humanizeFieldLabel,
  isPlainRecord,
} from "@saturn/core"
import { useTimezone } from "@saturn/hooks"
import type { ListAccountsResponse } from "@saturn/api/saturn/finance/v1/finance"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  formatToolDateValue,
  formatToolTimeRange,
} from "../lib/tool-formatters"
import {
  ArrowRightIcon,
  CalendarIcon,
  MailIcon,
  PaperclipIcon,
} from "lucide-react"

interface DomainResultViewProps {
  toolName: string
  output: Record<string, unknown>
  spaceId?: string | null
  fallback?: ReactNode
}

function asStr(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined
}

function asNum(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined
}

function asRecords(v: unknown): Record<string, unknown>[] {
  if (!Array.isArray(v)) return []
  return v.filter((item): item is Record<string, unknown> =>
    isPlainRecord(item)
  )
}

function DeepLinkFooter({
  spaceId,
  to,
  label,
}: {
  spaceId?: string | null
  to: string
  label: string
}) {
  if (!spaceId) return null
  return (
    <div className="flex justify-end border-t border-border/40 pt-1.5">
      <Link
        to={`/space/${spaceId}${to}`}
        className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
      >
        <span>{label}</span>
      </Link>
    </div>
  )
}

function OverflowNote({ total, shown }: { total: number; shown: number }) {
  if (total <= shown) return null
  return (
    <div className="pt-1 text-[11px] text-muted-foreground">
      +{total - shown} more
    </div>
  )
}

function getUsageBarColor(pct: number): string {
  if (pct >= 100) return "bg-rose-500"
  if (pct >= 80) return "bg-amber-500"
  return "bg-emerald-500"
}

function StatusPill({ status }: { status?: string }) {
  if (!status) return null
  const lower = status.toLowerCase()
  const tone =
    lower === "completed" || lower === "resolved" || lower === "settled"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      : lower === "failed" || lower === "error"
        ? "border-destructive/40 bg-destructive/10 text-destructive"
        : lower === "running" || lower === "processing"
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border/60 bg-muted/60 text-muted-foreground"
  return (
    <Badge
      variant="outline"
      className={cn("rounded-full px-1.5 py-0 text-[10px] capitalize", tone)}
    >
      {lower}
    </Badge>
  )
}

export function DomainToolOutput({
  toolName,
  output,
  spaceId,
  fallback = null,
}: DomainResultViewProps) {
  const tz = useTimezone()
  const queryClient = useQueryClient()

  // --- Finance: Accounts ---
  if (toolName === "finance_list_accounts" || toolName === "finance_accounts") {
    const accounts = asRecords(output.accounts)
    if (accounts.length === 0) {
      return (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">No accounts found.</p>
          <DeepLinkFooter
            spaceId={spaceId}
            to="/finance/accounts"
            label="Open Accounts →"
          />
        </div>
      )
    }
    const visible = accounts.slice(0, 6)
    return (
      <div className="space-y-1.5">
        <div className="divide-y divide-border/40">
          {visible.map((acc, idx) => {
            const name = asStr(acc.name) ?? "Account"
            const type = asStr(acc.type)
            const lastFour = asStr(acc.last_four) ?? asStr(acc.lastFour)
            const curr = asStr(acc.currency)
            const balCents =
              asNum(acc.balance_cents) ??
              asNum(acc.current_balance) ??
              asNum(acc.balanceCents)
            const formattedBal =
              asStr(acc.formatted_balance) ??
              asStr(acc.formattedBalance) ??
              (balCents !== undefined
                ? formatCurrencyCents(balCents, curr)
                : "—")
            const baseBal =
              asStr(acc.formatted_balance_in_base) ??
              asStr(acc.formattedBalanceInBase)
            const baseCurr = asStr(acc.base_currency) ?? asStr(acc.baseCurrency)
            const showBase =
              baseBal &&
              curr &&
              baseCurr &&
              curr.toUpperCase() !== baseCurr.toUpperCase()

            return (
              <div
                key={asStr(acc.id) ?? idx}
                className="flex items-center justify-between gap-2 py-1.5 text-xs"
              >
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate font-medium text-foreground">
                    {name}
                  </span>
                  {type && (
                    <Badge
                      variant="outline"
                      className="shrink-0 rounded-full px-1.5 py-0 text-[10px] text-muted-foreground"
                    >
                      {humanizeFieldLabel(type)}
                    </Badge>
                  )}
                  {lastFour && (
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                      ••{lastFour}
                    </span>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-mono font-medium text-foreground tabular-nums">
                    {formattedBal}
                  </div>
                  {showBase && (
                    <div className="font-mono text-[10px] text-muted-foreground tabular-nums">
                      ≈ {baseBal}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        <OverflowNote total={accounts.length} shown={visible.length} />
        <DeepLinkFooter
          spaceId={spaceId}
          to="/finance/accounts"
          label="Open Accounts →"
        />
      </div>
    )
  }

  // --- Finance: Budgets ---
  if (toolName === "finance_list_budgets" || toolName === "finance_budgets") {
    const budgets = asRecords(output.budgets)
    if (budgets.length === 0) {
      return (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">No budgets found.</p>
          <DeepLinkFooter
            spaceId={spaceId}
            to="/finance/budgets"
            label="Open Budgets →"
          />
        </div>
      )
    }
    const visible = budgets.slice(0, 6)
    return (
      <div className="space-y-1.5">
        <div className="divide-y divide-border/40">
          {visible.map((b, idx) => {
            const name = asStr(b.name) ?? "Budget"
            const curr = asStr(b.currency)
            const limitCents = asNum(b.limit_cents) ?? asNum(b.limitAmount) ?? 0
            const spentCents = asNum(b.spent_cents) ?? asNum(b.spentAmount) ?? 0
            const formattedSpent =
              asStr(b.formatted_spent) ?? formatCurrencyCents(spentCents, curr)
            const formattedLimit =
              asStr(b.formatted_limit) ?? formatCurrencyCents(limitCents, curr)
            const rawPct =
              asNum(b.usage_percent) ??
              asNum(b.usage_percentage) ??
              (limitCents > 0 ? Math.round((spentCents / limitCents) * 100) : 0)
            const pct = Math.max(0, Math.round(rawPct))
            const barWidth = Math.min(100, pct)

            return (
              <div
                key={asStr(b.id) ?? idx}
                className="space-y-1 py-1.5 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium text-foreground">
                    {name}
                  </span>
                  <div className="flex shrink-0 items-center gap-1.5 font-mono text-[11px] tabular-nums">
                    <span className="text-foreground">{formattedSpent}</span>
                    <span className="text-muted-foreground">
                      / {formattedLimit}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      ({pct}%)
                    </span>
                  </div>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      getUsageBarColor(pct)
                    )}
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
        <OverflowNote total={budgets.length} shown={visible.length} />
        <DeepLinkFooter
          spaceId={spaceId}
          to="/finance/budgets"
          label="Open Budgets →"
        />
      </div>
    )
  }

  // --- Finance: Transactions (list, create, update, or borrowing payment) ---
  if (
    toolName === "finance_list_transactions" ||
    toolName === "finance_create_transaction" ||
    toolName === "finance_create_expense" ||
    toolName === "finance_update_transaction" ||
    toolName === "finance_log_borrowing_payment"
  ) {
    const txs =
      toolName === "finance_list_transactions"
        ? asRecords(output.transactions)
        : [output]
    if (txs.length === 0) {
      return (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">
            No transactions found.
          </p>
          <DeepLinkFooter
            spaceId={spaceId}
            to="/finance/transactions"
            label="Open Transactions →"
          />
        </div>
      )
    }
    const visible = txs.slice(0, 6)
    return (
      <div className="space-y-1.5">
        <div className="divide-y divide-border/40">
          {visible.map((tx, idx) => {
            const txType = (asStr(tx.type) ?? "EXPENSE").toUpperCase()
            const isIncome = txType === "INCOME" || txType === "TRANSFER_IN"
            const desc = asStr(tx.description) ?? "Transaction"
            const curr = asStr(tx.currency)
            const cents = asNum(tx.amount_cents) ?? asNum(tx.amount)
            const formattedAmt =
              asStr(tx.formatted_amount) ??
              (cents !== undefined ? formatCurrencyCents(cents, curr) : "—")
            const dateStr =
              asStr(tx.effective_date) ?? asStr(tx.transaction_date)
            const budgetName = asStr(tx.budget_name)
            const accountName = asStr(tx.account_name)

            return (
              <div
                key={asStr(tx.id) ?? idx}
                className="flex items-start justify-between gap-2 py-1.5 text-xs"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="truncate font-medium text-foreground">
                    {desc}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                    {dateStr && <span>{formatToolDateValue(dateStr, tz)}</span>}
                    {budgetName && (
                      <Badge
                        variant="outline"
                        className="rounded-full px-1.5 py-0 text-[10px]"
                      >
                        {budgetName}
                      </Badge>
                    )}
                    {accountName && (
                      <span className="truncate">· {accountName}</span>
                    )}
                  </div>
                </div>
                <span
                  className={cn(
                    "shrink-0 font-mono font-medium tabular-nums",
                    isIncome
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-rose-600 dark:text-rose-400"
                  )}
                >
                  {isIncome ? "+" : "-"}
                  {formattedAmt}
                </span>
              </div>
            )
          })}
        </div>
        <OverflowNote total={txs.length} shown={visible.length} />
        <DeepLinkFooter
          spaceId={spaceId}
          to="/finance/transactions"
          label="Open Transactions →"
        />
      </div>
    )
  }

  // --- Finance: Insights ---
  if (toolName === "finance_get_insights") {
    const baseCurr = asStr(output.base_currency)
    const totalIncome =
      asStr(output.formatted_total_income) ??
      (asNum(output.total_income_cents) !== undefined
        ? formatCurrencyCents(asNum(output.total_income_cents)!, baseCurr)
        : undefined)
    const totalSpent =
      asStr(output.formatted_total_spent) ??
      (asNum(output.total_spent_cents) !== undefined
        ? formatCurrencyCents(asNum(output.total_spent_cents)!, baseCurr)
        : undefined)
    const remainingBudget =
      asStr(output.formatted_remaining_budget) ??
      (asNum(output.remaining_budget_cents) !== undefined
        ? formatCurrencyCents(asNum(output.remaining_budget_cents)!, baseCurr)
        : undefined)
    const burnRate = asNum(output.daily_burn_rate_cents)
    const distributions = asRecords(output.budget_distributions).slice(0, 4)

    return (
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-1.5">
          {totalIncome && (
            <div className="rounded-lg bg-muted/40 px-2.5 py-1.5">
              <div className="text-[10px] text-muted-foreground">
                Total Income
              </div>
              <div className="font-mono text-xs font-semibold text-emerald-600 tabular-nums dark:text-emerald-400">
                {totalIncome}
              </div>
            </div>
          )}
          {totalSpent && (
            <div className="rounded-lg bg-muted/40 px-2.5 py-1.5">
              <div className="text-[10px] text-muted-foreground">
                Total Expense
              </div>
              <div className="font-mono text-xs font-semibold text-rose-600 tabular-nums dark:text-rose-400">
                {totalSpent}
              </div>
            </div>
          )}
          {remainingBudget && (
            <div className="rounded-lg bg-muted/40 px-2.5 py-1.5">
              <div className="text-[10px] text-muted-foreground">
                Remaining Budget
              </div>
              <div className="font-mono text-xs font-semibold text-foreground tabular-nums">
                {remainingBudget}
              </div>
            </div>
          )}
          {burnRate !== undefined && (
            <div className="rounded-lg bg-muted/40 px-2.5 py-1.5">
              <div className="text-[10px] text-muted-foreground">
                Daily Burn Rate
              </div>
              <div className="font-mono text-xs font-semibold text-foreground tabular-nums">
                {formatCurrencyCents(Math.round(burnRate), baseCurr)}/d
              </div>
            </div>
          )}
        </div>

        {distributions.length > 0 && (
          <div className="divide-y divide-border/40 border-t border-border/40 pt-1">
            {distributions.map((d, idx) => {
              const name = asStr(d.budget_name) ?? "Budget"
              const spent = asStr(d.formatted_spent)
              const pct = Math.max(
                0,
                Math.round(asNum(d.usage_percentage) ?? 0)
              )
              return (
                <div
                  key={asStr(d.budget_id) ?? idx}
                  className="flex items-center justify-between gap-2 py-1 text-[11px]"
                >
                  <span className="truncate text-foreground">{name}</span>
                  <div className="flex shrink-0 items-center gap-2 font-mono tabular-nums">
                    {spent && (
                      <span className="text-muted-foreground">{spent}</span>
                    )}
                    <span className="font-medium text-foreground">{pct}%</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <DeepLinkFooter
          spaceId={spaceId}
          to="/finance"
          label="Open Insights →"
        />
      </div>
    )
  }

  // --- Finance: Inbox Items ---
  if (
    toolName === "finance_list_inbox_items" ||
    toolName === "finance_create_inbox_item" ||
    toolName === "finance_review_inbox_item"
  ) {
    const items =
      toolName === "finance_list_inbox_items"
        ? asRecords(output.items)
        : [output]
    if (items.length === 0) {
      return (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">
            Finance inbox is empty.
          </p>
          <DeepLinkFooter
            spaceId={spaceId}
            to="/finance/inbox"
            label="Open Finance Inbox →"
          />
        </div>
      )
    }
    const visible = items.slice(0, 6)
    return (
      <div className="space-y-1.5">
        <div className="divide-y divide-border/40">
          {visible.map((item, idx) => {
            const vendor =
              asStr(item.vendor_name) ?? asStr(item.vendor) ?? "Inbox Item"
            const docType = asStr(item.doc_type)
            const status = asStr(item.status)
            const dateStr = asStr(item.transaction_date)
            const amt =
              asStr(item.formatted_amount) ??
              (asNum(item.amount_cents) !== undefined
                ? formatCurrencyCents(
                    asNum(item.amount_cents)!,
                    asStr(item.currency)
                  )
                : "—")
            return (
              <div
                key={asStr(item.id) ?? idx}
                className="flex items-center justify-between gap-2 py-1.5 text-xs"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-medium text-foreground">
                      {vendor}
                    </span>
                    {docType && (
                      <Badge
                        variant="outline"
                        className="shrink-0 rounded-full px-1.5 py-0 text-[10px]"
                      >
                        {docType}
                      </Badge>
                    )}
                    <StatusPill status={status} />
                  </div>
                  {dateStr && (
                    <div className="text-[11px] text-muted-foreground">
                      {formatToolDateValue(dateStr, tz)}
                    </div>
                  )}
                </div>
                <span className="shrink-0 font-mono font-medium text-foreground tabular-nums">
                  {amt}
                </span>
              </div>
            )
          })}
        </div>
        <OverflowNote total={items.length} shown={visible.length} />
        <DeepLinkFooter
          spaceId={spaceId}
          to="/finance/inbox"
          label="Open Finance Inbox →"
        />
      </div>
    )
  }

  // --- Finance: Borrowings ---
  if (toolName === "finance_list_borrowings") {
    const borrowings = asRecords(output.borrowings)
    if (borrowings.length === 0) {
      return (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">No borrowings found.</p>
          <DeepLinkFooter
            spaceId={spaceId}
            to="/finance/borrowings"
            label="Open Borrowings →"
          />
        </div>
      )
    }
    const visible = borrowings.slice(0, 6)
    return (
      <div className="space-y-1.5">
        <div className="divide-y divide-border/40">
          {visible.map((b, idx) => {
            const counterparty = asStr(b.counterparty) ?? "Counterparty"
            const direction = asStr(b.direction)
            const status = asStr(b.status)
            const dueAt = asStr(b.due_at)
            const remaining =
              asStr(b.formatted_remaining) ??
              (asNum(b.remaining_amount_cents) !== undefined
                ? formatCurrencyCents(
                    asNum(b.remaining_amount_cents)!,
                    asStr(b.currency)
                  )
                : "—")
            return (
              <div
                key={asStr(b.id) ?? idx}
                className="flex items-center justify-between gap-2 py-1.5 text-xs"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    {direction && (
                      <Badge
                        variant="outline"
                        className="shrink-0 rounded-full px-1.5 py-0 text-[10px]"
                      >
                        {direction}
                      </Badge>
                    )}
                    <span className="truncate font-medium text-foreground">
                      {counterparty}
                    </span>
                    <StatusPill status={status} />
                  </div>
                  {dueAt && (
                    <div className="text-[11px] text-muted-foreground">
                      Due {formatToolDateValue(dueAt, tz)}
                    </div>
                  )}
                </div>
                <span className="shrink-0 font-mono font-medium text-foreground tabular-nums">
                  {remaining}
                </span>
              </div>
            )
          })}
        </div>
        <OverflowNote total={borrowings.length} shown={visible.length} />
        <DeepLinkFooter
          spaceId={spaceId}
          to="/finance/borrowings"
          label="Open Borrowings →"
        />
      </div>
    )
  }

  // --- Finance: Recurring ---
  if (toolName === "finance_list_recurring") {
    const items = asRecords(output.recurring)
    if (items.length === 0) {
      return (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">
            No recurring transactions found.
          </p>
          <DeepLinkFooter
            spaceId={spaceId}
            to="/finance/recurring"
            label="Open Recurring →"
          />
        </div>
      )
    }
    const visible = items.slice(0, 6)
    return (
      <div className="space-y-1.5">
        <div className="divide-y divide-border/40">
          {visible.map((r, idx) => {
            const name = asStr(r.name) ?? "Recurring Item"
            const interval = asStr(r.interval)
            const nextDue = asStr(r.next_due_date)
            const amt =
              asStr(r.formatted_amount) ??
              (asNum(r.amount_cents) !== undefined
                ? formatCurrencyCents(asNum(r.amount_cents)!, asStr(r.currency))
                : "—")
            return (
              <div
                key={asStr(r.id) ?? idx}
                className="flex items-center justify-between gap-2 py-1.5 text-xs"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-medium text-foreground">
                      {name}
                    </span>
                    {interval && (
                      <Badge
                        variant="outline"
                        className="shrink-0 rounded-full px-1.5 py-0 text-[10px]"
                      >
                        {humanizeFieldLabel(interval)}
                      </Badge>
                    )}
                  </div>
                  {nextDue && (
                    <div className="text-[11px] text-muted-foreground">
                      Next: {formatToolDateValue(nextDue, tz)}
                    </div>
                  )}
                </div>
                <span className="shrink-0 font-mono font-medium text-foreground tabular-nums">
                  {amt}
                </span>
              </div>
            )
          })}
        </div>
        <OverflowNote total={items.length} shown={visible.length} />
        <DeepLinkFooter
          spaceId={spaceId}
          to="/finance/recurring"
          label="Open Recurring →"
        />
      </div>
    )
  }

  // --- Finance: Transfer ---
  if (toolName === "finance_create_transfer") {
    const srcId = asStr(output.source_account_id)
    const dstId = asStr(output.destination_account_id)
    const cachedAccounts = queryClient.getQueriesData<ListAccountsResponse>({
      queryKey: ["/api/v1/finance/accounts"],
    })
    const findAcc = (id?: string) => {
      if (!id) return undefined
      for (const [, d] of cachedAccounts) {
        const hit = d?.accounts?.find((a) => a.id === id)
        if (hit) return hit
      }
      return undefined
    }
    const srcAcc = findAcc(srcId)
    const dstAcc = findAcc(dstId)
    const srcCents = asNum(output.source_amount_cents)
    const dstCents = asNum(output.destination_amount_cents)
    const transferDate = asStr(output.transfer_date)

    return (
      <div className="space-y-1.5 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 font-medium text-foreground">
            <span>{srcAcc?.name ?? srcId ?? "Source"}</span>
            <ArrowRightIcon className="size-3 text-muted-foreground" />
            <span>{dstAcc?.name ?? dstId ?? "Destination"}</span>
          </div>
          {srcCents !== undefined && (
            <span className="font-mono font-semibold text-foreground tabular-nums">
              {formatCurrencyCents(srcCents, srcAcc?.currency)}
              {dstCents !== undefined && dstCents !== srcCents
                ? ` → ${formatCurrencyCents(dstCents, dstAcc?.currency)}`
                : ""}
            </span>
          )}
        </div>
        {transferDate && (
          <div className="text-[11px] text-muted-foreground">
            {formatToolDateValue(transferDate, tz)}
          </div>
        )}
        <DeepLinkFooter
          spaceId={spaceId}
          to="/finance/transactions"
          label="Open Transactions →"
        />
      </div>
    )
  }

  // --- Calendar: Events ---
  if (
    toolName === "calendar_list_events" ||
    toolName === "calendar_create_event" ||
    toolName === "calendar_update_event"
  ) {
    const events =
      toolName === "calendar_list_events" ? asRecords(output.events) : [output]
    if (events.length === 0) {
      return (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">
            No upcoming events in this range.
          </p>
          <DeepLinkFooter
            spaceId={spaceId}
            to="/calendar"
            label="Open Calendar →"
          />
        </div>
      )
    }
    const visible = events.slice(0, 6)
    return (
      <div className="space-y-1.5">
        <div className="divide-y divide-border/40">
          {visible.map((ev, idx) => {
            const title = asStr(ev.title) ?? "Untitled Event"
            const isAllDay = Boolean(ev.is_all_day)
            const range = formatToolTimeRange(tz, {
              isAllDay,
              startTime: asStr(ev.start_time),
              endTime: asStr(ev.end_time),
              startDate: asStr(ev.start_date),
              endDate: asStr(ev.end_date),
            })
            const location = asStr(ev.location)
            const calName = asStr(ev.calendar_name)

            return (
              <div
                key={asStr(ev.event_id) ?? asStr(ev.id) ?? idx}
                className="flex items-stretch gap-2.5 py-1.5 text-xs"
              >
                <span className="w-0.5 shrink-0 rounded-full bg-sky-500" />
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium text-foreground">
                      {title}
                    </span>
                    {isAllDay && (
                      <Badge
                        variant="secondary"
                        className="shrink-0 rounded-full px-1.5 py-0 text-[10px]"
                      >
                        All-day
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                    {range && (
                      <span className="inline-flex items-center gap-1">
                        <CalendarIcon className="size-3" />
                        {range}
                      </span>
                    )}
                    {location && <span className="truncate">· {location}</span>}
                    {calName && (
                      <Badge
                        variant="outline"
                        className="rounded-full px-1.5 py-0 text-[10px]"
                      >
                        {calName}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        <OverflowNote total={events.length} shown={visible.length} />
        <DeepLinkFooter
          spaceId={spaceId}
          to="/calendar"
          label="Open Calendar →"
        />
      </div>
    )
  }

  if (toolName === "calendar_delete_event") {
    const id = asStr(output.id)
    return (
      <div className="space-y-1.5 text-xs">
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">Event deleted</span>
          {id && (
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
              {id}
            </code>
          )}
        </div>
        <DeepLinkFooter
          spaceId={spaceId}
          to="/calendar"
          label="Open Calendar →"
        />
      </div>
    )
  }

  // --- Calendar: List Calendars ---
  if (toolName === "calendar_list_calendars") {
    const calendars = asRecords(output.calendars)
    if (calendars.length === 0) {
      return (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">No calendars found.</p>
          <DeepLinkFooter
            spaceId={spaceId}
            to="/calendar"
            label="Open Calendar →"
          />
        </div>
      )
    }
    const visible = calendars.slice(0, 6)
    return (
      <div className="space-y-1.5">
        <div className="divide-y divide-border/40">
          {visible.map((cal, idx) => {
            const name = asStr(cal.name) ?? "Calendar"
            const source = asStr(cal.source)
            const timezone = asStr(cal.timezone)
            const isPrimary = Boolean(cal.is_primary)
            return (
              <div
                key={asStr(cal.id) ?? idx}
                className="flex items-center justify-between gap-2 py-1.5 text-xs"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      isPrimary ? "bg-primary" : "bg-sky-500"
                    )}
                  />
                  <span className="truncate font-medium text-foreground">
                    {name}
                  </span>
                  {isPrimary && (
                    <Badge
                      variant="secondary"
                      className="shrink-0 rounded-full px-1.5 py-0 text-[10px]"
                    >
                      Primary
                    </Badge>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                  {source && (
                    <Badge
                      variant="outline"
                      className="rounded-full px-1.5 py-0 text-[10px]"
                    >
                      {source}
                    </Badge>
                  )}
                  {timezone && <span className="truncate">{timezone}</span>}
                </div>
              </div>
            )
          })}
        </div>
        <OverflowNote total={calendars.length} shown={visible.length} />
        <DeepLinkFooter
          spaceId={spaceId}
          to="/calendar"
          label="Open Calendar →"
        />
      </div>
    )
  }

  // --- Mail: List Threads ---
  if (toolName === "mail_list_threads") {
    const threads = asRecords(output.threads)
    if (threads.length === 0) {
      return (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">
            No matching email threads.
          </p>
          <DeepLinkFooter spaceId={spaceId} to="/mail" label="Open Mail →" />
        </div>
      )
    }
    const visible = threads.slice(0, 6)
    return (
      <div className="space-y-1.5">
        <div className="divide-y divide-border/40">
          {visible.map((th, idx) => {
            const subject = asStr(th.subject) ?? "(No subject)"
            const snippet = asStr(th.snippet)
            const isUnread = Boolean(th.is_unread)
            const participants = Array.isArray(th.participants)
              ? th.participants
                  .filter((p): p is string => typeof p === "string")
                  .slice(0, 2)
                  .join(", ")
              : undefined
            const lastMsg = asStr(th.last_message_at)
            return (
              <div
                key={asStr(th.id) ?? idx}
                className="space-y-0.5 py-1.5 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-1.5">
                    {isUnread && (
                      <span
                        className="size-1.5 shrink-0 rounded-full bg-primary"
                        aria-label="Unread"
                      />
                    )}
                    <span
                      className={cn(
                        "truncate text-foreground",
                        isUnread ? "font-semibold" : "font-medium"
                      )}
                    >
                      {subject}
                    </span>
                  </div>
                  {lastMsg && (
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {formatToolDateValue(lastMsg, tz)}
                    </span>
                  )}
                </div>
                {participants && (
                  <div className="truncate text-[11px] text-muted-foreground">
                    {participants}
                  </div>
                )}
                {snippet && (
                  <p className="line-clamp-2 text-[11px] text-muted-foreground">
                    {snippet}
                  </p>
                )}
              </div>
            )
          })}
        </div>
        <OverflowNote total={threads.length} shown={visible.length} />
        <DeepLinkFooter spaceId={spaceId} to="/mail" label="Open Mail →" />
      </div>
    )
  }

  // --- Mail: Get Thread ---
  if (toolName === "mail_get_thread") {
    const subject = asStr(output.subject) ?? "(No subject)"
    const messages = asRecords(output.messages)
    const visible = messages.slice(0, 4)

    return (
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          <MailIcon className="size-3.5 shrink-0 text-violet-500" />
          <span className="truncate">{subject}</span>
        </div>
        {visible.length > 0 && (
          <div className="divide-y divide-border/40 border-t border-border/40">
            {visible.map((m, idx) => {
              const from = asStr(m.from) ?? "Unknown sender"
              const timestamp = asStr(m.timestamp)
              const body = asStr(m.body_plain)
              const attachments = Array.isArray(m.attachments)
                ? m.attachments
                : []
              return (
                <div
                  key={asStr(m.id) ?? idx}
                  className="space-y-1 py-1.5 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium text-foreground">
                      {from}
                    </span>
                    <div className="flex shrink-0 items-center gap-1.5 text-[10px] text-muted-foreground">
                      {attachments.length > 0 && (
                        <span className="inline-flex items-center gap-0.5">
                          <PaperclipIcon className="size-2.5" />
                          {attachments.length}
                        </span>
                      )}
                      {timestamp && (
                        <span>{formatToolDateValue(timestamp, tz)}</span>
                      )}
                    </div>
                  </div>
                  {body && (
                    <p className="line-clamp-3 text-[11px] whitespace-pre-wrap text-muted-foreground">
                      {body}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}
        <OverflowNote total={messages.length} shown={visible.length} />
        <DeepLinkFooter spaceId={spaceId} to="/mail" label="Open Mail →" />
      </div>
    )
  }

  // --- Mail: Mutations ---
  if (
    toolName === "mail_create_draft" ||
    toolName === "mail_update_draft" ||
    toolName === "mail_delete_draft" ||
    toolName === "mail_modify_thread" ||
    toolName === "mail_send_message" ||
    toolName === "mail_archive_thread"
  ) {
    const subject = asStr(output.subject)
    const statusLabel =
      toolName === "mail_send_message"
        ? "Sent"
        : toolName === "mail_create_draft"
          ? "Draft Created"
          : toolName === "mail_update_draft"
            ? "Draft Updated"
            : toolName === "mail_delete_draft"
              ? "Draft Deleted"
              : toolName === "mail_modify_thread"
                ? "Updated"
                : "Archived"
    const recipients = Array.isArray(output.to)
      ? output.to.filter((r): r is string => typeof r === "string")
      : []

    return (
      <div className="space-y-1.5 text-xs">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <MailIcon className="size-3.5 shrink-0 text-violet-500" />
            <span className="truncate font-medium text-foreground">
              {subject ??
                (asStr(output.id)
                  ? `Thread ${asStr(output.id)}`
                  : "Email updated")}
            </span>
          </div>
          <Badge
            variant="secondary"
            className="shrink-0 rounded-full px-2 py-0 text-[10px]"
          >
            {statusLabel}
          </Badge>
        </div>
        {recipients.length > 0 && (
          <div className="text-[11px] text-muted-foreground">
            To: {recipients.join(", ")}
          </div>
        )}
        <DeepLinkFooter spaceId={spaceId} to="/mail" label="Open Mail →" />
      </div>
    )
  }

  // --- Workflows: List Flows / Toggle Flow ---
  if (
    toolName === "workflows_list_flows" ||
    toolName === "workflows_set_flow_enabled"
  ) {
    const flows =
      toolName === "workflows_list_flows" ? asRecords(output.flows) : [output]
    if (flows.length === 0) {
      return (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">No workflows found.</p>
          <DeepLinkFooter
            spaceId={spaceId}
            to="/workflows"
            label="Open Workflows →"
          />
        </div>
      )
    }
    const visible = flows.slice(0, 6)
    return (
      <div className="space-y-1.5">
        <div className="divide-y divide-border/40">
          {visible.map((f, idx) => {
            const name = asStr(f.name) ?? "Workflow"
            const isEnabled = Boolean(f.is_enabled)
            const isSystem = Boolean(f.is_system)
            const stepCount = asNum(f.step_count)
            const runs7d = asNum(f.total_runs_7d)
            return (
              <div
                key={asStr(f.id) ?? idx}
                className="flex items-center justify-between gap-2 py-1.5 text-xs"
              >
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate font-medium text-foreground">
                    {name}
                  </span>
                  <Badge
                    variant={isEnabled ? "secondary" : "outline"}
                    className="shrink-0 rounded-full px-1.5 py-0 text-[10px]"
                  >
                    {isEnabled ? "Enabled" : "Disabled"}
                  </Badge>
                  {isSystem && (
                    <Badge
                      variant="outline"
                      className="shrink-0 rounded-full px-1.5 py-0 text-[10px]"
                    >
                      System
                    </Badge>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
                  {stepCount !== undefined && <span>{stepCount} steps</span>}
                  {runs7d !== undefined && <span>· {runs7d} runs</span>}
                </div>
              </div>
            )
          })}
        </div>
        <OverflowNote total={flows.length} shown={visible.length} />
        <DeepLinkFooter
          spaceId={spaceId}
          to="/workflows"
          label="Open Workflows →"
        />
      </div>
    )
  }

  // --- Workflows: Run Details / Execute ---
  if (
    toolName === "workflows_get_flow_run" ||
    toolName === "workflows_execute_flow"
  ) {
    const runId = asStr(output.id)
    const flowName = asStr(output.flow_name) ?? asStr(output.flow_id) ?? "Run"
    const status = asStr(output.status)
    const createTime = asStr(output.create_time)
    const errMsg = asStr(output.error)
    const stepRuns = asRecords(output.step_runs ?? output.stepRuns)

    return (
      <div className="space-y-2 text-xs">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-medium text-foreground">
            {flowName}
          </span>
          <StatusPill status={status} />
        </div>
        {createTime && (
          <div className="text-[11px] text-muted-foreground">
            Started {formatToolDateValue(createTime, tz)}
          </div>
        )}
        {stepRuns.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-t border-border/40 pt-1.5">
            {stepRuns.map((sr, idx) => (
              <Badge
                key={asStr(sr.step_id) ?? idx}
                variant="outline"
                className="gap-1 rounded-full px-2 py-0 text-[10px]"
              >
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    asStr(sr.status) === "completed"
                      ? "bg-emerald-500"
                      : asStr(sr.status) === "failed"
                        ? "bg-destructive"
                        : "bg-amber-500"
                  )}
                />
                <span>
                  {asStr(sr.step_id) ?? asStr(sr.step_type) ?? "Step"}
                </span>
              </Badge>
            ))}
          </div>
        )}
        {errMsg && (
          <div className="rounded-lg bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">
            {errMsg}
          </div>
        )}
        <DeepLinkFooter
          spaceId={spaceId}
          to={runId ? `/workflows/runs/${runId}` : "/workflows/runs"}
          label={runId ? "Open Run Trace →" : "Open Workflow Runs →"}
        />
      </div>
    )
  }

  // --- Space Context ---
  if (toolName === "space_get_context" || toolName === "space_context") {
    const name = asStr(output.name)
    const timezone = asStr(output.timezone)
    const role = asStr(output.role)
    const description = asStr(output.description)

    return (
      <div className="space-y-1.5 text-xs">
        <div className="grid grid-cols-1 gap-y-1 divide-y divide-border/40">
          {name && (
            <div className="flex items-center justify-between gap-2 py-1">
              <span className="text-[11px] text-muted-foreground">Name</span>
              <span className="font-medium text-foreground">{name}</span>
            </div>
          )}
          {timezone && (
            <div className="flex items-center justify-between gap-2 py-1">
              <span className="text-[11px] text-muted-foreground">
                Timezone
              </span>
              <span className="font-mono text-[11px] text-foreground">
                {timezone}
              </span>
            </div>
          )}
          {role && (
            <div className="flex items-center justify-between gap-2 py-1">
              <span className="text-[11px] text-muted-foreground">Role</span>
              <Badge
                variant="outline"
                className="rounded-full px-2 py-0 text-[10px] capitalize"
              >
                {role}
              </Badge>
            </div>
          )}
        </div>
        {description && (
          <p className="border-t border-border/40 pt-1 text-[11px] text-muted-foreground">
            {description}
          </p>
        )}
      </div>
    )
  }

  // --- Sub-agents (`agent__*`) ---
  if (toolName.startsWith("agent__")) {
    const responseText =
      asStr(output.text) ??
      asStr(output.response) ??
      (typeof output.output === "string" ? asStr(output.output) : undefined)
    const status = asStr(output.status)
    const errMsg = asStr(output.error)
    if (responseText || errMsg) {
      return (
        <div className="space-y-1.5 text-xs">
          {status && <StatusPill status={status} />}
          {responseText && (
            <p className="leading-relaxed whitespace-pre-wrap text-foreground">
              {responseText}
            </p>
          )}
          {errMsg && (
            <div className="rounded-lg bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">
              {errMsg}
            </div>
          )}
        </div>
      )
    }
  }

  return <>{fallback}</>
}
