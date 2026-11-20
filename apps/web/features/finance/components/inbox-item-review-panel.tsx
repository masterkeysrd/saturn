import { useState, useMemo } from "react"
import { Link } from "react-router-dom"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { InboxReviewSchema, type InboxReviewFormValues } from "@saturn/schemas"
import { useActiveSpaceContext } from "@/features/space/use-space"
import { useI18n, useTimezone } from "@saturn/hooks"
import type {
  InboxItem,
  Account,
  Budget,
  ScheduledTransaction,
  Borrowing,
  Transaction,
} from "@saturn/api/gen/saturn/finance/v1/finance"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { AccountSelect } from "./account-select"
import { BudgetSelect } from "./budget-select"
import { FormSelect } from "@/components/ui/form-select"
import { formatCents, decodeBase64Utf8, formatSourceType } from "../utils"
import { cn } from "@/lib/utils"
import {
  Check,
  Trash2,
  Calendar,
  Loader2,
  Mail,
  Sparkles,
  ChevronDown,
  ChevronUp,
  FileText,
  AlertTriangle,
  ArrowLeftRight,
  ShieldCheck,
  CheckCircle2,
} from "lucide-react"

const VALID_DOC_TYPES = [
  "RECEIPT",
  "INVOICE",
  "BANK_NOTIFICATION",
  "SYSTEM_VERIFICATION",
]

const VALID_TXN_TYPES = ["EXPENSE", "INCOME", "TRANSFER"]

interface InboxItemReviewPanelProps {
  selectedItem: InboxItem
  accounts: Account[]
  budgets: Budget[]
  payments: ScheduledTransaction[]
  borrowings: Borrowing[]
  transactions: Transaction[]
  onApprove: (tx: InboxItem, values: InboxReviewFormValues) => Promise<void>
  onDiscard: (id: string) => Promise<void>
  onSkip: () => void
  isPending: boolean
  isDiscarding: boolean
  hasMore: boolean
  error: string | null
}

