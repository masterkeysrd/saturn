import { createElement } from "react"
import { WorkspaceInspectorPanel } from "@/components/ui/inspector-panel"
import { MoneyAmount } from "@/components/ui/money-amount"
import { Button } from "@/components/ui/button"
import { CopilotAttachButton } from "@/features/ai/components/copilot-attach-button"
import { buildCopilotEntityKey } from "@saturn/core"
import {
  type Account,
  type Budget,
  type Transaction,
  useListTransactionEventsQuery,
} from "@saturn/api/gen/saturn/finance/v1/finance"
import { useTimezone } from "@saturn/hooks"
import {
  Loader2,
  Calendar,
  CreditCard,
  FileCheck,
  FileText,
  Settings,
  Activity,
  Clock,
  Edit2,
  Trash2,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowRightLeft,
  Repeat,
  Coins,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface TransactionEventsSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  transaction?: Transaction | null
  txnId?: string | null
  txnDescription?: string | null
  accounts?: Account[]
  budgets?: Budget[]
  baseCurrency?: string
  isWritable?: boolean
  onEdit?: (txn: Transaction) => void
  onDelete?: (txnId: string) => void
}

function getTypeDisplayLabel(type?: string): string {
  switch (type) {
    case "EXPENSE":
      return "Expense"
    case "INCOME":
      return "Income"
    case "TRANSFER_OUT":
      return "Transfer Out"
    case "TRANSFER_IN":
      return "Transfer In"
    case "BALANCE_ADJUSTMENT":
    case "TYPE_UNSPECIFIED":
      return "Adjustment"
    default:
      return "Transaction"
  }
}

function getSignedCents(txn: Transaction, rawCents: number): number {
  if (txn.type === "EXPENSE" || txn.type === "TRANSFER_OUT") {
    return -Math.abs(rawCents)
  }
  if (txn.type === "INCOME" || txn.type === "TRANSFER_IN") {
    return Math.abs(rawCents)
  }
  return rawCents
}

