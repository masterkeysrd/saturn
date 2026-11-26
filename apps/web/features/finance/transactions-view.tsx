import { TransactionFilterToolbar } from "./components/transaction-filter-toolbar"
import { TransactionLedgerList } from "./components/transaction-ledger-list"
import { useState, useEffect, useMemo } from "react"
import { useSearchParams, useNavigate } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { useUrlState } from "@/lib/use-url-state"
import {
  invalidateFinanceQueries,
  useDebounce,
  useI18n,
  useTimezone,
} from "@saturn/hooks"
import { useRegisterCopilotView } from "@saturn/hooks/ai"
import { buildCopilotEntityKey, convertCentsToBase } from "@saturn/core"
import {
  useSpacePermissions,
  resolveSpacePath,
} from "@/features/space/use-space"
import {
  useListTransactionsQuery,
  useDeleteTransactionMutation,
  type Transaction,
  type Transaction_Type,
  useListAccountsQuery,
  useListInboxItemsQuery,
  useGetSettingsQuery,
  useListBudgetsQuery,
  useListExchangeRatesQuery,
} from "@saturn/api/gen/saturn/finance/v1/finance"
import {
  ArrowUpDown,
  ArrowUpRight,
  ArrowDownLeft,
  Trash2,
  Receipt,
  Plus,
  Loader2,
  Edit2,
  MoreVertical,
  History,
  Calculator,
  Hash,
  Inbox,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { MoneyAmount } from "@/components/ui/money-amount"
import { toast } from "@/components/ui/toast"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import { FinancePageLayout } from "./components/finance-page-layout"
import { FinancePeriodPicker } from "./components/finance-period-picker"
import { resolveFinancePeriodBounds } from "./period-bounds"
import { CreateTransactionSheet } from "./components/create-transaction-sheet"
import { TransactionEventsSheet } from "./components/transaction-events-sheet"

const TRANSACTIONS_FILTER_DEFAULTS = {
  q: "",
  type: "TYPE_UNSPECIFIED" as string,
  budgetId: "_all" as string,
  accountId: "_all" as string,
  transferId: "" as string,
  scheduledTransactionId: "" as string,
  borrowingId: "" as string,
  period: "this_month" as string,
  month: "" as string,
  dateFrom: "" as string,
  dateTo: "" as string,
  sort: "_default" as string,
}

export function TransactionsView() {
  const queryClient = useQueryClient()
  const { spaceId, isWritable } = useSpacePermissions()
  const tz = useTimezone()
  const { t } = useI18n()
  const navigate = useNavigate()

  const getSortLabel = (sort: string): string => {
    switch (sort) {
      case "transaction_date:asc":
        return t("finance.transactions.sort.oldest")
      case "amount:desc":
        return t("finance.transactions.sort.highest")
      case "amount:asc":
        return t("finance.transactions.sort.lowest")
      case "effective_date:desc":
        return t("finance.transactions.sort.effectiveNewest")
      case "effective_date:asc":
        return t("finance.transactions.sort.effectiveOldest")
      case "description:asc":
        return t("finance.transactions.sort.descAZ")
      case "description:desc":
        return t("finance.transactions.sort.descZA")
      default:
        return t("finance.transactions.sort.newest")
    }
  }
  const [searchParams] = useSearchParams()

  const { data: settings } = useGetSettingsQuery({}, { enabled: !!spaceId })
  const baseCurrency = settings?.baseCurrency || "USD"

  const { data: budgetsData, refetch: refetchBudgets } = useListBudgetsQuery(
    { pageSize: 100, pageToken: "" },
    { enabled: !!settings }
  )
  const budgets = useMemo(
    () => budgetsData?.budgets || [],
    [budgetsData?.budgets]
  )

  const { data: accountsData } = useListAccountsQuery(
    {},
    { enabled: !!spaceId }
  )
  const accounts = useMemo(
    () => accountsData?.accounts || [],
    [accountsData?.accounts]
  )

  const { data: ratesData } = useListExchangeRatesQuery(
    { pageSize: 100, pageToken: "" },
    { enabled: !!spaceId }
  )
  const exchangeRates = useMemo(
    () => ratesData?.exchangeRates || [],
    [ratesData?.exchangeRates]
  )

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
  const [selectedTransaction, setSelectedTransaction] =
    useState<Transaction | null>(null)
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)

  const now = tz.now()
  const periodBounds = useMemo(
    () =>
      resolveFinancePeriodBounds(
        {
          period: urlState.period,
          month: urlState.month,
          dateFrom: urlState.dateFrom,
          dateTo: urlState.dateTo,
        },
        now,
        tz.timezone,
        tz.locale
      ),
    [
      urlState.period,
      urlState.month,
      urlState.dateFrom,
      urlState.dateTo,
      now,
      tz.timezone,
      tz.locale,
    ]
  )

  // Fetch transactions using server-supported filters
  const {
    data: txnData,
    isLoading: txnLoading,
    refetch: refetchTransactions,
  } = useListTransactionsQuery(
    {
      view: "FULL",
      budgetId: urlState.budgetId === "_all" ? "" : urlState.budgetId,
      types:
        urlState.type && urlState.type !== "TYPE_UNSPECIFIED"
          ? [urlState.type as Transaction_Type]
          : undefined,
      accountId:
        urlState.accountId === "_all"
          ? undefined
          : urlState.accountId || undefined,
      transferId: urlState.transferId || undefined,
      scheduledTransactionId: urlState.scheduledTransactionId || undefined,
      borrowingId: urlState.borrowingId || undefined,
      searchQuery: urlState.q || undefined,
      startDate: periodBounds.startISO || undefined,
      endDate: periodBounds.endISO || undefined,
      sort:
        urlState.sort === "_default" ? undefined : urlState.sort || undefined,
      pageSize: 100,
      pageToken: "",
    },
    { enabled: !!spaceId }
  )

  const reviewParam = searchParams.get("review") === "true"

  useRegisterCopilotView({
    viewId: "finance.transactions",
    title: t("finance.transactions.copilotTitle"),
    activeEntity:
      inspectorOpen && selectedTransaction?.id
        ? {
            key: buildCopilotEntityKey("transaction", selectedTransaction.id),
            kind: "transaction",
            id: selectedTransaction.id,
            label:
              selectedTransaction.description ||
              t("finance.transactions.transaction"),
            summary: {
              amount: Number(selectedTransaction.amount || 0),
              currency: selectedTransaction.currency,
              type: selectedTransaction.type,
              transactionDate: selectedTransaction.transactionDate,
            },
          }
        : undefined,
    suggestions: [
      t("finance.transactions.suggestion.spendingTrends"),
      t("finance.transactions.suggestion.unusualCharges"),
      t("finance.transactions.suggestion.categories"),
    ],
  })

  useEffect(() => {
    if (reviewParam) {
      navigate(resolveSpacePath("/finance/inbox", spaceId, true), {
        replace: true,
      })
    }
  }, [reviewParam, navigate, spaceId])

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

  const handleInspectTransaction = (t: Transaction) => {
    setSelectedTransaction(t)
    setInspectorOpen(true)
  }

  const deleteMutation = useDeleteTransactionMutation()

  const handleDelete = (id: string) => {
    if (!id) return
    setDeleteTargetId(id)
  }

  const handleConfirmDelete = async () => {
    if (!deleteTargetId) return
    try {
      await deleteMutation.mutateAsync({
        id: deleteTargetId,
        req: { id: deleteTargetId },
      })
      toast.add({
        type: "success",
        title: t("finance.transactions.deletedSuccessTitle"),
        description: t("finance.transactions.deletedSuccessDescription"),
      })
      if (selectedTransaction?.id === deleteTargetId) {
        setInspectorOpen(false)
        setSelectedTransaction(null)
      }
      setDeleteTargetId(null)
      await invalidateFinanceQueries(queryClient)
      refetchTransactions()
      refetchBudgets()
    } catch (err) {
      toast.add({
        type: "error",
        title: t("finance.transactions.deleteFailedTitle"),
        description:
          err instanceof Error
            ? err.message
            : t("finance.transactions.deleteFailedDescription"),
      })
    }
  }

  const transactions = useMemo(
    () => txnData?.transactions || [],
    [txnData?.transactions]
  )

  // Calculate KPI stats from visible (filtered) transactions
  const expenseTransactions = transactions.filter((t) => t.type === "EXPENSE")
  const incomeTransactions = transactions.filter((t) => t.type === "INCOME")

  const totalInflowCents = incomeTransactions.reduce((acc, t) => {
    const base =
      t.amountInBase !== undefined && t.amountInBase !== ""
        ? Number(t.amountInBase)
        : convertCentsToBase(t.amount, t.currency, baseCurrency, exchangeRates)
    return acc + Math.abs(base)
  }, 0)

  const totalOutflowCents = expenseTransactions.reduce((acc, t) => {
    const base =
      t.amountInBase !== undefined && t.amountInBase !== ""
        ? Number(t.amountInBase)
        : convertCentsToBase(t.amount, t.currency, baseCurrency, exchangeRates)
    return acc + Math.abs(base)
  }, 0)

  const txCount = transactions.length
  const expenseCount = expenseTransactions.length
  const avgSpentCents =
    expenseCount > 0 ? Math.round(totalOutflowCents / expenseCount) : 0
  const pendingCount = pendingData?.inboxItems.length || 0

  const hasTypeFilter = Boolean(
    urlState.type && urlState.type !== "TYPE_UNSPECIFIED"
  )
  const hasAccountFilter = Boolean(
    urlState.accountId && urlState.accountId !== "_all"
  )
  const hasBudgetFilter = Boolean(
    urlState.budgetId && urlState.budgetId !== "_all"
  )
  const hasTransferFilter = Boolean(urlState.transferId)
  const hasScheduledFilter = Boolean(urlState.scheduledTransactionId)
  const hasBorrowingFilter = Boolean(urlState.borrowingId)

  const activeAttributeFilterCount = [
    hasTypeFilter,
    hasAccountFilter,
    hasBudgetFilter,
    hasTransferFilter,
    hasScheduledFilter,
    hasBorrowingFilter,
  ].filter(Boolean).length

  const hasActiveFilters = Boolean(
    urlState.q ||
    activeAttributeFilterCount > 0 ||
    periodBounds.period !== "this_month" ||
    (urlState.sort && urlState.sort !== "_default")
  )

  const handleResetFilters = () => {
    setSearchQuery("")
    setUrlState({
      q: "",
      type: "TYPE_UNSPECIFIED",
      budgetId: "_all",
      accountId: "_all",
      transferId: "",
      scheduledTransactionId: "",
      borrowingId: "",
      period: "this_month",
      month: "",
      dateFrom: "",
      dateTo: "",
      sort: "_default",
    })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row lg:items-start">
      <div className="@container min-w-0 flex-1">
        <FinancePageLayout
          title={t("finance.transactions.title")}
          description={t("finance.transactions.description")}
          icon={Receipt}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {pendingCount > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    navigate(resolveSpacePath("/finance/inbox", spaceId, true))
                  }
                  className="h-10 cursor-pointer gap-2 rounded-lg"
                >
                  <Inbox className="size-4 text-primary" />
                  <span>
                    {t("finance.transactions.stagedForReview", {
                      count: pendingCount,
                    })}
                  </span>
                </Button>
              )}
              {isWritable && (
                <Button
                  onClick={handleCreateTrigger}
                  className="flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-lg px-4 font-medium sm:w-auto"
                >
                  <Plus className="h-4 w-4" />
                  {t("finance.transactions.recordTransaction")}
                </Button>
              )}
            </div>
          }
        >
          <div className="space-y-6">
            {/* Top Summary Stat Strip */}
            <div className="grid grid-cols-2 gap-4 @3xl:grid-cols-4">
              <div className="flex items-center gap-3.5 rounded-xl border border-border bg-card p-4 shadow-2xs">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-success/10 text-success">
                  <ArrowUpRight className="size-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">
                    {t("finance.transactions.totalInflow")}
                  </p>
                  <MoneyAmount
                    cents={totalInflowCents}
                    currency={baseCurrency}
                    size="lg"
                    className="mt-0.5 block truncate text-foreground"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3.5 rounded-xl border border-border bg-card p-4 shadow-2xs">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                  <ArrowDownLeft className="size-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">
                    {t("finance.transactions.totalOutflow")}
                  </p>
                  <MoneyAmount
                    cents={totalOutflowCents}
                    currency={baseCurrency}
                    size="lg"
                    className="mt-0.5 block truncate text-foreground"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3.5 rounded-xl border border-border bg-card p-4 shadow-2xs">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Calculator className="size-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">
                    {t("finance.transactions.avgPerExpense")}
                  </p>
                  <MoneyAmount
                    cents={avgSpentCents}
                    currency={baseCurrency}
                    size="lg"
                    className="mt-0.5 block truncate text-foreground"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3.5 rounded-xl border border-border bg-card p-4 shadow-2xs">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Hash className="size-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">
                    {t("finance.transactions.transactions")}
                  </p>
                  <span className="mt-0.5 block font-mono text-lg font-semibold text-foreground tabular-nums">
                    {txCount}
                  </span>
                </div>
              </div>
            </div>

            <TransactionFilterToolbar
              filters={urlState}
              onChange={setUrlState}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              onClearSearch={() => setUrlState({ q: "" })}
              accounts={accounts}
              budgets={budgets}
            >
              <FinancePeriodPicker
                value={{
                  period: urlState.period,
                  month: urlState.month,
                  dateFrom: urlState.dateFrom,
                  dateTo: urlState.dateTo,
                }}
                onChange={(next) => {
                  setInspectorOpen(false)
                  setUrlState(next)
                }}
              />

              <Select
                value={urlState.sort}
                onValueChange={(val) =>
                  setUrlState({ sort: val || "_default" })
                }
              >
                <SelectTrigger
                  aria-label={t("finance.transactions.sortAria")}
                  className="h-9 w-auto min-w-[116px] gap-1.5 rounded-lg border-border bg-control px-3 text-xs font-medium shadow-2xs"
                >
                  <ArrowUpDown className="size-3.5 shrink-0 text-muted-foreground" />
                  <SelectValue
                    placeholder={t("finance.transactions.sort.newest")}
                  >
                    {getSortLabel(urlState.sort)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="rounded-xl border border-border bg-popover p-1 shadow-xl">
                  <SelectItem value="_default">
                    {t("finance.transactions.sort.newest")}
                  </SelectItem>
                  <SelectItem value="transaction_date:asc">
                    {t("finance.transactions.sort.oldest")}
                  </SelectItem>
                  <SelectItem value="amount:desc">
                    {t("finance.transactions.sort.highest")}
                  </SelectItem>
                  <SelectItem value="amount:asc">
                    {t("finance.transactions.sort.lowest")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </TransactionFilterToolbar>

            {/* Full-Width Date-Grouped Ledger */}
            {txnLoading ? (
              <div className="flex items-center justify-center rounded-xl border border-border bg-card py-20">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : transactions.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card py-20 text-center">
                <div className="mb-3 flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                  <Receipt className="size-6" />
                </div>
                <h4 className="text-sm font-semibold text-foreground">
                  {hasActiveFilters
                    ? t("finance.transactions.noMatchingTitle")
                    : t("empty.transactionsTitle")}
                </h4>
                <p className="mt-1 max-w-xs px-4 text-xs leading-relaxed text-muted-foreground">
                  {hasActiveFilters
                    ? t("finance.transactions.noMatchingDescription")
                    : t("empty.transactionsDescription")}
                </p>
                {hasActiveFilters && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleResetFilters}
                    className="mt-4 cursor-pointer"
                  >
                    {t("finance.transactions.resetFilters")}
                  </Button>
                )}
              </div>
            ) : (
              <TransactionLedgerList
                transactions={transactions}
                accounts={accounts}
                budgets={budgets}
                exchangeRates={exchangeRates}
                baseCurrency={baseCurrency}
                selectedId={inspectorOpen ? selectedTransaction?.id : undefined}
                onInspect={handleInspectTransaction}
                renderRowActions={(txn) => (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t("finance.transactions.actionsAria")}
                          className="cursor-pointer text-muted-foreground hover:text-foreground"
                        >
                          <MoreVertical className="size-4" />
                        </Button>
                      }
                    />
                    <DropdownMenuContent
                      align="end"
                      className="w-40 rounded-xl border border-border bg-popover p-1 shadow-xl"
                    >
                      <DropdownMenuItem
                        onClick={() => handleInspectTransaction(txn)}
                        className="flex cursor-pointer items-center gap-2"
                      >
                        <History className="size-4" />
                        <span>{t("finance.transactions.viewHistory")}</span>
                      </DropdownMenuItem>
                      {isWritable &&
                        txn.type !== "BALANCE_ADJUSTMENT" &&
                        txn.type !== "TYPE_UNSPECIFIED" &&
                        (txn.metadata?.source_type ??
                          txn.metadata?.sourceType) !==
                          "SYSTEM_BALANCE_ADJUSTMENT" && (
                          <DropdownMenuItem
                            onClick={() => handleEditTrigger(txn)}
                            className="flex cursor-pointer items-center gap-2"
                          >
                            <Edit2 className="size-4" />
                            <span>{t("common.edit")}</span>
                          </DropdownMenuItem>
                        )}
                      {isWritable && (
                        <DropdownMenuItem
                          onClick={() => handleDelete(txn.id || "")}
                          disabled={deleteMutation.isPending}
                          className="flex cursor-pointer items-center gap-2 text-destructive focus:bg-destructive/10 focus:text-destructive"
                        >
                          <Trash2 className="size-4" />
                          <span>{t("common.delete")}</span>
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              />
            )}

            <CreateTransactionSheet
              open={createOpen}
              onOpenChange={setCreateOpen}
              spaceId={spaceId}
              baseCurrency={baseCurrency}
              budgets={budgets}
              accounts={accounts}
              editTransaction={editTransaction}
              refetchTransactions={refetchTransactions}
              refetchBudgets={refetchBudgets}
            />

            <AlertDialog
              open={!!deleteTargetId}
              onOpenChange={(open) => !open && setDeleteTargetId(null)}
            >
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {t("finance.transactions.deleteTitle")}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("finance.transactions.deleteDescription")}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={deleteMutation.isPending}>
                    {t("common.cancel")}
                  </AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    disabled={deleteMutation.isPending}
                    onClick={handleConfirmDelete}
                  >
                    {deleteMutation.isPending
                      ? t("finance.transactions.deleting")
                      : t("finance.transactions.deleteConfirm")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </FinancePageLayout>
      </div>

      <TransactionEventsSheet
        open={inspectorOpen}
        onOpenChange={setInspectorOpen}
        transaction={selectedTransaction}
        accounts={accounts}
        budgets={budgets}
        baseCurrency={baseCurrency}
        isWritable={isWritable}
        onEdit={handleEditTrigger}
        onDelete={handleDelete}
      />
    </div>
  )
}
