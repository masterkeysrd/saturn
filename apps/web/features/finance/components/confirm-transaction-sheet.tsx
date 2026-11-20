import { useState, useMemo } from "react"
import { useForm, Controller, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useNavigate } from "react-router-dom"
import { useTimezone, useI18n } from "@saturn/hooks"
import { getLocalizedEnumLabel } from "@saturn/i18n"
import {
  ConfirmTransactionSchema,
  type ConfirmTransactionFormValues,
} from "@saturn/schemas"
import {
  useConfirmScheduledTransactionMutation,
  useMatchScheduledTransactionMutation,
  useSkipScheduledTransactionMutation,
  useListAccountsQuery,
  useListBudgetsQuery,
  useListRecurringTransactionsQuery,
  useListTransactionsQuery,
  type ScheduledTransaction,
  type Transaction,
} from "@saturn/api/gen/saturn/finance/v1/finance"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
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
  getBudgetColors,
  getBudgetIcon,
} from "../utils"

interface ConfirmTransactionSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  transaction: ScheduledTransaction | null
  refetchTransactions: () => void
  getConversionPreview: (
    amountStr: string,
    fromCurr: string
  ) =>
    | { amount: number; rate: number; currency: string }
    | { error: string }
    | null
}

export function ConfirmTransactionSheet({
  open,
  onOpenChange,
  transaction,
  refetchTransactions,
  getConversionPreview,
}: ConfirmTransactionSheetProps) {
  const navigate = useNavigate()
  const tz = useTimezone()
  const { t, language } = useI18n()

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
  const { data: recurringData } = useListRecurringTransactionsQuery(
    { pageSize: 100, pageToken: "", status: "STATUS_UNSPECIFIED" },
    { enabled: open }
  )
  const { data: transactionsData } = useListTransactionsQuery(
    { pageSize: 100, pageToken: "", budgetId: "", types: [] },
    { enabled: open }
  )

  const accounts = accountsData?.accounts || []
  const budgets = budgetsData?.budgets || []
  const recurringTemplates = useMemo(
    () => recurringData?.recurringTransactions || [],
    [recurringData?.recurringTransactions]
  )
  const transactions = transactionsData?.transactions || []

  // Filter unlinked transactions of matching type
  const unlinkedTransactions = transactions.filter(
    (t) => !t.metadata?.scheduled_transaction_id && t.type === transaction?.type
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
    const dateStr = t.transactionDate ? tz.formatDate(t.transactionDate) : ""

    return (
      vendor.includes(q) ||
      amountStr.includes(q) ||
      budgetName.includes(q) ||
      accountName.includes(q) ||
      dateStr.includes(q)
    )
  })

  // Smart Candidate Search (matching amount, currency, and date within 7 days)
  const candidateMatch = transaction
    ? unlinkedTransactions.find((t) => {
        if (
          t.amount !== transaction.amount ||
          t.currency !== transaction.currency
        )
          return false
        const tDate = new Date(t.transactionDate).getTime()
        const pDate = new Date(transaction.dueDate).getTime()
        const diffDays = Math.abs(tDate - pDate) / (1000 * 3600 * 24)
        return diffDays <= 7
      })
    : null

  const confirmMutation = useConfirmScheduledTransactionMutation()
  const matchMutation = useMatchScheduledTransactionMutation()
  const skipMutation = useSkipScheduledTransactionMutation()
  const [skipDialogOpen, setSkipDialogOpen] = useState(false)

  const handleConfirmSkip = async () => {
    if (!transaction) return
    await skipMutation.mutateAsync({
      id: transaction.id || "",
      req: { id: transaction.id || "" },
    })
    refetchTransactions()
    setSkipDialogOpen(false)
    onOpenChange(false)
  }

  const [prevTransaction, setPrevTransaction] =
    useState<typeof transaction>(null)
  if (open && transaction && transaction !== prevTransaction) {
    setPrevTransaction(transaction)
    setConfirmedTxn(null)
    if (candidateMatch) {
      setSelectedTxnId(candidateMatch.id || "")
      setAccordionOpen(true)
    } else {
      setSelectedTxnId("")
      setAccordionOpen(false)
    }
  }

  const confirmDefaultValues = useMemo<ConfirmTransactionFormValues>(() => {
    if (!transaction) {
      return {
        type: "EXPENSE",
        amount: "",
        accountId: "",
        budgetId: "",
        description: "",
        transactionDate: new Date(),
        effectiveDate: new Date(),
      }
    }
    const matchedTemplate = transaction.sourceId
      ? recurringTemplates.find((e) => e.id === transaction.sourceId)
      : null
    const metaDesc = transaction.metadata?.description || null

    const dueFormatted = new Date(transaction.dueDate)
      .toISOString()
      .slice(0, 10)
    const name =
      matchedTemplate?.name ||
      transaction.recurringTransaction?.name ||
      t("finance.recurring.confirm.scheduledFallback")
    const defaultDesc = metaDesc || `${name} (${dueFormatted})`

    return {
      type: transaction.type === "INCOME" ? "INCOME" : "EXPENSE",
      amount: formatCents(transaction.amount).toString(),
      transactionDate: new Date(),
      effectiveDate: new Date(transaction.dueDate),
      budgetId: transaction.budgetId || "",
      accountId: transaction.accountId || "",
      description: defaultDesc,
    }
  }, [transaction, recurringTemplates, t])

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<ConfirmTransactionFormValues>({
    resolver: zodResolver(ConfirmTransactionSchema),
    defaultValues: {
      type: "EXPENSE",
      amount: "",
      accountId: "",
      budgetId: "",
      description: "",
      transactionDate: new Date(),
      effectiveDate: new Date(),
    },
    values: confirmDefaultValues,
    resetOptions: { keepDirtyValues: true },
  })

  const amountValue = useWatch({ control, name: "amount" })
  const budgetIdValue = useWatch({ control, name: "budgetId" })
  const typeValue = useWatch({ control, name: "type" })

  const toLocalISODate = (d: Date): string => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const date = String(d.getDate()).padStart(2, "0")
    return `${y}-${m}-${date}T12:00:00Z`
  }

  const onSubmit = async (data: ConfirmTransactionFormValues) => {
    if (!transaction) return

    if (selectedTxnId) {
      const res = await matchMutation.mutateAsync({
        transaction_id: transaction.id || "",
        req: {
          transactionId: transaction.id || "",
          matchedTransactionId: selectedTxnId,
        },
      })
      refetchTransactions()
      setConfirmedTxn(res)
    } else {
      const centsAmount = toCentsString(data.amount)
      const txDateStr = toLocalISODate(data.transactionDate)
      const effDateStr = toLocalISODate(data.effectiveDate)

      const res = await confirmMutation.mutateAsync({
        transaction_id: transaction.id || "",
        req: {
          transactionId: transaction.id || "",
          transactionDate: txDateStr,
          effectiveDate: effDateStr,
          actualAmount: centsAmount,
          description: data.description.trim() || undefined,
          accountId: data.accountId || undefined,
          budgetId:
            data.type === "EXPENSE" ? data.budgetId || undefined : undefined,
        },
      })
      refetchTransactions()
      setConfirmedTxn(res)
    }
  }

  const isPending = confirmMutation.isPending
  const conversion = transaction
    ? getConversionPreview(amountValue, transaction.currency)
    : null

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[min(88svh,46rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
          {confirmedTxn ? (
            // Success State Screen
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex-1 space-y-6 overflow-y-auto px-6 py-8 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500 shadow-inner">
                  <CheckCircle2 className="h-8 w-8" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-bold tracking-tight text-foreground">
                    {t("finance.recurring.confirm.clearedTitle")}
                  </h3>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {t("finance.recurring.confirm.clearedDescription")}
                  </p>
                </div>

                <div className="space-y-3 rounded-xl border border-border/60 bg-background/50 p-4 text-left text-xs">
                  <div className="flex justify-between border-b border-border/40 pb-2">
                    <span className="text-muted-foreground">
                      {t("finance.recurring.confirm.transactionId")}
                    </span>
                    <span className="ml-4 text-right font-mono font-semibold break-all text-foreground select-all">
                      {confirmedTxn.id}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-border/40 pb-2">
                    <span className="text-muted-foreground">
                      {t("finance.recurring.confirm.clearedAmount")}
                    </span>
                    <span
                      className={cn(
                        "font-bold tabular-nums",
                        confirmedTxn.type === "EXPENSE"
                          ? "text-rose-500"
                          : "text-emerald-500"
                      )}
                    >
                      {confirmedTxn.type === "EXPENSE" ? "-" : "+"}
                      {formatCents(confirmedTxn.amount).toFixed(2)}{" "}
                      <span className="text-[11px] font-medium text-muted-foreground uppercase">
                        {confirmedTxn.currency}
                      </span>
                    </span>
                  </div>
                  {confirmedTxn.currency !==
                    (confirmedTxn.amountInBase ? "USD" : "") &&
                    confirmedTxn.amountInBase && (
                      <div className="flex justify-between border-b border-border/40 pb-2">
                        <span className="text-muted-foreground">
                          {t("finance.recurring.confirm.amountInBase")}
                        </span>
                        <span className="font-bold text-foreground tabular-nums">
                          {formatCents(confirmedTxn.amountInBase).toFixed(2)}{" "}
                          <span className="text-[11px] font-medium text-muted-foreground uppercase">
                            USD
                          </span>
                        </span>
                      </div>
                    )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      {t("finance.recurring.confirm.descriptionLabel")}
                    </span>
                    <span className="max-w-[200px] truncate font-semibold text-foreground">
                      {confirmedTxn.description ||
                        t("finance.recurring.confirm.scheduledFallback")}
                    </span>
                  </div>
                </div>
              </div>

              <DialogFooter className="shrink-0 grid-cols-2 border-t border-border/60 bg-card px-6 py-4 sm:justify-between">
                <Button
                  variant="outline"
                  onClick={() => {
                    onOpenChange(false)
                    navigate("/finance/transactions")
                  }}
                  className="cursor-pointer"
                >
                  {t("finance.recurring.confirm.viewTransactions")}
                </Button>
                <Button
                  onClick={() => onOpenChange(false)}
                  className="cursor-pointer"
                >
                  {t("common.done")}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            // Confirmation Form Screen
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <DialogHeader className="shrink-0 border-b border-border/60 px-6 py-4">
                <DialogTitle className="pr-8 text-lg font-semibold tracking-tight">
                  {transaction?.type === "INCOME"
                    ? t("finance.recurring.confirm.confirmIncome")
                    : t("finance.recurring.confirm.confirmPayment")}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  {transaction?.type === "INCOME"
                    ? t("finance.recurring.confirm.verifyInflow")
                    : t("finance.recurring.confirm.verifyOutflow")}
                </DialogDescription>
              </DialogHeader>

              <div className="flex-1 overflow-y-auto px-6 py-5">
                {transaction &&
                  (() => {
                    const matchedTemplate = transaction.sourceId
                      ? recurringTemplates.find(
                          (e) => e.id === transaction.sourceId
                        )
                      : null

                    const vendorFromMeta =
                      transaction.metadata?.vendorName ||
                      transaction.metadata?.description ||
                      null

                    const templateName =
                      matchedTemplate?.name ||
                      transaction.recurringTransaction?.name ||
                      vendorFromMeta ||
                      t("finance.recurring.confirm.scheduledFallback")

                    const budget =
                      transaction.budget ||
                      budgets.find(
                        (b) => b.id === (budgetIdValue || transaction.budgetId)
                      )
                    const colors = getBudgetColors(budget?.color || "indigo")
                    const Icon = getBudgetIcon(budget?.icon || "piggy-bank")

                    const intervalVal =
                      matchedTemplate?.interval ||
                      transaction.recurringTransaction?.interval
                    const intervalLabel = intervalVal
                      ? getLocalizedEnumLabel(
                          "finance",
                          "interval",
                          intervalVal,
                          language
                        )
                      : null

                    return (
                      <form
                        id="confirm-transaction-form"
                        onSubmit={handleSubmit(onSubmit)}
                        className="space-y-5"
                      >
                        {/* Rich Context Card for Scheduled Obligation */}
                        <div className="rounded-2xl border border-border/40 bg-card/40 p-4 shadow-sm backdrop-blur-md">
                          <div className="flex items-center gap-3.5">
                            <div
                              className={cn(
                                "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-xs",
                                transaction.type === "INCOME"
                                  ? "bg-emerald-500/10 text-emerald-500"
                                  : colors.bg,
                                transaction.type === "INCOME"
                                  ? "text-emerald-500"
                                  : colors.text
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
                                {transaction.type === "EXPENSE" &&
                                budget?.name ? (
                                  <span className="truncate text-[11px] font-medium text-muted-foreground">
                                    {t("finance.recurring.confirm.budgetLabel")}{" "}
                                    <span className="font-semibold text-foreground">
                                      {budget.name}
                                    </span>
                                  </span>
                                ) : (
                                  <span className="text-[11px] font-semibold tracking-wide text-emerald-500 uppercase">
                                    {t(
                                      "finance.recurring.confirm.incomeInflow"
                                    )}
                                  </span>
                                )}
                                <span className="shrink-0 font-semibold text-foreground">
                                  {t("finance.recurring.confirm.targetLabel")}{" "}
                                  {formatCents(transaction.amount).toFixed(2)}{" "}
                                  <span className="text-[10px] font-medium text-muted-foreground uppercase">
                                    {transaction.currency}
                                  </span>
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="mt-3.5 grid grid-cols-2 gap-2 border-t border-border/20 pt-3 text-xs">
                            <div className="flex flex-col gap-0.5">
                              <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                                {t("finance.recurring.confirm.sourceLabel")}
                              </span>
                              <span className="font-bold text-foreground">
                                {getLocalizedEnumLabel(
                                  "finance",
                                  "sourceType",
                                  transaction.sourceType,
                                  language
                                ) ||
                                  t(
                                    "finance.recurring.confirm.scheduledPayment"
                                  )}
                              </span>
                            </div>

                            <div className="flex flex-col gap-0.5">
                              <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                                {t("finance.recurring.confirm.dueDate")}
                              </span>
                              <span className="font-mono font-bold text-foreground">
                                {tz.formatDate(transaction.dueDate, {
                                  year: "numeric",
                                  month: "short",
                                  day: "numeric",
                                })}
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
                              <span>
                                {t("finance.recurring.confirm.linkExisting")}
                              </span>
                              {candidateMatch ? (
                                <span className="flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-500">
                                  <Sparkles className="h-3 w-3" />
                                  {t("finance.recurring.confirm.smartMatch")}
                                </span>
                              ) : (
                                <span className="text-[10px] font-normal text-muted-foreground">
                                  ({t("common.optional")})
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
                                      {t(
                                        "finance.recurring.confirm.suggestedMatch"
                                      )}
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
                                        ? t(
                                            "finance.recurring.confirm.selected"
                                          )
                                        : t(
                                            "finance.recurring.confirm.useSuggestion"
                                          )}
                                    </Button>
                                  </div>
                                  <div className="flex items-center justify-between pt-0.5 font-medium text-foreground">
                                    <span className="max-w-[200px] truncate">
                                      {candidateMatch.description ||
                                        t(
                                          "finance.recurring.confirm.bankOutflow"
                                        )}
                                    </span>
                                    <span
                                      className={cn(
                                        "font-bold",
                                        candidateMatch.type === "EXPENSE"
                                          ? "text-rose-500"
                                          : "text-emerald-500"
                                      )}
                                    >
                                      {candidateMatch.type === "EXPENSE"
                                        ? "-"
                                        : "+"}
                                      {formatCents(
                                        candidateMatch.amount
                                      ).toFixed(2)}{" "}
                                      <span className="text-[9px] font-medium text-muted-foreground uppercase">
                                        {candidateMatch.currency}
                                      </span>
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                    <span>
                                      {tz.formatDate(
                                        candidateMatch.transactionDate,
                                        {
                                          month: "short",
                                          day: "numeric",
                                        }
                                      )}
                                    </span>
                                    {candidateMatch.account && (
                                      <>
                                        <span>•</span>
                                        <span>
                                          {candidateMatch.account.name}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* Manual Search Select */}
                              <div className="space-y-1.5">
                                <Label className="text-[11px] font-semibold text-muted-foreground">
                                  {candidateMatch
                                    ? t("finance.recurring.confirm.orSearch")
                                    : t(
                                        "finance.recurring.confirm.searchRecord"
                                      )}
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
                                          return t(
                                            "finance.recurring.confirm.selectedTransaction"
                                          )
                                        const dateStr = matched.transactionDate
                                          ? tz.formatDate(
                                              matched.transactionDate,
                                              {
                                                month: "short",
                                                day: "numeric",
                                              }
                                            )
                                          : ""
                                        const amtStr = formatCents(
                                          matched.amount || "0"
                                        ).toFixed(2)
                                        return (
                                          <div className="flex w-full items-center justify-between pr-1 text-xs">
                                            <div className="flex min-w-0 items-center gap-2">
                                              <span
                                                className={cn(
                                                  "h-1.5 w-1.5 shrink-0 rounded-full",
                                                  matched.type === "EXPENSE"
                                                    ? "bg-rose-500"
                                                    : "bg-emerald-500"
                                                )}
                                              />
                                              <span className="max-w-[190px] truncate font-semibold text-foreground">
                                                {matched.description ||
                                                  t(
                                                    "finance.recurring.confirm.transactionFallback"
                                                  )}
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
                                        {t(
                                          "finance.recurring.confirm.searchPlaceholder"
                                        )}
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
                                        placeholder={t(
                                          "finance.recurring.confirm.searchHint"
                                        )}
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
                                            {t(
                                              "finance.recurring.confirm.dontLink"
                                            )}
                                          </span>
                                        </button>
                                        <Separator className="my-1 bg-border/10" />
                                        {filteredTransactions.length === 0 ? (
                                          <div className="p-4 text-center text-xs text-muted-foreground">
                                            {t(
                                              "finance.recurring.confirm.noUnlinked"
                                            )}
                                          </div>
                                        ) : (
                                          filteredTransactions.map((txn) => {
                                            const dateStr = txn.transactionDate
                                              ? tz.formatDate(
                                                  txn.transactionDate,
                                                  {
                                                    month: "short",
                                                    day: "numeric",
                                                  }
                                                )
                                              : ""
                                            const amtStr = formatCents(
                                              txn.amount || "0"
                                            ).toFixed(2)
                                            const budgetName = budgets.find(
                                              (b) => b.id === txn.budgetId
                                            )?.name
                                            const accountName = accounts.find(
                                              (a) => a.id === txn.accountId
                                            )?.name
                                            const isSelected =
                                              selectedTxnId === txn.id

                                            return (
                                              <button
                                                key={txn.id}
                                                type="button"
                                                className={cn(
                                                  "flex w-full cursor-pointer items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs transition-colors",
                                                  isSelected
                                                    ? "bg-primary/10 font-semibold text-primary"
                                                    : "text-foreground hover:bg-muted/10"
                                                )}
                                                onClick={() => {
                                                  setSelectedTxnId(txn.id || "")
                                                  setPopoverOpen(false)
                                                }}
                                              >
                                                <div className="flex min-w-0 flex-col gap-0.5 pr-2">
                                                  <div className="flex items-center gap-1.5">
                                                    <span
                                                      className={cn(
                                                        "h-1.5 w-1.5 shrink-0 rounded-full",
                                                        txn.type === "EXPENSE"
                                                          ? "bg-rose-500"
                                                          : "bg-emerald-500"
                                                      )}
                                                    />
                                                    <span className="truncate font-bold text-foreground">
                                                      {txn.description ||
                                                        t(
                                                          "finance.recurring.confirm.transactionFallback"
                                                        )}
                                                    </span>
                                                  </div>
                                                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                                                    <span>{dateStr}</span>
                                                    {accountName && (
                                                      <>
                                                        <span>•</span>
                                                        <span>
                                                          {accountName}
                                                        </span>
                                                      </>
                                                    )}
                                                    {txn.type === "EXPENSE" &&
                                                      budgetName && (
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
                                                  {amtStr} {txn.currency}
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
                                {t("finance.recurring.confirm.amountCleared")}
                              </Label>
                              <div className="flex h-10 items-center overflow-hidden rounded-lg border border-border bg-control shadow-2xs transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40">
                                <input
                                  id="actualAmount"
                                  type="number"
                                  step="0.01"
                                  min="0.01"
                                  placeholder="0.00"
                                  {...register("amount")}
                                  className="h-full w-full flex-1 bg-transparent px-3 py-1.5 font-mono text-sm font-semibold text-foreground tabular-nums placeholder:text-muted-foreground focus:outline-none"
                                />

                                <div className="h-5 w-px shrink-0 bg-border/70" />

                                <div className="px-3 font-mono text-xs font-medium text-muted-foreground select-none">
                                  {transaction.currency}
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
                              fromCurrency={transaction.currency}
                            />

                            <div className="space-y-2">
                              <Label className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                                {t(
                                  "finance.recurring.confirm.financialAccount"
                                )}
                              </Label>
                              <AccountSelect
                                control={control}
                                name="accountId"
                                accounts={accounts}
                                allowNone
                                placeholder={t(
                                  "finance.recurring.confirm.accountPlaceholder"
                                )}
                              />
                            </div>

                            {typeValue === "EXPENSE" && (
                              <div className="space-y-2">
                                <Label className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                                  {t(
                                    "finance.recurring.confirm.budgetCategory"
                                  )}
                                </Label>
                                <BudgetSelect
                                  control={control}
                                  name="budgetId"
                                  budgets={budgets}
                                  placeholder={t(
                                    "finance.recurring.confirm.budgetPlaceholder"
                                  )}
                                />
                                {errors.budgetId && (
                                  <p className="text-[11px] font-semibold text-destructive">
                                    {errors.budgetId.message}
                                  </p>
                                )}
                              </div>
                            )}

                            <div className="space-y-2">
                              <Label
                                htmlFor="confirm-description"
                                className="text-xs font-bold tracking-wider text-muted-foreground uppercase"
                              >
                                {t(
                                  "finance.recurring.confirm.descriptionNotes"
                                )}
                              </Label>
                              <Input
                                id="confirm-description"
                                type="text"
                                placeholder={t(
                                  "finance.recurring.confirm.notesPlaceholder"
                                )}
                                {...register("description")}
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
                                  {t("finance.recurring.confirm.dateCleared")}
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
                                  {t("finance.recurring.confirm.effectiveDate")}
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

              <DialogFooter className="shrink-0 flex-row items-center justify-between gap-2 border-t border-border/60 bg-card px-6 py-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSkipDialogOpen(true)}
                  className="cursor-pointer border-amber-500/30 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 dark:text-amber-400"
                  disabled={
                    isPending ||
                    matchMutation.isPending ||
                    skipMutation.isPending
                  }
                >
                  {skipMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <FastForward className="mr-1.5 h-4 w-4" />
                      {t("finance.recurring.skipCycle")}
                    </>
                  )}
                </Button>
                <Button
                  type="submit"
                  form="confirm-transaction-form"
                  className="cursor-pointer"
                  disabled={
                    isPending ||
                    matchMutation.isPending ||
                    skipMutation.isPending
                  }
                >
                  {isPending || matchMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {selectedTxnId
                        ? t("finance.recurring.confirm.linking")
                        : t("finance.recurring.confirm.clearing")}
                    </>
                  ) : selectedTxnId ? (
                    t("finance.recurring.confirm.linkAndClear")
                  ) : transaction?.type === "INCOME" ? (
                    t("finance.recurring.confirm.clearIncomeInflow")
                  ) : (
                    t("finance.recurring.confirm.clearPayment")
                  )}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <SkipPaymentDialog
        open={skipDialogOpen}
        onOpenChange={setSkipDialogOpen}
        onConfirm={handleConfirmSkip}
        isPending={skipMutation.isPending}
        paymentName={
          transaction
            ? transaction.recurringTransaction?.name ||
              t("finance.recurring.confirm.scheduledFallback")
            : ""
        }
        amountFormatted={
          transaction ? formatCents(transaction.amount).toFixed(2) : undefined
        }
        currency={transaction?.currency}
      />
    </>
  )
}
