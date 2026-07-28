import { useState, useEffect } from "react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useNavigate } from "react-router-dom"
import {
  confirmPaymentSchema,
  type ConfirmPaymentFormValues,
} from "../schemas/reconciliation"
import {
  useConfirmScheduledPaymentMutation,
  useMatchScheduledPaymentMutation,
  useSkipScheduledPaymentMutation,
  useListAccountsQuery,
  useListBudgetsQuery,
  useListRecurringExpensesQuery,
  useListTransactionsQuery,
  type ScheduledPayment,
  type Transaction,
} from "@/gen/saturn/finance/v1/finance"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { DatePicker } from "@/components/ui/date-picker"
import {
  Loader2,
  CheckCircle2,
  ChevronDown,
  Sparkles,
  Link2,
  Search,
  FastForward,
} from "lucide-react"
import { CurrencyConversionPreview } from "./currency-conversion-preview"
import { AccountSelect } from "./account-select"
import { BudgetSelect } from "./budget-select"
import { SkipPaymentDialog } from "./skip-payment-dialog"
import { cn } from "@/lib/utils"
import {
  toCentsString,
  formatCents,
  formatSourceType,
  getBudgetColors,
  getBudgetIcon,
  formatInterval,
  decodeBase64Utf8,
} from "../utils"

interface ConfirmPaymentSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  payment: ScheduledPayment | null
  refetchPayments: () => void
  getConversionPreview: (
    amountStr: string,
    fromCurr: string
  ) =>
    | { amount: number; rate: number; currency: string }
    | { error: string }
    | null
}

