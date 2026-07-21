import { useState, createElement } from "react"
import {
  useListTransactionsQuery,
  useDeleteTransactionMutation,
  type Transaction,
} from "@/gen/saturn/finance/v1/finance"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
import {
  ArrowUpRight,
  Trash2,
  Filter,
  Receipt,
  Plus,
  Loader2,
  Edit2,
  Repeat,
} from "lucide-react"
import { useWorkspaceFinance } from "./use-workspace-finance"
import { FinancePageLayout } from "./components/finance-page-layout"
import { formatCents, getBudgetColors, getBudgetIcon } from "./utils"
import { CreateTransactionSheet } from "./components/create-transaction-sheet"

export function TransactionsView() {
  const {
    spaceId,
    isWritable,
    settings,
    budgets,
    getConversionPreview,
    refetchBudgets,
  } = useWorkspaceFinance()
  const [selectedBudgetFilter, setSelectedBudgetFilter] = useState("")
  const [createOpen, setCreateOpen] = useState(false)
  const [editTransaction, setEditTransaction] = useState<Transaction | null>(
    null
  )

  const handleCreateTrigger = () => {
    setEditTransaction(null)
    setCreateOpen(true)
  }

  const handleEditTrigger = (t: Transaction) => {
    setEditTransaction(t)
    setCreateOpen(true)
  }

  // Fetch transactions
  const {
    data: txnData,
    isLoading: txnLoading,
    refetch: refetchTransactions,
  } = useListTransactionsQuery(
    {
      spaceId,
      budgetId: selectedBudgetFilter || "",
      type: "TRANSACTION_TYPE_UNSPECIFIED",
      pageSize: 100,
      pageToken: "",
    },
    { enabled: !!spaceId }
  )

  const deleteMutation = useDeleteTransactionMutation()

  const handleDelete = async (id: string) => {
    if (
      !confirm(
        "Are you sure you want to delete this transaction? This will restore the budget limit capacity."
      )
    ) {
      return
    }
    await deleteMutation.mutateAsync({
      space_id: spaceId,
      id,
      req: { spaceId, id },
    })
    refetchTransactions()
    refetchBudgets()
  }

  const getBudgetDetails = (id: string) => {
    const b = budgets.find((x) => x.id === id)
    return b
      ? {
          name: b.name,
          icon: b.icon || "piggy-bank",
          color: b.color || "indigo",
        }
      : {
          name: "General",
          icon: "coins",
          color: "zinc",
        }
  }

  // Calculate stats from queried stream
  const transactions = txnData?.transactions || []
  const totalSpent = transactions.reduce(
    (acc, t) => acc + formatCents(t.amountInBase),
    0
  )
  const txCount = transactions.length
  const avgSpent = txCount > 0 ? totalSpent / txCount : 0

  return (
    <FinancePageLayout
      title="Workspace Transactions"
      description="View your ledger history, check exchange conversions, and manage expenses."
      icon={Receipt}
    >
      <div className="mt-2 animate-in duration-300 fade-in">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* Left Column: Analytics & Controls (Sticky) */}
          <div className="space-y-6 self-start lg:sticky lg:top-6 lg:col-span-1">
            <div className="overflow-hidden rounded-3xl border border-border/40 bg-card/45 p-6 shadow-xl backdrop-blur-xl md:p-8">
              <h3 className="text-lg font-bold text-foreground">
                Ledger Overview
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Real-time summary and workspace transaction controls.
              </p>

              <div className="mt-8 space-y-6">
                {/* Total Outflow Display */}
                <div>
                  <span className="block text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                    Total Outflow
                  </span>
                  <span className="mt-1 block text-3xl font-black tracking-tight text-foreground">
                    {totalSpent.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{" "}
                    <span className="text-sm font-bold text-muted-foreground uppercase">
                      {settings?.baseCurrency}
                    </span>
                  </span>
                </div>

                {/* Sub-stats Grid */}
                <div className="grid grid-cols-2 gap-4 border-t border-border/20 pt-4">
                  <div>
                    <span className="block text-[9px] font-bold text-muted-foreground uppercase">
                      Average Cost
                    </span>
                    <span className="mt-0.5 block text-sm font-extrabold text-foreground">
                      {avgSpent.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[9px] font-bold text-muted-foreground uppercase">
                      Total Transactions
                    </span>
                    <span className="mt-0.5 block text-sm font-extrabold text-foreground">
                      {txCount}
                    </span>
                  </div>
                </div>

                {/* Filter */}
                <div className="block space-y-2 border-t border-border/20 pt-4">
                  <label className="block text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                    Filter Budget
                  </label>
                  <Select
                    value={selectedBudgetFilter}
                    onValueChange={(val) => setSelectedBudgetFilter(val || "")}
                  >
                    <SelectTrigger className="h-9 w-full rounded-xl border border-border/50 bg-background/30 px-3 text-xs font-semibold">
                      <span className="flex items-center gap-2">
                        <Filter className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <SelectValue placeholder="All Budgets">
                          {selectedBudgetFilter
                            ? budgets.find((b) => b.id === selectedBudgetFilter)
                                ?.name || "All Budgets"
                            : "All Budgets"}
                        </SelectValue>
                      </span>
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border border-border/50 bg-card/90 p-1.5 shadow-xl backdrop-blur-xl">
                      <SelectItem value="">All Budgets</SelectItem>
                      {budgets.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Add Expense Action Button */}
                {isWritable && (
                  <Button
                    onClick={handleCreateTrigger}
                    className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-accent pt-0.5 font-semibold text-white shadow-lg shadow-primary/15 transition-all hover:scale-[1.02] hover:opacity-95"
                  >
                    <Plus className="h-4.5 w-4.5" />
                    Record Expense
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Transaction Stream (Activity List) */}
          <div className="space-y-4 lg:col-span-2">
            <div className="flex items-center justify-between px-2">
              <div>
                <h3 className="text-lg font-bold text-foreground">
                  Activity Stream
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Chronological record of space-wide expenses.
                </p>
              </div>
              <span className="rounded-full border border-border/30 bg-muted/40 px-2.5 py-1 text-xs font-bold text-muted-foreground">
                {txCount} total
              </span>
            </div>

            {/* Loader */}
            {txnLoading ? (
              <div className="flex items-center justify-center rounded-3xl border border-border/20 bg-card/15 py-20">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : transactions.length === 0 ? (
              <div className="flex animate-in flex-col items-center justify-center rounded-3xl border border-dashed border-border/40 bg-card/15 py-24 text-center shadow-inner fade-in">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/40 text-muted-foreground/80 shadow-sm">
                  <Receipt className="h-8 w-8" />
                </div>
                <h4 className="text-md font-bold text-foreground">
                  No Transactions Recorded
                </h4>
                <p className="mt-1.5 max-w-xs px-4 text-xs leading-relaxed text-muted-foreground">
                  Create an expense to see it in your ledger stream and update
                  your budget progress.
                </p>
              </div>
            ) : (
              <div className="space-y-3.5 select-none">
                {transactions.map((t) => {
                  const amtLocal = formatCents(t.amount)
                  const amtBase = formatCents(t.amountInBase)
                  const isCrossCurrency = t.currency !== settings?.baseCurrency
                  const details = getBudgetDetails(t.budgetId)
                  const colors = getBudgetColors(details.color)
                  const iconComp = getBudgetIcon(details.icon)

                  return (
                    <div
                      key={t.id}
                      className="group relative flex items-center justify-between rounded-2xl border border-border/40 bg-card/25 p-4 shadow-sm backdrop-blur-sm transition-all duration-300 hover:scale-[1.005] hover:bg-card/35 hover:shadow-md"
                    >
                      {/* Left: Avatar with dynamic colors/icons */}
                      <div className="flex items-center gap-4">
                        <div
                          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${colors.bg} ${colors.text} border ${colors.border}`}
                        >
                          {createElement(iconComp, { className: "h-5 w-5" })}
                        </div>

                        {/* Middle: Details */}
                        <div>
                          <span className="flex items-center gap-2 text-sm font-bold text-foreground transition-colors group-hover:text-primary">
                            {t.description || (
                              <span className="text-xs font-normal text-muted-foreground/50 italic">
                                No description
                              </span>
                            )}
                            {t.sourceType === "recurrent_expense" && (
                              <span className="inline-flex items-center gap-1 rounded bg-indigo-500/10 px-1.5 py-0.5 text-[8px] font-black tracking-wider text-indigo-500 uppercase select-none">
                                <Repeat className="h-2.5 w-2.5" />
                                Recurring
                              </span>
                            )}
                          </span>
                          <div className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${colors.bg} ${colors.text}`}
                            >
                              {details.name}
                            </span>
                            <span>•</span>
                            <span className="font-mono text-[11px] text-muted-foreground/80">
                              {new Date(t.transactionDate).toLocaleDateString(
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
                        </div>
                      </div>

                      {/* Right: Amounts & Delete Actions */}
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <span className="block text-base font-extrabold tracking-tight text-foreground">
                            {amtLocal.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                            <span className="ml-1 text-[10px] font-bold text-muted-foreground uppercase">
                              {t.currency}
                            </span>
                          </span>
                          {isCrossCurrency && (
                            <span className="mt-0.5 flex items-center justify-end gap-0.5 font-mono text-[10px] text-muted-foreground">
                              <ArrowUpRight className="h-3 w-3 shrink-0 text-muted-foreground/60" />
                              {amtBase.toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}{" "}
                              {settings?.baseCurrency}
                            </span>
                          )}
                        </div>

                        {isWritable && (
                          <div className="flex items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEditTrigger(t)}
                              className="h-8 w-8 shrink-0 cursor-pointer rounded-lg text-muted-foreground hover:bg-muted/40"
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={deleteMutation.isPending}
                              onClick={() => handleDelete(t.id)}
                              className="h-8 w-8 shrink-0 cursor-pointer rounded-lg text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
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

        {/* Transaction recording slider sheet */}
        <CreateTransactionSheet
          open={createOpen}
          onOpenChange={setCreateOpen}
          spaceId={spaceId}
          baseCurrency={settings?.baseCurrency || "USD"}
          budgets={budgets}
          editTransaction={editTransaction}
          refetchTransactions={refetchTransactions}
          refetchBudgets={refetchBudgets}
          getConversionPreview={getConversionPreview}
        />
      </div>
    </FinancePageLayout>
  )
}
