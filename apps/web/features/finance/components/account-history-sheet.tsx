import { WorkspaceInspectorPanel } from "@/components/ui/inspector-panel"
import { CopilotAttachButton } from "@/features/ai/components/copilot-attach-button"
import { buildCopilotEntityKey } from "@saturn/core"
import {
  useListTransactionsQuery,
  useListBudgetsQuery,
  type Account,
  useGetSettingsQuery,
} from "@saturn/api/gen/saturn/finance/v1/finance"
import { useActiveSpaceContext } from "@/features/space/use-space"
import { useTimezone, useI18n } from "@saturn/hooks"
import { getLocalizedEnumLabel } from "@saturn/i18n"
import {
  Loader2,
  Calendar,
  History,
  ArrowRight,
  TrendingDown,
  TrendingUp,
  Tag,
  Scale,
} from "lucide-react"
import { formatCents } from "../utils"
import { cn } from "@/lib/utils"

interface AccountHistorySheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  account: Account | null
}

export function AccountHistorySheet({
  open,
  onOpenChange,
  account,
}: AccountHistorySheetProps) {
  const { spaceId } = useActiveSpaceContext()
  const tz = useTimezone()
  const { t, language } = useI18n()
  const { data: settings } = useGetSettingsQuery(
    {},
    { enabled: open && !!spaceId }
  )
  const baseCurrency = settings?.baseCurrency || "USD"

  // Fetch transaction history for this account
  const { data: txnsData, isLoading: isTxnsLoading } = useListTransactionsQuery(
    {
      budgetId: "",
      types: [],
      pageSize: 100,
      pageToken: "",
      accountId: account?.id || "",
    },
    { enabled: open && !!account?.id && !!spaceId }
  )

  // Fetch budgets to resolve budget category names
  const { data: budgetsData, isLoading: isBudgetsLoading } =
    useListBudgetsQuery(
      { pageSize: 100, pageToken: "" },
      { enabled: open && !!spaceId }
    )

  const transactions = txnsData?.transactions || []
  const budgets = budgetsData?.budgets || []
  const isLoading = isTxnsLoading || isBudgetsLoading

  return (
    <WorkspaceInspectorPanel
      open={open}
      onOpenChange={onOpenChange}
      icon={<History className="size-4" />}
      title={t("finance.accounts.history.title")}
      description={
        <>
          {t("finance.accounts.history.description", {
            name:
              account?.name || t("finance.accounts.history.selectedAccount"),
          })}
        </>
      }
      headerActions={
        account?.id ? (
          <CopilotAttachButton
            item={{
              key: buildCopilotEntityKey("account", account.id),
              kind: "account",
              id: account.id,
              label: account.name || t("nav.accounts"),
              summary: {
                type: account.type,
                currency: account.currency,
                currentBalance: Number(account.currentBalance || 0),
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
            {t("finance.accounts.history.noTransactions")}
          </p>
          <p className="mt-1 max-w-[250px] text-xs text-muted-foreground/80">
            {t("finance.accounts.history.noTransactionsDescription")}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border/40">
          {transactions.map((txn) => {
            const conversionPreview = txn.currency !== baseCurrency
            const budget = budgets.find((b) => b.id === txn.budgetId)
            const rawAmt = formatCents(txn.amount)
            const isNegative = rawAmt < 0
            const isExpense =
              txn.type === "EXPENSE" || txn.type === "TRANSFER_OUT"
            const isAdjustment =
              txn.type === "BALANCE_ADJUSTMENT" ||
              txn.type === "TYPE_UNSPECIFIED" ||
              (txn.metadata?.source_type ?? txn.metadata?.sourceType) ===
                "SYSTEM_BALANCE_ADJUSTMENT"

            return (
              <div
                key={txn.id}
                className="space-y-2 py-3.5 first:pt-0 last:pb-0"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border/50 bg-muted/30 text-muted-foreground">
                      {isAdjustment ? (
                        <Scale className="h-4 w-4 text-teal-400" />
                      ) : isExpense ? (
                        <TrendingDown className="h-4 w-4 text-rose-400" />
                      ) : (
                        <TrendingUp className="h-4 w-4 text-emerald-400" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <span className="block truncate text-xs font-semibold text-foreground">
                        {txn.description ||
                          t("finance.accounts.history.unspecified")}
                      </span>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span>
                          {tz.formatDate(txn.transactionDate, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </span>
                        {budget && (
                          <>
                            <span className="text-muted-foreground/45">•</span>
                            <span className="flex items-center gap-0.5 font-medium text-foreground">
                              <Tag className="h-2.5 w-2.5" />
                              {budget.name}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0 text-right tabular-nums">
                    <span className="block font-mono text-xs font-semibold text-foreground">
                      {isNegative ? "-" : "+"}
                      {Math.abs(rawAmt).toLocaleString(undefined, {
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
                      txn.type === "EXPENSE" || txn.type === "TRANSFER_OUT"
                        ? "bg-rose-500/10 text-rose-500"
                        : txn.type === "BALANCE_ADJUSTMENT" ||
                            txn.type === "TYPE_UNSPECIFIED"
                          ? "bg-teal-500/10 text-teal-400"
                          : "bg-emerald-500/10 text-emerald-500"
                    )}
                  >
                    {txn.type === "BALANCE_ADJUSTMENT" ||
                    txn.type === "TYPE_UNSPECIFIED"
                      ? t("finance.accounts.history.adjustment")
                      : getLocalizedEnumLabel(
                          "finance",
                          "transactionType",
                          txn.type,
                          language
                        ).toUpperCase()}
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

export { AccountHistorySheet as AccountHistoryInspector }
