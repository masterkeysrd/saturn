import { WorkspaceInspectorPanel } from "@/components/ui/inspector-panel"
import { CopilotAttachButton } from "@/features/ai/components/copilot-attach-button"
import { buildCopilotEntityKey } from "@saturn/core"
import {
  useListTransactionsQuery,
  useListAccountsQuery,
  type Budget,
  useGetSettingsQuery,
} from "@saturn/api/gen/saturn/finance/v1/finance"
import { useActiveSpaceContext } from "@/features/space/use-space"
import { useTimezone } from "@saturn/hooks"
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
  const { spaceId } = useActiveSpaceContext()
  const tz = useTimezone()
  const { data: settings } = useGetSettingsQuery(
    {},
    { enabled: open && !!spaceId }
  )
  const baseCurrency = settings?.baseCurrency || "USD"

  // Fetch transaction history for this budget
  const { data: txnsData, isLoading: isTxnsLoading } = useListTransactionsQuery(
    {
      budgetId: budget?.id || "",
      types: [],
      pageSize: 100,
      pageToken: "",
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
    <WorkspaceInspectorPanel
      open={open}
      onOpenChange={onOpenChange}
      icon={<History className="size-4" />}
      title="Budget Transaction History"
      description={
        <>
          Ledger for{" "}
          <span className="font-medium text-foreground">
            {budget?.name || "selected budget"}
          </span>
        </>
      }
      headerActions={
        budget?.id ? (
          <CopilotAttachButton
            item={{
              key: buildCopilotEntityKey("budget", budget.id),
              kind: "budget",
              id: budget.id,
              label: budget.name || "Budget",
              summary: {
                currency: budget.currency,
                limitAmount: Number(budget.limitAmount || 0),
                interval: budget.interval,
                status: budget.status,
              },
            }}
          />
        ) : null
      }
    >
      {isLoading ? (
        <div className="flex h-[250px] items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      ) : transactions.length === 0 ? (
        <div className="flex h-[250px] flex-col items-center justify-center p-4 text-center">
          <Calendar className="mb-3 h-9 w-9 text-muted-foreground/30" />
          <p className="text-xs font-semibold text-muted-foreground">
            No transactions logged
          </p>
          <p className="mt-1 max-w-[250px] text-xs text-muted-foreground/80">
            Transactions allocated to this budget category will appear here once
            they are added.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border/40">
          {transactions.map((txn) => {
            const conversionPreview = txn.currency !== baseCurrency
            const account = accounts.find((a) => a.id === txn.accountId)
            const isExpense =
              txn.type === "EXPENSE" || txn.type === "TRANSFER_OUT"
            const budgetColors = getBudgetColors(budget?.color || "indigo")

            return (
              <div
                key={txn.id}
                className="space-y-2 py-3.5 first:pt-0 last:pb-0"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border",
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
                      <span className="block truncate text-xs font-semibold text-foreground">
                        {txn.description || "Unspecified Transaction"}
                      </span>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span>
                          {tz.formatDate(txn.transactionDate, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </span>
                        {account && (
                          <>
                            <span className="text-muted-foreground/45">•</span>
                            <span className="flex items-center gap-0.5 font-medium text-foreground">
                              <Wallet className="h-2.5 w-2.5" />
                              {account.name}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0 text-right tabular-nums">
                    <span
                      className={cn(
                        "block font-mono text-xs font-semibold",
                        isExpense ? "text-foreground" : "text-emerald-500"
                      )}
                    >
                      {isExpense ? "-" : "+"}
                      {formatCents(txn.amount).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{" "}
                      <span className="text-[11px] font-medium uppercase opacity-80">
                        {txn.currency}
                      </span>
                    </span>

                    {conversionPreview && (
                      <span className="mt-0.5 flex items-center justify-end gap-1 font-mono text-[11px] text-muted-foreground">
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

                <div className="flex items-center justify-between pt-0.5">
                  <span className="font-mono text-[11px] text-muted-foreground/75 select-all">
                    ID: {txn.id}
                  </span>
                  <span
                    className={cn(
                      "rounded-md px-2 py-0.5 text-[11px] font-medium",
                      txn.type === "EXPENSE"
                        ? "bg-muted text-muted-foreground"
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
      )}
    </WorkspaceInspectorPanel>
  )
}

export { BudgetHistorySheet as BudgetHistoryInspector }
