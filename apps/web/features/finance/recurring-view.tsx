import { useState } from "react"
import { useSpacePermissions } from "@/features/space/use-space"
import { FinancePageLayout } from "./components/finance-page-layout"
import {
  useListRecurringTransactionsQuery,
  useListScheduledTransactionsQuery,
  useDeleteRecurringTransactionMutation,
  useSkipScheduledTransactionMutation,
  useListTransactionsQuery,
  type RecurringTransaction,
  type ScheduledTransaction,
  type ListScheduledTransactionsRequest,
  useGetFinanceSettingsQuery,
  useListBudgetsQuery,
} from "@/gen/saturn/finance/v1/finance"
import { useCurrencyConversionPreview } from "@/hooks/use-currency-conversion"
import {
  TrendingDownIcon,
  TrendingUpIcon,
  CalendarIcon,
  LayersIcon,
  PlusIcon,
  Loader2,
  Edit2Icon,
  Trash2Icon,
  CheckCircle2Icon,
  AlertCircleIcon,
  History,
  ArrowRight,
  MoreVertical,
  FastForward,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import { CreateRecurringTransactionSheet } from "./components/create-recurring-transaction-sheet"
import { ConfirmTransactionSheet } from "./components/confirm-transaction-sheet"
import { RecurringTransactionHistorySheet } from "./components/recurring-transaction-history-sheet"
import { SkipPaymentDialog } from "./components/skip-payment-dialog"
import {
  formatCents,
  getBudgetColors,
  getBudgetIcon,
  formatInterval,
  formatNextDueDate,
  formatStatus,
  isStatusActive,
} from "./utils"
import { cn } from "@/lib/utils"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"

const WEEKS_IN_YEAR = 52
const MONTHS_IN_YEAR = 12
const FORECAST_DAYS_WINDOW = 7
const DEFAULT_PAGE_SIZE = 100
const HISTORY_PAGE_SIZE = 50

export function RecurringView() {
  const { spaceId, isWritable } = useSpacePermissions()

  const { data: settings } = useGetFinanceSettingsQuery(
    {},
    { enabled: !!spaceId }
  )
  const baseCurrency = settings?.baseCurrency || "USD"

  const { data: budgetsData } = useListBudgetsQuery(
    { pageSize: 100, pageToken: "" },
    { enabled: !!settings }
  )
  const budgets = budgetsData?.budgets || []

  const { getConversionPreview } = useCurrencyConversionPreview({
    spaceId,
    enabled: !!settings,
    baseCurrency,
  })

  // Sheets and Dialogs state
  const [transactionSheetOpen, setTransactionSheetOpen] = useState(false)
  const [editTransaction, setEditTransaction] =
    useState<RecurringTransaction | null>(null)
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)
  const [selectedScheduledTransaction, setSelectedScheduledTransaction] =
    useState<ScheduledTransaction | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyTransaction, setHistoryTransaction] =
    useState<RecurringTransaction | null>(null)
  const [transactionToSkip, setTransactionToSkip] =
    useState<ScheduledTransaction | null>(null)

  // Fetch lists
  const {
    data: recurringData,
    isLoading: recurringLoading,
    refetch: refetchRecurring,
  } = useListRecurringTransactionsQuery({
    pageSize: DEFAULT_PAGE_SIZE,
    pageToken: "",
    status: "STATUS_UNSPECIFIED",
  })

  const {
    data: scheduledData,
    isLoading: scheduledLoading,
    refetch: refetchScheduled,
  } = useListScheduledTransactionsQuery({
    pageSize: DEFAULT_PAGE_SIZE,
    pageToken: "",
    status: "PENDING",
    startDate: "",
    endDate: "",
  } as unknown as ListScheduledTransactionsRequest)

  const deleteMutation = useDeleteRecurringTransactionMutation()
  const skipMutation = useSkipScheduledTransactionMutation()

  const handleConfirmSkipTransaction = async () => {
    if (!transactionToSkip) return
    await skipMutation.mutateAsync({
      id: transactionToSkip.id || "",
      req: { id: transactionToSkip.id || "" },
    })
    refetchScheduled()
    setTransactionToSkip(null)
  }

  const transactions = recurringData?.recurringTransactions || []
  const scheduledTransactions = scheduledData?.scheduledTransactions || []

  // Fetch unified transaction history
  const {
    data: historyData,
    isLoading: historyLoading,
    refetch: refetchHistory,
  } = useListTransactionsQuery(
    {
      budgetId: "",
      type: "TYPE_UNSPECIFIED",
      pageSize: HISTORY_PAGE_SIZE,
      pageToken: "",
    },
    { enabled: !!spaceId }
  )

  const historyTransactions = (historyData?.transactions || []).filter((t) =>
    Boolean(t.metadata?.recurring_transaction_id)
  )

  const handleDeleteTransaction = async (re: RecurringTransaction) => {
    if (
      confirm(
        `Are you sure you want to delete this recurring ${re.type === "INCOME" ? "income" : "expense"} template? This will stop future scheduled instances from generating.`
      )
    ) {
      await deleteMutation.mutateAsync({
        id: re.id || "",
        req: {
          id: re.id || "",
          version: re.version,
        },
      })
      refetchRecurring()
    }
  }

  // Convert amount to base currency using exchange rates
  const convertToBase = (amountVal: number, fromCurrency: string) => {
    if (!settings?.baseCurrency || fromCurrency === settings.baseCurrency) {
      return amountVal
    }
    const preview = getConversionPreview(amountVal.toString(), fromCurrency)
    if (preview && "amount" in preview && typeof preview.amount === "number") {
      return preview.amount
    }
    return amountVal // Fallback if rate not configured yet
  }

  // Calculate Normalized Monthly Recurring Expenses in base currency
  const monthlyExpenses = transactions.reduce((acc, exp) => {
    if (!isStatusActive(exp.status) || exp.type !== "EXPENSE") return acc

    const amountVal = formatCents(exp.amount)
    const convertedAmount = convertToBase(amountVal, exp.currency)
    let normalizedAmount = convertedAmount

    const upperInterval = (exp.interval || "").toUpperCase()
    if (upperInterval === "WEEKLY" || upperInterval === "INTERVAL_WEEKLY") {
      normalizedAmount = convertedAmount * (WEEKS_IN_YEAR / MONTHS_IN_YEAR)
    } else if (
      upperInterval === "YEARLY" ||
      upperInterval === "INTERVAL_YEARLY"
    ) {
      normalizedAmount = convertedAmount / MONTHS_IN_YEAR
    }

    return acc + normalizedAmount
  }, 0)

  // Calculate Normalized Monthly Recurring Incomes in base currency
  const monthlyIncomes = transactions.reduce((acc, exp) => {
    if (!isStatusActive(exp.status) || exp.type !== "INCOME") return acc

    const amountVal = formatCents(exp.amount)
    const convertedAmount = convertToBase(amountVal, exp.currency)
    let normalizedAmount = convertedAmount

    const upperInterval = (exp.interval || "").toUpperCase()
    if (upperInterval === "WEEKLY" || upperInterval === "INTERVAL_WEEKLY") {
      normalizedAmount = convertedAmount * (WEEKS_IN_YEAR / MONTHS_IN_YEAR)
    } else if (
      upperInterval === "YEARLY" ||
      upperInterval === "INTERVAL_YEARLY"
    ) {
      normalizedAmount = convertedAmount / MONTHS_IN_YEAR
    }

    return acc + normalizedAmount
  }, 0)

  // Calculate Next 7 Days Outflows in base currency
  const next7Days = new Date()
  next7Days.setDate(next7Days.getDate() + FORECAST_DAYS_WINDOW)

  const upcomingOutflows = scheduledTransactions.reduce((acc, pay) => {
    if (pay.type !== "EXPENSE") return acc
    const dueDate = new Date(pay.dueDate)
    if (dueDate <= next7Days) {
      const amountVal = formatCents(pay.amount)
      const convertedAmount = convertToBase(amountVal, pay.currency)
      return acc + convertedAmount
    }
    return acc
  }, 0)

  const isLoading = recurringLoading || scheduledLoading

  return (
    <FinancePageLayout
      title="Recurring Transactions"
      description="Manage recurring SaaS subscriptions, utility bills, salaries, rent, and scheduled obligations."
      icon={LayersIcon}
      actions={
        <Button
          onClick={() => {
            setEditTransaction(null)
            setTransactionSheetOpen(true)
          }}
          className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-accent pt-0.5 font-semibold text-white shadow-lg shadow-primary/15 transition-all hover:scale-[1.02] hover:opacity-95 sm:w-auto"
        >
          <PlusIcon className="h-4 w-4" />
          Create Template
        </Button>
      }
    >
      <div className="mt-2 animate-in space-y-8 duration-300 fade-in">
        {/* Metrics Grid */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {/* Monthly Incomes Card */}
          <div className="relative flex items-center gap-4 overflow-hidden rounded-3xl border border-border/40 bg-card/30 p-6 shadow-sm backdrop-blur-sm select-none">
            <div className="rounded-2xl bg-emerald-500/10 p-3.5 text-emerald-500">
              <TrendingUpIcon className="h-6 w-6" />
            </div>
            <div>
              <span className="block text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                Recurring Income (Monthly)
              </span>
              <span className="mt-1 block text-2xl font-black tracking-tight text-emerald-500">
                +
                {monthlyIncomes.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                <span className="text-xs font-bold text-muted-foreground uppercase">
                  {baseCurrency}
                </span>
              </span>
            </div>
          </div>

          {/* Monthly Expenses Card */}
          <div className="relative flex items-center gap-4 overflow-hidden rounded-3xl border border-border/40 bg-card/30 p-6 shadow-sm backdrop-blur-sm select-none">
            <div className="rounded-2xl bg-rose-500/10 p-3.5 text-rose-500">
              <TrendingDownIcon className="h-6 w-6" />
            </div>
            <div>
              <span className="block text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                Recurring Overhead (Monthly)
              </span>
              <span className="mt-1 block text-2xl font-black tracking-tight text-rose-500">
                -
                {monthlyExpenses.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                <span className="text-xs font-bold text-muted-foreground uppercase">
                  {baseCurrency}
                </span>
              </span>
            </div>
          </div>

          {/* 7-Day Outflow Card */}
          <div className="relative flex items-center gap-4 overflow-hidden rounded-3xl border border-border/40 bg-card/30 p-6 shadow-sm backdrop-blur-sm select-none">
            <div className="rounded-2xl bg-amber-500/10 p-3.5 text-amber-500">
              <CalendarIcon className="h-6 w-6" />
            </div>
            <div>
              <span className="block text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                Next 7 Days Outflows
              </span>
              <span className="mt-1 block text-2xl font-black tracking-tight text-amber-500">
                {upcomingOutflows.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                <span className="text-xs font-bold text-muted-foreground uppercase">
                  {baseCurrency}
                </span>
              </span>
            </div>
          </div>
        </div>

        {/* Main Content inside Tabs */}
        {isLoading ? (
          <div className="flex h-[350px] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="active" className="w-full space-y-6">
            <div className="flex items-center justify-between">
              <TabsList className="rounded-2xl border border-border/40 bg-card/40 p-1 backdrop-blur-sm">
                <TabsTrigger
                  value="active"
                  className="flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all data-active:bg-primary data-active:text-primary-foreground data-active:shadow-sm"
                >
                  <LayersIcon className="h-3.5 w-3.5" />
                  Templates & Schedule
                </TabsTrigger>
                <TabsTrigger
                  value="history"
                  className="flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all data-active:bg-primary data-active:text-primary-foreground data-active:shadow-sm"
                >
                  <History className="h-3.5 w-3.5" />
                  History
                  {historyTransactions.length > 0 && (
                    <span className="ml-1 rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-black text-primary group-data-active:bg-primary-foreground/20 group-data-active:text-primary-foreground">
                      {historyTransactions.length}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Tab 1: Active Templates & Pending Obligations */}
            <TabsContent value="active" className="mt-0 space-y-8">
              <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
                {/* 1. Recurring Templates List (7 cols) */}
                <div className="flex flex-col overflow-hidden rounded-3xl border border-border/40 bg-card/30 shadow-sm backdrop-blur-sm lg:col-span-7">
                  <div className="flex items-center justify-between border-b border-border/20 bg-card/10 px-6 py-4">
                    <h2 className="flex items-center gap-2 text-xs font-black tracking-wider text-muted-foreground uppercase">
                      <LayersIcon className="h-4 w-4 text-primary" />
                      Recurring Templates
                    </h2>
                    <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-black text-primary">
                      {transactions.length} Total
                    </span>
                  </div>

                  {transactions.length === 0 ? (
                    <div className="flex h-[200px] flex-col items-center justify-center p-4 text-center">
                      <LayersIcon className="mb-3 h-10 w-10 text-muted-foreground/30" />
                      <p className="text-xs font-semibold text-muted-foreground">
                        No recurring templates configured.
                      </p>
                      <p className="mt-1 max-w-[300px] text-[10px] text-muted-foreground/80">
                        Add template rules for salary inflows or subscription
                        outflows to automate future scheduling.
                      </p>
                    </div>
                  ) : (
                    <ScrollArea className="max-h-[500px] min-h-[180px]">
                      <div className="flex flex-col">
                        {transactions.map((exp) => {
                          const budget = budgets.find(
                            (b) => b.id === exp.budgetId
                          )
                          const colors = getBudgetColors(
                            budget?.color || "indigo"
                          )
                          const Icon = getBudgetIcon(
                            budget?.icon || "piggy-bank"
                          )

                          const nextDueDateVal =
                            exp.executionState?.nextDueDate ||
                            ((
                              exp.executionState as unknown as
                                Record<string, unknown> | undefined
                            )?.next_due_date as string | undefined) ||
                            ((exp as unknown as Record<string, unknown>)
                              .nextDueDate as string | undefined) ||
                            ((exp as unknown as Record<string, unknown>)
                              .next_due_date as string | undefined)

                          return (
                            <div
                              key={exp.id}
                              className="group flex items-center justify-between border-b border-border/20 px-3.5 py-3.5 transition-colors last:border-0 hover:bg-muted/10 sm:px-6 sm:py-4"
                            >
                              <div className="flex min-w-0 flex-1 items-center gap-3">
                                <div
                                  className={cn(
                                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-sm",
                                    exp.type === "INCOME"
                                      ? "bg-emerald-500/10 text-emerald-500"
                                      : colors.bg,
                                    exp.type === "INCOME"
                                      ? "text-emerald-500"
                                      : colors.text
                                  )}
                                >
                                  <Icon className="h-5 w-5" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <h4
                                    className="max-w-[130px] truncate text-sm font-bold text-foreground min-[375px]:max-w-[170px] min-[420px]:max-w-[210px] sm:max-w-[350px]"
                                    title={exp.name}
                                  >
                                    {exp.name}
                                  </h4>
                                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                                    <span
                                      className={cn(
                                        "font-semibold",
                                        exp.type === "EXPENSE"
                                          ? "text-rose-500"
                                          : "text-emerald-500"
                                      )}
                                    >
                                      {exp.type === "EXPENSE" ? "-" : "+"}
                                      {formatCents(exp.amount).toLocaleString(
                                        undefined,
                                        {
                                          minimumFractionDigits: 2,
                                          maximumFractionDigits: 2,
                                        }
                                      )}{" "}
                                      <span className="text-[10px] font-medium text-muted-foreground uppercase">
                                        {exp.currency}
                                      </span>
                                    </span>
                                    <span className="text-muted-foreground/40">
                                      •
                                    </span>
                                    <span className="font-medium text-foreground/80">
                                      {formatInterval(exp.interval)}
                                    </span>
                                    <span className="text-muted-foreground/40">
                                      •
                                    </span>
                                    <span className="flex items-center gap-1 font-medium text-muted-foreground">
                                      <CalendarIcon className="h-3 w-3 text-primary/70" />
                                      Next: {formatNextDueDate(nextDueDateVal)}
                                    </span>
                                    {exp.isVariable && (
                                      <span className="rounded bg-sky-500/10 px-1.5 py-0.5 text-[9px] font-bold text-sky-500">
                                        Variable
                                      </span>
                                    )}
                                    {exp.gracePeriodDays > 0 && (
                                      <span className="rounded bg-indigo-500/10 px-1.5 py-0.5 text-[9px] font-bold text-indigo-500">
                                        Grace: {exp.gracePeriodDays}d
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                                <span
                                  className={cn(
                                    "rounded-full px-2.5 py-0.5 text-[10px] font-black tracking-wider select-none",
                                    isStatusActive(exp.status)
                                      ? "bg-emerald-500/10 text-emerald-500"
                                      : "bg-muted text-muted-foreground"
                                  )}
                                >
                                  {formatStatus(exp.status)}
                                </span>

                                {isWritable && (
                                  <DropdownMenu>
                                    <DropdownMenuTrigger
                                      render={
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-muted/20"
                                        >
                                          <MoreVertical className="h-4 w-4" />
                                        </Button>
                                      }
                                    />
                                    <DropdownMenuContent
                                      align="end"
                                      className="w-40"
                                    >
                                      <DropdownMenuItem
                                        onClick={() => {
                                          setHistoryTransaction(exp)
                                          setHistoryOpen(true)
                                        }}
                                        className="flex cursor-pointer items-center gap-2"
                                      >
                                        <History className="h-4 w-4 text-muted-foreground" />
                                        <span>History Logs</span>
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        onClick={() => {
                                          setEditTransaction(exp)
                                          setTransactionSheetOpen(true)
                                        }}
                                        className="flex cursor-pointer items-center gap-2"
                                      >
                                        <Edit2Icon className="h-4 w-4 text-muted-foreground" />
                                        <span>Edit</span>
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        onClick={() =>
                                          handleDeleteTransaction(exp)
                                        }
                                        className="flex cursor-pointer items-center gap-2 text-destructive focus:bg-destructive/10 focus:text-destructive"
                                      >
                                        <Trash2Icon className="h-4 w-4" />
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
                    </ScrollArea>
                  )}
                </div>

                {/* 2. Pending Schedule (Actionable list - 5 cols) */}
                <div className="flex flex-col overflow-hidden rounded-3xl border border-border/40 bg-card/30 shadow-sm backdrop-blur-sm lg:col-span-5">
                  <div className="flex items-center justify-between border-b border-border/20 bg-card/10 px-6 py-4">
                    <h2 className="flex items-center gap-2 text-xs font-black tracking-wider text-muted-foreground uppercase">
                      <CalendarIcon className="h-4 w-4 text-primary" />
                      Pending Schedule
                    </h2>
                    <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-black text-primary">
                      {scheduledTransactions.length} Pending
                    </span>
                  </div>

                  {scheduledTransactions.length === 0 ? (
                    <div className="flex h-[200px] flex-col items-center justify-center p-4 text-center">
                      <CheckCircle2Icon className="mb-3 h-10 w-10 text-emerald-500/30" />
                      <p className="text-xs font-semibold text-muted-foreground">
                        All clear! No pending schedules.
                      </p>
                      <p className="mt-1 max-w-[200px] text-[10px] text-muted-foreground/80">
                        Upcoming templates will generate items automatically.
                      </p>
                    </div>
                  ) : (
                    <ScrollArea className="max-h-[500px] min-h-[180px]">
                      <div className="flex flex-col">
                        {scheduledTransactions.map((pay) => {
                          const budget = budgets.find(
                            (b) => b.id === pay.budgetId
                          )
                          const colors = getBudgetColors(
                            budget?.color || "indigo"
                          )
                          const Icon = getBudgetIcon(
                            budget?.icon || "piggy-bank"
                          )
                          const matchedTemplate = transactions.find(
                            (e) => e.id === pay.sourceId
                          )
                          const graceDays =
                            matchedTemplate?.gracePeriodDays || 0
                          const graceDueDate = new Date(pay.dueDate)
                          graceDueDate.setDate(
                            graceDueDate.getDate() + graceDays
                          )
                          const isOverdue = graceDueDate < new Date()

                          const displayName = (() => {
                            if (pay.sourceType === "RECURRENT_TRANSACTION") {
                              return (
                                transactions.find((e) => e.id === pay.sourceId)
                                  ?.name || "Scheduled Obligation"
                              )
                            }
                            if (
                              pay.sourceType === "SOURCE_TYPE_UNSPECIFIED" ||
                              !pay.sourceType
                            ) {
                              if (pay.metadata?.vendorName) {
                                return pay.metadata.vendorName
                              }
                              if (pay.metadata?.description) {
                                return pay.metadata.description
                              }
                            }
                            return "Scheduled Inflow"
                          })()

                          return (
                            <div
                              key={pay.id}
                              className="flex items-center justify-between border-b border-border/20 px-4 py-3.5 transition-colors last:border-0 hover:bg-muted/10"
                            >
                              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                                <div
                                  className={cn(
                                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-sm",
                                    pay.type === "INCOME"
                                      ? "bg-emerald-500/10 text-emerald-500"
                                      : colors.bg,
                                    pay.type === "INCOME"
                                      ? "text-emerald-500"
                                      : colors.text
                                  )}
                                >
                                  <Icon className="h-4 w-4" />
                                </div>
                                <div className="min-w-0">
                                  <h4
                                    className="max-w-[130px] truncate text-xs font-bold text-foreground sm:max-w-[165px] md:max-w-[190px]"
                                    title={displayName}
                                  >
                                    {displayName}
                                  </h4>
                                  <div className="mt-0.5 flex flex-wrap items-center gap-x-1 text-[9px]">
                                    <span
                                      className={cn(
                                        "flex items-center gap-0.5 font-semibold",
                                        isOverdue && pay.type === "EXPENSE"
                                          ? "text-rose-500"
                                          : "text-muted-foreground"
                                      )}
                                    >
                                      {isOverdue && pay.type === "EXPENSE" && (
                                        <AlertCircleIcon className="h-2.5 w-2.5" />
                                      )}
                                      Due:{" "}
                                      {new Date(pay.dueDate).toLocaleDateString(
                                        undefined,
                                        {
                                          month: "short",
                                          day: "numeric",
                                          timeZone: "UTC",
                                        }
                                      )}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="flex shrink-0 items-center gap-2">
                                <div className="text-right">
                                  <span
                                    className={cn(
                                      "block text-xs font-bold",
                                      pay.type === "EXPENSE"
                                        ? "text-rose-500"
                                        : "text-emerald-500"
                                    )}
                                  >
                                    {pay.type === "EXPENSE" ? "-" : "+"}
                                    {formatCents(pay.amount).toLocaleString(
                                      undefined,
                                      {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                      }
                                    )}
                                  </span>
                                  <span className="block text-[8px] font-semibold text-muted-foreground uppercase">
                                    {pay.currency}
                                  </span>
                                </div>

                                <DropdownMenu>
                                  <DropdownMenuTrigger
                                    render={
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 rounded-lg text-muted-foreground hover:bg-muted/20"
                                      >
                                        <MoreVertical className="h-3.5 w-3.5" />
                                      </Button>
                                    }
                                  />
                                  <DropdownMenuContent
                                    align="end"
                                    className="w-40"
                                  >
                                    <DropdownMenuItem
                                      onClick={() => {
                                        setSelectedScheduledTransaction(pay)
                                        setConfirmDialogOpen(true)
                                      }}
                                      className="flex cursor-pointer items-center gap-2"
                                    >
                                      <CheckCircle2Icon className="h-4 w-4 text-emerald-500" />
                                      <span>Confirm Cleared</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() => setTransactionToSkip(pay)}
                                      className="flex cursor-pointer items-center gap-2 text-amber-600 focus:bg-amber-500/10 focus:text-amber-600 dark:text-amber-400"
                                    >
                                      <FastForward className="h-4 w-4" />
                                      <span>Skip Cycle</span>
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </ScrollArea>
                  )}
                </div>
              </div>
            </TabsContent>

            {/* Tab 2: History */}
            <TabsContent value="history" className="mt-0">
              <div className="flex flex-col overflow-hidden rounded-3xl border border-border/40 bg-card/30 shadow-sm backdrop-blur-sm">
                <div className="flex items-center justify-between border-b border-border/20 bg-card/10 px-6 py-4">
                  <h2 className="flex items-center gap-2 text-xs font-black tracking-wider text-muted-foreground uppercase">
                    <History className="h-4 w-4 text-primary" />
                    Transaction Logs
                  </h2>
                  <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-black text-primary">
                    {historyTransactions.length} Total
                  </span>
                </div>

                {historyLoading ? (
                  <div className="flex h-[250px] items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : historyTransactions.length === 0 ? (
                  <div className="flex h-[250px] flex-col items-center justify-center p-4 text-center">
                    <History className="mb-3 h-10 w-10 text-muted-foreground/30" />
                    <p className="text-xs font-bold text-foreground">
                      No transaction history yet
                    </p>
                    <p className="mt-1 max-w-[280px] text-[10px] text-muted-foreground">
                      Confirm pending scheduled items to build your recurrent
                      transaction logs.
                    </p>
                  </div>
                ) : (
                  <ScrollArea className="max-h-[500px] min-h-[250px]">
                    <div className="flex flex-col">
                      {historyTransactions.map((txn) => {
                        const matchedTemplate = transactions.find(
                          (e) =>
                            e.id ===
                            (txn.metadata?.source_id ?? txn.metadata?.sourceId)
                        )
                        const budget = budgets.find(
                          (b) => b.id === txn.budgetId
                        )
                        const colors = getBudgetColors(
                          budget?.color || "indigo"
                        )
                        const Icon = getBudgetIcon(budget?.icon || "piggy-bank")

                        const tDate = new Date(txn.transactionDate)
                        const effDate = new Date(txn.effectiveDate)

                        const graceDays = matchedTemplate?.gracePeriodDays || 0
                        const graceLimitDate = new Date(effDate)
                        graceLimitDate.setDate(
                          graceLimitDate.getDate() + graceDays
                        )

                        const isLate = tDate > graceLimitDate
                        const conversionPreview = txn.currency !== baseCurrency

                        return (
                          <div
                            key={txn.id}
                            className="flex items-center justify-between border-b border-border/20 px-6 py-4 transition-colors last:border-0 hover:bg-muted/10"
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className={cn(
                                  "flex h-10 w-10 items-center justify-center rounded-xl shadow-sm",
                                  txn.type === "INCOME"
                                    ? "bg-emerald-500/10 text-emerald-500"
                                    : colors.bg,
                                  txn.type === "INCOME"
                                    ? "text-emerald-500"
                                    : colors.text
                                )}
                              >
                                <Icon className="h-5 w-5" />
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <h4 className="text-xs font-bold text-foreground">
                                    {matchedTemplate?.name ||
                                      txn.description ||
                                      "Recurring Transaction"}
                                  </h4>
                                  {isLate && txn.type === "EXPENSE" ? (
                                    <span className="rounded bg-rose-500/10 px-1.5 py-0.5 text-[8px] font-black tracking-wider text-rose-500 uppercase select-none">
                                      Late
                                    </span>
                                  ) : (
                                    <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[8px] font-black tracking-wider text-emerald-500 uppercase select-none">
                                      On Time
                                    </span>
                                  )}
                                </div>
                                <div className="mt-0.5 flex items-center gap-1.5 text-[9px] text-muted-foreground">
                                  <span>
                                    Cleared:{" "}
                                    {new Date(
                                      txn.transactionDate
                                    ).toLocaleDateString(undefined, {
                                      month: "short",
                                      day: "numeric",
                                      year: "numeric",
                                      timeZone: "UTC",
                                    })}
                                  </span>
                                  <span>•</span>
                                  <span className="font-mono break-all select-all">
                                    ID: {txn.id}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-4">
                              <div className="text-right">
                                <span
                                  className={cn(
                                    "block text-xs font-bold",
                                    txn.type === "EXPENSE"
                                      ? "text-rose-500"
                                      : "text-emerald-500"
                                  )}
                                >
                                  {txn.type === "EXPENSE" ? "-" : "+"}
                                  {formatCents(txn.amount).toLocaleString(
                                    undefined,
                                    {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    }
                                  )}{" "}
                                  <span className="text-[10px] font-medium text-muted-foreground uppercase">
                                    {txn.currency}
                                  </span>
                                </span>
                                {conversionPreview && (
                                  <span className="mt-0.5 flex items-center justify-end gap-1 text-[9px] font-medium text-muted-foreground">
                                    <ArrowRight className="h-3 w-3" />
                                    {baseCurrency}{" "}
                                    {formatCents(
                                      txn.amountInBase
                                    ).toLocaleString(undefined, {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    })}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </ScrollArea>
                )}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </div>

      {/* Sheets and Dialogs */}
      <CreateRecurringTransactionSheet
        open={transactionSheetOpen}
        onOpenChange={setTransactionSheetOpen}
        budgets={budgets}
        baseCurrency={baseCurrency}
        editTransaction={editTransaction}
        refetchTransactions={refetchRecurring}
        spaceId={spaceId}
      />

      <ConfirmTransactionSheet
        open={confirmDialogOpen}
        onOpenChange={setConfirmDialogOpen}
        transaction={selectedScheduledTransaction}
        refetchTransactions={() => {
          refetchScheduled()
          refetchRecurring()
          refetchHistory()
        }}
        getConversionPreview={getConversionPreview}
      />

      <RecurringTransactionHistorySheet
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        transaction={historyTransaction}
      />

      <SkipPaymentDialog
        open={!!transactionToSkip}
        onOpenChange={(open) => {
          if (!open) setTransactionToSkip(null)
        }}
        onConfirm={handleConfirmSkipTransaction}
        isPending={skipMutation.isPending}
        paymentName={
          transactionToSkip?.sourceType === "RECURRENT_TRANSACTION"
            ? transactions.find((e) => e.id === transactionToSkip.sourceId)
                ?.name || "Scheduled Transaction"
            : "Scheduled Transaction"
        }
        amountFormatted={
          transactionToSkip
            ? formatCents(transactionToSkip.amount).toFixed(2)
            : undefined
        }
        currency={transactionToSkip?.currency}
      />
    </FinancePageLayout>
  )
}
export default RecurringView
