import { useState, useEffect, createElement } from "react"
import { useSearchParams, useNavigate } from "react-router-dom"
import { useUrlState } from "@/lib/use-url-state"
import { useDebounce } from "@/lib/use-debounce"
import {
  useSpacePermissions,
  resolveSpacePath,
} from "@/features/space/use-space"
import {
  useListTransactionsQuery,
  useDeleteTransactionMutation,
  type Transaction,
  useListAccountsQuery,
  useListInboxItemsQuery,
  useGetFinanceSettingsQuery,
  useListBudgetsQuery,
} from "@/gen/saturn/finance/v1/finance"
import { Inbox } from "lucide-react"
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
  Receipt,
  Plus,
  Loader2,
  Edit2,
  Repeat,
  MoreVertical,
  History,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import { FinancePageLayout } from "./components/finance-page-layout"
import { formatCents, getBudgetColors, getBudgetIcon } from "./utils"
import { CreateTransactionSheet } from "./components/create-transaction-sheet"
import { TransactionEventsSheet } from "./components/transaction-events-sheet"
const TRANSACTIONS_FILTER_DEFAULTS = {
  q: "",
  type: "TYPE_UNSPECIFIED" as string,
  budgetId: "_all" as string,
  accountId: "_all" as string,
  sort: "_default" as string,
}

