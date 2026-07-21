import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import {
  useListTransactionsQuery,
  useListAccountsQuery,
  type Budget,
} from "@/gen/saturn/finance/v1/finance"
import { useWorkspaceFinance } from "../use-workspace-finance"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Loader2,
  Calendar,
  History,
  ArrowRight,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react"
import { formatCents, getBudgetColors } from "../utils"
import { cn } from "@/lib/utils"

interface BudgetHistorySheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  budget: Budget | null
}

export function BudgetHistorySheet({
  open,
  onOpenChange,
  budget,
}: BudgetHistorySheetProps) {
  const { spaceId, settings } = useWorkspaceFinance()
  const baseCurrency = settings?.baseCurrency || "USD"

  // Fetch transaction history for this budget
  const { data: txnsData, isLoading: isTxnsLoading } = useListTransactionsQuery(
    {
      budgetId: budget?.id || "",
      type: "TRANSACTION_TYPE_UNSPECIFIED",
      pageSize: 100,
      pageToken: "",
      sourceType: "",
      sourceId: "",
    },
    { enabled: open && !!budget?.id && !!spaceId }
  )

  // Fetch accounts to map account names
  const { data: accountsData, isLoading: isAccountsLoading } =
    useListAccountsQuery({}, { enabled: open && !!spaceId })

  const transactions = txnsData?.transactions || []
  const accounts = accountsData?.accounts || []
  const isLoading = isTxnsLoading || isAccountsLoading

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full border-l border-border/40 bg-card/95 p-6 shadow-2xl backdrop-blur-xl sm:!max-w-xl">
        <SheetHeader className="mb-6 text-left">
          <SheetTitle className="flex items-center gap-2 text-xl font-bold tracking-tight text-foreground">
            <History className="h-5 w-5 text-primary" />
            Budget Transaction History
          </SheetTitle>
          <SheetDescription className="mt-1 text-xs text-muted-foreground">
            Ledger of transactions allocated under budget:{" "}
            <span className="font-semibold text-foreground">
              {budget?.name || ""}
            </span>
          </SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="flex h-[250px] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : transactions.length === 0 ? (
          <div className="flex h-[250px] flex-col items-center justify-center p-4 text-center">
            <Calendar className="mb-3 h-10 w-10 text-muted-foreground/30" />
            <p className="text-xs font-semibold text-muted-foreground">
              No transactions logged
            </p>
            <p className="mt-1 max-w-[250px] text-[10px] text-muted-foreground/80">
              Transactions allocated to this budget category will appear here
              once they are added.
            </p>
          </div>
        ) : (
          <ScrollArea className="h-[calc(100vh-180px)] pr-3">
            <div className="space-y-3.5">
              {transactions.map((txn) => {
                const conversionPreview = txn.currency !== baseCurrency
                const account = accounts.find((a) => a.id === txn.accountId)
                const isExpense =
                  txn.type === "EXPENSE" || txn.type === "TRANSFER_OUT"
                const budgetColors = getBudgetColors(budget?.color || "indigo")

                return (
                  <div
                    key={txn.id}
                    className="relative overflow-hidden rounded-2xl border border-border/40 bg-background/50 p-4 shadow-sm backdrop-blur-sm transition-all hover:bg-background/80"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex min-w-0 items-center gap-3">
                        {/* Transaction Type Indicator Icon */}
                        <div
                          className={cn(
                            "flex h-7 w-7 items-center justify-center rounded-lg border",
                            isExpense
                              ? `${budgetColors.border} ${budgetColors.bg} ${budgetColors.text}`
                              : "border-emerald-500/20 bg-emerald-500/5 text-emerald-500"
                          )}
                        >
                          {isExpense ? (
                            <TrendingDown className="h-4 w-4" />
                          ) : (
                            <TrendingUp className="h-4 w-4" />
                          )}
                        </div>

                        <div className="min-w-0">
                          <span className="block truncate text-xs font-bold text-foreground">
                            {txn.description || "Unspecified Transaction"}
                          </span>
                          <div className="mt-0.5 flex items-center gap-1.5 text-[9px] text-muted-foreground">
                            <span>
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
                            {account && (
                              <>
                                <span className="text-muted-foreground/45">
                                  •
                                </span>
                                <span className="flex items-center gap-0.5 font-medium text-foreground">
                                  <Wallet className="h-2.5 w-2.5" />
                                  {account.name}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <span
                          className={cn(
                            "block text-xs font-black",
                            isExpense ? "text-foreground" : "text-emerald-500"
                          )}
                        >
                          {isExpense ? "-" : "+"}
                          {formatCents(txn.amount).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}{" "}
                          <span className="text-[9px] font-bold uppercase opacity-85">
                            {txn.currency}
                          </span>
                        </span>

                        {conversionPreview && (
                          <span className="mt-0.5 flex items-center justify-end gap-1 text-[9px] font-medium text-muted-foreground">
                            <ArrowRight className="h-3 w-3" />
                            {baseCurrency}{" "}
                            {formatCents(txn.amountInBase).toLocaleString(
                              undefined,
                              {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              }
                            )}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between border-t border-border/10 pt-2.5">
                      <span className="font-mono text-[9px] text-muted-foreground/75 select-all">
                        ID: {txn.id}
                      </span>
                      <span
                        className={cn(
                          "rounded px-2 py-0.5 text-[8px] font-black tracking-wider uppercase",
                          txn.type === "EXPENSE"
                            ? "border border-border/40 bg-muted text-muted-foreground"
                            : txn.type === "INCOME"
                              ? "bg-emerald-500/10 text-emerald-500"
                              : "bg-blue-500/10 text-blue-500"
                        )}
                      >
                        {txn.type
                          .replace("TRANSACTION_TYPE_", "")
                          .replace("_", " ")}
                      </span>
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
