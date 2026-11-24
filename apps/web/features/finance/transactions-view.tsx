import { useState, useEffect, useMemo, createElement } from "react"
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
import { getLocalizedEnumLabel } from "@saturn/i18n"
import {
  buildCopilotEntityKey,
  convertCentsToBase,
  getTimezoneParts,
} from "@saturn/core"
import { CopilotAttachButton } from "@/features/ai/components/copilot-attach-button"
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
  ArrowLeft,
  ArrowUpDown,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowRightLeft,
  ChevronRight,
  Coins,
  Trash2,
  Receipt,
  Plus,
  Loader2,
  Edit2,
  Repeat,
  MoreVertical,
  History,
  Calculator,
  Hash,
  Inbox,
  ListFilter,
  Search,
  Tag,
  Wallet,
  PiggyBank,
  X,
} from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { MoneyAmount } from "@/components/ui/money-amount"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
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
import { cn } from "@/lib/utils"
import { FinancePageLayout } from "./components/finance-page-layout"
import { FinancePeriodPicker } from "./components/finance-period-picker"
import { resolveFinancePeriodBounds } from "./period-bounds"
import { getBudgetColors, getBudgetIcon } from "./utils"
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

type FacetDimension = "type" | "account" | "budget"

function toYmdInTimezone(
  date: Date | string | number | null | undefined,
  timeZone: string
): string {
  const parts = getTimezoneParts(date, timeZone)
  if (!parts) return ""
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`
}

function FacetValueCommand({
  dimension,
  selectedType,
  selectedAccountId,
  selectedBudgetId,
  accounts,
  budgets,
  onSelectType,
  onSelectAccount,
  onSelectBudget,
}: {
  dimension: FacetDimension
  selectedType: string
  selectedAccountId: string
  selectedBudgetId: string
  accounts: { id?: string; name?: string; currency?: string }[]
  budgets: { id?: string; name?: string }[]
  onSelectType: (value: string) => void
  onSelectAccount: (value: string) => void
  onSelectBudget: (value: string) => void
}) {
  const { t, language } = useI18n()
  const placeholder =
    dimension === "type"
      ? t("finance.transactions.searchType")
      : dimension === "account"
        ? t("finance.transactions.searchAccount")
        : t("finance.transactions.searchBudget")

  const typeOptions: { value: Transaction_Type; label: string }[] = (
    [
      "EXPENSE",
      "INCOME",
      "TRANSFER_OUT",
      "TRANSFER_IN",
      "BALANCE_ADJUSTMENT",
    ] as Transaction_Type[]
  ).map((value) => ({
    value,
    label: getLocalizedEnumLabel("finance", "transactionType", value, language),
  }))

  return (
    <Command>
      <CommandInput placeholder={placeholder} />
      <CommandList>
        <CommandEmpty>{t("finance.transactions.noMatches")}</CommandEmpty>
        <CommandGroup>
          {dimension === "type" &&
            typeOptions.map((opt) => {
              const checked = selectedType === opt.value
              return (
                <CommandItem
                  key={opt.value}
                  value={opt.label}
                  data-checked={checked}
                  onSelect={() =>
                    onSelectType(checked ? "TYPE_UNSPECIFIED" : opt.value)
                  }
                >
                  <span>{opt.label}</span>
                </CommandItem>
              )
            })}

          {dimension === "account" &&
            accounts.map((acc) => {
              const id = acc.id || ""
              const checked = selectedAccountId === id
              return (
                <CommandItem
                  key={id}
                  value={`${acc.name || ""} ${acc.currency || ""}`}
                  data-checked={checked}
                  onSelect={() => onSelectAccount(checked ? "_all" : id)}
                >
                  <span className="truncate">{acc.name}</span>
                  {acc.currency && (
                    <span className="ml-1 font-mono text-[11px] text-muted-foreground">
                      {acc.currency}
                    </span>
                  )}
                </CommandItem>
              )
            })}

          {dimension === "budget" &&
            budgets.map((b) => {
              const id = b.id || ""
              const checked = selectedBudgetId === id
              return (
                <CommandItem
                  key={id}
                  value={b.name || ""}
                  data-checked={checked}
                  onSelect={() => onSelectBudget(checked ? "_all" : id)}
                >
                  <span className="truncate">{b.name}</span>
                </CommandItem>
              )
            })}
        </CommandGroup>
      </CommandList>
    </Command>
  )
}

export function TransactionsView() {
  const queryClient = useQueryClient()
  const { spaceId, isWritable } = useSpacePermissions()
  const tz = useTimezone()
  const { t, language } = useI18n()
  const navigate = useNavigate()

  const getTypeLabel = (type: string): string => {
    if (type === "TYPE_UNSPECIFIED") {
      return t("finance.transactions.type.allTypes")
    }
    return getLocalizedEnumLabel("finance", "transactionType", type, language)
  }

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

  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false)
  const [filterStep, setFilterStep] = useState<FacetDimension | null>(null)
  const [editingChip, setEditingChip] = useState<FacetDimension | null>(null)

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

  const getBudgetDetails = (id: string) => {
    const b = budgets.find((x) => x.id === id)
    return b
      ? {
          name: b.name,
          icon: b.icon || "piggy-bank",
          color: b.color || "indigo",
        }
      : {
          name: t("finance.transactions.general"),
          icon: "coins",
          color: "indigo",
        }
  }

  const transactions = useMemo(
    () => txnData?.transactions || [],
    [txnData?.transactions]
  )

  // Group visible transactions by calendar day in tz.timezone
  const dateGroups = useMemo(() => {
    const groups: {
      key: string
      title: string
      items: Transaction[]
      dailyNetBaseCents: number
    }[] = []
    const groupMap = new Map<string, (typeof groups)[number]>()

    for (const txn of transactions) {
      const rawDate = txn.transactionDate || txn.effectiveDate
      const ymd = rawDate ? toYmdInTimezone(rawDate, tz.timezone) : "unknown"
      const key = ymd || "unknown"

      let group = groupMap.get(key)
      if (!group) {
        let title = t("finance.transactions.undated")
        if (rawDate && key !== "unknown") {
          if (tz.isToday(rawDate)) {
            title = t("common.today")
          } else if (tz.isYesterday(rawDate)) {
            title = t("common.yesterday")
          } else {
            title = tz.format(rawDate, {
              weekday: "short",
              month: "short",
              day: "numeric",
              year: "numeric",
            })
          }
        }
        group = { key, title, items: [], dailyNetBaseCents: 0 }
        groupMap.set(key, group)
        groups.push(group)
      }

      group.items.push(txn)

      const baseCents =
        txn.amountInBase !== undefined && txn.amountInBase !== ""
          ? Number(txn.amountInBase)
          : convertCentsToBase(
              txn.amount,
              txn.currency,
              baseCurrency,
              exchangeRates
            )

      if (txn.type === "INCOME" || txn.type === "TRANSFER_IN") {
        group.dailyNetBaseCents += Math.abs(baseCents)
      } else if (txn.type === "EXPENSE" || txn.type === "TRANSFER_OUT") {
        group.dailyNetBaseCents -= Math.abs(baseCents)
      } else {
        group.dailyNetBaseCents += baseCents
      }
    }

    return groups
  }, [transactions, tz, baseCurrency, exchangeRates, t])

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

  const handleClearAttributeFilters = () => {
    setUrlState({
      type: "TYPE_UNSPECIFIED",
      budgetId: "_all",
      accountId: "_all",
      transferId: "",
      scheduledTransactionId: "",
      borrowingId: "",
    })
  }

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

            {/* Slim 1-Row Faceted Toolbar */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                {/* Left: Search + Faceted Filter */}
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <div className="relative w-full sm:w-64 md:w-72">
                    <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="text"
                      aria-label={t("finance.transactions.searchAria")}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={t("finance.transactions.searchPlaceholder")}
                      className="h-9 rounded-lg border-border bg-control pr-8 pl-8.5 text-xs shadow-2xs"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        aria-label={t("finance.transactions.clearSearchAria")}
                        onClick={() => {
                          setSearchQuery("")
                          setUrlState({ q: "" })
                        }}
                        className="absolute top-1/2 right-2 flex size-5 -translate-y-1/2 cursor-pointer items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <X className="size-3.5" />
                      </button>
                    )}
                  </div>

                  {/* + Filter Faceted Popover */}
                  <Popover
                    open={filterPopoverOpen}
                    onOpenChange={(nextOpen) => {
                      if (nextOpen) {
                        setFilterStep(null)
                      }
                      setFilterPopoverOpen(nextOpen)
                    }}
                  >
                    <PopoverTrigger
                      type="button"
                      aria-label={t("finance.transactions.filterAria")}
                      className={cn(
                        buttonVariants({ variant: "outline", size: "sm" }),
                        "h-9 cursor-pointer gap-1.5 rounded-lg border-border bg-control px-3 text-xs font-medium shadow-2xs"
                      )}
                    >
                      <ListFilter className="size-3.5" />
                      <span>{t("finance.transactions.filter")}</span>
                      {activeAttributeFilterCount > 0 && (
                        <span className="ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary/15 px-1 font-mono text-[10px] font-semibold text-primary tabular-nums">
                          {activeAttributeFilterCount}
                        </span>
                      )}
                    </PopoverTrigger>
                    <PopoverContent
                      align="start"
                      className="w-64 rounded-xl border border-border bg-popover p-0 shadow-xl"
                    >
                      {filterStep === null ? (
                        <Command>
                          <CommandList>
                            <CommandGroup>
                              <CommandItem
                                onSelect={() => setFilterStep("type")}
                              >
                                <Tag className="size-3.5 text-muted-foreground" />
                                <span>
                                  {t("finance.transactions.facetType")}
                                </span>
                                {hasTypeFilter && (
                                  <span className="ml-auto truncate text-xs text-muted-foreground">
                                    {getTypeLabel(urlState.type)}
                                  </span>
                                )}
                                <ChevronRight className="ml-1 size-3.5 text-muted-foreground" />
                              </CommandItem>
                              <CommandItem
                                onSelect={() => setFilterStep("account")}
                              >
                                <Wallet className="size-3.5 text-muted-foreground" />
                                <span>
                                  {t("finance.transactions.facetAccount")}
                                </span>
                                {hasAccountFilter && (
                                  <span className="ml-auto max-w-[90px] truncate text-xs text-muted-foreground">
                                    {accounts.find(
                                      (a) => a.id === urlState.accountId
                                    )?.name || urlState.accountId}
                                  </span>
                                )}
                                <ChevronRight className="ml-1 size-3.5 text-muted-foreground" />
                              </CommandItem>
                              <CommandItem
                                onSelect={() => setFilterStep("budget")}
                              >
                                <PiggyBank className="size-3.5 text-muted-foreground" />
                                <span>
                                  {t("finance.transactions.facetBudget")}
                                </span>
                                {hasBudgetFilter && (
                                  <span className="ml-auto max-w-[90px] truncate text-xs text-muted-foreground">
                                    {budgets.find(
                                      (b) => b.id === urlState.budgetId
                                    )?.name || urlState.budgetId}
                                  </span>
                                )}
                                <ChevronRight className="ml-1 size-3.5 text-muted-foreground" />
                              </CommandItem>
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      ) : (
                        <div>
                          <div className="flex items-center gap-1.5 border-b border-border/60 px-2.5 py-2">
                            <button
                              type="button"
                              aria-label={t(
                                "finance.transactions.backToDimensions"
                              )}
                              onClick={() => setFilterStep(null)}
                              className="flex size-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                            >
                              <ArrowLeft className="size-3.5" />
                            </button>
                            <span className="text-xs font-semibold text-foreground capitalize">
                              {filterStep === "type"
                                ? t("finance.transactions.facetType")
                                : filterStep === "account"
                                  ? t("finance.transactions.facetAccount")
                                  : t("finance.transactions.facetBudget")}
                            </span>
                          </div>
                          <FacetValueCommand
                            dimension={filterStep}
                            selectedType={urlState.type}
                            selectedAccountId={urlState.accountId}
                            selectedBudgetId={urlState.budgetId}
                            accounts={accounts}
                            budgets={budgets}
                            onSelectType={(val) => {
                              setUrlState({ type: val })
                              setFilterPopoverOpen(false)
                            }}
                            onSelectAccount={(val) => {
                              setUrlState({ accountId: val })
                              setFilterPopoverOpen(false)
                            }}
                            onSelectBudget={(val) => {
                              setUrlState({ budgetId: val })
                              setFilterPopoverOpen(false)
                            }}
                          />
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Right: Period Stepper + Compact Sort */}
                <div className="flex flex-wrap items-center gap-2">
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
                </div>
              </div>

              {/* Row 2: Contextual Active Attribute Filter Chips */}
              {activeAttributeFilterCount > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {hasTypeFilter && (
                    <div className="inline-flex h-7 items-center overflow-hidden rounded-md border border-border bg-card text-xs">
                      <Popover
                        open={editingChip === "type"}
                        onOpenChange={(o) => setEditingChip(o ? "type" : null)}
                      >
                        <PopoverTrigger
                          type="button"
                          className="flex h-full cursor-pointer items-center gap-1 px-2 text-foreground transition-colors hover:bg-muted/50"
                        >
                          <span className="text-muted-foreground">
                            {t("finance.transactions.typeLabel")}
                          </span>
                          <span className="font-medium">
                            {getTypeLabel(urlState.type)}
                          </span>
                        </PopoverTrigger>
                        <PopoverContent
                          align="start"
                          className="w-56 rounded-xl border border-border bg-popover p-0 shadow-xl"
                        >
                          <FacetValueCommand
                            dimension="type"
                            selectedType={urlState.type}
                            selectedAccountId={urlState.accountId}
                            selectedBudgetId={urlState.budgetId}
                            accounts={accounts}
                            budgets={budgets}
                            onSelectType={(val) => {
                              setUrlState({ type: val })
                              setEditingChip(null)
                            }}
                            onSelectAccount={() => {}}
                            onSelectBudget={() => {}}
                          />
                        </PopoverContent>
                      </Popover>
                      <button
                        type="button"
                        aria-label={t("finance.transactions.removeTypeFilter")}
                        onClick={() =>
                          setUrlState({ type: "TYPE_UNSPECIFIED" })
                        }
                        className="flex h-full cursor-pointer items-center border-l border-border px-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  )}

                  {hasAccountFilter && (
                    <div className="inline-flex h-7 items-center overflow-hidden rounded-md border border-border bg-card text-xs">
                      <Popover
                        open={editingChip === "account"}
                        onOpenChange={(o) =>
                          setEditingChip(o ? "account" : null)
                        }
                      >
                        <PopoverTrigger
                          type="button"
                          className="flex h-full cursor-pointer items-center gap-1 px-2 text-foreground transition-colors hover:bg-muted/50"
                        >
                          <span className="text-muted-foreground">
                            {t("finance.transactions.accountLabel")}
                          </span>
                          <span className="font-medium">
                            {accounts.find((a) => a.id === urlState.accountId)
                              ?.name || urlState.accountId}
                          </span>
                        </PopoverTrigger>
                        <PopoverContent
                          align="start"
                          className="w-60 rounded-xl border border-border bg-popover p-0 shadow-xl"
                        >
                          <FacetValueCommand
                            dimension="account"
                            selectedType={urlState.type}
                            selectedAccountId={urlState.accountId}
                            selectedBudgetId={urlState.budgetId}
                            accounts={accounts}
                            budgets={budgets}
                            onSelectType={() => {}}
                            onSelectAccount={(val) => {
                              setUrlState({ accountId: val })
                              setEditingChip(null)
                            }}
                            onSelectBudget={() => {}}
                          />
                        </PopoverContent>
                      </Popover>
                      <button
                        type="button"
                        aria-label={t(
                          "finance.transactions.removeAccountFilter"
                        )}
                        onClick={() => setUrlState({ accountId: "_all" })}
                        className="flex h-full cursor-pointer items-center border-l border-border px-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  )}

                  {hasBudgetFilter && (
                    <div className="inline-flex h-7 items-center overflow-hidden rounded-md border border-border bg-card text-xs">
                      <Popover
                        open={editingChip === "budget"}
                        onOpenChange={(o) =>
                          setEditingChip(o ? "budget" : null)
                        }
                      >
                        <PopoverTrigger
                          type="button"
                          className="flex h-full cursor-pointer items-center gap-1 px-2 text-foreground transition-colors hover:bg-muted/50"
                        >
                          <span className="text-muted-foreground">
                            {t("finance.transactions.budgetLabel")}
                          </span>
                          <span className="font-medium">
                            {budgets.find((b) => b.id === urlState.budgetId)
                              ?.name || urlState.budgetId}
                          </span>
                        </PopoverTrigger>
                        <PopoverContent
                          align="start"
                          className="w-60 rounded-xl border border-border bg-popover p-0 shadow-xl"
                        >
                          <FacetValueCommand
                            dimension="budget"
                            selectedType={urlState.type}
                            selectedAccountId={urlState.accountId}
                            selectedBudgetId={urlState.budgetId}
                            accounts={accounts}
                            budgets={budgets}
                            onSelectType={() => {}}
                            onSelectAccount={() => {}}
                            onSelectBudget={(val) => {
                              setUrlState({ budgetId: val })
                              setEditingChip(null)
                            }}
                          />
                        </PopoverContent>
                      </Popover>
                      <button
                        type="button"
                        aria-label={t(
                          "finance.transactions.removeBudgetFilter"
                        )}
                        onClick={() => setUrlState({ budgetId: "_all" })}
                        className="flex h-full cursor-pointer items-center border-l border-border px-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  )}

                  {hasTransferFilter && (
                    <div className="inline-flex h-7 items-center overflow-hidden rounded-md border border-border bg-card text-xs">
                      <span className="flex h-full items-center gap-1 px-2 text-foreground">
                        <span className="text-muted-foreground">
                          {t("finance.transactions.transferLabel")}
                        </span>
                        <span className="font-mono font-medium">
                          {urlState.transferId}
                        </span>
                      </span>
                      <button
                        type="button"
                        aria-label={t(
                          "finance.transactions.removeTransferFilter"
                        )}
                        onClick={() => setUrlState({ transferId: "" })}
                        className="flex h-full cursor-pointer items-center border-l border-border px-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  )}

                  {hasScheduledFilter && (
                    <div className="inline-flex h-7 items-center overflow-hidden rounded-md border border-border bg-card text-xs">
                      <span className="flex h-full items-center gap-1 px-2 text-foreground">
                        <span className="text-muted-foreground">
                          {t("finance.transactions.scheduledLabel")}
                        </span>
                        <span className="font-mono font-medium">
                          {urlState.scheduledTransactionId}
                        </span>
                      </span>
                      <button
                        type="button"
                        aria-label={t(
                          "finance.transactions.removeScheduledFilter"
                        )}
                        onClick={() =>
                          setUrlState({ scheduledTransactionId: "" })
                        }
                        className="flex h-full cursor-pointer items-center border-l border-border px-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  )}

                  {hasBorrowingFilter && (
                    <div className="inline-flex h-7 items-center overflow-hidden rounded-md border border-border bg-card text-xs">
                      <span className="flex h-full items-center gap-1 px-2 text-foreground">
                        <span className="text-muted-foreground">
                          {t("finance.transactions.borrowingLabel")}
                        </span>
                        <span className="font-mono font-medium">
                          {urlState.borrowingId}
                        </span>
                      </span>
                      <button
                        type="button"
                        aria-label={t(
                          "finance.transactions.removeBorrowingFilter"
                        )}
                        onClick={() => setUrlState({ borrowingId: "" })}
                        className="flex h-full cursor-pointer items-center border-l border-border px-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  )}

                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={handleClearAttributeFilters}
                    className="h-7 cursor-pointer px-2 text-xs text-muted-foreground hover:text-foreground"
                  >
                    {t("finance.transactions.reset")}
                  </Button>
                </div>
              )}
            </div>

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
              <div className="space-y-5">
                {dateGroups.map((group) => (
                  <section
                    key={group.key}
                    aria-label={group.title}
                    className="space-y-2"
                  >
                    {/* Crisp Date Section Header */}
                    <div className="sticky top-0 z-10 flex items-center justify-between gap-4 bg-background/95 px-1 py-1.5 backdrop-blur-xs">
                      <div className="flex items-center gap-2">
                        <h3 className="text-xs font-semibold text-foreground">
                          {group.title}
                        </h3>
                        <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] font-medium text-muted-foreground tabular-nums">
                          {group.items.length}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span>{t("finance.transactions.net")}</span>
                        <MoneyAmount
                          cents={group.dailyNetBaseCents}
                          currency={baseCurrency}
                          showSign
                          colored
                          size="sm"
                        />
                      </div>
                    </div>

                    {/* Grouped Ledger Rows */}
                    <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-card shadow-2xs">
                      {group.items.map((txn) => {
                        const amtLocalCents = Number(txn.amount || 0)
                        const amtBaseCents =
                          txn.amountInBase !== undefined &&
                          txn.amountInBase !== ""
                            ? Number(txn.amountInBase)
                            : convertCentsToBase(
                                txn.amount,
                                txn.currency,
                                baseCurrency,
                                exchangeRates
                              )
                        const signedLocalCents =
                          txn.type === "EXPENSE" || txn.type === "TRANSFER_OUT"
                            ? -Math.abs(amtLocalCents)
                            : txn.type === "INCOME" ||
                                txn.type === "TRANSFER_IN"
                              ? Math.abs(amtLocalCents)
                              : amtLocalCents
                        const signedBaseCents =
                          txn.type === "EXPENSE" || txn.type === "TRANSFER_OUT"
                            ? -Math.abs(amtBaseCents)
                            : txn.type === "INCOME" ||
                                txn.type === "TRANSFER_IN"
                              ? Math.abs(amtBaseCents)
                              : amtBaseCents

                        const isCrossCurrency = txn.currency !== baseCurrency
                        const details = getBudgetDetails(txn.budgetId)
                        const colors = getBudgetColors(details.color)
                        const iconComp = getBudgetIcon(details.icon)
                        const acc = accounts.find((a) => a.id === txn.accountId)
                        const isSelected =
                          inspectorOpen && selectedTransaction?.id === txn.id

                        return (
                          <div
                            key={txn.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => handleInspectTransaction(txn)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault()
                                handleInspectTransaction(txn)
                              }
                            }}
                            className={cn(
                              "group flex cursor-pointer items-center justify-between gap-4 px-4 py-3 text-left transition-colors outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset",
                              isSelected &&
                                "bg-primary/5 ring-1 ring-primary/30 ring-inset"
                            )}
                          >
                            {/* Left: Icon, description & pills */}
                            <div className="flex min-w-0 flex-1 items-center gap-3">
                              <div
                                className={cn(
                                  "flex size-9 shrink-0 items-center justify-center rounded-lg border",
                                  txn.type === "INCOME"
                                    ? "border-success/20 bg-success/10 text-success"
                                    : txn.type === "TRANSFER_IN" ||
                                        txn.type === "TRANSFER_OUT"
                                      ? "border-info/20 bg-info/10 text-info"
                                      : `${colors.bg} ${colors.text} ${colors.border}`
                                )}
                              >
                                {txn.type === "INCOME" ? (
                                  <ArrowUpRight className="size-4" />
                                ) : txn.type === "TRANSFER_IN" ||
                                  txn.type === "TRANSFER_OUT" ? (
                                  <ArrowRightLeft className="size-4" />
                                ) : (
                                  createElement(iconComp, {
                                    className: "size-4",
                                  })
                                )}
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="truncate text-sm font-medium text-foreground">
                                    {txn.description || (
                                      <span className="text-muted-foreground italic">
                                        {t(
                                          "finance.transactions.noDescription"
                                        )}
                                      </span>
                                    )}
                                  </span>

                                  {Boolean(
                                    txn.metadata?.recurring_transaction_id
                                  ) && (
                                    <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/50 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                                      <Repeat className="size-3 text-primary" />
                                      {t("finance.transactions.recurring")}
                                    </span>
                                  )}

                                  {Boolean(txn.metadata?.transfer_id) && (
                                    <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/50 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                                      <ArrowRightLeft className="size-3 text-info" />
                                      {t("finance.transactions.transfer")}
                                    </span>
                                  )}

                                  {Boolean(txn.metadata?.borrowing_id) && (
                                    <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/50 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                                      <Coins className="size-3 text-warning" />
                                      {txn.metadata?.borrowing_role ===
                                      "REPAYMENT"
                                        ? t("finance.transactions.repayment")
                                        : txn.type === "EXPENSE"
                                          ? t("finance.transactions.lend")
                                          : t("finance.transactions.borrow")}
                                    </span>
                                  )}
                                </div>

                                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                                  {acc && (
                                    <span className="inline-flex items-center rounded-md border border-border/70 bg-muted/40 px-1.5 py-0.5 text-[11px] font-medium text-foreground/80">
                                      {acc.name}
                                    </span>
                                  )}
                                  {txn.budgetId && (
                                    <span
                                      className={cn(
                                        "inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium",
                                        colors.bg,
                                        colors.text
                                      )}
                                    >
                                      {details.name}
                                    </span>
                                  )}
                                  <span className="text-[11px] text-muted-foreground">
                                    {getTypeLabel(txn.type)}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Right: Hover Copilot attach, amount, menu */}
                            <div
                              className="flex shrink-0 items-center gap-2"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {txn.id && (
                                <div className="opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                                  <CopilotAttachButton
                                    item={{
                                      key: buildCopilotEntityKey(
                                        "transaction",
                                        txn.id
                                      ),
                                      kind: "transaction",
                                      id: txn.id,
                                      label:
                                        txn.description ||
                                        t("finance.transactions.transaction"),
                                      summary: {
                                        amount: Number(txn.amount || 0),
                                        currency: txn.currency,
                                        type: txn.type,
                                        transactionDate: txn.transactionDate,
                                      },
                                    }}
                                  />
                                </div>
                              )}

                              <div className="min-w-0 text-right">
                                <MoneyAmount
                                  cents={signedLocalCents}
                                  currency={txn.currency}
                                  showSign
                                  colored={txn.type === "INCOME"}
                                  size="md"
                                  className="block font-medium"
                                />
                                {isCrossCurrency && (
                                  <MoneyAmount
                                    cents={signedBaseCents}
                                    currency={baseCurrency}
                                    showSign
                                    size="sm"
                                    className="block text-[11px] text-muted-foreground"
                                  />
                                )}
                              </div>

                              <DropdownMenu>
                                <DropdownMenuTrigger
                                  render={
                                    <Button
                                      variant="ghost"
                                      size="icon-sm"
                                      aria-label={t(
                                        "finance.transactions.actionsAria"
                                      )}
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
                                    onClick={() =>
                                      handleInspectTransaction(txn)
                                    }
                                    className="flex cursor-pointer items-center gap-2"
                                  >
                                    <History className="size-4" />
                                    <span>
                                      {t("finance.transactions.viewHistory")}
                                    </span>
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
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </section>
                ))}
              </div>
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