export function TransactionsView() {
  const { spaceId, isWritable } = useSpacePermissions()

  const { data: settings } = useGetFinanceSettingsQuery(
    {},
    { enabled: !!spaceId }
  )
  const baseCurrency = settings?.baseCurrency || "USD"

  const { data: budgetsData, refetch: refetchBudgets } = useListBudgetsQuery(
    { pageSize: 100, pageToken: "" },
    { enabled: !!settings }
  )
  const budgets = budgetsData?.budgets || []

  const { data: accountsData } = useListAccountsQuery(
    {},
    { enabled: !!spaceId }
  )
  const accounts = accountsData?.accounts || []

  const [urlState, setUrlState] = useUrlState(TRANSACTIONS_FILTER_DEFAULTS)
  const [searchQuery, setSearchQuery] = useState(urlState.q)
  const debouncedSearchQuery = useDebounce(searchQuery, 300)

  useEffect(() => {
    setUrlState({ q: debouncedSearchQuery })
  }, [debouncedSearchQuery, setUrlState])

  const [prevUrlQ, setPrevUrlQ] = useState(urlState.q)
  if (urlState.q !== prevUrlQ) {
    setPrevUrlQ(urlState.q)
    setSearchQuery(urlState.q)
  }

  const [createOpen, setCreateOpen] = useState(false)
  const [editTransaction, setEditTransaction] = useState<Transaction | null>(
    null
  )
  const [eventsOpen, setEventsOpen] = useState(false)
  const [eventsTxnId, setEventsTxnId] = useState<string | null>(null)
  const [eventsTxnDescription, setEventsTxnDescription] = useState<
    string | null
  >(null)
  const [searchParams] = useSearchParams()

  // Fetch transactions
  const {
    data: txnData,
    isLoading: txnLoading,
    refetch: refetchTransactions,
  } = useListTransactionsQuery(
    {
      view: "FULL",
      budgetId: urlState.budgetId === "_all" ? "" : urlState.budgetId,
      type: urlState.type as Parameters<
        typeof useListTransactionsQuery
      >[0]["type"],
      accountId:
        urlState.accountId === "_all"
          ? undefined
          : urlState.accountId || undefined,
      searchQuery: urlState.q || undefined,
      sort:
        urlState.sort === "_default" ? undefined : urlState.sort || undefined,
      pageSize: 100,
      pageToken: "",
    },
    { enabled: !!spaceId }
  )
  const reviewParam = searchParams.get("review") === "true"
  const navigate = useNavigate()

  useEffect(() => {
    if (reviewParam) {
      navigate(resolveSpacePath("/finance/inbox", spaceId, true), {
        replace: true,
      })
    }
  }, [reviewParam, navigate, spaceId])

  // Query inbox items staged for review
  const { data: pendingData } = useListInboxItemsQuery(
    {
      status: "PENDING",
      pageSize: 100,
      pageToken: "",
      sort: "",
      view: "BASIC",
    },
    { enabled: !!spaceId }
  )

  const handleCreateTrigger = () => {
    setEditTransaction(null)
    setCreateOpen(true)
  }

  const handleEditTrigger = (t: Transaction) => {
    setEditTransaction(t)
    setCreateOpen(true)
  }

  const handleViewEventsTrigger = (t: Transaction) => {
    setEventsTxnId(t.id || null)
    setEventsTxnDescription(t.description || null)
    setEventsOpen(true)
  }

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
  const pendingCount = pendingData?.inboxItems.length || 0

  return (
    <FinancePageLayout
      title="Transactions"
      description="View your ledger history, check exchange conversions, and manage expenses."
      icon={Receipt}
    >
      <div className="mt-2 animate-in duration-300 fade-in">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* Left Column: Analytics & Controls (Sticky) */}
          <div className="space-y-6 self-start lg:sticky lg:top-6 lg:col-span-1">
            {pendingCount > 0 && (
              <div className="overflow-hidden rounded-3xl border border-indigo-500/30 bg-indigo-500/5 p-6 shadow-lg backdrop-blur-xl">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-indigo-500/20 bg-indigo-500/10 text-indigo-400">
                    <Inbox className="h-5 w-5 animate-pulse" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-foreground">
                      Staging Review Queue
                    </h4>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {pendingCount} transaction{pendingCount > 1 ? "s" : ""}{" "}
                      staged for review
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  className="mt-4 w-full cursor-pointer rounded-2xl bg-indigo-500 font-semibold text-white shadow-md hover:bg-indigo-600"
                  onClick={() =>
                    navigate(resolveSpacePath("/finance/inbox", spaceId, true))
                  }
                >
                  Review Staged Expenses
                </Button>
              </div>
            )}
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
                  <span className="mt-1 block text-2xl font-black tracking-tight whitespace-nowrap text-foreground sm:text-3xl">
                    {totalSpent.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{" "}
                    <span className="text-xs font-bold text-muted-foreground uppercase sm:text-sm">
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
                    <span className="mt-0.5 block text-sm font-extrabold whitespace-nowrap text-foreground">
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
                    <span className="mt-0.5 block text-sm font-extrabold whitespace-nowrap text-foreground">
                      {txCount}
                    </span>
                  </div>
                </div>
                {/* Filters */}
                <div className="block space-y-4 border-t border-border/20 pt-4">
                  {/* Search query */}
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                      Search Notes
                    </label>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search description..."
                      className="h-9 w-full rounded-xl border border-border/50 bg-background/30 px-3 text-xs font-semibold placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-primary focus:outline-none"
                    />
                  </div>

                  {/* Flow Type filter */}
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                      Flow Type
                    </label>
                    <Select
                      value={urlState.type}
                      onValueChange={(val) =>
                        setUrlState({ type: val || "TYPE_UNSPECIFIED" })
                      }
                    >
                      <SelectTrigger className="h-9 w-full rounded-xl border border-border/50 bg-background/30 px-3 text-xs font-semibold">
                        <SelectValue placeholder="All Flows">
                          {urlState.type === "TYPE_UNSPECIFIED"
                            ? "All Flows"
                            : urlState.type === "EXPENSE"
                              ? "Expense"
                              : urlState.type === "INCOME"
                                ? "Income"
                                : urlState.type === "TRANSFER_OUT"
                                  ? "Transfer Out"
                                  : urlState.type === "TRANSFER_IN"
                                    ? "Transfer In"
                                    : "All Flows"}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent className="rounded-xl border border-border/50 bg-card/90 p-1.5 shadow-xl backdrop-blur-xl">
                        <SelectItem value="TYPE_UNSPECIFIED">
                          All Flows
                        </SelectItem>
                        <SelectItem value="EXPENSE">Expense</SelectItem>
                        <SelectItem value="INCOME">Income</SelectItem>
                        <SelectItem value="TRANSFER_OUT">
                          Transfer Out
                        </SelectItem>
                        <SelectItem value="TRANSFER_IN">Transfer In</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Budget Category filter */}
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                      Budget Category
                    </label>
                    <Select
                      value={urlState.budgetId}
                      onValueChange={(val) =>
                        setUrlState({ budgetId: val || "_all" })
                      }
                    >
                      <SelectTrigger className="h-9 w-full rounded-xl border border-border/50 bg-background/30 px-3 text-xs font-semibold">
                        <SelectValue placeholder="All Budgets">
                          {urlState.budgetId === "_all"
                            ? "All Budgets"
                            : budgets.find((b) => b.id === urlState.budgetId)
                                ?.name || "All Budgets"}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent className="rounded-xl border border-border/50 bg-card/90 p-1.5 shadow-xl backdrop-blur-xl">
                        <SelectItem value="_all">All Budgets</SelectItem>
                        {budgets.map((b) => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Asset Account filter */}
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                      Asset Account
                    </label>
                    <Select
                      value={urlState.accountId}
                      onValueChange={(val) =>
                        setUrlState({ accountId: val || "_all" })
                      }
                    >
                      <SelectTrigger className="h-9 w-full rounded-xl border border-border/50 bg-background/30 px-3 text-xs font-semibold">
                        <SelectValue placeholder="All Accounts">
                          {urlState.accountId === "_all"
                            ? "All Accounts"
                            : accounts.find((a) => a.id === urlState.accountId)
                                ?.name || "All Accounts"}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent className="rounded-xl border border-border/50 bg-card/90 p-1.5 shadow-xl backdrop-blur-xl">
                        <SelectItem value="_all">All Accounts</SelectItem>
                        {accounts.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name} ({a.currency})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Sort Order filter */}
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                      Sort Order
                    </label>
                    <Select
                      value={urlState.sort}
                      onValueChange={(val) =>
                        setUrlState({ sort: val || "_default" })
                      }
                    >
                      <SelectTrigger className="h-9 w-full rounded-xl border border-border/50 bg-background/30 px-3 text-xs font-semibold">
                        <SelectValue placeholder="Newest first">
                          {urlState.sort === "_default"
                            ? "Newest first"
                            : urlState.sort === "transaction_date:asc"
                              ? "Oldest first"
                              : urlState.sort === "effective_date:desc"
                                ? "Effective: Newest"
                                : urlState.sort === "effective_date:asc"
                                  ? "Effective: Oldest"
                                  : urlState.sort === "amount:desc"
                                    ? "Highest Amount"
                                    : urlState.sort === "amount:asc"
                                      ? "Lowest Amount"
                                      : urlState.sort === "description:asc"
                                        ? "Description: A-Z"
                                        : urlState.sort === "description:desc"
                                          ? "Description: Z-A"
                                          : "Newest first"}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent className="rounded-xl border border-border/50 bg-card/90 p-1.5 shadow-xl backdrop-blur-xl">
                        <SelectItem value="_default">Newest first</SelectItem>
                        <SelectItem value="transaction_date:asc">
                          Oldest first
                        </SelectItem>
                        <SelectItem value="effective_date:desc">
                          Effective: Newest
                        </SelectItem>
                        <SelectItem value="effective_date:asc">
                          Effective: Oldest
                        </SelectItem>
                        <SelectItem value="amount:desc">
                          Highest Amount
                        </SelectItem>
                        <SelectItem value="amount:asc">
                          Lowest Amount
                        </SelectItem>
                        <SelectItem value="description:asc">
                          Description: A-Z
                        </SelectItem>
                        <SelectItem value="description:desc">
                          Description: Z-A
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
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
              <span className="rounded-full border border-border/30 bg-muted/40 px-2.5 py-1 text-xs font-bold whitespace-nowrap text-muted-foreground">
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
                      className="group relative flex items-center justify-between gap-4 rounded-2xl border border-border/40 bg-card/25 p-4 shadow-sm backdrop-blur-sm transition-all duration-300 hover:scale-[1.005] hover:bg-card/35 hover:shadow-md sm:grid sm:grid-cols-12 sm:gap-4"
                    >
                      {/* Column 1: Icon & Description (col-span-5) */}
                      <div className="flex min-w-0 flex-1 items-center gap-3 sm:col-span-5 sm:gap-4">
                        <div
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl sm:h-11 sm:w-11 ${colors.bg} ${colors.text} border ${colors.border}`}
                        >
                          {createElement(iconComp, { className: "h-5 w-5" })}
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-1.5 text-sm font-bold text-foreground transition-colors group-hover:text-primary">
                            <span className="max-w-[100px] truncate min-[375px]:max-w-[140px] min-[420px]:max-w-[180px] sm:max-w-none">
                              {t.description || (
                                <span className="text-xs font-normal text-muted-foreground/50 italic">
                                  No description
                                </span>
                              )}
                            </span>
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
                            <span className="font-mono text-[10px] text-muted-foreground/80 sm:hidden">
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

                      {/* Column 2: Transaction Type Badge (col-span-2) */}
                      <div className="hidden sm:col-span-2 sm:block">
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
                      <div className="hidden font-mono text-xs text-muted-foreground/80 sm:col-span-2 sm:block">
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
                      <div className="min-w-0 shrink-0 pr-1 text-right sm:col-span-2 sm:pr-2">
                        <span
                          className={`block text-sm font-extrabold tracking-tight sm:text-base ${
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
                          <span className="ml-1 text-[9px] font-bold text-muted-foreground uppercase sm:text-[10px]">
                            {t.currency}
                          </span>
                        </span>
                        {isCrossCurrency && (
                          <span className="mt-0.5 flex items-center justify-end gap-0.5 truncate font-mono text-[9px] text-muted-foreground sm:text-[10px]">
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
                      <div className="flex shrink-0 justify-end sm:col-span-1">
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
                                onClick={() => handleViewEventsTrigger(t)}
                                className="flex cursor-pointer items-center gap-2"
                              >
                                <History className="h-4 w-4" />
                                <span>Timeline</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleEditTrigger(t)}
                                className="flex cursor-pointer items-center gap-2"
                              >
                                <Edit2 className="h-4 w-4" />
                                <span>Edit</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleDelete(t.id || "")}
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
          baseCurrency={baseCurrency}
          budgets={budgets}
          editTransaction={editTransaction}
          refetchTransactions={refetchTransactions}
          refetchBudgets={refetchBudgets}
        />
        <TransactionEventsSheet
          open={eventsOpen}
          onOpenChange={setEventsOpen}
          txnId={eventsTxnId}
          txnDescription={eventsTxnDescription}
        />
      </div>
    </FinancePageLayout>
  )
}
