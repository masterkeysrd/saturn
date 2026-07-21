import { useState, createElement } from "react"
import {
  useListTransactionsQuery,
  useDeleteTransactionMutation,
  type Transaction,
  useListAccountsQuery,
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
  ArrowDownLeft,
  Coins,
  Trash2,
  Filter,
  Receipt,
  Plus,
  Loader2,
  Edit2,
  Repeat,
  MoreVertical,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
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
  const { data: accountsData } = useListAccountsQuery(
    {},
    { enabled: !!spaceId }
  )
  const accounts = accountsData?.accounts || []
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
      id,
      req: { id },
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
                      className="group relative grid grid-cols-12 items-center gap-4 rounded-2xl border border-border/40 bg-card/25 p-4 shadow-sm backdrop-blur-sm transition-all duration-300 hover:scale-[1.005] hover:bg-card/35 hover:shadow-md"
                    >
                      {/* Column 1: Icon & Description (col-span-5) */}
                      <div className="col-span-5 flex min-w-0 items-center gap-4">
                        <div
                          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${colors.bg} ${colors.text} border ${colors.border}`}
                        >
                          {createElement(iconComp, { className: "h-5 w-5" })}
                        </div>
                        <div className="min-w-0">
                          <span className="flex flex-wrap items-center gap-2 truncate text-sm font-bold text-foreground transition-colors group-hover:text-primary">
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
                            {t.sourceType === "borrowing" &&
                              t.type === "EXPENSE" && (
                                <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[8px] font-black tracking-wider text-amber-500 uppercase select-none">
                                  <ArrowUpRight className="h-2.5 w-2.5" />
                                  Lend
                                </span>
                              )}
                            {t.sourceType === "borrowing" &&
                              t.type === "INCOME" && (
                                <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[8px] font-black tracking-wider text-emerald-500 uppercase select-none">
                                  <ArrowDownLeft className="h-2.5 w-2.5" />
                                  Borrow
                                </span>
                              )}
                            {t.sourceType === "borrowing_repayment" && (
                              <span className="inline-flex items-center gap-1 rounded bg-blue-500/10 px-1.5 py-0.5 text-[8px] font-black tracking-wider text-blue-500 uppercase select-none">
                                <Coins className="h-2.5 w-2.5" />
                                Repayment
                              </span>
                            )}
                          </span>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${colors.bg} ${colors.text}`}
                            >
                              {details.name}
                            </span>
                            {(() => {
                              const acc = accounts.find(
                                (a) => a.id === t.accountId
                              )
                              if (!acc) return null
                              return (
                                <span className="inline-flex items-center gap-1 rounded border border-border/40 bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                                  {acc.name}
                                </span>
                              )
                            })()}
                          </div>
                        </div>
                      </div>

                      {/* Column 2: Transaction Type Badge (col-span-2) */}
                      <div className="col-span-2">
                        <span
                          className={`inline-flex items-center rounded border px-2 py-0.5 text-[9px] font-extrabold uppercase select-none ${
                            t.type === "INCOME"
                              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-500"
                              : t.type === "EXPENSE"
                                ? "border-rose-500/20 bg-rose-500/10 text-rose-500"
                                : "border-border/30 bg-muted text-muted-foreground"
                          }`}
                        >
                          {t.type}
                        </span>
                      </div>

                      {/* Column 3: Date (col-span-2) */}
                      <div className="col-span-2 font-mono text-xs text-muted-foreground/80">
                        {new Date(t.transactionDate).toLocaleDateString(
                          undefined,
                          {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            timeZone: "UTC",
                          }
                        )}
                      </div>

                      {/* Column 4: Amount (col-span-2 text-right) */}
                      <div className="col-span-2 min-w-0 pr-2 text-right">
                        <span
                          className={`block text-base font-extrabold tracking-tight ${
                            t.type === "INCOME"
                              ? "text-emerald-500"
                              : "text-foreground"
                          } truncate`}
                        >
                          {t.type === "INCOME" ? "+" : "-"}
                          {amtLocal.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                          <span className="ml-1 text-[10px] font-bold text-muted-foreground uppercase">
                            {t.currency}
                          </span>
                        </span>
                        {isCrossCurrency && (
                          <span className="mt-0.5 flex items-center justify-end gap-0.5 truncate font-mono text-[10px] text-muted-foreground">
                            {t.type === "INCOME" ? "+" : "-"}
                            {amtBase.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}{" "}
                            {settings?.baseCurrency}
                          </span>
                        )}
                      </div>

                      {/* Column 5: Actions (col-span-1 text-right) */}
                      <div className="col-span-1 flex justify-end">
                        {isWritable && (
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 shrink-0 cursor-pointer rounded-lg text-muted-foreground hover:bg-muted/40"
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              }
                            />
                            <DropdownMenuContent align="end" className="w-36">
                              <DropdownMenuItem
                                onClick={() => handleEditTrigger(t)}
                                className="flex cursor-pointer items-center gap-2"
                              >
                                <Edit2 className="h-4 w-4" />
                                <span>Edit</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleDelete(t.id)}
                                disabled={deleteMutation.isPending}
                                className="flex cursor-pointer items-center gap-2 text-destructive focus:bg-destructive/10 focus:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                                <span>Delete</span>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
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