export function ConfirmPaymentSheet({
  open,
  onOpenChange,
  payment,
  refetchPayments,
  getConversionPreview,
}: ConfirmPaymentSheetProps) {
  const navigate = useNavigate()
  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    formState: { errors },
  } = useForm<ConfirmPaymentFormValues>({
    resolver: zodResolver(confirmPaymentSchema),
    defaultValues: {
      amount: "",
      accountId: "",
      budgetId: "",
      description: "",
      transactionDate: new Date(),
      effectiveDate: new Date(),
    },
  })

  const [confirmedTxn, setConfirmedTxn] = useState<Transaction | null>(null)
  const [selectedTxnId, setSelectedTxnId] = useState<string>("")
  const [accordionOpen, setAccordionOpen] = useState<boolean>(false)
  const [txSearch, setTxSearch] = useState<string>("")
  const [popoverOpen, setPopoverOpen] = useState<boolean>(false)

  const { data: accountsData } = useListAccountsQuery(
    { pageSize: 100, pageToken: "" },
    { enabled: open }
  )
  const { data: budgetsData } = useListBudgetsQuery(
    { pageSize: 100, pageToken: "" },
    { enabled: open }
  )
  const { data: expensesData } = useListRecurringExpensesQuery(
    { pageSize: 100, pageToken: "", status: "STATUS_UNSPECIFIED" },
    { enabled: open }
  )
  const { data: transactionsData } = useListTransactionsQuery(
    { pageSize: 100, pageToken: "", budgetId: "", type: "TYPE_UNSPECIFIED" },
    { enabled: open }
  )

  const accounts = accountsData?.accounts || []
  const budgets = budgetsData?.budgets || []
  const expenses = expensesData?.recurringExpenses || []
  const transactions = transactionsData?.transactions || []

  // Filter unlinked expense transactions
  const unlinkedTransactions = transactions.filter(
    (t) => !t.sourceType && t.type === "EXPENSE"
  )

  // Reconciliation Queue style multi-field search filter
  const filteredTransactions = unlinkedTransactions.filter((t) => {
    const q = txSearch.toLowerCase().trim()
    if (!q) return true
    const vendor = (t.description || "").toLowerCase()
    const amountStr = formatCents(t.amount || "0").toFixed(2)
    const budgetName =
      budgets.find((b) => b.id === t.budgetId)?.name?.toLowerCase() || ""
    const accountName =
      accounts.find((a) => a.id === t.accountId)?.name?.toLowerCase() || ""
    const dateStr = t.transactionDate
      ? new Date(t.transactionDate).toLocaleDateString()
      : ""

    return (
      vendor.includes(q) ||
      amountStr.includes(q) ||
      budgetName.includes(q) ||
      accountName.includes(q) ||
      dateStr.includes(q)
    )
  })

  // Smart Candidate Search (matching amount, currency, and date within 7 days)
  const candidateMatch = payment
    ? unlinkedTransactions.find((t) => {
        if (t.amount !== payment.amount || t.currency !== payment.currency)
          return false
        const tDate = new Date(t.transactionDate).getTime()
        const pDate = new Date(payment.dueDate).getTime()
        const diffDays = Math.abs(tDate - pDate) / (1000 * 3600 * 24)
        return diffDays <= 7
      })
    : null

  const confirmMutation = useConfirmScheduledPaymentMutation()
  const matchMutation = useMatchScheduledPaymentMutation()
  const skipMutation = useSkipScheduledPaymentMutation()
  const [skipDialogOpen, setSkipDialogOpen] = useState(false)

  const handleConfirmSkip = async () => {
    if (!payment) return
    await skipMutation.mutateAsync({
      id: payment.id || "",
      req: { id: payment.id || "" },
    })
    refetchPayments()
    setSkipDialogOpen(false)
    onOpenChange(false)
  }

  useEffect(() => {
    if (open && payment) {
      const matchedExp = payment.sourceId
        ? expenses.find((e) => e.id === payment.sourceId)
        : null
      const metaDesc = payment.metadata
        ? (() => {
            try {
              const decoded = JSON.parse(decodeBase64Utf8(payment.metadata))
              return decoded?.description || null
            } catch {
              return null
            }
          })()
        : null

      const dueFormatted = new Date(payment.dueDate).toISOString().slice(0, 10)
      const name =
        matchedExp?.name ||
        payment.recurringExpense?.name ||
        "Scheduled Payment"
      const defaultDesc = metaDesc || `${name} (${dueFormatted})`

      reset({
        amount: formatCents(payment.amount).toString(),
        transactionDate: new Date(),
        effectiveDate: new Date(payment.dueDate),
        budgetId: payment.budgetId || "",
        accountId: "",
        description: defaultDesc,
      })
      setConfirmedTxn(null)

      if (candidateMatch) {
        setSelectedTxnId(candidateMatch.id || "")
        setAccordionOpen(true)
      } else {
        setSelectedTxnId("")
        setAccordionOpen(false)
      }
    }
  }, [open, payment, expenses, candidateMatch, reset])

  const amountValue = watch("amount")
  const budgetIdValue = watch("budgetId")

  const toLocalISODate = (d: Date): string => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const date = String(d.getDate()).padStart(2, "0")
    return `${y}-${m}-${date}T12:00:00Z`
  }

  const onSubmit = async (data: ConfirmPaymentFormValues) => {
    if (!payment) return

    if (selectedTxnId) {
      const res = await matchMutation.mutateAsync({
        payment_id: payment.id || "",
        req: {
          paymentId: payment.id || "",
          transactionId: selectedTxnId,
        },
      })
      refetchPayments()
      setConfirmedTxn(res)
    } else {
      const centsAmount = toCentsString(data.amount)
      const txDateStr = toLocalISODate(data.transactionDate)
      const effDateStr = toLocalISODate(data.effectiveDate)

      const res = await confirmMutation.mutateAsync({
        payment_id: payment.id || "",
        req: {
          paymentId: payment.id || "",
          transactionDate: txDateStr,
          effectiveDate: effDateStr,
          actualAmount: centsAmount,
          description: data.description.trim() || undefined,
          accountId: data.accountId || undefined,
          budgetId: data.budgetId || undefined,
        },
      })
      refetchPayments()
      setConfirmedTxn(res)
    }
  }

  const isPending = confirmMutation.isPending
  const conversion = payment
    ? getConversionPreview(amountValue, payment.currency)
    : null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full rounded-none border-none border-border/40 bg-card/95 p-6 shadow-2xl backdrop-blur-xl sm:!max-w-xl sm:rounded-l-3xl sm:border-l md:p-8">
        {confirmedTxn ? (
          // Success State Screen
          <div className="flex h-full flex-col justify-between pt-8">
            <div className="space-y-6 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500 shadow-inner">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold tracking-tight text-foreground">
                  Payment Cleared!
                </h3>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  The scheduled payment was successfully cleared and registered
                  as a transaction.
                </p>
              </div>

              <div className="space-y-3.5 rounded-2xl border border-border/40 bg-background/50 p-5 text-left text-xs shadow-sm">
                <div className="flex justify-between border-b border-border/10 pb-2">
                  <span className="text-muted-foreground">Transaction ID:</span>
                  <span className="ml-4 text-right font-mono font-semibold break-all text-foreground select-all">
                    {confirmedTxn.id}
                  </span>
                </div>
                <div className="flex justify-between border-b border-border/10 pb-2">
                  <span className="text-muted-foreground">Cleared Amount:</span>
                  <span className="font-bold text-foreground">
                    {formatCents(confirmedTxn.amount).toFixed(2)}{" "}
                    <span className="text-[10px] font-medium text-muted-foreground uppercase">
                      {confirmedTxn.currency}
                    </span>
                  </span>
                </div>
                {confirmedTxn.currency !==
                  (confirmedTxn.amountInBase ? "USD" : "") &&
                  confirmedTxn.amountInBase && (
                    <div className="flex justify-between border-b border-border/10 pb-2">
                      <span className="text-muted-foreground">
                        Amount in Base:
                      </span>
                      <span className="font-bold text-foreground">
                        {formatCents(confirmedTxn.amountInBase).toFixed(2)}{" "}
                        <span className="text-[10px] font-medium text-muted-foreground uppercase">
                          USD
                        </span>
                      </span>
                    </div>
                  )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Description:</span>
                  <span className="max-w-[200px] truncate font-semibold text-foreground">
                    {confirmedTxn.description || "Scheduled Outflow"}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  onOpenChange(false)
                  navigate("/finance/transactions")
                }}
                className="h-12 cursor-pointer rounded-xl border-border/60 text-xs font-bold hover:bg-muted/10"
              >
                View Transactions
              </Button>
              <Button
                onClick={() => onOpenChange(false)}
                className="h-12 cursor-pointer rounded-xl bg-gradient-to-r from-primary to-accent text-xs font-bold text-white shadow-lg shadow-primary/15 transition-all hover:scale-[1.01] hover:opacity-95"
              >
                Done
              </Button>
            </div>
          </div>
        ) : (
          // Confirmation Form Screen
          <div className="flex h-full flex-col justify-between">
            <div className="overflow-y-auto pr-1">
              <SheetHeader className="p-0">
                <SheetTitle className="text-xl font-bold">
                  Confirm Payment
                </SheetTitle>
                <SheetDescription className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  Verify the details for clearing this scheduled outflow.
                </SheetDescription>
              </SheetHeader>

              {payment &&
                (() => {
                  const matchedExpense = payment.sourceId
                    ? expenses.find((e) => e.id === payment.sourceId)
                    : null

                  const vendorFromMeta = payment.metadata
                    ? (() => {
                        try {
                          const decoded = JSON.parse(
                            decodeBase64Utf8(payment.metadata)
                          )
                          return decoded?.vendor_name || null
                        } catch {
                          return null
                        }
                      })()
                    : null

                  const templateName =
                    matchedExpense?.name ||
                    payment.recurringExpense?.name ||
                    vendorFromMeta ||
                    "Scheduled Outflow"

                  const budget =
                    payment.budget ||
                    budgets.find(
                      (b) => b.id === (budgetIdValue || payment.budgetId)
                    )
                  const colors = getBudgetColors(budget?.color || "indigo")
                  const Icon = getBudgetIcon(budget?.icon || "piggy-bank")

                  const intervalVal =
                    matchedExpense?.interval ||
                    payment.recurringExpense?.interval
                  const intervalLabel = intervalVal
                    ? formatInterval(intervalVal)
                    : null

                  return (
                    <form
                      id="confirm-payment-form"
                      onSubmit={handleSubmit(onSubmit)}
                      className="mt-6 space-y-5"
                    >
                      {/* Rich Context Card for Scheduled Payment / Recurring Expense */}
                      <div className="rounded-2xl border border-border/40 bg-card/40 p-4 shadow-sm backdrop-blur-md">
                        <div className="flex items-center gap-3.5">
                          <div
                            className={cn(
                              "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-xs",
                              colors.bg,
                              colors.text
                            )}
                          >
                            <Icon className="h-5 w-5" />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <h4 className="truncate text-sm font-bold text-foreground">
                                {templateName}
                              </h4>
                              {intervalLabel && (
                                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                                  {intervalLabel}
                                </span>
                              )}
                            </div>

                            <div className="mt-0.5 flex items-center justify-between gap-2 text-xs">
                              {budget?.name && (
                                <span className="truncate text-[11px] font-medium text-muted-foreground">
                                  Budget:{" "}
                                  <span className="font-semibold text-foreground">
                                    {budget.name}
                                  </span>
                                </span>
                              )}
                              <span className="shrink-0 font-semibold text-foreground">
                                Target: {formatCents(payment.amount).toFixed(2)}{" "}
                                <span className="text-[10px] font-medium text-muted-foreground uppercase">
                                  {payment.currency}
                                </span>
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="mt-3.5 grid grid-cols-2 gap-2 border-t border-border/20 pt-3 text-xs">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                              Source
                            </span>
                            <span className="font-bold text-foreground">
                              {formatSourceType(payment.sourceType)}
                            </span>
                          </div>

                          <div className="flex flex-col gap-0.5">
                            <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                              Due Date
                            </span>
                            <span className="font-mono font-bold text-foreground">
                              {new Date(payment.dueDate).toLocaleDateString(
                                undefined,
                                {
                                  year: "numeric",
                                  month: "short",
                                  day: "numeric",
                                  timeZone: "UTC",
                                }
                              )}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Mini Accordion for Linking Existing Transaction */}
                      <div className="overflow-hidden rounded-2xl border border-border/40 bg-card/30 transition-all">
                        <button
                          type="button"
                          onClick={() => setAccordionOpen(!accordionOpen)}
                          className="flex w-full items-center justify-between p-3.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted/10"
                        >
                          <div className="flex items-center gap-2">
                            <Link2 className="h-4 w-4 text-primary" />
                            <span>Link Existing Bank Transaction</span>
                            {candidateMatch ? (
                              <span className="flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-500">
                                <Sparkles className="h-3 w-3" />1 Smart Match
                              </span>
                            ) : (
                              <span className="text-[10px] font-normal text-muted-foreground">
                                (Optional)
                              </span>
                            )}
                          </div>
                          <ChevronDown
                            className={cn(
                              "h-4 w-4 text-muted-foreground transition-transform duration-200",
                              accordionOpen && "rotate-180"
                            )}
                          />
                        </button>

                        {accordionOpen && (
                          <div className="space-y-3 border-t border-border/20 bg-muted/5 p-3.5 text-xs">
                            {/* Smart Candidate Suggestion Card */}
                            {candidateMatch && (
                              <div className="space-y-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
                                <div className="flex items-center justify-between">
                                  <span className="flex items-center gap-1.5 text-[11px] font-bold text-amber-500">
                                    <Sparkles className="h-3.5 w-3.5" />
                                    Suggested Match Found
                                  </span>
                                  <Button
                                    type="button"
                                    variant={
                                      selectedTxnId === candidateMatch.id
                                        ? "default"
                                        : "outline"
                                    }
                                    size="sm"
                                    onClick={() =>
                                      setSelectedTxnId(
                                        selectedTxnId === candidateMatch.id
                                          ? ""
                                          : candidateMatch.id || ""
                                      )
                                    }
                                    className="h-7 cursor-pointer rounded-lg px-2.5 text-[10px] font-bold"
                                  >
                                    {selectedTxnId === candidateMatch.id
                                      ? "Selected"
                                      : "Use Suggestion"}
                                  </Button>
                                </div>
                                <div className="flex items-center justify-between pt-0.5 font-medium text-foreground">
                                  <span className="max-w-[200px] truncate">
                                    {candidateMatch.description ||
                                      "Bank Outflow"}
                                  </span>
                                  <span className="font-bold">
                                    {formatCents(candidateMatch.amount).toFixed(
                                      2
                                    )}{" "}
                                    <span className="text-[9px] font-medium text-muted-foreground uppercase">
                                      {candidateMatch.currency}
                                    </span>
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                  <span>
                                    {new Date(
                                      candidateMatch.transactionDate
                                    ).toLocaleDateString(undefined, {
                                      month: "short",
                                      day: "numeric",
                                    })}
                                  </span>
                                  {candidateMatch.account && (
                                    <>
                                      <span>•</span>
                                      <span>{candidateMatch.account.name}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Manual Search Select using Reconciliation Queue Search Popover */}
                            <div className="space-y-1.5">
                              <Label className="text-[11px] font-semibold text-muted-foreground">
                                {candidateMatch
                                  ? "Or search and pick another transaction:"
                                  : "Search transaction to pair with:"}
                              </Label>
                              <Popover
                                open={popoverOpen}
                                onOpenChange={setPopoverOpen}
                                modal={false}
                              >
                                <PopoverTrigger className="flex h-10 w-full cursor-pointer items-center justify-between rounded-xl border border-border/60 bg-background/50 px-3 text-left font-normal text-foreground transition-colors hover:bg-background/80 focus:ring-1 focus:ring-ring">
                                  {selectedTxnId ? (
                                    (() => {
                                      const matched = transactions.find(
                                        (t) => t.id === selectedTxnId
                                      )
                                      if (!matched)
                                        return "Selected Transaction"
                                      const dateStr = matched.transactionDate
                                        ? new Date(
                                            matched.transactionDate
                                          ).toLocaleDateString(undefined, {
                                            month: "short",
                                            day: "numeric",
                                          })
                                        : ""
                                      const amtStr = formatCents(
                                        matched.amount || "0"
                                      ).toFixed(2)
                                      return (
                                        <div className="flex w-full items-center justify-between pr-1 text-xs">
                                          <div className="flex min-w-0 items-center gap-2">
                                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
                                            <span className="max-w-[190px] truncate font-semibold text-foreground">
                                              {matched.description || "Outflow"}
                                            </span>
                                            <span className="shrink-0 text-[10px] text-muted-foreground">
                                              ({dateStr})
                                            </span>
                                          </div>
                                          <span className="shrink-0 font-bold text-foreground">
                                            {amtStr} {matched.currency}
                                          </span>
                                        </div>
                                      )
                                    })()
                                  ) : (
                                    <span className="text-xs text-muted-foreground">
                                      Search by vendor, amount, budget, or
                                      account...
                                    </span>
                                  )}
                                  <ChevronDown className="ml-1 h-4 w-4 shrink-0 opacity-50" />
                                </PopoverTrigger>

                                <PopoverContent
                                  align="start"
                                  className="flex w-[var(--anchor-width)] min-w-[340px] flex-col gap-2 rounded-2xl border border-border/50 bg-card/95 p-2.5 shadow-2xl backdrop-blur-xl"
                                >
                                  <div className="relative">
                                    <Search className="absolute top-2.5 left-2.5 h-3.5 w-3.5 text-muted-foreground" />
                                    <Input
                                      placeholder="Type to search (vendor, amount, budget...)"
                                      className="h-9 rounded-xl border-border/50 bg-background/50 pl-8 text-xs focus-visible:ring-ring"
                                      value={txSearch}
                                      onChange={(e) =>
                                        setTxSearch(e.target.value)
                                      }
                                      autoFocus
                                    />
                                  </div>
                                  <ScrollArea className="h-56">
                                    <div className="flex flex-col gap-1 pr-1">
                                      <button
                                        type="button"
                                        className="flex w-full cursor-pointer items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs font-semibold text-rose-400 transition-colors hover:bg-rose-500/10"
                                        onClick={() => {
                                          setSelectedTxnId("")
                                          setPopoverOpen(false)
                                        }}
                                      >
                                        <span>
                                          Don't link (Create new transaction)
                                        </span>
                                      </button>
                                      <Separator className="my-1 bg-border/10" />
                                      {filteredTransactions.length === 0 ? (
                                        <div className="p-4 text-center text-xs text-muted-foreground">
                                          No unlinked transactions found.
                                        </div>
                                      ) : (
                                        filteredTransactions.map((t) => {
                                          const dateStr = t.transactionDate
                                            ? new Date(
                                                t.transactionDate
                                              ).toLocaleDateString(undefined, {
                                                month: "short",
                                                day: "numeric",
                                              })
                                            : ""
                                          const amtStr = formatCents(
                                            t.amount || "0"
                                          ).toFixed(2)
                                          const budgetName = budgets.find(
                                            (b) => b.id === t.budgetId
                                          )?.name
                                          const accountName = accounts.find(
                                            (a) => a.id === t.accountId
                                          )?.name
                                          const isSelected =
                                            selectedTxnId === t.id

                                          return (
                                            <button
                                              key={t.id}
                                              type="button"
                                              className={cn(
                                                "flex w-full cursor-pointer items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs transition-colors",
                                                isSelected
                                                  ? "bg-primary/10 font-semibold text-primary"
                                                  : "text-foreground hover:bg-muted/10"
                                              )}
                                              onClick={() => {
                                                setSelectedTxnId(t.id || "")
                                                setPopoverOpen(false)
                                              }}
                                            >
                                              <div className="flex min-w-0 flex-col gap-0.5 pr-2">
                                                <div className="flex items-center gap-1.5">
                                                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
                                                  <span className="truncate font-bold text-foreground">
                                                    {t.description || "Outflow"}
                                                  </span>
                                                </div>
                                                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                                                  <span>{dateStr}</span>
                                                  {accountName && (
                                                    <>
                                                      <span>•</span>
                                                      <span>{accountName}</span>
                                                    </>
                                                  )}
                                                  {budgetName && (
                                                    <>
                                                      <span>•</span>
                                                      <span className="font-medium text-foreground/80">
                                                        {budgetName}
                                                      </span>
                                                    </>
                                                  )}
                                                </div>
                                              </div>

                                              <span className="shrink-0 font-mono font-bold text-foreground">
                                                {amtStr} {t.currency}
                                              </span>
                                            </button>
                                          )
                                        })
                                      )}
                                    </div>
                                  </ScrollArea>
                                </PopoverContent>
                              </Popover>
                            </div>
                          </div>
                        )}
                      </div>

                      {!selectedTxnId && (
                        <>
                          <div className="space-y-2">
                            <Label
                              htmlFor="actualAmount"
                              className="text-xs font-bold tracking-wider text-muted-foreground uppercase"
                            >
                              Amount Paid
                            </Label>
                            <div className="flex h-12 items-center overflow-hidden rounded-xl border border-border/60 bg-background/50 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20">
                              <input
                                id="actualAmount"
                                type="number"
                                step="0.01"
                                min="0.01"
                                placeholder="0.00"
                                {...register("amount")}
                                className="h-full w-full flex-1 bg-transparent px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
                              />

                              <div className="h-6 w-px shrink-0 bg-border/40" />

                              <div className="px-4 text-xs font-bold text-muted-foreground select-none">
                                {payment.currency}
                              </div>
                            </div>
                            {errors.amount && (
                              <p className="text-[11px] font-semibold text-destructive">
                                {errors.amount.message}
                              </p>
                            )}
                          </div>

                          <CurrencyConversionPreview
                            conversion={conversion}
                            fromCurrency={payment.currency}
                          />

                          <div className="space-y-2">
                            <Label className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                              Financial Account (Paid From)
                            </Label>
                            <AccountSelect
                              control={control}
                              name="accountId"
                              accounts={accounts}
                              allowNone
                              placeholder="Select account used for payment..."
                            />
                          </div>

                          <div className="space-y-2">
                            <Label className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                              Budget Category
                            </Label>
                            <BudgetSelect
                              control={control}
                              name="budgetId"
                              budgets={budgets}
                              placeholder="Select budget category..."
                            />
                            {errors.budgetId && (
                              <p className="text-[11px] font-semibold text-destructive">
                                {errors.budgetId.message}
                              </p>
                            )}
                          </div>

                          <div className="space-y-2">
                            <Label
                              htmlFor="confirm-description"
                              className="text-xs font-bold tracking-wider text-muted-foreground uppercase"
                            >
                              Description / Notes
                            </Label>
                            <Input
                              id="confirm-description"
                              type="text"
                              placeholder="Optional notes or narration..."
                              {...register("description")}
                              className="h-12 rounded-xl border-border/60 bg-background/50"
                            />
                            {errors.description && (
                              <p className="text-[11px] font-semibold text-destructive">
                                {errors.description.message}
                              </p>
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                              <Label className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                                Date Cleared
                              </Label>
                              <Controller
                                control={control}
                                name="transactionDate"
                                render={({ field }) => (
                                  <DatePicker
                                    date={field.value}
                                    setDate={(d) => d && field.onChange(d)}
                                  />
                                )}
                              />
                            </div>

                            <div className="space-y-2">
                              <Label className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                                Effective Date
                              </Label>
                              <Controller
                                control={control}
                                name="effectiveDate"
                                render={({ field }) => (
                                  <DatePicker
                                    date={field.value}
                                    setDate={(d) => d && field.onChange(d)}
                                  />
                                )}
                              />
                            </div>
                          </div>
                        </>
                      )}
                    </form>
                  )
                })()}
            </div>

            <div className="mt-6 flex items-center gap-3 pt-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setSkipDialogOpen(true)}
                className="h-12 flex-1 cursor-pointer rounded-xl border-amber-500/30 bg-amber-500/10 text-xs font-bold text-amber-600 shadow-sm transition-all hover:bg-amber-500/20 dark:text-amber-400"
                disabled={
                  isPending || matchMutation.isPending || skipMutation.isPending
                }
              >
                {skipMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <FastForward className="mr-1.5 h-4 w-4" />
                    Skip Cycle
                  </>
                )}
              </Button>
              <Button
                type="submit"
                form="confirm-payment-form"
                className="h-12 flex-1 cursor-pointer rounded-xl bg-gradient-to-r from-primary to-accent text-xs font-bold text-white shadow-lg shadow-primary/15 transition-all hover:scale-[1.01] hover:opacity-95"
                disabled={
                  isPending || matchMutation.isPending || skipMutation.isPending
                }
              >
                {isPending || matchMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {selectedTxnId ? "Linking..." : "Clearing..."}
                  </>
                ) : selectedTxnId ? (
                  "Link & Clear Payment"
                ) : (
                  "Clear Payment"
                )}
              </Button>
            </div>
          </div>
        )}
      </SheetContent>

      <SkipPaymentDialog
        open={skipDialogOpen}
        onOpenChange={setSkipDialogOpen}
        onConfirm={handleConfirmSkip}
        isPending={skipMutation.isPending}
        amountFormatted={
          payment ? formatCents(payment.amount).toFixed(2) : undefined
        }
        currency={payment?.currency}
      />
    </Sheet>
  )
}