export function InboxItemReviewPanel({
  selectedItem,
  accounts,
  budgets,
  payments,
  borrowings,
  transactions,
  onApprove,
  onDiscard,
  onSkip,
  isPending,
  isDiscarding,
  hasMore,
  error,
}: InboxItemReviewPanelProps) {
  const { spaceId } = useActiveSpaceContext()
  const tz = useTimezone()
  const { t } = useI18n()

  const docTypeItems = useMemo(
    () => [
      {
        value: "RECEIPT",
        label: t("finance.inbox.docTypes.receiptDetailed"),
      },
      {
        value: "INVOICE",
        label: t("finance.inbox.docTypes.invoiceDetailed"),
      },
      {
        value: "BANK_NOTIFICATION",
        label: t("finance.inbox.docTypes.notificationDetailed"),
      },
      {
        value: "SYSTEM_VERIFICATION",
        label: t("finance.inbox.docTypes.systemVerificationDetailed"),
      },
    ],
    [t]
  )

  const txnTypeItems = useMemo(
    () => [
      {
        value: "EXPENSE",
        label: t("finance.inbox.transactionTypes.expense"),
      },
      {
        value: "INCOME",
        label: t("finance.inbox.transactionTypes.income"),
      },
      {
        value: "TRANSFER",
        label: t("finance.inbox.transactionTypes.transfer"),
      },
    ],
    [t]
  )
  const [nowTime] = useState(() => Date.now())
  const [rawOpen, setRawOpen] = useState(false)
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [txSearch, setTxSearch] = useState("")

  const [billPopoverOpen, setBillPopoverOpen] = useState(false)
  const [billSearch, setBillSearch] = useState("")

  const [borrowingPopoverOpen, setBorrowingPopoverOpen] = useState(false)
  const [borrowingSearch, setBorrowingSearch] = useState("")

  let meta: {
    duplicate_reason?: string
    potential_duplicate_id?: string
    suggested_borrowing_id?: string
    transaction_type?: string
  } = {}
  if (selectedItem.metadata) {
    meta = selectedItem.metadata as typeof meta
  }

  // Calculate candidate match for existing transactions
  const candidateTxMatch = useMemo(() => {
    if (!transactions || transactions.length === 0) return null

    if (meta.potential_duplicate_id) {
      const match = transactions.find(
        (t) => t.id === meta.potential_duplicate_id
      )
      if (match) return match
    }

    const vendorLower = (selectedItem.vendorName || "").toLowerCase().trim()
    const stagedAmtCents = Number(selectedItem.amount || 0)

    for (const t of transactions) {
      const descLower = (t.description || "").toLowerCase().trim()
      const tAmtCents = Number(t.amount || 0)

      const nameMatched =
        vendorLower &&
        descLower &&
        (vendorLower.includes(descLower) || descLower.includes(vendorLower))

      const amtMatched = stagedAmtCents > 0 && tAmtCents === stagedAmtCents

      if (nameMatched || amtMatched) {
        return t
      }
    }

    return null
  }, [transactions, meta.potential_duplicate_id, selectedItem])

  // Calculate candidate match for borrowing / debt
  const suggestedBorrowing = useMemo(() => {
    if (!borrowings || borrowings.length === 0) return null

    if (meta.suggested_borrowing_id) {
      const match = borrowings.find((b) => b.id === meta.suggested_borrowing_id)
      if (match) return match
    }

    const vendorLower = (selectedItem.vendorName || "").toLowerCase().trim()
    const stagedAmtCents = Number(selectedItem.amount || 0)

    for (const b of borrowings) {
      const counterpartyLower = (b.counterparty || "").toLowerCase()

      const nameMatched =
        vendorLower &&
        counterpartyLower &&
        (vendorLower.includes(counterpartyLower) ||
          counterpartyLower.includes(vendorLower))

      const remCents = Number(b.remainingAmount || 0)
      const amtRatio =
        stagedAmtCents > 0 && remCents > 0 ? stagedAmtCents / remCents : 0
      const amtMatched = amtRatio >= 0.85 && amtRatio <= 1.15

      if (nameMatched || amtMatched) {
        return b
      }
    }

    return null
  }, [borrowings, meta.suggested_borrowing_id, selectedItem])

  // Calculate candidate match for scheduled bill
  const suggestedBill = useMemo(() => {
    if (!payments || payments.length === 0) return null

    if (selectedItem.scheduledTransactionId) {
      const match = payments.find(
        (p) => p.id === selectedItem.scheduledTransactionId
      )
      if (match) return match
    }

    const itemMeta = selectedItem.metadata || {}
    const docTxnType = (itemMeta.transaction_type || "EXPENSE").toUpperCase()

    const vendorLower = (selectedItem.vendorName || "").toLowerCase().trim()
    const stagedAmtCents = Number(selectedItem.amount || 0)

    for (const p of payments) {
      if (p.type !== docTxnType) continue
      const pAmtCents = Number(p.amount || 0)
      const budget = budgets.find((b) => b.id === p.budgetId)
      const budgetNameLower = (budget?.name || "").toLowerCase()

      const nameMatched =
        vendorLower &&
        budgetNameLower &&
        (vendorLower.includes(budgetNameLower) ||
          budgetNameLower.includes(vendorLower))

      const amtRatio =
        stagedAmtCents > 0 && pAmtCents > 0 ? stagedAmtCents / pAmtCents : 0
      const amtMatched = amtRatio >= 0.85 && amtRatio <= 1.15

      if (nameMatched || amtMatched) {
        return p
      }
    }

    return null
  }, [payments, budgets, selectedItem])

  const decodedRawText = useMemo(() => {
    return (
      decodeBase64Utf8(selectedItem.rawPayload || "") ||
      selectedItem.rawPayload ||
      ""
    )
  }, [selectedItem.rawPayload])

  const inboxReviewDefaultValues = useMemo<InboxReviewFormValues>(() => {
    let itemMeta: {
      transaction_type?: string
      suggested_borrowing_id?: string
      potential_duplicate_id?: string
      destination_account_id?: string
      suggested_transfer_leg?: string
    } = {}
    if (selectedItem.metadata) {
      itemMeta = selectedItem.metadata as typeof itemMeta
    }

    const docTypeVal = (
      selectedItem.docType || "RECEIPT"
    ).toUpperCase() as InboxReviewFormValues["docType"]

    const txnTypeVal = (
      itemMeta.transaction_type || "EXPENSE"
    ).toUpperCase() as InboxReviewFormValues["transactionType"]
    const initialScheduledTransactionId =
      selectedItem.scheduledTransactionId ||
      (suggestedBill ? suggestedBill.id || "" : "")
    const initialBorrowingId =
      itemMeta.suggested_borrowing_id ||
      (suggestedBorrowing ? suggestedBorrowing.id || "" : "")

    return {
      selectedTxId: itemMeta.potential_duplicate_id || "",
      overwriteLinkedTx: false,
      docType: VALID_DOC_TYPES.includes(docTypeVal) ? docTypeVal : "RECEIPT",
      transactionType: VALID_TXN_TYPES.includes(txnTypeVal)
        ? txnTypeVal
        : "EXPENSE",
      description: selectedItem.vendorName || "",
      amountStr: (Number(selectedItem.amount || 0) / 100).toFixed(2),
      currency: selectedItem.currency || "USD",
      accountId: selectedItem.accountId || "",
      destinationAccountId: itemMeta.destination_account_id || "",
      transferLeg:
        (itemMeta.suggested_transfer_leg as "SOURCE" | "DESTINATION") ||
        "SOURCE",
      budgetId: selectedItem.budgetId || "",
      scheduledTransactionId: initialScheduledTransactionId,
      borrowingId: initialBorrowingId,
    }
  }, [selectedItem, suggestedBill, suggestedBorrowing])

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<InboxReviewFormValues>({
    resolver: zodResolver(InboxReviewSchema),
    defaultValues: {
      selectedTxId: "",
      overwriteLinkedTx: false,
      docType: "RECEIPT",
      transactionType: "EXPENSE",
      description: "",
      amountStr: "",
      currency: "USD",
      accountId: "",
      destinationAccountId: "",
      transferLeg: "SOURCE",
      budgetId: "",
      scheduledTransactionId: "",
      borrowingId: "",
    },
    values: inboxReviewDefaultValues,
    resetOptions: { keepDirtyValues: true },
  })

  const currentTxnType = useWatch({ control, name: "transactionType" })

  const currentScheduledTransactionId = useWatch({
    control,
    name: "scheduledTransactionId",
  })

  const filteredPayments = useMemo(() => {
    const matchedTypePayments = payments.filter((p) => {
      return p.type === currentTxnType
    })

    const q = billSearch.toLowerCase().trim()
    if (!q) return matchedTypePayments

    return matchedTypePayments.filter((p) => {
      const budget = budgets.find((b) => b.id === p.budgetId)
      const budgetName = (budget?.name || "").toLowerCase()
      const amtStr = (Number(p.amount || 0) / 100).toFixed(2)
      const dateStr = p.dueDate ? tz.formatDate(p.dueDate).toLowerCase() : ""
      const sourceType = (p.sourceType || "").toLowerCase()

      return (
        budgetName.includes(q) ||
        amtStr.includes(q) ||
        dateStr.includes(q) ||
        sourceType.includes(q)
      )
    })
  }, [payments, budgets, billSearch, currentTxnType, tz])

  const currentBorrowingId = useWatch({ control, name: "borrowingId" })
  const currentBorrowingLinkType = useWatch({
    control,
    name: "borrowingLinkType",
  })

  const filteredBorrowings = useMemo(() => {
    const q = borrowingSearch.toLowerCase().trim()
    if (!q) return borrowings

    return borrowings.filter((b) => {
      const counterparty = (b.counterparty || "").toLowerCase()
      const remAmtStr = (Number(b.remainingAmount || 0) / 100).toFixed(2)
      const totalAmtStr = (Number(b.totalAmount || 0) / 100).toFixed(2)
      const direction = (b.direction || "").toLowerCase()

      return (
        counterparty.includes(q) ||
        remAmtStr.includes(q) ||
        totalAmtStr.includes(q) ||
        direction.includes(q)
      )
    })
  }, [borrowings, borrowingSearch])

  const selectedTxId = useWatch({ control, name: "selectedTxId" })
  const overwriteLinkedTx = useWatch({ control, name: "overwriteLinkedTx" })
  const currentDocType = useWatch({ control, name: "docType" })
  const isVerificationItem = currentDocType === "SYSTEM_VERIFICATION"

  const systemVerificationInfo = useMemo(() => {
    if (!isVerificationItem) return null

    const codeMatch = decodedRawText.match(
      /(?:confirmation code|code):\s*([0-9a-zA-Z]+)/i
    )
    const autoVerified = decodedRawText.includes(
      "Auto-Verification: Successfully fetched"
    )

    return {
      code: codeMatch ? codeMatch[1] : null,
      autoVerified,
    }
  }, [decodedRawText, isVerificationItem])
  const transferLeg = useWatch({ control, name: "transferLeg" })
  const scheduledTransactionIdVal = useWatch({
    control,
    name: "scheduledTransactionId",
  })
  const hasScheduledBill = !!scheduledTransactionIdVal
  const isLinking = !!(selectedTxId && selectedTxId !== "none")

  const matchedTransaction = useMemo(() => {
    if (!selectedTxId || selectedTxId === "none") return null
    return transactions.find((t) => t.id === selectedTxId) || null
  }, [transactions, selectedTxId])

  const isMatchedAlreadyScheduled = useMemo(() => {
    if (!matchedTransaction) return false
    return Boolean(matchedTransaction.metadata?.scheduled_transaction_id)
  }, [matchedTransaction])

  const isMatchedAlreadyBorrowing = useMemo(() => {
    if (!matchedTransaction) return false
    return Boolean(matchedTransaction.metadata?.borrowing_id)
  }, [matchedTransaction])

  const showScheduledPaymentSection =
    (currentTxnType === "EXPENSE" || currentTxnType === "INCOME") &&
    (!isLinking || !isMatchedAlreadyScheduled)
  const showBorrowingSection =
    currentTxnType === "EXPENSE" && (!isLinking || !isMatchedAlreadyBorrowing)

  const dupTx = meta.potential_duplicate_id
    ? transactions.find((t) => t.id === meta.potential_duplicate_id)
    : null

  const filteredTransactions = transactions.filter((t) => {
    const q = txSearch.toLowerCase().trim()
    if (!q) return true
    const vendor = (t.description || "").toLowerCase()
    const amountStr = (Number(t.amount || 0) / 100).toFixed(2)
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

  const onSubmit = async (values: InboxReviewFormValues) => {
    await onApprove(selectedItem, values)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Card className="flex flex-col gap-6 rounded-3xl border border-border/40 bg-card/40 p-6 shadow-xl backdrop-blur-xl md:p-8">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              {selectedItem.flowRunId ? (
                <Sparkles className="h-6 w-6" />
              ) : (
                <FileText className="h-6 w-6" />
              )}
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                  {selectedItem.flowRunId ? "Workflow Run" : "Manual Upload"}
                </span>
                {selectedItem.flowRunId && spaceId && (
                  <Link
                    to={`/space/${spaceId}/workflows/runs/${selectedItem.flowRunId}`}
                    className="font-mono text-[11px] font-semibold text-primary hover:underline"
                  >
                    {selectedItem.flowRunId}
                  </Link>
                )}
              </div>
              <h3 className="text-lg font-bold text-foreground">
                {selectedItem.vendorName || "Staged Document"}
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="rounded-full border border-border/50 bg-background/50 px-3 py-1 text-xs font-semibold text-muted-foreground uppercase">
              {currentDocType}
            </span>
          </div>
        </div>

        {/* Metadata Details Bar */}
        <div className="grid grid-cols-2 gap-4 rounded-2xl border border-border/30 bg-background/30 p-4 text-xs sm:grid-cols-4">
          <div>
            <span className="block text-[10px] font-bold text-muted-foreground uppercase">
              Received Date
            </span>
            <span className="font-semibold text-foreground">
              {selectedItem.transactionDate
                ? tz.formatDate(selectedItem.transactionDate)
                : "N/A"}
            </span>
          </div>
          <div>
            <span className="block text-[10px] font-bold text-muted-foreground uppercase">
              {t("finance.inbox.reviewPanel.extractedAmount")}
            </span>
            <span className="font-bold text-foreground">
              {isVerificationItem ? (
                <span className="text-xs text-muted-foreground italic">
                  {t("finance.inbox.reviewPanel.systemEmail")}
                </span>
              ) : (
                <>
                  {formatCents(selectedItem.amount || "0")}{" "}
                  <span className="text-[10px] text-muted-foreground uppercase">
                    {selectedItem.currency || "USD"}
                  </span>
                </>
              )}
            </span>
          </div>
          <div>
            <span className="block text-[10px] font-bold text-muted-foreground uppercase">
              {t("finance.inbox.reviewPanel.documentId")}
            </span>
            <span className="block truncate font-mono text-[11px] text-muted-foreground">
              {selectedItem.id}
            </span>
          </div>
          <div>
            <span className="block text-[10px] font-bold text-muted-foreground uppercase">
              {t("finance.inbox.reviewPanel.confidenceScore")}
            </span>
            <span className="flex items-center gap-1 font-semibold text-emerald-400">
              <Sparkles className="h-3 w-3" />{" "}
              {t("finance.inbox.reviewPanel.highMatch")}
            </span>
          </div>
        </div>

        {/* System Verification Notice Banner */}
        {systemVerificationInfo && (
          <div className="flex animate-in gap-3 rounded-2xl border border-indigo-500/30 bg-indigo-500/10 p-4 text-xs leading-relaxed text-indigo-300 duration-300 fade-in">
            <ShieldCheck className="h-5 w-5 shrink-0 text-indigo-400" />
            <div className="flex-grow space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-foreground">
                  {t("finance.inbox.reviewPanel.forwardingNotice")}
                </span>
                {systemVerificationInfo.autoVerified && (
                  <span className="flex items-center gap-1 rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[10px] font-extrabold text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" />{" "}
                    {t("finance.inbox.reviewPanel.autoConfirmed")}
                  </span>
                )}
              </div>
              <p className="text-muted-foreground">
                {t("finance.inbox.reviewPanel.forwardingNoticeHelp")}
              </p>
              {systemVerificationInfo.code && (
                <div className="mt-2 inline-flex items-center gap-2 rounded-xl border border-indigo-500/30 bg-background/60 px-3 py-1.5 font-mono text-xs text-indigo-300">
                  <span>{t("finance.inbox.reviewPanel.confirmationCode")}</span>
                  <span className="font-bold tracking-wider text-foreground select-all">
                    {systemVerificationInfo.code}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Accordion Raw Payload */}
        {selectedItem.rawPayload && (
          <div className="overflow-hidden rounded-2xl border border-border/30 bg-muted/20">
            <button
              type="button"
              className="flex w-full cursor-pointer items-center justify-between px-4 py-3 text-sm font-bold text-muted-foreground transition-colors hover:bg-muted/40"
              onClick={() => setRawOpen(!rawOpen)}
            >
              <span className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-indigo-400" />
                {t("finance.inbox.reviewPanel.viewOriginalEmail")}
              </span>
              {rawOpen ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
            {rawOpen && (
              <div className="max-h-60 overflow-y-auto border-t border-border/20 bg-background/50 p-4 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
                {decodeBase64Utf8(selectedItem.rawPayload) ||
                  selectedItem.rawPayload}
              </div>
            )}
          </div>
        )}

        {/* Duplicate Warning */}
        {meta.duplicate_reason && (
          <div className="flex animate-in gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs leading-relaxed text-amber-500 duration-300 fade-in">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
            <div className="flex-grow">
              <span className="block font-bold">
                {t("finance.inbox.reviewPanel.duplicateWarning")}
              </span>
              <span className="mt-0.5 block text-muted-foreground">
                {meta.duplicate_reason}
              </span>
              {dupTx && (
                <div className="mt-3 rounded-xl border border-amber-500/10 bg-amber-500/10 p-3 text-amber-600 dark:text-amber-400">
                  <span className="block font-semibold">
                    {t("finance.inbox.reviewPanel.suggestedMatch")}
                  </span>
                  <div className="mt-1 grid grid-cols-2 gap-1 text-[11px]">
                    <div>
                      <span className="text-muted-foreground">
                        {t("finance.transactions.inspector.transactionDate")}:
                      </span>{" "}
                      {dupTx.transactionDate
                        ? tz.formatDate(dupTx.transactionDate)
                        : t("finance.transactions.scheduled.notAvailable")}
                    </div>
                    <div>
                      <span className="text-muted-foreground">
                        {t("finance.transactions.expenseForm.amountLabel")}:
                      </span>{" "}
                      {dupTx.currency}{" "}
                      {(Number(dupTx.amount || 0) / 100).toFixed(2)}
                    </div>
                    <div className="col-span-2">
                      <span className="text-muted-foreground">
                        {t("finance.transactions.inspector.account")}:
                      </span>{" "}
                      {dupTx.description ||
                        t("finance.transactions.noDescription")}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <Separator className="bg-border/20" />

        {/* Document Classification Selector - Always visible */}
        <div className="grid grid-cols-1 gap-x-6 gap-y-3.5 md:grid-cols-2">
          <FormSelect
            control={control}
            name="docType"
            label={t("finance.inbox.reviewPanel.documentClassification")}
            items={docTypeItems}
          />
        </div>

        {/* Form Fields - Hidden for System Verification Emails */}
        {!isVerificationItem && (
          <div className="grid grid-cols-1 gap-x-6 gap-y-3.5 md:grid-cols-2">
            {/* Link to Existing Transaction Popover */}
            <div className="space-y-2 md:col-span-2">
              <Label className="flex items-center gap-1.5 text-xs font-bold tracking-wider text-muted-foreground uppercase">
                <ArrowLeftRight className="h-3.5 w-3.5" />
                {t("finance.inbox.reviewPanel.linkExistingTransaction")}
              </Label>

              <Popover
                open={popoverOpen}
                onOpenChange={setPopoverOpen}
                modal={false}
              >
                <PopoverTrigger className="flex h-10 w-full cursor-pointer items-center justify-between rounded-xl border border-border/60 bg-background/40 px-3 text-left font-normal text-foreground hover:bg-background/50 focus:ring-1 focus:ring-ring">
                  {selectedTxId && selectedTxId !== "none" ? (
                    (() => {
                      const matched = transactions.find(
                        (t) => t.id === selectedTxId
                      )
                      if (!matched)
                        return t(
                          "finance.inbox.reviewPanel.selectedTransaction"
                        )
                      const dateStr = matched.transactionDate
                        ? tz.formatDate(matched.transactionDate)
                        : ""
                      const amtStr = formatCents(matched.amount || "0")
                      return (
                        <div className="flex w-full items-center justify-between pr-1 text-xs">
                          <div className="flex min-w-0 items-center gap-2">
                            <span
                              className={cn(
                                "h-1.5 w-1.5 shrink-0 rounded-full",
                                matched.type === "INCOME"
                                  ? "bg-emerald-500"
                                  : "bg-rose-500"
                              )}
                            />
                            <span className="max-w-[150px] truncate font-semibold text-foreground sm:max-w-[200px]">
                              {matched.description ||
                                t("finance.transactions.noDescription")}
                            </span>
                            <span className="shrink-0 text-[10px] text-muted-foreground">
                              ({dateStr})
                            </span>
                          </div>
                          <span className="shrink-0 pl-2 font-bold text-foreground">
                            {amtStr} {matched.currency}
                          </span>
                        </div>
                      )
                    })()
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {t(
                        "finance.inbox.reviewPanel.selectTransactionPlaceholder"
                      )}
                    </span>
                  )}
                  <ChevronDown className="h-4 w-4 shrink-0 pl-1 opacity-50" />
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  className="flex w-[var(--anchor-width)] min-w-[320px] flex-col gap-2 rounded-2xl border border-border/50 bg-card/95 p-2 shadow-2xl backdrop-blur-xl"
                >
                  <Input
                    placeholder={t(
                      "finance.inbox.reviewPanel.searchTransactionsPlaceholder"
                    )}
                    className="h-9 rounded-xl border-border/50 bg-background/50 text-xs focus-visible:ring-ring"
                    value={txSearch}
                    onChange={(e) => setTxSearch(e.target.value)}
                    autoFocus
                  />
                  <ScrollArea className="h-60">
                    <div className="flex flex-col gap-1 pr-1">
                      <button
                        type="button"
                        className="flex w-full cursor-pointer items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs text-rose-400 transition-colors hover:bg-rose-500/10"
                        onClick={() => {
                          setValue("selectedTxId", "none", {
                            shouldValidate: true,
                          })
                          setPopoverOpen(false)
                        }}
                      >
                        <span>
                          {t("finance.inbox.reviewPanel.noneCreateNew")}
                        </span>
                      </button>
                      <Separator className="my-1 bg-border/10" />
                      {filteredTransactions.length === 0 ? (
                        <div className="p-4 text-center text-xs text-muted-foreground">
                          {t(
                            "finance.inbox.reviewPanel.noMatchingTransactions"
                          )}
                        </div>
                      ) : (
                        filteredTransactions.map((txItem) => {
                          const isSelected = selectedTxId === txItem.id
                          const isIncome = txItem.type === "INCOME"
                          const formattedDate = txItem.transactionDate
                            ? tz.formatDate(txItem.transactionDate)
                            : ""
                          const budgetName = budgets.find(
                            (b) => b.id === txItem.budgetId
                          )?.name
                          const accountName = accounts.find(
                            (a) => a.id === txItem.accountId
                          )?.name

                          return (
                            <button
                              key={txItem.id}
                              type="button"
                              className={cn(
                                "flex w-full cursor-pointer items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs transition-colors",
                                isSelected
                                  ? "border border-primary/30 bg-primary/10 font-semibold text-primary"
                                  : "text-foreground hover:bg-muted/10"
                              )}
                              onClick={() => {
                                setValue("selectedTxId", txItem.id || "", {
                                  shouldValidate: true,
                                })
                                setPopoverOpen(false)
                              }}
                            >
                              <div className="flex min-w-0 flex-col gap-0.5">
                                <div className="flex items-center gap-1.5 truncate pr-2 font-semibold text-foreground">
                                  <span
                                    className={cn(
                                      "h-1.5 w-1.5 shrink-0 rounded-full",
                                      isIncome
                                        ? "bg-emerald-500"
                                        : "bg-rose-500"
                                    )}
                                  />
                                  <span className="truncate">
                                    {txItem.description ||
                                      t("finance.transactions.noDescription")}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                  <span>{formattedDate}</span>
                                  {budgetName && (
                                    <>
                                      <span>•</span>
                                      <span>{budgetName}</span>
                                    </>
                                  )}
                                  {accountName && (
                                    <>
                                      <span>•</span>
                                      <span>{accountName}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                              <div className="flex shrink-0 flex-col items-end gap-0.5 pl-2 text-right">
                                <span className="font-bold text-foreground">
                                  {formatCents(txItem.amount || "0")}{" "}
                                  {txItem.currency}
                                </span>
                              </div>
                            </button>
                          )
                        })
                      )}
                    </div>
                  </ScrollArea>
                </PopoverContent>
              </Popover>

              {candidateTxMatch && (
                <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-blue-500/20 bg-blue-500/10 px-3 py-2 text-xs">
                  <div className="flex min-w-0 items-center gap-2 text-blue-300">
                    <Sparkles className="h-3.5 w-3.5 shrink-0 animate-pulse text-blue-400" />
                    <span className="shrink-0 font-semibold">
                      {t("finance.inbox.reviewPanel.suggestedMatch")}
                    </span>
                    <span className="max-w-[150px] truncate font-bold">
                      {candidateTxMatch.description ||
                        t("finance.transactions.transaction")}
                    </span>
                    <span className="shrink-0 text-[11px]">
                      ({candidateTxMatch.currency}{" "}
                      {formatCents(candidateTxMatch.amount).toLocaleString(
                        undefined,
                        {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        }
                      )}
                      )
                    </span>
                  </div>
                  {selectedTxId !== candidateTxMatch.id ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 shrink-0 cursor-pointer rounded-lg border-blue-500/30 px-2 text-[10px] font-bold text-blue-300 hover:bg-blue-500/20"
                      onClick={() =>
                        setValue("selectedTxId", candidateTxMatch.id || "", {
                          shouldValidate: true,
                        })
                      }
                    >
                      {t("finance.inbox.actions.linkMatch")}
                    </Button>
                  ) : (
                    <span className="flex shrink-0 items-center gap-1 text-[10px] font-bold tracking-wider text-emerald-400 uppercase">
                      <Check className="h-3 w-3" />{" "}
                      {t("finance.inbox.actions.linked")}
                    </span>
                  )}
                </div>
              )}

              {/* Mismatch Alert & Overwrite controls */}
              {(() => {
                if (!selectedTxId || selectedTxId === "none") return null
                const matched = transactions.find((t) => t.id === selectedTxId)
                if (!matched) return null

                const hasAmountMismatch =
                  Number(matched.amount) !== Number(selectedItem.amount)
                const hasCurrencyMismatch =
                  matched.currency !== selectedItem.currency
                if (!hasAmountMismatch && !hasCurrencyMismatch) return null

                const stagingAmt = formatCents(
                  selectedItem.amount?.toString() || "0"
                )
                const ledgerAmt = formatCents(matched.amount?.toString() || "0")

                return (
                  <div className="mt-2.5 flex animate-in flex-col gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3 duration-200 fade-in md:col-span-2">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-4.5 w-4.5 shrink-0 text-amber-500" />
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-xs font-bold text-amber-400">
                          {t("finance.inbox.reviewPanel.duplicateDetected")}
                        </span>
                        <p className="text-[11px] leading-normal text-muted-foreground">
                          {t("finance.inbox.reviewPanel.duplicateMismatchHelp")}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 rounded-xl border border-border/20 bg-background/30 p-2.5 text-xs">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[9px] font-semibold tracking-wider text-muted-foreground uppercase">
                          {t("finance.inbox.reviewPanel.stagedReceipt")}
                        </span>
                        <span className="font-bold text-foreground">
                          {stagingAmt} {selectedItem.currency}
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5 border-l border-border/10 pl-3">
                        <span className="text-[9px] font-semibold tracking-wider text-muted-foreground uppercase">
                          {t("finance.inbox.reviewPanel.ledgerEntry")}
                        </span>
                        <span className="font-bold text-foreground">
                          {ledgerAmt} {matched.currency}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <span className="text-[9px] font-bold tracking-wider text-muted-foreground uppercase">
                        {t("finance.inbox.reviewPanel.reconciliationAction")}
                      </span>
                      <RadioGroup
                        value={overwriteLinkedTx ? "overwrite" : "keep"}
                        onValueChange={(val) => {
                          const isOverwrite = val === "overwrite"
                          setValue("overwriteLinkedTx", isOverwrite)
                          if (matched) {
                            if (isOverwrite) {
                              setValue(
                                "amountStr",
                                (
                                  Number(selectedItem.amount || 0) / 100
                                ).toFixed(2)
                              )
                              setValue(
                                "description",
                                selectedItem.vendorName || ""
                              )
                            } else {
                              setValue(
                                "amountStr",
                                (Number(matched.amount || 0) / 100).toFixed(2)
                              )
                              setValue("description", matched.description || "")
                            }
                          }
                        }}
                      >
                        <label
                          htmlFor="reconcile-keep"
                          className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-transparent p-2 transition-colors select-none hover:bg-background/25"
                        >
                          <RadioGroupItem
                            value="keep"
                            id="reconcile-keep"
                            className="mt-0.5"
                          />
                          <div className="flex flex-col">
                            <span className="text-xs font-semibold text-foreground">
                              {t("finance.inbox.reviewPanel.keepLedger")}
                            </span>
                          </div>
                        </label>
                        <label
                          htmlFor="reconcile-overwrite"
                          className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-transparent p-2 transition-colors select-none hover:bg-background/25"
                        >
                          <RadioGroupItem
                            value="overwrite"
                            id="reconcile-overwrite"
                            className="mt-0.5"
                          />
                          <div className="flex flex-col">
                            <span className="text-xs font-semibold text-foreground">
                              {t("finance.inbox.reviewPanel.overwriteReceipt")}
                            </span>
                          </div>
                        </label>
                      </RadioGroup>
                    </div>
                  </div>
                )
              })()}
            </div>

            <FormSelect
              control={control}
              name="transactionType"
              label={t("finance.inbox.reviewPanel.transactionType")}
              disabled={isLinking}
              items={txnTypeItems}
            />

            <div className="space-y-2">
              <Label className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                {t("finance.inbox.reviewPanel.vendorDescription")}
              </Label>
              <Input
                className="h-10 w-full rounded-xl border-border/60 bg-background/40"
                {...register("description")}
                disabled={isLinking}
              />
              {errors.description && (
                <p className="text-[11px] font-semibold text-destructive">
                  {errors.description.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                {t("finance.inbox.reviewPanel.amountOverride")}
              </Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  step="0.01"
                  className="h-10 flex-1 rounded-xl border-border/60 bg-background/40"
                  {...register("amountStr")}
                  disabled={isLinking}
                />
                <FormSelect
                  control={control}
                  name="currency"
                  disabled={isLinking}
                  items={[
                    { value: "USD", label: "USD" },
                    { value: "DOP", label: "DOP" },
                    { value: "EUR", label: "EUR" },
                    { value: "GBP", label: "GBP" },
                  ]}
                  triggerClassName="h-10 w-24 border-border/60 bg-background/40"
                />
              </div>
              {errors.amountStr && (
                <p className="text-[11px] font-semibold text-destructive">
                  {errors.amountStr.message}
                </p>
              )}
            </div>

            {currentTxnType === "TRANSFER" ? (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                    {t("finance.inbox.reviewPanel.debitAccount")}
                  </Label>
                  <AccountSelect
                    control={control}
                    name="accountId"
                    className="h-10 w-full rounded-xl border-border/60 bg-background/40"
                    accounts={accounts}
                    disabled={isLinking}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                    {t("finance.inbox.reviewPanel.creditAccount")}
                  </Label>
                  <AccountSelect
                    control={control}
                    name="destinationAccountId"
                    className="h-10 w-full rounded-xl border-border/60 bg-background/40"
                    accounts={accounts}
                    disabled={isLinking}
                  />
                </div>
                <div className="mt-1.5 flex flex-col gap-1 space-y-2 rounded-2xl border border-border/10 bg-background/10 p-3 md:col-span-2">
                  <span className="block text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                    {t("finance.inbox.reviewPanel.attachDocumentTo")}
                  </span>
                  <RadioGroup
                    value={transferLeg}
                    onValueChange={(val) =>
                      setValue("transferLeg", val as "SOURCE" | "DESTINATION")
                    }
                    className="mt-0.5 flex gap-4"
                  >
                    <label
                      htmlFor="leg-source"
                      className="flex cursor-pointer items-center gap-2 text-xs font-medium text-foreground select-none"
                    >
                      <RadioGroupItem value="SOURCE" id="leg-source" />
                      <span>{t("finance.inbox.reviewPanel.debitLeg")}</span>
                    </label>
                    <label
                      htmlFor="leg-destination"
                      className="flex cursor-pointer items-center gap-2 text-xs font-medium text-foreground select-none"
                    >
                      <RadioGroupItem
                        value="DESTINATION"
                        id="leg-destination"
                      />
                      <span>{t("finance.inbox.reviewPanel.creditLeg")}</span>
                    </label>
                  </RadioGroup>
                </div>
              </>
            ) : (
              <>
                {currentDocType !== "INVOICE" ? (
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                      {currentTxnType === "INCOME"
                        ? t("finance.inbox.reviewPanel.depositAccountRequired")
                        : t("finance.inbox.reviewPanel.paymentAccountRequired")}
                    </Label>
                    <AccountSelect
                      control={control}
                      name="accountId"
                      className="h-10 w-full rounded-xl border-border/60 bg-background/40"
                      accounts={accounts}
                      disabled={isLinking}
                    />
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                      {t("finance.inbox.reviewPanel.account")}
                    </Label>
                    <div className="flex h-10 w-full items-center rounded-xl border border-dashed border-border/40 bg-muted/10 px-3">
                      <span className="line-clamp-1 text-[11px] text-muted-foreground">
                        {t(
                          "finance.inbox.reviewPanel.noAccountRequiredInvoice"
                        )}
                      </span>
                    </div>
                  </div>
                )}

                {currentTxnType !== "INCOME" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                      {currentDocType === "INVOICE"
                        ? t(
                            "finance.inbox.reviewPanel.requiredBudgetForInvoice"
                          )
                        : t("finance.transactions.facetBudget")}
                    </Label>
                    <BudgetSelect
                      control={control}
                      name="budgetId"
                      className="h-10 w-full rounded-xl border-border/60 bg-background/40"
                      budgets={budgets}
                      allowNone
                      disabled={isLinking}
                    />
                  </div>
                )}
              </>
            )}

            {/* Integrations Section */}
            {(showScheduledPaymentSection || showBorrowingSection) && (
              <div className="space-y-3 pt-1 md:col-span-2">
                <span className="block text-[10px] font-black tracking-widest text-muted-foreground uppercase">
                  {t("finance.inbox.reviewPanel.advancedMappings")}
                </span>

                <div className="grid grid-cols-1 gap-x-6 gap-y-3.5 sm:grid-cols-2">
                  {showScheduledPaymentSection && (
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground uppercase">
                        <Calendar className="h-3.5 w-3.5 text-indigo-400" />
                        {currentTxnType === "INCOME"
                          ? t("finance.inbox.reviewPanel.linkScheduledIncome")
                          : t("finance.inbox.reviewPanel.linkScheduledBill")}
                      </Label>

                      {(() => {
                        const selectedPaymentObj = payments.find(
                          (p) => p.id === currentScheduledTransactionId
                        )
                        const selectedPaymentBudget = selectedPaymentObj
                          ? budgets.find(
                              (b) => b.id === selectedPaymentObj.budgetId
                            )
                          : null

                        const selectedPaymentName =
                          selectedPaymentObj?.recurringTransaction?.name ||
                          selectedPaymentObj?.metadata?.vendorName ||
                          selectedPaymentObj?.metadata?.name ||
                          selectedPaymentBudget?.name ||
                          (selectedPaymentObj?.type === "INCOME"
                            ? t("finance.inbox.reviewPanel.linkScheduledIncome")
                            : t("finance.inbox.reviewPanel.linkScheduledBill"))

                        return (
                          <Popover
                            open={billPopoverOpen}
                            onOpenChange={setBillPopoverOpen}
                            modal={false}
                          >
                            <PopoverTrigger className="flex h-10 w-full min-w-0 cursor-pointer items-center justify-between gap-2 rounded-xl border border-border/60 bg-background/40 px-3 text-left font-normal text-foreground hover:bg-background/50 focus:ring-1 focus:ring-ring">
                              {selectedPaymentObj ? (
                                <div className="flex min-w-0 flex-1 items-center justify-between gap-2 overflow-hidden text-xs">
                                  <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                                    <Calendar className="h-3.5 w-3.5 shrink-0 text-indigo-400" />
                                    <span className="truncate font-semibold text-foreground">
                                      {selectedPaymentName}
                                    </span>
                                    <span className="shrink-0 text-[10px] text-muted-foreground">
                                      (
                                      {t(
                                        "finance.transactions.scheduled.dueOn",
                                        {
                                          date: tz.formatDate(
                                            selectedPaymentObj.dueDate
                                          ),
                                        }
                                      )}
                                      )
                                    </span>
                                  </div>
                                  <span className="shrink-0 font-bold text-foreground">
                                    {formatCents(
                                      selectedPaymentObj.amount
                                    ).toLocaleString(undefined, {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    })}{" "}
                                    {selectedPaymentObj.currency}
                                  </span>
                                </div>
                              ) : (
                                <span className="truncate text-xs text-muted-foreground">
                                  {t(
                                    "finance.inbox.reviewPanel.searchScheduledPlaceholder"
                                  )}
                                </span>
                              )}
                              <ChevronDown className="ml-1 h-4 w-4 shrink-0 opacity-50" />
                            </PopoverTrigger>
                            <PopoverContent
                              align="start"
                              className="flex w-[var(--anchor-width)] min-w-[320px] flex-col gap-2 rounded-2xl border border-border/50 bg-card/95 p-2 shadow-2xl backdrop-blur-xl"
                            >
                              <Input
                                placeholder={t(
                                  "finance.inbox.reviewPanel.searchBillsPlaceholder"
                                )}
                                className="h-9 rounded-xl border-border/50 bg-background/50 text-xs focus-visible:ring-ring"
                                value={billSearch}
                                onChange={(e) => setBillSearch(e.target.value)}
                                autoFocus
                              />
                              <ScrollArea className="h-60">
                                <div className="flex flex-col gap-1 pr-1">
                                  <button
                                    type="button"
                                    className="flex w-full cursor-pointer items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs text-rose-400 transition-colors hover:bg-rose-500/10"
                                    onClick={() => {
                                      setValue("scheduledTransactionId", "", {
                                        shouldValidate: true,
                                      })
                                      setBillPopoverOpen(false)
                                    }}
                                  >
                                    <span>
                                      {currentTxnType === "INCOME"
                                        ? t(
                                            "finance.inbox.reviewPanel.noneStandaloneIncome"
                                          )
                                        : t(
                                            "finance.inbox.reviewPanel.noneStandaloneExpense"
                                          )}
                                    </span>
                                  </button>
                                  <Separator className="my-1 bg-border/10" />
                                  {filteredPayments.length === 0 ? (
                                    <div className="p-4 text-center text-xs text-muted-foreground">
                                      {currentTxnType === "INCOME"
                                        ? t(
                                            "finance.inbox.reviewPanel.noMatchingIncome"
                                          )
                                        : t(
                                            "finance.inbox.reviewPanel.noMatchingBills"
                                          )}
                                    </div>
                                  ) : (
                                    filteredPayments.map((p) => {
                                      const budget = budgets.find(
                                        (b) => b.id === p.budgetId
                                      )
                                      const isSelected =
                                        currentScheduledTransactionId === p.id
                                      const isOverdue =
                                        p.dueDate &&
                                        new Date(p.dueDate).getTime() < nowTime
                                      const formattedDate = p.dueDate
                                        ? tz.formatDate(p.dueDate, {
                                            month: "short",
                                            day: "numeric",
                                          })
                                        : t(
                                            "finance.transactions.scheduled.notAvailable"
                                          )

                                      const pName =
                                        p.recurringTransaction?.name ||
                                        p.metadata?.vendorName ||
                                        p.metadata?.name ||
                                        budget?.name ||
                                        (p.type === "INCOME"
                                          ? t(
                                              "finance.inbox.reviewPanel.linkScheduledIncome"
                                            )
                                          : t(
                                              "finance.inbox.reviewPanel.linkScheduledBill"
                                            ))

                                      return (
                                        <button
                                          key={p.id}
                                          type="button"
                                          className={cn(
                                            "flex w-full cursor-pointer items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs transition-colors",
                                            isSelected
                                              ? "border border-indigo-500/30 bg-indigo-500/15 font-semibold text-indigo-400"
                                              : "text-foreground hover:bg-muted/10"
                                          )}
                                          onClick={() => {
                                            setValue(
                                              "scheduledTransactionId",
                                              p.id || "",
                                              { shouldValidate: true }
                                            )
                                            setBillPopoverOpen(false)
                                          }}
                                        >
                                          <div className="flex min-w-0 flex-col gap-0.5">
                                            <div className="flex items-center gap-1.5 truncate pr-2 font-semibold text-foreground">
                                              <Calendar className="h-3.5 w-3.5 shrink-0 text-indigo-400" />
                                              <span className="truncate">
                                                {pName}
                                              </span>
                                            </div>
                                            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                                              <span>
                                                {t(
                                                  "finance.transactions.scheduled.dueOn",
                                                  {
                                                    date: formattedDate,
                                                  }
                                                )}
                                              </span>
                                              {isOverdue && (
                                                <span className="rounded border border-rose-500/20 bg-rose-500/10 px-1 text-[9px] font-bold text-rose-400">
                                                  {t(
                                                    "finance.inbox.reviewPanel.overdue"
                                                  )}
                                                </span>
                                              )}
                                              {p.sourceType && (
                                                <>
                                                  <span>•</span>
                                                  <span className="text-[9px] font-medium text-muted-foreground/80">
                                                    {formatSourceType(
                                                      p.sourceType
                                                    )}
                                                  </span>
                                                </>
                                              )}
                                            </div>
                                          </div>
                                          <div className="flex shrink-0 flex-col items-end gap-0.5 pl-2 text-right">
                                            <span className="font-bold text-foreground">
                                              {formatCents(
                                                p.amount
                                              ).toLocaleString(undefined, {
                                                minimumFractionDigits: 2,
                                                maximumFractionDigits: 2,
                                              })}{" "}
                                              {p.currency}
                                            </span>
                                          </div>
                                        </button>
                                      )
                                    })
                                  )}
                                </div>
                              </ScrollArea>
                            </PopoverContent>
                          </Popover>
                        )
                      })()}
                    </div>
                  )}

                  {showBorrowingSection && currentDocType !== "INVOICE" && (
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground uppercase">
                        <ArrowLeftRight className="h-3.5 w-3.5 text-teal-400" />
                        {t("finance.inbox.reviewPanel.linkDebt")}
                      </Label>

                      {(() => {
                        const selectedBorrowingObj = borrowings.find(
                          (b) => b.id === currentBorrowingId
                        )

                        return (
                          <>
                            <Popover
                              open={borrowingPopoverOpen}
                              onOpenChange={setBorrowingPopoverOpen}
                              modal={false}
                            >
                              <PopoverTrigger className="flex h-10 w-full min-w-0 cursor-pointer items-center justify-between gap-2 rounded-xl border border-border/60 bg-background/40 px-3 text-left font-normal text-foreground hover:bg-background/50 focus:ring-1 focus:ring-ring">
                                {selectedBorrowingObj ? (
                                  <div className="flex min-w-0 flex-1 items-center justify-between gap-2 overflow-hidden text-xs">
                                    <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                                      <ArrowLeftRight className="h-3.5 w-3.5 shrink-0 text-teal-400" />
                                      <span className="truncate font-semibold text-foreground">
                                        {selectedBorrowingObj.counterparty}
                                      </span>
                                      <span
                                        className={cn(
                                          "shrink-0 rounded border px-1.5 text-[9px] font-bold",
                                          selectedBorrowingObj.direction ===
                                            "LENT"
                                            ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                                            : "border-amber-500/20 bg-amber-500/10 text-amber-400"
                                        )}
                                      >
                                        {selectedBorrowingObj.direction ===
                                        "LENT"
                                          ? t(
                                              "finance.inbox.reviewPanel.lentOut"
                                            )
                                          : t(
                                              "finance.inbox.reviewPanel.borrowed"
                                            )}
                                      </span>
                                    </div>
                                    <span className="shrink-0 font-bold text-foreground">
                                      Bal:{" "}
                                      {formatCents(
                                        selectedBorrowingObj.remainingAmount
                                      ).toLocaleString(undefined, {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                      })}{" "}
                                      {selectedBorrowingObj.currency}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="truncate text-xs text-muted-foreground">
                                    {t(
                                      "finance.inbox.reviewPanel.searchDebtPlaceholder"
                                    )}
                                  </span>
                                )}
                                <ChevronDown className="ml-1 h-4 w-4 shrink-0 opacity-50" />
                              </PopoverTrigger>
                              <PopoverContent
                                align="start"
                                className="flex w-[var(--anchor-width)] min-w-[320px] flex-col gap-2 rounded-2xl border border-border/50 bg-card/95 p-2 shadow-2xl backdrop-blur-xl"
                              >
                                <Input
                                  placeholder={t(
                                    "finance.inbox.reviewPanel.searchBorrowingPlaceholder"
                                  )}
                                  className="h-9 rounded-xl border-border/50 bg-background/50 text-xs focus-visible:ring-ring"
                                  value={borrowingSearch}
                                  onChange={(e) =>
                                    setBorrowingSearch(e.target.value)
                                  }
                                  autoFocus
                                />
                                <ScrollArea className="h-60">
                                  <div className="flex flex-col gap-1 pr-1">
                                    <button
                                      type="button"
                                      className="flex w-full cursor-pointer items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs text-rose-400 transition-colors hover:bg-rose-500/10"
                                      onClick={() => {
                                        setValue("borrowingId", "", {
                                          shouldValidate: true,
                                        })
                                        setBorrowingPopoverOpen(false)
                                      }}
                                    >
                                      <span>
                                        {t(
                                          "finance.inbox.reviewPanel.noneGeneralLedger"
                                        )}
                                      </span>
                                    </button>
                                    <Separator className="my-1 bg-border/10" />
                                    {filteredBorrowings.length === 0 ? (
                                      <div className="p-4 text-center text-xs text-muted-foreground">
                                        {t(
                                          "finance.inbox.reviewPanel.noMatchingDebt"
                                        )}
                                      </div>
                                    ) : (
                                      filteredBorrowings.map((b) => {
                                        const isSelected =
                                          currentBorrowingId === b.id
                                        const isLent = b.direction === "LENT"

                                        return (
                                          <button
                                            key={b.id}
                                            type="button"
                                            className={cn(
                                              "flex w-full cursor-pointer items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs transition-colors",
                                              isSelected
                                                ? "border border-teal-500/30 bg-teal-500/15 font-semibold text-teal-400"
                                                : "text-foreground hover:bg-muted/10"
                                            )}
                                            onClick={() => {
                                              setValue(
                                                "borrowingId",
                                                b.id || "",
                                                {
                                                  shouldValidate: true,
                                                }
                                              )
                                              setBorrowingPopoverOpen(false)
                                            }}
                                          >
                                            <div className="flex min-w-0 flex-col gap-0.5">
                                              <div className="flex items-center gap-1.5 truncate pr-2 font-semibold text-foreground">
                                                <ArrowLeftRight className="h-3.5 w-3.5 shrink-0 text-teal-400" />
                                                <span className="truncate">
                                                  {b.counterparty}
                                                </span>
                                              </div>
                                              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                                                <span
                                                  className={cn(
                                                    "rounded border px-1 text-[9px] font-bold",
                                                    isLent
                                                      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                                                      : "border-amber-500/20 bg-amber-500/10 text-amber-400"
                                                  )}
                                                >
                                                  {isLent
                                                    ? t(
                                                        "finance.inbox.reviewPanel.lentOutReceivable"
                                                      )
                                                    : t(
                                                        "finance.inbox.reviewPanel.borrowedPayable"
                                                      )}
                                                </span>
                                              </div>
                                            </div>
                                            <div className="flex shrink-0 flex-col items-end gap-0.5 pl-2 text-right">
                                              <span className="font-bold text-foreground">
                                                Bal:{" "}
                                                {formatCents(
                                                  b.remainingAmount
                                                ).toLocaleString(undefined, {
                                                  minimumFractionDigits: 2,
                                                  maximumFractionDigits: 2,
                                                })}{" "}
                                                {b.currency}
                                              </span>
                                              <span className="text-[9px] text-muted-foreground">
                                                Total:{" "}
                                                {formatCents(
                                                  b.totalAmount
                                                ).toLocaleString(undefined, {
                                                  minimumFractionDigits: 2,
                                                  maximumFractionDigits: 2,
                                                })}
                                              </span>
                                            </div>
                                          </button>
                                        )
                                      })
                                    )}
                                  </div>
                                </ScrollArea>
                              </PopoverContent>
                            </Popover>

                            {currentBorrowingId && (
                              <div className="mt-2.5 space-y-1.5 rounded-xl border border-teal-500/20 bg-teal-500/5 p-2.5">
                                <Label className="text-[11px] font-semibold text-teal-400">
                                  {t(
                                    "finance.inbox.reviewPanel.borrowingLinkAction"
                                  )}
                                </Label>
                                <RadioGroup
                                  value={
                                    currentBorrowingLinkType ||
                                    "INITIAL_RECEIPT"
                                  }
                                  onValueChange={(val) =>
                                    setValue(
                                      "borrowingLinkType",
                                      val as InboxReviewFormValues["borrowingLinkType"],
                                      {
                                        shouldValidate: true,
                                      }
                                    )
                                  }
                                  className="grid grid-cols-1 gap-1.5 sm:grid-cols-3"
                                >
                                  <div className="flex cursor-pointer items-center space-x-1.5 rounded-lg border border-border/40 bg-background/50 px-2 py-1.5 hover:bg-background/80">
                                    <RadioGroupItem
                                      value="INITIAL_RECEIPT"
                                      id="bt-initial"
                                    />
                                    <label
                                      htmlFor="bt-initial"
                                      className="cursor-pointer text-[10px] leading-none font-medium"
                                    >
                                      {t(
                                        "finance.inbox.reviewPanel.originalReceipt"
                                      )}
                                    </label>
                                  </div>
                                  <div className="flex cursor-pointer items-center space-x-1.5 rounded-lg border border-border/40 bg-background/50 px-2 py-1.5 hover:bg-background/80">
                                    <RadioGroupItem
                                      value="REPAYMENT"
                                      id="bt-repay"
                                    />
                                    <label
                                      htmlFor="bt-repay"
                                      className="cursor-pointer text-[10px] leading-none font-medium"
                                    >
                                      {t(
                                        "finance.inbox.reviewPanel.repaymentOption"
                                      )}
                                    </label>
                                  </div>
                                  <div className="flex cursor-pointer items-center space-x-1.5 rounded-lg border border-border/40 bg-background/50 px-2 py-1.5 hover:bg-background/80">
                                    <RadioGroupItem
                                      value="ADDITIONAL_LOAN"
                                      id="bt-add"
                                    />
                                    <label
                                      htmlFor="bt-add"
                                      className="cursor-pointer text-[10px] leading-none font-medium"
                                    >
                                      {t(
                                        "finance.inbox.reviewPanel.topUpOption"
                                      )}
                                    </label>
                                  </div>
                                </RadioGroup>
                              </div>
                            )}
                          </>
                        )
                      })()}
                    </div>
                  )}

                  {/* Full-width Suggestion Banners in their own row */}
                  {suggestedBill && (
                    <div className="sm:col-span-2">
                      <div className="flex items-center justify-between gap-2 rounded-xl border border-indigo-500/20 bg-indigo-500/10 px-3 py-2 text-xs">
                        <div className="flex min-w-0 items-center gap-2 text-indigo-300">
                          <Sparkles className="h-3.5 w-3.5 shrink-0 animate-pulse text-indigo-400" />
                          <span className="shrink-0 font-semibold">
                            {t("finance.inbox.reviewPanel.suggestedBill")}
                          </span>
                          <span className="max-w-[180px] truncate font-bold">
                            {budgets.find(
                              (b) => b.id === suggestedBill.budgetId
                            )?.name ||
                              t(
                                "finance.transactions.scheduled.confirmPayment"
                              )}
                          </span>
                          <span className="shrink-0 text-[11px]">
                            ({suggestedBill.currency}{" "}
                            {formatCents(suggestedBill.amount).toLocaleString(
                              undefined,
                              {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              }
                            )}
                            )
                          </span>
                        </div>
                        {currentScheduledTransactionId !== suggestedBill.id ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-6 shrink-0 cursor-pointer rounded-lg border-indigo-500/30 px-2 text-[10px] font-bold text-indigo-300 hover:bg-indigo-500/20"
                            onClick={() =>
                              setValue(
                                "scheduledTransactionId",
                                suggestedBill.id || "",
                                { shouldValidate: true }
                              )
                            }
                          >
                            {t("finance.inbox.actions.linkMatch")}
                          </Button>
                        ) : (
                          <span className="flex shrink-0 items-center gap-1 text-[10px] font-bold tracking-wider text-emerald-400 uppercase">
                            <Check className="h-3 w-3" />{" "}
                            {t("finance.inbox.actions.linked")}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {suggestedBorrowing && (
                    <div className="sm:col-span-2">
                      <div className="flex items-center justify-between gap-2 rounded-xl border border-teal-500/20 bg-teal-500/10 px-3 py-2 text-xs">
                        <div className="flex min-w-0 items-center gap-2 text-teal-300">
                          <Sparkles className="h-3.5 w-3.5 shrink-0 animate-pulse text-teal-400" />
                          <span className="shrink-0 font-semibold">
                            {t("finance.inbox.reviewPanel.suggestedDebt")}
                          </span>
                          <span className="max-w-[180px] truncate font-bold">
                            {suggestedBorrowing.counterparty}
                          </span>
                          <span className="shrink-0 text-[11px]">
                            ({suggestedBorrowing.currency}{" "}
                            {formatCents(
                              suggestedBorrowing.remainingAmount
                            ).toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                            )
                          </span>
                        </div>
                        {currentBorrowingId !== suggestedBorrowing.id ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-6 shrink-0 cursor-pointer rounded-lg border-teal-500/30 px-2 text-[10px] font-bold text-teal-300 hover:bg-teal-500/20"
                            onClick={() =>
                              setValue(
                                "borrowingId",
                                suggestedBorrowing.id || "",
                                {
                                  shouldValidate: true,
                                }
                              )
                            }
                          >
                            {t("finance.inbox.actions.linkMatch")}
                          </Button>
                        ) : (
                          <span className="flex shrink-0 items-center gap-1 text-[10px] font-bold tracking-wider text-emerald-400 uppercase">
                            <Check className="h-3 w-3" />{" "}
                            {t("finance.inbox.actions.linked")}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="flex animate-in gap-2 rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-[11px] leading-relaxed text-red-400 duration-300 slide-in-from-top-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        <Separator className="bg-border/20" />

        {/* Footer Controls */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            className="cursor-pointer self-start rounded-2xl text-red-400 hover:bg-red-500/10 hover:text-red-300"
            disabled={isPending || isDiscarding}
            onClick={() => onDiscard(selectedItem.id || "")}
          >
            {isDiscarding ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="mr-2 h-4 w-4" />
            )}
            {t("finance.inbox.actions.discard")}
          </Button>

          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              className="cursor-pointer rounded-2xl"
              onClick={onSkip}
              disabled={!hasMore}
            >
              {t("finance.inbox.actions.skip")}
            </Button>
            <Button
              type="submit"
              className="flex cursor-pointer items-center gap-2 rounded-2xl bg-primary text-primary-foreground shadow-[inset_0_1px_0_oklch(1_0_0/0.16)] shadow-sm hover:bg-primary/90"
              disabled={isPending || isDiscarding}
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("finance.inbox.actions.processing")}
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  {isVerificationItem
                    ? t("finance.inbox.actions.archiveVerification")
                    : isLinking
                      ? t("finance.inbox.actions.linkTransaction")
                      : currentTxnType === "TRANSFER"
                        ? t("finance.inbox.actions.recordTransfer")
                        : currentDocType === "INVOICE"
                          ? hasScheduledBill
                            ? t("finance.inbox.actions.linkBill")
                            : t("finance.inbox.actions.scheduleBill")
                          : hasScheduledBill
                            ? t("finance.inbox.actions.confirmBillPayment")
                            : currentTxnType === "INCOME"
                              ? t("finance.inbox.actions.recordIncome")
                              : t("finance.inbox.actions.recordExpense")}
                </>
              )}
            </Button>
          </div>
        </div>
      </Card>
    </form>
  )
}
