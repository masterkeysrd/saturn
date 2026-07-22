import { useState } from "react"
import { useWorkspaceFinance } from "./use-workspace-finance"
import { FinancePageLayout } from "./components/finance-page-layout"
import {
  useListRecurringExpensesQuery,
  useListScheduledPaymentsQuery,
  useDeleteRecurringExpenseMutation,
  useListTransactionsQuery,
  type RecurringExpense,
  type ScheduledPayment,
  type ListScheduledPaymentsRequest,
} from "@/gen/saturn/finance/v1/finance"
import {
  TrendingDownIcon,
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
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { CreateRecurringExpenseSheet } from "./components/create-recurring-expense-sheet"
import { ConfirmPaymentSheet } from "./components/confirm-payment-sheet"
import { RecurringExpenseHistorySheet } from "./components/recurring-expense-history-sheet"
import { formatCents, getBudgetColors, getBudgetIcon } from "./utils"
import { cn } from "@/lib/utils"

// Constants for time conversions and pagination
const WEEKS_IN_YEAR = 52
const MONTHS_IN_YEAR = 12
const FORECAST_DAYS_WINDOW = 7
const DEFAULT_PAGE_SIZE = 100
const HISTORY_PAGE_SIZE = 50

export function RecurringView() {
  const { spaceId, settings, getConversionPreview, budgets, currencies } =
    useWorkspaceFinance()
  const baseCurrency = settings?.baseCurrency || "USD"

  // Sheets and Dialogs state
  const [expenseSheetOpen, setExpenseSheetOpen] = useState(false)
  const [editExpense, setEditExpense] = useState<RecurringExpense | null>(null)
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)
  const [selectedPayment, setSelectedPayment] =
    useState<ScheduledPayment | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyExpense, setHistoryExpense] = useState<RecurringExpense | null>(
    null
  )

  // Fetch lists
  const {
    data: expensesData,
    isLoading: expensesLoading,
    refetch: refetchExpenses,
  } = useListRecurringExpensesQuery({
    pageSize: DEFAULT_PAGE_SIZE,
    pageToken: "",
    status: "",
  })

  const {
    data: paymentsData,
    isLoading: paymentsLoading,
    refetch: refetchPayments,
  } = useListScheduledPaymentsQuery({
    pageSize: DEFAULT_PAGE_SIZE,
    pageToken: "",
    status: "",
    startDate: "",
    endDate: "",
  } as unknown as ListScheduledPaymentsRequest)

  const deleteMutation = useDeleteRecurringExpenseMutation()

  const expenses = expensesData?.recurringExpenses || []
  const payments = paymentsData?.scheduledPayments || []

  // Fetch unified transaction history for all recurrent outflows
  const {
    data: historyData,
    isLoading: historyLoading,
    refetch: refetchHistory,
  } = useListTransactionsQuery(
    {
      budgetId: "",
      type: "TRANSACTION_TYPE_UNSPECIFIED",
      pageSize: HISTORY_PAGE_SIZE,
      pageToken: "",
      sourceType: "recurrent_expense",
      sourceId: "",
    },
    { enabled: !!spaceId }
  )

  const historyTransactions = historyData?.transactions || []

  const handleDeleteExpense = async (id: string) => {
    if (
      confirm(
        "Are you sure you want to delete this recurring expense template? This will stop future scheduled bills from generating."
      )
    ) {
      await deleteMutation.mutateAsync({
        id: id,
        req: {
          id: id,
        },
      })
      refetchExpenses()
    }
  }

  // Convert amount to base currency using exchange rates
  const convertToBase = (amountVal: number, fromCurrency: string) => {
    if (!settings?.baseCurrency || fromCurrency === settings.baseCurrency) {
      return amountVal
    }
    const preview = getConversionPreview(amountVal.toString(), fromCurrency)
    if (preview && typeof preview.amount === "number") {
      return preview.amount
    }
    return amountVal // Fallback if rate not configured yet
  }

  // Calculate Normalized Monthly Recurring Overhead in base currency
  const monthlyOverhead = expenses.reduce((acc, exp) => {
    if (exp.status !== "active") return acc

    const amountVal = formatCents(exp.amount)
    const convertedAmount = convertToBase(amountVal, exp.currency)
    let normalizedAmount = convertedAmount

    if (exp.interval === "weekly") {
      normalizedAmount = convertedAmount * (WEEKS_IN_YEAR / MONTHS_IN_YEAR)
    } else if (exp.interval === "yearly") {
      normalizedAmount = convertedAmount / MONTHS_IN_YEAR
    }

    return acc + normalizedAmount
  }, 0)

  // Calculate Next 7 Days Outflows in base currency
  const next7Days = new Date()
  next7Days.setDate(next7Days.getDate() + FORECAST_DAYS_WINDOW)

  const upcomingOutflows = payments.reduce((acc, pay) => {
    const dueDate = new Date(pay.dueDate)
    if (dueDate <= next7Days) {
      const amountVal = formatCents(pay.amount)
      const convertedAmount = convertToBase(amountVal, pay.currency)
      return acc + convertedAmount
    }
    return acc
  }, 0)

  const isLoading = expensesLoading || paymentsLoading

  return (
    <FinancePageLayout
      title="Recurrent Expenses"
      description="Manage recurrent SaaS subscriptions, bills, rent, and scheduled outflows."
      icon={LayersIcon}
      actions={
        <Button
          onClick={() => {
            setEditExpense(null)
            setExpenseSheetOpen(true)
          }}
          className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-accent pt-0.5 font-semibold text-white shadow-lg shadow-primary/15 transition-all hover:scale-[1.02] hover:opacity-95"
        >
          <PlusIcon className="h-4 w-4" />
          Create Recurrent Expense
        </Button>
      }
    >
      <div className="mt-2 animate-in space-y-8 duration-300 fade-in">
        {/* Metrics Grid */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {/* Monthly Overhead Card */}
          <div className="relative flex items-center gap-4 overflow-hidden rounded-3xl border border-border/40 bg-card/30 p-6 shadow-sm backdrop-blur-sm select-none">
            <div className="rounded-2xl bg-indigo-500/10 p-3.5 text-indigo-500">
              <LayersIcon className="h-6 w-6" />
            </div>
            <div>
              <span className="block text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                Monthly Overhead
              </span>
              <span className="mt-1 block text-2xl font-black tracking-tight text-foreground">
                {monthlyOverhead.toLocaleString(undefined, {
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
              <TrendingDownIcon className="h-6 w-6" />
            </div>
            <div>
              <span className="block text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                Next 7 Days Outflows
              </span>
              <span className="mt-1 block text-2xl font-black tracking-tight text-foreground">
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

        {/* Main Stacked Content */}
        {isLoading ? (
          <div className="flex h-[350px] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-8">
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
              {/* 1. Recurring Expenses Templates (Configuration template list - 8 cols) */}
              <div className="flex flex-col overflow-hidden rounded-3xl border border-border/40 bg-card/30 shadow-sm backdrop-blur-sm lg:col-span-8">
                <div className="flex items-center justify-between border-b border-border/20 bg-card/10 px-6 py-4">
                  <h2 className="flex items-center gap-2 text-xs font-black tracking-wider text-muted-foreground uppercase">
                    <LayersIcon className="h-4 w-4 text-primary" />
                    Recurring Templates
                  </h2>
                  <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-black text-primary">
                    {expenses.length} Total
                  </span>
                </div>

                {expenses.length === 0 ? (
                  <div className="flex h-[200px] flex-col items-center justify-center p-4 text-center">
                    <LayersIcon className="mb-3 h-10 w-10 text-muted-foreground/30" />
                    <p className="text-xs font-semibold text-muted-foreground">
                      No recurring templates configured.
                    </p>
                    <p className="mt-1 max-w-[300px] text-[10px] text-muted-foreground/80">
                      Add subscriptions or rent bills to automate future
                      scheduling.
                    </p>
                  </div>
                ) : (
                  <ScrollArea className="max-h-[360px] min-h-[180px]">
                    <div className="flex flex-col">
                      {expenses.map((exp) => {
                        const budget = budgets.find(
                          (b) => b.id === exp.budgetId
                        )
                        const colors = getBudgetColors(
                          budget?.color || "indigo"
                        )
                        const Icon = getBudgetIcon(budget?.icon || "piggy-bank")

                        return (
                          <div
                            key={exp.id}
                            className="group flex items-center justify-between border-b border-border/20 px-6 py-4 transition-colors last:border-0 hover:bg-muted/10"
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <div
                                className={cn(
                                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-sm",
                                  colors.bg,
                                  colors.text
                                )}
                              >
                                <Icon className="h-5 w-5" />
                              </div>
                              <div className="min-w-0">
                                <h4
                                  className="max-w-[180px] truncate text-xs font-bold text-foreground sm:max-w-[350px]"
                                  title={exp.name}
                                >
                                  {exp.name}
                                </h4>
                                <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[9px] text-muted-foreground">
                                  <span className="font-semibold text-muted-foreground uppercase">
                                    {exp.interval}
                                  </span>
                                  <span className="text-muted-foreground/45">
                                    •
                                  </span>
                                  <span>
                                    Next:{" "}
                                    {new Date(
                                      exp.nextDueDate
                                    ).toLocaleDateString(undefined, {
                                      month: "short",
                                      day: "numeric",
                                      timeZone: "UTC",
                                    })}
                                  </span>
                                  {exp.isVariable && (
                                    <>
                                      <span className="text-muted-foreground/45">
                                        •
                                      </span>
                                      <span className="py-0.2 rounded bg-sky-500/10 px-1 text-[8px] font-bold text-sky-500 uppercase">
                                        Variable
                                      </span>
                                    </>
                                  )}
                                  {exp.gracePeriodDays > 0 && (
                                    <>
                                      <span className="text-muted-foreground/45">
                                        •
                                      </span>
                                      <span className="py-0.2 rounded bg-indigo-500/10 px-1 text-[8px] font-bold text-indigo-500 uppercase">
                                        Grace: {exp.gracePeriodDays}d
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex shrink-0 items-center gap-4">
                              <div className="text-right">
                                <span className="block text-xs font-bold text-foreground">
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
                                <span
                                  className={cn(
                                    "mt-0.5 block text-[8px] font-black tracking-wider uppercase",
                                    exp.status === "active"
                                      ? "text-emerald-500"
                                      : exp.status === "paused"
                                        ? "text-amber-500"
                                        : "text-rose-500"
                                  )}
                                >
                                  {exp.status}
                                </span>
                              </div>

                              <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 cursor-pointer rounded-lg text-muted-foreground hover:bg-muted/20"
                                  title="View payment history"
                                  onClick={() => {
                                    setHistoryExpense(exp)
                                    setHistoryOpen(true)
                                  }}
                                >
                                  <History className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 cursor-pointer rounded-lg text-muted-foreground hover:bg-muted/20"
                                  onClick={() => {
                                    setEditExpense(exp)
                                    setExpenseSheetOpen(true)
                                  }}
                                >
                                  <Edit2Icon className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 cursor-pointer rounded-lg text-rose-500 hover:bg-rose-500/10 hover:text-rose-600"
                                  onClick={() => handleDeleteExpense(exp.id)}
                                >
                                  <Trash2Icon className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </ScrollArea>
                )}
              </div>

              {/* 2. Pending Payments (Actionable scheduled payments list - 4 cols) */}
              <div className="flex flex-col overflow-hidden rounded-3xl border border-border/40 bg-card/30 shadow-sm backdrop-blur-sm lg:col-span-4">
                <div className="flex items-center justify-between border-b border-border/20 bg-card/10 px-6 py-4">
                  <h2 className="flex items-center gap-2 text-xs font-black tracking-wider text-muted-foreground uppercase">
                    <CalendarIcon className="h-4 w-4 text-primary" />
                    Pending Payments
                  </h2>
                  <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-black text-primary">
                    {payments.length} Pending
                  </span>
                </div>

                {payments.length === 0 ? (
                  <div className="flex h-[200px] flex-col items-center justify-center p-4 text-center">
                    <CheckCircle2Icon className="mb-3 h-10 w-10 text-emerald-500/30" />
                    <p className="text-xs font-semibold text-muted-foreground">
                      All clear! No pending payments.
                    </p>
                    <p className="mt-1 max-w-[200px] text-[10px] text-muted-foreground/80">
                      Upcoming bills will generate automatically.
                    </p>
                  </div>
                ) : (
                  <ScrollArea className="max-h-[360px] min-h-[180px]">
                    <div className="flex flex-col">
                      {payments.map((pay) => {
                        const budget = budgets.find(
                          (b) => b.id === pay.budgetId
                        )
                        const colors = getBudgetColors(
                          budget?.color || "indigo"
                        )
                        const Icon = getBudgetIcon(budget?.icon || "piggy-bank")
                        const matchedExpense = expenses.find(
                          (e) => e.id === pay.sourceId
                        )
                        const graceDays = matchedExpense?.gracePeriodDays || 0
                        const graceDueDate = new Date(pay.dueDate)
                        graceDueDate.setDate(graceDueDate.getDate() + graceDays)
                        const isOverdue = graceDueDate < new Date()

                        return (
                          <div
                            key={pay.id}
                            className="flex items-center justify-between border-b border-border/20 px-4 py-3.5 transition-colors last:border-0 hover:bg-muted/10"
                          >
                            <div className="flex min-w-0 items-center gap-2.5">
                              <div
                                className={cn(
                                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-sm",
                                  colors.bg,
                                  colors.text
                                )}
                              >
                                <Icon className="h-4 w-4" />
                              </div>
                              <div className="min-w-0">
                                <h4
                                  className="max-w-[90px] truncate text-xs font-bold text-foreground sm:max-w-[120px]"
                                  title={
                                    pay.sourceType === "recurrent_expense"
                                      ? expenses.find(
                                          (e) => e.id === pay.sourceId
                                        )?.name || "Recurring Bill"
                                      : "Scheduled Outflow"
                                  }
                                >
                                  {pay.sourceType === "recurrent_expense"
                                    ? expenses.find(
                                        (e) => e.id === pay.sourceId
                                      )?.name || "Recurring Bill"
                                    : "Scheduled Outflow"}
                                </h4>
                                <div className="mt-0.5 flex flex-wrap items-center gap-x-1 text-[9px]">
                                  <span
                                    className={cn(
                                      "flex items-center gap-0.5 font-semibold",
                                      isOverdue
                                        ? "text-rose-500"
                                        : "text-muted-foreground"
                                    )}
                                  >
                                    {isOverdue && (
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
                                <span className="block text-xs font-bold text-foreground">
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

                              <Button
                                size="sm"
                                className="h-7 rounded-lg bg-gradient-to-r from-primary to-accent px-2.5 text-[10px] font-bold text-white shadow shadow-primary/10 transition-all hover:scale-[1.02] hover:opacity-95"
                                onClick={() => {
                                  setSelectedPayment(pay)
                                  setConfirmDialogOpen(true)
                                }}
                              >
                                Confirm
                              </Button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </ScrollArea>
                )}
              </div>
            </div>

            {/* 3. History (Unified list of all past recurrent payments) */}
            <div className="flex flex-col overflow-hidden rounded-3xl border border-border/40 bg-card/30 shadow-sm backdrop-blur-sm">
              <div className="flex items-center justify-between border-b border-border/20 bg-card/10 px-6 py-4">
                <h2 className="flex items-center gap-2 text-xs font-black tracking-wider text-muted-foreground uppercase">
                  <History className="h-4 w-4 text-primary" />
                  History
                </h2>
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-black text-primary">
                  {historyTransactions.length} Total
                </span>
              </div>

              {historyLoading ? (
                <div className="flex h-[180px] items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : historyTransactions.length === 0 ? (
                <div className="flex h-[180px] flex-col items-center justify-center p-4 text-center">
                  <History className="mb-3 h-10 w-10 text-muted-foreground/30" />
                  <p className="text-xs font-bold text-foreground">
                    No payment history yet
                  </p>
                  <p className="mt-1 max-w-[280px] text-[10px] text-muted-foreground">
                    Confirm pending payments above to build your payment
                    history.
                  </p>
                </div>
              ) : (
                <ScrollArea className="max-h-[320px] min-h-[180px]">
                  <div className="flex flex-col">
                    {historyTransactions.map((txn) => {
                      const matchedExpense = expenses.find(
                        (e) => e.id === txn.sourceId
                      )
                      const budget = budgets.find((b) => b.id === txn.budgetId)
                      const colors = getBudgetColors(budget?.color || "indigo")
                      const Icon = getBudgetIcon(budget?.icon || "piggy-bank")

                      const tDate = new Date(txn.transactionDate)
                      const effDate = new Date(txn.effectiveDate)

                      const graceDays = matchedExpense?.gracePeriodDays || 0
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
                                colors.bg,
                                colors.text
                              )}
                            >
                              <Icon className="h-5 w-5" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="text-xs font-bold text-foreground">
                                  {matchedExpense?.name ||
                                    txn.description ||
                                    "Recurring Outflow"}
                                </h4>
                                {isLate ? (
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
                              <span className="block text-xs font-bold text-foreground">
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
                        </div>
                      )
                    })}
                  </div>
                </ScrollArea>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Sheets and Dialogs */}
      <CreateRecurringExpenseSheet
        open={expenseSheetOpen}
        onOpenChange={setExpenseSheetOpen}
        budgets={budgets}
        baseCurrency={baseCurrency}
        editExpense={editExpense}
        refetchExpenses={refetchExpenses}
        getConversionPreview={getConversionPreview}
        currencies={currencies}
      />

      <ConfirmPaymentSheet
        open={confirmDialogOpen}
        onOpenChange={setConfirmDialogOpen}
        payment={selectedPayment}
        refetchPayments={() => {
          refetchPayments()
          refetchExpenses()
          refetchHistory()
        }}
        getConversionPreview={getConversionPreview}
      />

      <RecurringExpenseHistorySheet
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        expense={historyExpense}
      />
    </FinancePageLayout>
  )
}
export default RecurringView
