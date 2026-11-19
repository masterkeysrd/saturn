import { WorkspaceInspectorPanel } from "@/components/ui/inspector-panel"
import {
  useListTransactionsQuery,
  type RecurringTransaction,
  useGetSettingsQuery,
} from "@saturn/api/gen/saturn/finance/v1/finance"
import { useActiveSpaceContext } from "@/features/space/use-space"
import { useTimezone } from "@saturn/hooks"
import { Loader2, Calendar, FileText, ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatCents } from "../utils"

interface RecurringTransactionHistorySheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  transaction: RecurringTransaction | null
}

export function RecurringTransactionHistorySheet({
  open,
  onOpenChange,
  transaction,
}: RecurringTransactionHistorySheetProps) {
  const { spaceId } = useActiveSpaceContext()
  const tz = useTimezone()
  const { data: settings } = useGetSettingsQuery(
    {},
    { enabled: open && !!spaceId }
  )
  const baseCurrency = settings?.baseCurrency || "USD"

  // Fetch transaction history for this template
  const { data, isLoading } = useListTransactionsQuery(
    {
      budgetId: "",
      types: [],
      pageSize: 100,
      pageToken: "",
    },
    { enabled: open && !!transaction?.id && !!spaceId }
  )

  const transactions = (data?.transactions || []).filter(
    (t) => t.metadata?.recurring_transaction_id === transaction?.id
  )

  return (
    <WorkspaceInspectorPanel
      open={open}
      onOpenChange={onOpenChange}
      icon={<FileText className="size-4" />}
      title="Transaction History"
      description={
        <>
          Past cleared instances for{" "}
          <span className="font-medium text-foreground">
            {transaction?.name || ""}
          </span>
        </>
      }
    >
      {isLoading ? (
        <div className="flex h-[250px] items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      ) : transactions.length === 0 ? (
        <div className="flex h-[200px] flex-col items-center justify-center p-4 text-center">
          <Calendar className="mb-3 h-9 w-9 text-muted-foreground/30" />
          <p className="text-xs font-semibold text-muted-foreground">
            No transaction history found
          </p>
          <p className="mt-1 max-w-[250px] text-xs text-muted-foreground/80">
            Historical transaction logs will appear here once upcoming schedules
            generated from this template are confirmed.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border/40">
          {transactions.map((txn) => {
            const conversionPreview = txn.currency !== baseCurrency

            const tDate = new Date(txn.transactionDate)
            const effDate = new Date(txn.effectiveDate)

            const graceDays = transaction?.gracePeriodDays || 0
            const graceLimitDate = new Date(effDate)
            graceLimitDate.setDate(graceLimitDate.getDate() + graceDays)

            const isLate = tDate > graceLimitDate

            return (
              <div
                key={txn.id}
                className="space-y-2 py-3.5 first:pt-0 last:pb-0"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="block text-[11px] font-medium text-muted-foreground">
                      Cleared Date
                    </span>
                    <span className="text-xs font-semibold text-foreground">
                      {tz.formatDate(txn.transactionDate, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  </div>

                  <div className="shrink-0 text-right tabular-nums">
                    <span
                      className={cn(
                        "block font-mono text-xs font-semibold",
                        txn.type === "EXPENSE"
                          ? "text-rose-500"
                          : "text-emerald-500"
                      )}
                    >
                      {txn.type === "EXPENSE" ? "-" : "+"}
                      {formatCents(txn.amount).toFixed(2)}{" "}
                      <span className="text-[11px] font-medium text-muted-foreground uppercase">
                        {txn.currency}
                      </span>
                    </span>

                    {conversionPreview && (
                      <span className="mt-0.5 flex items-center justify-end gap-1 font-mono text-[11px] text-muted-foreground">
                        <ArrowRight className="h-3 w-3" />
                        {baseCurrency}{" "}
                        {formatCents(txn.amountInBase).toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-0.5">
                  <span className="font-mono text-[11px] break-all text-muted-foreground select-all">
                    ID: {txn.id}
                  </span>
                  {isLate ? (
                    <span className="rounded-md bg-rose-500/10 px-2 py-0.5 text-[11px] font-medium text-rose-500">
                      Late
                    </span>
                  ) : (
                    <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-500">
                      On Time
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </WorkspaceInspectorPanel>
  )
}

export { RecurringTransactionHistorySheet as RecurringTransactionHistoryInspector }
