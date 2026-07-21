import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import {
  useListTransactionsQuery,
  type RecurringExpense,
} from "@/gen/saturn/finance/v1/finance"
import { useWorkspaceFinance } from "../use-workspace-finance"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Loader2, Calendar, FileText, ArrowRight } from "lucide-react"
import { formatCents } from "../utils"

interface RecurringExpenseHistorySheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  expense: RecurringExpense | null
}

export function RecurringExpenseHistorySheet({
  open,
  onOpenChange,
  expense,
}: RecurringExpenseHistorySheetProps) {
  const { spaceId, settings } = useWorkspaceFinance()
  const baseCurrency = settings?.baseCurrency || "USD"

  // Fetch transaction history for this template
  const { data, isLoading } = useListTransactionsQuery(
    {
      spaceId,
      budgetId: "",
      type: "TRANSACTION_TYPE_UNSPECIFIED",
      pageSize: 50,
      pageToken: "",
      sourceType: "recurrent_expense",
      sourceId: expense?.id || "",
    },
    { enabled: open && !!expense?.id && !!spaceId }
  )

  const transactions = data?.transactions || []

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full border-l border-border/40 bg-card/95 p-6 shadow-2xl backdrop-blur-xl sm:!max-w-xl">
        <SheetHeader className="mb-6 text-left">
          <SheetTitle className="flex items-center gap-2 text-xl font-bold tracking-tight text-foreground">
            <FileText className="h-5 w-5 text-primary" />
            Payment History
          </SheetTitle>
          <SheetDescription className="mt-1 text-xs text-muted-foreground">
            Ledger of past cleared instances for template:{" "}
            <span className="font-semibold text-foreground">
              {expense?.name || ""}
            </span>
          </SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="flex h-[250px] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : transactions.length === 0 ? (
          <div className="flex h-[200px] flex-col items-center justify-center p-4 text-center">
            <Calendar className="mb-3 h-10 w-10 text-muted-foreground/30" />
            <p className="text-xs font-semibold text-muted-foreground">
              No transaction history found
            </p>
            <p className="mt-1 max-w-[250px] text-[10px] text-muted-foreground/80">
              Historical payment logs will appear here once upcoming outflows
              generated from this template are confirmed.
            </p>
          </div>
        ) : (
          <ScrollArea className="h-[calc(100vh-180px)] pr-3">
            <div className="space-y-4">
              {transactions.map((txn) => {
                const conversionPreview = txn.currency !== baseCurrency

                const tDate = new Date(txn.transactionDate)
                const effDate = new Date(txn.effectiveDate)

                const graceDays = expense?.gracePeriodDays || 0
                const graceLimitDate = new Date(effDate)
                graceLimitDate.setDate(graceLimitDate.getDate() + graceDays)

                const isLate = tDate > graceLimitDate

                return (
                  <div
                    key={txn.id}
                    className="relative overflow-hidden rounded-2xl border border-border/40 bg-background/50 p-4 shadow-sm backdrop-blur-sm transition-all hover:bg-background/80"
                  >
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <span className="block text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                          Cleared Date
                        </span>
                        <span className="text-xs font-semibold text-foreground">
                          {new Date(txn.transactionDate).toLocaleDateString(
                            undefined,
                            {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                              timeZone: "UTC",
                            }
                          )}
                        </span>
                      </div>

                      <div className="text-right">
                        <span className="block text-xs font-bold text-foreground">
                          {formatCents(txn.amount).toFixed(2)}{" "}
                          <span className="text-[9px] font-medium text-muted-foreground uppercase">
                            {txn.currency}
                          </span>
                        </span>

                        {conversionPreview && (
                          <span className="mt-0.5 flex items-center justify-end gap-1 text-[9px] font-medium text-muted-foreground">
                            <ArrowRight className="h-3 w-3" />
                            {baseCurrency}{" "}
                            {formatCents(txn.amountInBase).toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between border-t border-border/10 pt-2.5">
                      <span className="font-mono text-[9px] break-all text-muted-foreground select-all">
                        ID: {txn.id}
                      </span>
                      {isLate ? (
                        <span className="rounded bg-rose-500/10 px-2 py-0.5 text-[8px] font-black tracking-wider text-rose-500 uppercase">
                          Late
                        </span>
                      ) : (
                        <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[8px] font-black tracking-wider text-emerald-500 uppercase">
                          On Time
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </ScrollArea>
        )}
      </SheetContent>
    </Sheet>
  )
}