export function TransactionEventsSheet({
  open,
  onOpenChange,
  transaction,
  txnId,
  txnDescription,
  accounts = [],
  budgets = [],
  baseCurrency = "USD",
  isWritable = false,
  onEdit,
  onDelete,
}: TransactionEventsSheetProps) {
  const tz = useTimezone()
  const resolvedTxnId = transaction?.id || txnId || null
  const resolvedDescription =
    transaction?.description || txnDescription || "Transaction Details"

  const { data, isLoading } = useListTransactionEventsQuery(
    { txnId: resolvedTxnId || "" },
    { enabled: open && !!resolvedTxnId }
  )

  const events = data?.events || []

  const getEventConfig = (type: string) => {
    switch (type) {
      case "EXPENSE_SCHEDULED":
        return {
          title: "Expense Scheduled",
          icon: Calendar,
          color: "bg-indigo-500/10 text-indigo-500 border-indigo-500/20",
        }
      case "BANK_CONFIRM_RECEIVED":
        return {
          title: "Bank Payment Confirmed",
          icon: CreditCard,
          color: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
        }
      case "INVOICE_RECEIVED":
        return {
          title: "Invoice Generated",
          icon: FileText,
          color: "bg-amber-500/10 text-amber-500 border-amber-500/20",
        }
      case "RECEIPT_RECEIVED":
        return {
          title: "Provider Receipt Verified",
          icon: FileCheck,
          color: "bg-teal-500/10 text-teal-500 border-teal-500/20",
        }
      case "MANUAL_EDIT":
        return {
          title: "Manual Modification",
          icon: Settings,
          color: "bg-orange-500/10 text-orange-500 border-orange-500/20",
        }
      default:
        return {
          title: type.replace(/_/g, " "),
          icon: Activity,
          color: "bg-muted text-muted-foreground border-border",
        }
    }
  }

  const parseMetadata = (metaStr: string) => {
    try {
      return metaStr ? JSON.parse(metaStr) : {}
    } catch {
      return {}
    }
  }

  const isEditable =
    !!transaction &&
    transaction.type !== "BALANCE_ADJUSTMENT" &&
    transaction.type !== "TYPE_UNSPECIFIED" &&
    (transaction.metadata?.source_type ?? transaction.metadata?.sourceType) !==
      "SYSTEM_BALANCE_ADJUSTMENT"

  const resolvedAccountName =
    transaction?.account?.name ||
    accounts.find((a) => a.id === transaction?.accountId)?.name ||
    ""
  const resolvedBudgetName =
    transaction?.budget?.name ||
    budgets.find((b) => b.id === transaction?.budgetId)?.name ||
    ""

  const isCrossCurrency =
    !!transaction?.currency && transaction.currency !== baseCurrency

  const localAmountNum = Number(transaction?.amount || 0)
  const baseAmountNum = Number(transaction?.amountInBase || 0)
  const impliedRate =
    isCrossCurrency && localAmountNum > 0 && baseAmountNum > 0
      ? baseAmountNum / localAmountNum
      : null

  const typeIcon =
    transaction?.type === "INCOME" ? (
      <ArrowUpRight className="size-4 text-success" />
    ) : transaction?.type === "EXPENSE" ? (
      <ArrowDownLeft className="size-4 text-destructive" />
    ) : transaction?.type === "TRANSFER_IN" ||
      transaction?.type === "TRANSFER_OUT" ? (
      <ArrowRightLeft className="size-4 text-info" />
    ) : (
      <Clock className="size-4" />
    )

  return (
    <WorkspaceInspectorPanel
      open={open}
      onOpenChange={onOpenChange}
      icon={typeIcon}
      title={resolvedDescription}
      description={
        transaction ? (
          <span>
            {getTypeDisplayLabel(transaction.type)} ·{" "}
            {tz.format(transaction.transactionDate, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
        ) : (
          "Lifecycle events & audit trail"
        )
      }
      headerActions={
        <div className="flex items-center gap-1">
          {resolvedTxnId && (
            <CopilotAttachButton
              item={{
                key: buildCopilotEntityKey("transaction", resolvedTxnId),
                kind: "transaction",
                id: resolvedTxnId,
                label: resolvedDescription,
                summary: transaction
                  ? {
                      amount: Number(transaction.amount || 0),
                      currency: transaction.currency,
                      type: transaction.type,
                      transactionDate: transaction.transactionDate,
                    }
                  : undefined,
              }}
            />
          )}
          {isWritable && transaction && isEditable && onEdit && (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Edit transaction"
              onClick={() => onEdit(transaction)}
              className="cursor-pointer text-muted-foreground hover:text-foreground"
            >
              <Edit2 className="size-3.5" />
            </Button>
          )}
          {isWritable && resolvedTxnId && onDelete && (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Delete transaction"
              onClick={() => onDelete(resolvedTxnId)}
              className="cursor-pointer text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-5">
        {transaction && (
          <>
            {/* Amount & Status Summary */}
            <div className="space-y-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <MoneyAmount
                  cents={getSignedCents(
                    transaction,
                    Number(transaction.amount || 0)
                  )}
                  currency={transaction.currency}
                  showSign
                  colored
                  size="xl"
                />
                <span
                  className={cn(
                    "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
                    transaction.type === "INCOME"
                      ? "border-success/20 bg-success/10 text-success"
                      : transaction.type === "EXPENSE"
                        ? "border-destructive/20 bg-destructive/10 text-destructive"
                        : "border-border bg-muted/60 text-muted-foreground"
                  )}
                >
                  {getTypeDisplayLabel(transaction.type)}
                </span>
              </div>

              {isCrossCurrency && transaction.amountInBase && (
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>Base equivalent</span>
                  <div className="flex items-center gap-2 font-mono tabular-nums">
                    <MoneyAmount
                      cents={getSignedCents(
                        transaction,
                        Number(transaction.amountInBase || 0)
                      )}
                      currency={baseCurrency}
                      showSign
                      size="sm"
                      className="text-foreground"
                    />
                    {impliedRate !== null && (
                      <span className="text-[11px] text-muted-foreground">
                        (1 {transaction.currency} = {impliedRate.toFixed(4)}{" "}
                        {baseCurrency})
                      </span>
                    )}
                  </div>
                </div>
              )}

              {(transaction.metadata?.recurring_transaction_id ||
                transaction.metadata?.borrowing_id ||
                transaction.metadata?.transfer_id ||
                transaction.metadata?.scheduled_transaction_id) && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {Boolean(transaction.metadata?.recurring_transaction_id) && (
                    <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/50 px-2 py-0.5 text-xs font-medium text-foreground/80">
                      <Repeat className="size-3 text-primary" />
                      Recurring
                    </span>
                  )}
                  {Boolean(transaction.metadata?.borrowing_id) && (
                    <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/50 px-2 py-0.5 text-xs font-medium text-foreground/80">
                      <Coins className="size-3 text-warning" />
                      {transaction.metadata?.borrowing_role === "REPAYMENT"
                        ? "Debt repayment"
                        : "Debt / Loan"}
                    </span>
                  )}
                  {Boolean(transaction.metadata?.transfer_id) && (
                    <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/50 px-2 py-0.5 text-xs font-medium text-foreground/80">
                      <ArrowRightLeft className="size-3 text-info" />
                      Account transfer
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Metadata Details (Hairline separated, zero nested cards) */}
            <dl className="space-y-2.5 border-t border-border/70 pt-4 text-xs">
              <div className="flex items-start justify-between gap-4">
                <dt className="text-muted-foreground">Transaction date</dt>
                <dd className="text-right font-mono text-foreground tabular-nums">
                  {tz.formatDateTime(transaction.transactionDate)}
                </dd>
              </div>
              {transaction.effectiveDate && (
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-muted-foreground">Effective date</dt>
                  <dd className="text-right font-mono text-foreground tabular-nums">
                    {tz.formatDateTime(transaction.effectiveDate)}
                  </dd>
                </div>
              )}
              <div className="flex items-start justify-between gap-4">
                <dt className="text-muted-foreground">Account</dt>
                <dd className="text-right font-medium text-foreground">
                  {resolvedAccountName || "Unassigned"}
                </dd>
              </div>
              {resolvedBudgetName && (
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-muted-foreground">Budget</dt>
                  <dd className="text-right font-medium text-foreground">
                    {resolvedBudgetName}
                  </dd>
                </div>
              )}
              {(transaction.metadata?.notes || transaction.description) && (
                <div className="space-y-1 border-t border-border/50 pt-2.5">
                  <dt className="text-muted-foreground">Notes</dt>
                  <dd className="leading-relaxed text-foreground">
                    {transaction.metadata?.notes || transaction.description}
                  </dd>
                </div>
              )}
              {transaction.id && (
                <div className="flex items-center justify-between gap-4 border-t border-border/50 pt-2.5">
                  <dt className="text-muted-foreground">Reference ID</dt>
                  <dd className="font-mono text-[11px] text-muted-foreground select-all">
                    {transaction.id}
                  </dd>
                </div>
              )}
            </dl>
          </>
        )}

        {/* Audit Trail / Event History */}
        <div
          className={cn(
            "space-y-3",
            transaction && "border-t border-border/70 pt-4"
          )}
        >
          <h4 className="text-xs font-semibold text-foreground">
            Audit trail &amp; events
          </h4>

          {isLoading ? (
            <div className="flex h-[180px] items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : events.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Activity className="mb-2.5 h-8 w-8 text-muted-foreground/35" />
              <p className="text-xs font-medium text-muted-foreground">
                No lifecycle events recorded
              </p>
              <p className="mt-1 max-w-[240px] text-xs text-muted-foreground/80">
                This transaction was logged directly without external
                reconciliation or ingestion events.
              </p>
            </div>
          ) : (
            <div className="relative ml-3 space-y-5 border-l border-border/70 py-1 pl-6">
              {events.map((e) => {
                const config = getEventConfig(e.eventType)
                const meta = parseMetadata(e.metadata)
                const metaKeys = Object.keys(meta)

                return (
                  <div key={e.id} className="relative">
                    <div
                      className={`absolute top-0 -left-[37px] flex h-7 w-7 items-center justify-center rounded-lg border ${config.color} bg-card`}
                    >
                      {createElement(config.icon, { className: "h-3.5 w-3.5" })}
                    </div>

                    <div className="space-y-2 border-b border-border/50 pb-4 last:border-b-0 last:pb-0">
                      <div>
                        <h5 className="text-xs font-semibold text-foreground">
                          {config.title}
                        </h5>
                        <span className="mt-0.5 block font-mono text-[11px] text-muted-foreground tabular-nums">
                          {e.createTime
                            ? tz.formatDateTime(e.createTime, {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : ""}
                        </span>
                      </div>

                      {metaKeys.length > 0 && (
                        <div className="space-y-1.5 border-t border-border/50 pt-2">
                          {metaKeys.map((key) => {
                            const value = meta[key]
                            const label = key
                              .replace(/_/g, " ")
                              .replace(/\b\w/g, (c) => c.toUpperCase())

                            return (
                              <div
                                key={key}
                                className="flex items-center justify-between gap-2 text-[11px]"
                              >
                                <span className="text-muted-foreground">
                                  {label}
                                </span>
                                <span className="max-w-[190px] truncate font-mono font-medium text-foreground select-all">
                                  {typeof value === "object"
                                    ? JSON.stringify(value)
                                    : String(value)}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </WorkspaceInspectorPanel>
  )
}

export { TransactionEventsSheet as TransactionEventsInspector }
