import { useState, useMemo, useCallback } from "react"
import {
  type StatementLine,
  type Account,
  type Budget,
  type Borrowing,
  type ScheduledTransaction,
  type Transaction_Type,
  useListTransactionsQuery,
} from "@saturn/api/gen/saturn/finance/v1/finance"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Calendar,
  Check,
  ChevronDown,
  RotateCcw,
  Sparkles,
  ArrowRightLeft,
  ArrowDownLeft,
  CalendarClock,
  HandCoins,
  Search,
  Pencil,
  ArrowUpDown,
  SkipForward,
  Loader2,
  AlertTriangle,
} from "lucide-react"
import { formatAmount, formatCents, toCents } from "../utils"
import { getLocalizedEnumLabel } from "@saturn/i18n"
import { useI18n, useTimezone } from "@saturn/hooks"
import { cn } from "@/lib/utils"
import { AccountSelect } from "./account-select"
import { BudgetSelect } from "./budget-select"

export interface ReconciliationRowProps {
  line: StatementLine
  budgets: Budget[]
  accounts: Account[]
  scheduledTxns: ScheduledTransaction[]
  borrowings: Borrowing[]
  targetAccount?: Account
  onSaveChoice: (
    targetLine: StatementLine,
    type: string,
    payload: {
      transactionId?: string
      overwriteTransaction?: boolean
      budgetId?: string
      counterpartAccountId?: string
      scheduledTransactionId?: string
      borrowingId?: string
    }
  ) => void
  onUndo: (targetLine: StatementLine) => void
  onUpdateDetails: (
    targetLine: StatementLine,
    updates: { description?: string; amount?: number | string }
  ) => void
  isPending: boolean
  isSuspectDiscrepancy?: boolean
  isReadOnly?: boolean
}

export function ReconciliationRow({
  line,
  budgets,
  accounts,
  scheduledTxns,
  borrowings,
  targetAccount,
  onSaveChoice,
  onUndo,
  onUpdateDetails,
  isPending,
  isSuspectDiscrepancy = false,
  isReadOnly = false,
}: ReconciliationRowProps) {
  const tz = useTimezone()
  const { t, language } = useI18n()
  const lineAmount = Number(line.amount || 0)
  const isExpense = lineAmount < 0
  const hasExactMatches =
    line.suggestions?.matches && line.suggestions.matches.length > 0
  const firstMatch = hasExactMatches ? line.suggestions!.matches![0] : null

  // Inline description editing state
  const [isEditingDesc, setIsEditingDesc] = useState(false)
  const [editedDesc, setEditedDesc] = useState(line.description)

  // Inline amount editing state
  const [isEditingAmount, setIsEditingAmount] = useState(false)
  const [editedAmount, setEditedAmount] = useState("")

  // Local drawer / sub-action mode
  const [customMode, setCustomMode] = useState<
    | null
    | "transfer"
    | "scheduled"
    | "repayment"
    | "other_matches"
    | "search_match"
  >(null)

  // Local selection states for inline pickers
  const [selectedBudgetId, setSelectedBudgetId] = useState<string>(
    line.suggestions?.budgetId ||
      (budgets.length > 0 ? budgets[0].id || "" : "")
  )
  const [selectedMatchId, setSelectedMatchId] = useState<string>(
    firstMatch?.id || ""
  )
  const [counterpartId, setCounterpartId] = useState<string>(
    accounts.find((a) => a.id !== targetAccount?.id)?.id || ""
  )
  const [scheduledId, setScheduledId] = useState<string>(
    scheduledTxns.find((s) => s.status !== "PAID" && s.status !== "SKIPPED")
      ?.id || ""
  )
  const [borrowingId, setBorrowingId] = useState<string>(
    borrowings[0]?.id || ""
  )
  const [overwriteTransaction, setOverwriteTransaction] = useState(false)

  const [currentTime] = useState(() => Date.now())

  // Scheduled Transaction Search & Selection
  const [scheduledSearch, setScheduledSearch] = useState("")
  const [scheduledPopoverOpen, setScheduledPopoverOpen] = useState(false)

  const getScheduledName = useCallback(
    (s: ScheduledTransaction) => {
      const budget = budgets.find((b) => b.id === s.budgetId)
      return (
        s.recurringTransaction?.name ||
        s.metadata?.vendorName ||
        s.metadata?.name ||
        budget?.name ||
        (s.type === "INCOME"
          ? t("finance.reconcile.row.scheduledIncome")
          : t("finance.reconcile.row.scheduledBill"))
      )
    },
    [budgets, t]
  )

  const eligibleScheduledTxns = useMemo(() => {
    return scheduledTxns.filter((s) => {
      if (s.status === "PAID" || s.status === "SKIPPED") return false
      if (isExpense && s.type !== "EXPENSE") return false
      if (!isExpense && s.type !== "INCOME") return false
      return true
    })
  }, [scheduledTxns, isExpense])

  const filteredScheduledTxns = useMemo(() => {
    const q = scheduledSearch.toLowerCase().trim()
    if (!q) return eligibleScheduledTxns
    return eligibleScheduledTxns.filter((s) => {
      const name = getScheduledName(s).toLowerCase()
      const amt = formatCents(s.amount).toFixed(2)
      const date = s.dueDate ? tz.formatDate(s.dueDate) : ""
      return name.includes(q) || amt.includes(q) || date.includes(q)
    })
  }, [eligibleScheduledTxns, scheduledSearch, getScheduledName, tz])

  const selectedScheduledObj = useMemo(() => {
    return scheduledTxns.find((s) => s.id === scheduledId) || null
  }, [scheduledTxns, scheduledId])

  // Borrowing Search & Selection
  const [borrowingSearch, setBorrowingSearch] = useState("")
  const [borrowingPopoverOpen, setBorrowingPopoverOpen] = useState(false)

  const filteredBorrowings = useMemo(() => {
    const q = borrowingSearch.toLowerCase().trim()
    if (!q) return borrowings
    return borrowings.filter((b) => {
      const counterparty = (b.counterparty || "").toLowerCase()
      const amt = formatCents(b.totalAmount).toFixed(2)
      const rem = formatCents(b.remainingAmount).toFixed(2)
      return counterparty.includes(q) || amt.includes(q) || rem.includes(q)
    })
  }, [borrowings, borrowingSearch])

  const selectedBorrowingObj = useMemo(() => {
    return borrowings.find((b) => b.id === borrowingId) || null
  }, [borrowings, borrowingId])

  // Search ledger transactions for manual matching
  const [searchMatchQuery, setSearchMatchQuery] = useState("")

  const requestedTypes: Transaction_Type[] = useMemo(() => {
    return isExpense ? ["EXPENSE", "TRANSFER_OUT"] : ["INCOME", "TRANSFER_IN"]
  }, [isExpense])

  const { data: txnsData, isLoading: isTxnsLoading } = useListTransactionsQuery(
    {
      accountId: targetAccount?.id,
      pageSize: 100,
      pageToken: "",
      types: requestedTypes,
      searchQuery: searchMatchQuery || undefined,
    },
    { enabled: customMode === "search_match" && !!targetAccount?.id }
  )

  const accountTransactions = useMemo(() => {
    return txnsData?.transactions || []
  }, [txnsData])

  const filteredTxns = useMemo(() => {
    const q = searchMatchQuery.toLowerCase().trim()
    if (!q) return accountTransactions
    return accountTransactions.filter((txn) => {
      const desc = (txn.description || "").toLowerCase()
      const amt = formatCents(txn.amount).toFixed(2)
      const date = txn.transactionDate ? tz.formatDate(txn.transactionDate) : ""
      return desc.includes(q) || amt.includes(q) || date.includes(q)
    })
  }, [accountTransactions, searchMatchQuery, tz])

  const selectedMatchObj = useMemo(() => {
    if (!selectedMatchId) return null
    return (
      accountTransactions.find((txn) => txn.id === selectedMatchId) ||
      line.suggestions?.matches?.find((m) => m.id === selectedMatchId) ||
      null
    )
  }, [selectedMatchId, accountTransactions, line.suggestions?.matches])

  const isAmountMismatch = useMemo(() => {
    if (!selectedMatchObj) return false
    return Number(selectedMatchObj.amount) !== Math.abs(lineAmount)
  }, [selectedMatchObj, lineAmount])

  const isResolved = line.status !== "UNMATCHED"

  const statusLabel =
    line.status === "MATCHED"
      ? t("finance.reconcile.row.statusMatched")
      : line.status === "IMPORTED"
        ? t("finance.reconcile.row.statusImported")
        : line.status === "SKIPPED"
          ? t("finance.reconcile.row.statusSkipped")
          : t("finance.reconcile.row.statusUnmatched")

  const actionSummary = useMemo(() => {
    if (
      line.match?.transactionId ||
      (line.status === "MATCHED" && line.matchedTransactionId)
    ) {
      const matchTxnId = line.match?.transactionId || line.matchedTransactionId
      const matchedTxn = line.suggestions?.matches?.find(
        (m) => m.id === matchTxnId
      )
      const isOverwritten = line.match?.overwriteTransaction
      return {
        badge: isOverwritten
          ? t("finance.reconcile.row.badgeMatchedOverwritten")
          : t("finance.reconcile.row.badgeMatched"),
        badgeColor: isOverwritten
          ? "border-amber-500/30 bg-amber-500/10 text-amber-500"
          : "border-blue-500/30 bg-blue-500/10 text-blue-500",
        icon: Check,
        iconBg: isOverwritten
          ? "bg-amber-500/10 text-amber-500"
          : "bg-blue-500/10 text-blue-500",
        title: matchedTxn?.description
          ? t("finance.reconcile.row.matchedTitle", {
              description: matchedTxn.description,
            })
          : t("finance.reconcile.row.matchedToLedger"),
        subtitle: isOverwritten
          ? t("finance.reconcile.row.overwriteSubtitle", {
              amount: formatAmount(
                Math.abs(lineAmount),
                targetAccount?.currency
              ),
            })
          : matchedTxn
            ? t("finance.reconcile.row.matchedSubtitle", {
                date: tz.formatDate(
                  matchedTxn.effectiveDate || matchedTxn.transactionDate || ""
                ),
                amount: formatAmount(
                  matchedTxn.amount,
                  targetAccount?.currency
                ),
              })
            : matchTxnId
              ? t("finance.reconcile.row.linkedTransactionId", {
                  id: matchTxnId,
                })
              : t("finance.reconcile.row.linkedWithLedger"),
      }
    }

    if (line.createExpense) {
      const budget = budgets.find((b) => b.id === line.createExpense?.budgetId)
      return {
        badge: t("finance.reconcile.row.badgeExpense"),
        badgeColor: "border-rose-500/30 bg-rose-500/10 text-rose-500",
        icon: ArrowDownLeft,
        iconBg: "bg-rose-500/10 text-rose-500",
        title: budget
          ? t("finance.reconcile.row.expenseCategoryTitle", {
              name: budget.name,
            })
          : t("finance.reconcile.row.recordExpense"),
        subtitle: budget
          ? t("finance.reconcile.row.expenseSubtitleBudget", {
              name: budget.name,
            })
          : t("finance.reconcile.row.expenseSubtitleAccount", {
              account:
                targetAccount?.name || t("finance.reconcile.accountFallback"),
            }),
      }
    }

    if (line.createIncome) {
      return {
        badge: t("finance.reconcile.row.badgeIncome"),
        badgeColor: "border-emerald-500/30 bg-emerald-500/10 text-emerald-500",
        icon: ArrowDownLeft,
        iconBg: "bg-emerald-500/10 text-emerald-500",
        title: t("finance.reconcile.row.incomeTitle"),
        subtitle: t("finance.reconcile.row.incomeSubtitle", {
          account:
            targetAccount?.name || t("finance.reconcile.accountFallback"),
        }),
      }
    }

    if (line.createTransfer) {
      const counterpart = accounts.find(
        (a) => a.id === line.createTransfer?.counterpartAccountId
      )
      const isOutflow = lineAmount < 0
      const accountFallback = t("finance.reconcile.accountFallback")
      const counterpartFallback = t("finance.reconcile.row.counterpartAccount")
      return {
        badge: t("finance.reconcile.row.badgeTransfer"),
        badgeColor: "border-sky-500/30 bg-sky-500/10 text-sky-500",
        icon: ArrowRightLeft,
        iconBg: "bg-sky-500/10 text-sky-500",
        title: t("finance.reconcile.row.transferTitle", {
          from: isOutflow
            ? targetAccount?.name || accountFallback
            : counterpart?.name || counterpartFallback,
          to: isOutflow
            ? counterpart?.name || counterpartFallback
            : targetAccount?.name || accountFallback,
        }),
        subtitle: t("finance.reconcile.row.transferSubtitle"),
      }
    }

    if (line.confirmScheduled) {
      const scheduled = scheduledTxns.find(
        (s) => s.id === line.confirmScheduled?.scheduledTransactionId
      )
      const scheduledName = scheduled
        ? getScheduledName(scheduled)
        : t("finance.reconcile.row.scheduledPayment")
      const budget = scheduled?.budgetId
        ? budgets.find((b) => b.id === scheduled.budgetId)
        : null
      return {
        badge: t("finance.reconcile.row.badgeScheduled"),
        badgeColor: "border-indigo-500/30 bg-indigo-500/10 text-indigo-500",
        icon: CalendarClock,
        iconBg: "bg-indigo-500/10 text-indigo-500",
        title: t("finance.reconcile.row.scheduledTitle", {
          name: scheduledName,
        }),
        subtitle: scheduled?.dueDate
          ? budget
            ? t("finance.reconcile.row.scheduledSubtitleBudget", {
                date: tz.formatDate(scheduled.dueDate),
                budget: budget.name,
              })
            : t("finance.reconcile.row.scheduledSubtitleDate", {
                date: tz.formatDate(scheduled.dueDate),
              })
          : t("finance.reconcile.row.scheduledSubtitleNoDate"),
      }
    }

    if (line.createRepayment) {
      const borrowing = borrowings.find(
        (b) => b.id === line.createRepayment?.borrowingId
      )
      const isLent = borrowing?.direction === "LENT"
      return {
        badge: t("finance.reconcile.row.badgeBorrowing"),
        badgeColor: "border-pink-500/30 bg-pink-500/10 text-pink-500",
        icon: HandCoins,
        iconBg: "bg-pink-500/10 text-pink-500",
        title: borrowing
          ? t("finance.reconcile.row.repaymentTitle", {
              name: borrowing.counterparty,
            })
          : t("finance.reconcile.row.repaymentFallback"),
        subtitle: borrowing
          ? t("finance.reconcile.row.repaymentSubtitle", {
              kind: isLent
                ? t("finance.reconcile.row.receivablePayment")
                : t("finance.reconcile.row.payableReduction"),
              amount: formatAmount(
                borrowing.remainingAmount,
                borrowing.currency
              ),
            })
          : t("finance.reconcile.row.repaymentSubtitleFallback"),
      }
    }

    if (line.skip || line.status === "SKIPPED") {
      return {
        badge: t("finance.reconcile.row.badgeSkipped"),
        badgeColor: "border-amber-500/30 bg-amber-500/10 text-amber-500",
        icon: SkipForward,
        iconBg: "bg-amber-500/10 text-amber-500",
        title: t("finance.reconcile.row.skippedTitle"),
        subtitle: t("finance.reconcile.row.skippedSubtitle"),
      }
    }

    // Fallback for generic resolved state
    return {
      badge:
        line.status === "MATCHED"
          ? t("finance.reconcile.row.badgeMatched")
          : t("finance.reconcile.row.badgeImported"),
      badgeColor: "border-emerald-500/30 bg-emerald-500/10 text-emerald-500",
      icon: Check,
      iconBg: "bg-emerald-500/10 text-emerald-500",
      title:
        line.status === "MATCHED"
          ? t("finance.reconcile.row.matchedToLedger")
          : t("finance.reconcile.row.importedTitle"),
      subtitle: isReadOnly
        ? t("finance.reconcile.row.finalizedSubtitle")
        : t("finance.reconcile.row.readySubtitle"),
    }
  }, [
    line,
    budgets,
    accounts,
    scheduledTxns,
    borrowings,
    targetAccount,
    lineAmount,
    isReadOnly,
    getScheduledName,
    tz,
    t,
  ])

  const handleSaveDescription = () => {
    setIsEditingDesc(false)
    if (
      editedDesc &&
      editedDesc.trim() &&
      editedDesc.trim() !== line.description
    ) {
      onUpdateDetails(line, { description: editedDesc.trim() })
    }
  }

  const handleSaveAmount = () => {
    setIsEditingAmount(false)
    const newCents = toCents(editedAmount, isExpense ? -1 : 1)
    if (newCents !== 0 && newCents !== lineAmount) {
      onUpdateDetails(line, { amount: newCents })
    }
  }

  return (
    <div
      className={cn(
        "group relative grid grid-cols-1 gap-3 rounded-2xl border p-4 transition-all duration-200 md:grid-cols-12",
        isSuspectDiscrepancy
          ? "border-amber-500/50 bg-amber-500/5 shadow-md ring-1 shadow-amber-500/5 ring-amber-500/30 hover:border-amber-500/70"
          : isResolved
            ? "border-border/30 bg-card/20 opacity-80 hover:opacity-100"
            : "border-border/60 bg-card/40 shadow-sm hover:border-primary/40 hover:bg-card/60 hover:shadow-md"
      )}
    >
      {/* LEFT COLUMN: Bank Statement Entry */}
      <div className="flex flex-col justify-between space-y-2 border-b border-border/40 pb-3 md:col-span-5 md:border-r md:border-b-0 md:pr-4 md:pb-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex items-center text-xs font-semibold text-muted-foreground">
              <Calendar className="mr-1.5 h-3.5 w-3.5 opacity-70" />
              {line.dateStr}
            </span>
            {isSuspectDiscrepancy && (
              <span className="py-0.2 animate-pulse rounded-md border border-amber-500/30 bg-amber-500/15 px-1.5 text-[9px] font-extrabold text-amber-500">
                {t("finance.reconcile.row.discrepancyMatch")}
              </span>
            )}
          </div>
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-black tracking-wider uppercase",
              line.status === "UNMATCHED" && "bg-muted text-muted-foreground",
              line.status === "MATCHED" &&
                "border border-blue-500/20 bg-blue-500/10 text-blue-500",
              line.status === "IMPORTED" &&
                "border border-emerald-500/20 bg-emerald-500/10 text-emerald-500",
              line.status === "SKIPPED" &&
                "border border-amber-500/20 bg-amber-500/10 text-amber-500"
            )}
          >
            {statusLabel}
          </span>
        </div>

        {/* Description: Inline Editable */}
        <div className="space-y-0.5">
          {isEditingDesc ? (
            <div className="flex items-center gap-1.5">
              <Input
                value={editedDesc}
                onChange={(e) => setEditedDesc(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveDescription()
                  if (e.key === "Escape") {
                    setIsEditingDesc(false)
                    setEditedDesc(line.description)
                  }
                }}
                autoFocus
                className="h-7 rounded-lg border-primary bg-background px-2 text-xs"
              />
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 shrink-0 text-emerald-500 hover:bg-emerald-500/10"
                onClick={handleSaveDescription}
              >
                <Check className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <div className="group/desc flex items-center justify-between gap-1.5">
              <p className="text-sm leading-snug font-bold break-words text-foreground">
                {line.description}
              </p>
              {!isResolved && !isReadOnly && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground opacity-0 transition-opacity group-hover/desc:opacity-100 hover:text-foreground"
                  onClick={() => {
                    setEditedDesc(line.description)
                    setIsEditingDesc(true)
                  }}
                  title={t("finance.reconcile.row.editDescription")}
                >
                  <Pencil className="h-3 w-3" />
                </Button>
              )}
            </div>
          )}

          {line.reference && (
            <p className="text-[11px] text-muted-foreground">
              {t("finance.reconcile.row.refLabel")}{" "}
              <span className="font-mono">{line.reference}</span>
            </p>
          )}
        </div>

        {/* Amount with Invert Sign (+/-) Toggle & Inline Amount Editing */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
              {t("finance.reconcile.row.statementAmount")}
            </span>
            {!isResolved && !isReadOnly && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onUpdateDetails(line, { amount: -lineAmount })}
                disabled={isPending}
                title={t("finance.reconcile.row.invertSignTooltip")}
                className="h-5 rounded-md px-1.5 font-mono text-[10px] text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
              >
                <ArrowUpDown className="mr-1 h-2.5 w-2.5" />
                +/-
              </Button>
            )}
          </div>
          {isEditingAmount ? (
            <div className="flex items-center gap-1.5">
              <div className="relative flex items-center">
                <span className="pointer-events-none absolute left-2 font-mono text-xs font-bold text-muted-foreground select-none">
                  {editedAmount.startsWith("-") || editedAmount.startsWith("+")
                    ? ""
                    : isExpense
                      ? "-"
                      : "+"}
                </span>
                <Input
                  value={editedAmount}
                  onChange={(e) => setEditedAmount(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveAmount()
                    if (e.key === "Escape") {
                      setIsEditingAmount(false)
                    }
                  }}
                  autoFocus
                  placeholder="0.00"
                  className={cn(
                    "h-7 w-28 rounded-lg border-primary bg-background font-mono text-xs font-bold",
                    editedAmount.startsWith("-") || editedAmount.startsWith("+")
                      ? "px-2"
                      : "pr-2 pl-5"
                  )}
                />
              </div>
              <Button
                size="icon"
                variant="ghost"
                disabled={isPending}
                className="h-7 w-7 shrink-0 text-emerald-500 hover:bg-emerald-500/10"
                onClick={handleSaveAmount}
                title={t("finance.reconcile.row.saveAmount")}
              >
                <Check className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <div className="group/amount flex items-center gap-1.5">
              <span
                className={cn(
                  "font-mono text-base font-black tracking-tight",
                  !isResolved &&
                    !isReadOnly &&
                    "cursor-pointer hover:underline",
                  isExpense ? "text-rose-500" : "text-emerald-500"
                )}
                onClick={() => {
                  if (!isResolved && !isReadOnly) {
                    setEditedAmount(
                      formatCents(Math.abs(lineAmount)).toFixed(2)
                    )
                    setIsEditingAmount(true)
                  }
                }}
                title={
                  !isResolved && !isReadOnly
                    ? t("finance.reconcile.row.clickToEditAmount")
                    : undefined
                }
              >
                {isExpense ? "-" : "+"}
                {formatAmount(Math.abs(lineAmount), targetAccount?.currency)}
              </span>
              {!isResolved && !isReadOnly && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground opacity-0 transition-opacity group-hover/amount:opacity-100 hover:text-foreground"
                  onClick={() => {
                    setEditedAmount(
                      formatCents(Math.abs(lineAmount)).toFixed(2)
                    )
                    setIsEditingAmount(true)
                  }}
                  title={t("finance.reconcile.row.editAmount")}
                >
                  <Pencil className="h-3 w-3" />
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT COLUMN: Ledger Action / Rule Resolution */}
      <div className="flex flex-col justify-between space-y-3 md:col-span-7 md:pl-2">
        {/* State A: Resolved Line (Already Matched, Created, or Skipped) */}
        {isResolved ? (
          <div className="flex flex-1 items-center justify-between gap-4 py-1">
            <div className="flex min-w-0 items-center space-x-3">
              <div
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                  actionSummary.iconBg
                )}
              >
                <actionSummary.icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-xs font-bold text-foreground">
                    {actionSummary.title}
                  </span>
                  <span
                    className={cn(
                      "py-0.2 rounded-md border px-1.5 text-[9px] font-extrabold tracking-wider uppercase",
                      actionSummary.badgeColor
                    )}
                  >
                    {actionSummary.badge}
                  </span>
                </div>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {actionSummary.subtitle}
                </span>
              </div>
            </div>

            {!isReadOnly && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCustomMode(null)
                  onUndo(line)
                }}
                disabled={isPending}
                className="h-8 rounded-xl text-xs font-semibold text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                {t("common.undo")}
              </Button>
            )}
          </div>
        ) : isReadOnly ? (
          <div className="flex flex-1 items-center space-x-3 py-2 text-xs text-muted-foreground">
            <span className="font-semibold">
              {t("finance.reconcile.row.unmatched")}
            </span>
          </div>
        ) : (
          /* State B: Unresolved Line */
          <>
            {/* Custom Mode 1: Transfer */}
            {customMode === "transfer" ? (
              <div className="space-y-3 rounded-xl border border-border/50 bg-background/40 p-3">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-primary">
                    <ArrowRightLeft className="h-3.5 w-3.5" />
                    {t("finance.reconcile.row.recordAsTransfer")}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[11px]"
                    onClick={() => setCustomMode(null)}
                  >
                    {t("common.cancel")}
                  </Button>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold text-muted-foreground uppercase">
                    {t("finance.reconcile.row.counterpartAccount")}
                  </Label>
                  <AccountSelect
                    value={counterpartId}
                    onValueChange={setCounterpartId}
                    accounts={accounts.filter(
                      (a) => a.id !== targetAccount?.id
                    )}
                  />
                </div>
                <Button
                  size="sm"
                  disabled={!counterpartId || isPending}
                  onClick={() => {
                    setCustomMode(null)
                    onSaveChoice(line, "transfer", {
                      counterpartAccountId: counterpartId,
                    })
                  }}
                  className="h-8 w-full rounded-lg bg-primary text-xs font-bold"
                >
                  {t("finance.reconcile.row.confirmTransfer")}
                </Button>
              </div>
            ) : customMode === "scheduled" ? (
              /* Custom Mode 2: Scheduled Transaction */
              <div className="space-y-3 rounded-xl border border-indigo-500/30 bg-background/50 p-3 shadow-inner">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-indigo-500">
                    <CalendarClock className="h-3.5 w-3.5" />
                    {isExpense
                      ? t("finance.reconcile.row.linkScheduledBill")
                      : t("finance.reconcile.row.linkScheduledIncome")}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[11px]"
                    onClick={() => {
                      setCustomMode(null)
                      setScheduledSearch("")
                    }}
                  >
                    {t("common.cancel")}
                  </Button>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold text-muted-foreground uppercase">
                    {t("finance.reconcile.row.scheduledTransactionLabel")}
                  </Label>
                  <Popover
                    open={scheduledPopoverOpen}
                    onOpenChange={setScheduledPopoverOpen}
                  >
                    <PopoverTrigger className="flex h-10 w-full min-w-0 cursor-pointer items-center justify-between gap-2 rounded-xl border border-border/60 bg-background/50 px-3 text-left font-normal text-foreground transition-all hover:bg-background/80 focus:ring-1 focus:ring-ring">
                      {selectedScheduledObj ? (
                        <div className="flex min-w-0 flex-1 items-center justify-between gap-2 overflow-hidden text-xs">
                          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                            <CalendarClock className="h-3.5 w-3.5 shrink-0 text-indigo-400" />
                            <span className="truncate font-semibold text-foreground">
                              {getScheduledName(selectedScheduledObj)}
                            </span>
                            <span className="shrink-0 text-[10px] text-muted-foreground">
                              {t("finance.reconcile.row.dueShort", {
                                date: selectedScheduledObj.dueDate
                                  ? tz.formatDate(selectedScheduledObj.dueDate)
                                  : t("finance.reconcile.row.notAvailable"),
                              })}
                            </span>
                          </div>
                          <span className="shrink-0 font-bold text-foreground">
                            {formatAmount(
                              selectedScheduledObj.amount,
                              selectedScheduledObj.currency
                            )}
                          </span>
                        </div>
                      ) : (
                        <span className="truncate text-xs text-muted-foreground">
                          {isExpense
                            ? t("finance.reconcile.row.searchScheduledBill")
                            : t("finance.reconcile.row.searchScheduledIncome")}
                        </span>
                      )}
                      <ChevronDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
                    </PopoverTrigger>
                    <PopoverContent
                      align="start"
                      className="flex w-(--anchor-width) max-w-[var(--anchor-width)] min-w-[320px] flex-col gap-2 rounded-2xl border border-border/50 bg-card/95 p-2 shadow-2xl backdrop-blur-xl"
                    >
                      <Input
                        placeholder={t(
                          "finance.reconcile.row.filterScheduledPlaceholder"
                        )}
                        value={scheduledSearch}
                        onChange={(e) => setScheduledSearch(e.target.value)}
                        className="h-8 rounded-xl border-border/50 bg-background/50 text-xs"
                        autoFocus
                      />
                      <ScrollArea className="h-48">
                        <div className="flex flex-col gap-1 pr-1">
                          {filteredScheduledTxns.length === 0 ? (
                            <div className="p-4 text-center text-xs text-muted-foreground">
                              {t("finance.reconcile.row.noScheduledFound")}
                            </div>
                          ) : (
                            filteredScheduledTxns.map((s) => {
                              const isSelected = scheduledId === s.id
                              const isOverdue =
                                s.dueDate &&
                                new Date(s.dueDate).getTime() < currentTime
                              const formattedDueDate = s.dueDate
                                ? tz.formatDate(s.dueDate, {
                                    month: "short",
                                    day: "numeric",
                                  })
                                : t("finance.reconcile.row.notAvailable")
                              const title = getScheduledName(s)
                              const budget = budgets.find(
                                (b) => b.id === s.budgetId
                              )

                              return (
                                <button
                                  key={s.id}
                                  type="button"
                                  className={cn(
                                    "flex w-full cursor-pointer items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs transition-colors",
                                    isSelected
                                      ? "border border-indigo-500/30 bg-indigo-500/15 font-semibold text-indigo-400"
                                      : "text-foreground hover:bg-muted/20"
                                  )}
                                  onClick={() => {
                                    setScheduledId(s.id || "")
                                    setScheduledPopoverOpen(false)
                                  }}
                                >
                                  <div className="flex min-w-0 flex-1 flex-col gap-0.5 overflow-hidden pr-2">
                                    <div className="flex items-center gap-1.5 truncate font-semibold text-foreground">
                                      <CalendarClock className="h-3.5 w-3.5 shrink-0 text-indigo-400" />
                                      <span className="truncate">{title}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                                      <span>
                                        {t("finance.reconcile.row.dueDate", {
                                          date: formattedDueDate,
                                        })}
                                      </span>
                                      {isOverdue && (
                                        <span className="shrink-0 rounded border border-rose-500/20 bg-rose-500/10 px-1 text-[9px] font-bold text-rose-400">
                                          {t("finance.reconcile.row.overdue")}
                                        </span>
                                      )}
                                      {budget && (
                                        <>
                                          <span>•</span>
                                          <span className="truncate">
                                            {budget.name}
                                          </span>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                  <span className="shrink-0 font-bold text-foreground">
                                    {formatAmount(s.amount, s.currency)}
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
                <Button
                  size="sm"
                  disabled={!scheduledId || isPending}
                  onClick={() => {
                    setCustomMode(null)
                    onSaveChoice(line, "scheduled", {
                      scheduledTransactionId: scheduledId,
                    })
                  }}
                  className="h-8 w-full rounded-lg bg-indigo-600 text-xs font-bold text-white hover:bg-indigo-700"
                >
                  {t("finance.reconcile.row.confirmScheduledLink")}
                </Button>
              </div>
            ) : customMode === "repayment" ? (
              /* Custom Mode 3: Borrowing / Lending */
              <div className="space-y-3 rounded-xl border border-pink-500/30 bg-background/50 p-3 shadow-inner">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-pink-500">
                    <HandCoins className="h-3.5 w-3.5" />
                    {t("finance.reconcile.row.linkBorrowing")}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[11px]"
                    onClick={() => {
                      setCustomMode(null)
                      setBorrowingSearch("")
                    }}
                  >
                    {t("common.cancel")}
                  </Button>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold text-muted-foreground uppercase">
                    {t("finance.reconcile.row.borrowingRecordLabel")}
                  </Label>
                  <Popover
                    open={borrowingPopoverOpen}
                    onOpenChange={setBorrowingPopoverOpen}
                  >
                    <PopoverTrigger className="flex h-10 w-full min-w-0 cursor-pointer items-center justify-between gap-2 rounded-xl border border-border/60 bg-background/50 px-3 text-left font-normal text-foreground transition-all hover:bg-background/80 focus:ring-1 focus:ring-ring">
                      {selectedBorrowingObj ? (
                        <div className="flex min-w-0 flex-1 items-center justify-between gap-2 overflow-hidden text-xs">
                          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                            <HandCoins className="h-3.5 w-3.5 shrink-0 text-pink-400" />
                            <span className="truncate font-semibold text-foreground">
                              {selectedBorrowingObj.counterparty}
                            </span>
                            <span
                              className={cn(
                                "py-0.2 shrink-0 rounded px-1.5 text-[9px] font-bold",
                                selectedBorrowingObj.direction === "LENT"
                                  ? "border border-emerald-500/20 bg-emerald-500/15 text-emerald-400"
                                  : "border border-amber-500/20 bg-amber-500/15 text-amber-400"
                              )}
                            >
                              {selectedBorrowingObj.direction === "LENT"
                                ? t("finance.reconcile.row.lentOut")
                                : t("finance.reconcile.row.borrowed")}
                            </span>
                          </div>
                          <span className="shrink-0 font-bold text-foreground">
                            {t("finance.reconcile.row.balLabel")}{" "}
                            {formatAmount(
                              selectedBorrowingObj.remainingAmount,
                              selectedBorrowingObj.currency
                            )}
                          </span>
                        </div>
                      ) : (
                        <span className="truncate text-xs text-muted-foreground">
                          {t(
                            "finance.reconcile.row.searchBorrowingPlaceholder"
                          )}
                        </span>
                      )}
                      <ChevronDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
                    </PopoverTrigger>
                    <PopoverContent
                      align="start"
                      className="flex w-(--anchor-width) max-w-[var(--anchor-width)] min-w-[320px] flex-col gap-2 rounded-2xl border border-border/50 bg-card/95 p-2 shadow-2xl backdrop-blur-xl"
                    >
                      <Input
                        placeholder={t(
                          "finance.reconcile.row.filterBorrowingPlaceholder"
                        )}
                        value={borrowingSearch}
                        onChange={(e) => setBorrowingSearch(e.target.value)}
                        className="h-8 rounded-xl border-border/50 bg-background/50 text-xs"
                        autoFocus
                      />
                      <ScrollArea className="h-48">
                        <div className="flex flex-col gap-1 pr-1">
                          {filteredBorrowings.length === 0 ? (
                            <div className="p-4 text-center text-xs text-muted-foreground">
                              {t("finance.reconcile.row.noBorrowingsFound")}
                            </div>
                          ) : (
                            filteredBorrowings.map((b) => {
                              const isSelected = borrowingId === b.id
                              const isLent = b.direction === "LENT"

                              return (
                                <button
                                  key={b.id}
                                  type="button"
                                  className={cn(
                                    "flex w-full cursor-pointer items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs transition-colors",
                                    isSelected
                                      ? "border border-pink-500/30 bg-pink-500/15 font-semibold text-pink-400"
                                      : "text-foreground hover:bg-muted/20"
                                  )}
                                  onClick={() => {
                                    setBorrowingId(b.id || "")
                                    setBorrowingPopoverOpen(false)
                                  }}
                                >
                                  <div className="flex min-w-0 flex-1 flex-col gap-0.5 overflow-hidden pr-2">
                                    <div className="flex items-center gap-1.5 truncate font-semibold text-foreground">
                                      <HandCoins className="h-3.5 w-3.5 shrink-0 text-pink-400" />
                                      <span className="truncate">
                                        {b.counterparty}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                                      <span
                                        className={cn(
                                          "rounded px-1 text-[9px] font-bold",
                                          isLent
                                            ? "bg-emerald-500/15 text-emerald-400"
                                            : "bg-amber-500/15 text-amber-400"
                                        )}
                                      >
                                        {isLent
                                          ? t("finance.reconcile.row.lentOut")
                                          : t("finance.reconcile.row.borrowed")}
                                      </span>
                                      <span>•</span>
                                      <span>
                                        {t("finance.reconcile.row.totalLabel")}{" "}
                                        {formatAmount(
                                          b.totalAmount,
                                          b.currency
                                        )}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="flex shrink-0 flex-col items-end text-right">
                                    <span className="font-bold text-foreground">
                                      {formatAmount(
                                        b.remainingAmount,
                                        b.currency
                                      )}
                                    </span>
                                    <span className="text-[9px] text-muted-foreground">
                                      {t(
                                        "finance.reconcile.row.remainingLabel"
                                      )}
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
                </div>
                <Button
                  size="sm"
                  disabled={!borrowingId || isPending}
                  onClick={() => {
                    setCustomMode(null)
                    onSaveChoice(line, "repayment", {
                      borrowingId: borrowingId,
                    })
                  }}
                  className="h-8 w-full rounded-lg bg-pink-600 text-xs font-bold text-white hover:bg-pink-700"
                >
                  {t("finance.reconcile.row.linkBorrowingConfirm")}
                </Button>
              </div>
            ) : customMode === "other_matches" && line.suggestions?.matches ? (
              /* Custom Mode 4: Choose From Multiple Matches */
              <div className="space-y-3 rounded-xl border border-border/50 bg-background/40 p-3">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-blue-500">
                    <Check className="h-3.5 w-3.5" />
                    {t("finance.reconcile.row.selectMatchingTransaction")}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[11px]"
                    onClick={() => setCustomMode(null)}
                  >
                    {t("common.cancel")}
                  </Button>
                </div>
                <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
                  {line.suggestions.matches.map((m) => (
                    <div
                      key={m.id}
                      onClick={() => m.id && setSelectedMatchId(m.id)}
                      className={cn(
                        "flex cursor-pointer items-center justify-between rounded-xl border p-2.5 text-xs transition-all",
                        selectedMatchId === m.id
                          ? "border-primary bg-primary/10"
                          : "border-border/50 bg-background/30 hover:bg-background/60"
                      )}
                    >
                      <div className="min-w-0 pr-2">
                        <p className="truncate font-bold text-foreground">
                          {m.description}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {tz.formatDate(m.effectiveDate)}
                        </p>
                      </div>
                      <span className="shrink-0 font-mono font-bold">
                        {formatAmount(m.amount, m.currency)}
                      </span>
                    </div>
                  ))}
                </div>

                {isAmountMismatch && selectedMatchObj && (
                  <div className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
                    <div className="flex items-center justify-between font-bold text-amber-500">
                      <span className="flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        {t("finance.reconcile.row.amountMismatch")}
                      </span>
                      <span className="font-mono text-[11px]">
                        {t("finance.reconcile.row.ledgerVsStatement", {
                          ledger: formatAmount(
                            selectedMatchObj.amount,
                            selectedMatchObj.currency
                          ),
                          statement: formatAmount(
                            Math.abs(lineAmount),
                            targetAccount?.currency
                          ),
                        })}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1.5 pt-1">
                      <label className="flex cursor-pointer items-start gap-2 rounded-lg p-1.5 transition-colors select-none hover:bg-background/40">
                        <input
                          type="radio"
                          name={`overwrite-other-${line.id}`}
                          checked={!overwriteTransaction}
                          onChange={() => setOverwriteTransaction(false)}
                          className="mt-0.5 text-primary focus:ring-primary"
                        />
                        <div className="min-w-0">
                          <span className="font-semibold text-foreground">
                            {t("finance.reconcile.row.keepLedgerAmount", {
                              amount: formatAmount(
                                selectedMatchObj.amount,
                                selectedMatchObj.currency
                              ),
                            })}
                          </span>
                          <p className="text-[10px] text-muted-foreground">
                            {t("finance.reconcile.row.keepLedgerDescription")}
                          </p>
                        </div>
                      </label>
                      <label className="flex cursor-pointer items-start gap-2 rounded-lg p-1.5 transition-colors select-none hover:bg-background/40">
                        <input
                          type="radio"
                          name={`overwrite-other-${line.id}`}
                          checked={overwriteTransaction}
                          onChange={() => setOverwriteTransaction(true)}
                          className="mt-0.5 text-primary focus:ring-primary"
                        />
                        <div className="min-w-0">
                          <span className="font-semibold text-primary">
                            {t("finance.reconcile.row.overwriteAmount", {
                              amount: formatAmount(
                                Math.abs(lineAmount),
                                targetAccount?.currency
                              ),
                            })}
                          </span>
                          <p className="text-[10px] text-muted-foreground">
                            {t("finance.reconcile.row.overwriteDescription")}
                          </p>
                        </div>
                      </label>
                    </div>
                  </div>
                )}

                <Button
                  size="sm"
                  disabled={!selectedMatchId || isPending}
                  onClick={() => {
                    setCustomMode(null)
                    onSaveChoice(line, "match", {
                      transactionId: selectedMatchId,
                      overwriteTransaction: isAmountMismatch
                        ? overwriteTransaction
                        : false,
                    })
                  }}
                  className="h-8 w-full rounded-lg bg-blue-600 text-xs font-bold text-white hover:bg-blue-700"
                >
                  {t("finance.reconcile.row.confirmSelectedMatch")}
                </Button>
              </div>
            ) : customMode === "search_match" ? (
              /* Custom Mode 5: Search & Manual Match Any Ledger Transaction */
              <div className="space-y-3 rounded-xl border border-blue-500/30 bg-background/50 p-3 shadow-inner">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="flex items-center gap-1.5 text-xs font-bold text-blue-500">
                      <Search className="h-3.5 w-3.5" />
                      {isExpense
                        ? t("finance.reconcile.row.findOutflow")
                        : t("finance.reconcile.row.findInflow")}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[11px]"
                    onClick={() => {
                      setCustomMode(null)
                      setSearchMatchQuery("")
                    }}
                  >
                    {t("common.cancel")}
                  </Button>
                </div>

                <div className="relative">
                  <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder={t(
                      "finance.reconcile.row.searchLedgerPlaceholder"
                    )}
                    value={searchMatchQuery}
                    onChange={(e) => setSearchMatchQuery(e.target.value)}
                    className="h-8 rounded-lg border-border/60 bg-background/50 pl-8 text-xs"
                  />
                </div>

                <div className="max-h-52 space-y-1.5 overflow-y-auto pr-1">
                  {isTxnsLoading ? (
                    <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t("finance.reconcile.row.searchingLedger")}
                    </div>
                  ) : filteredTxns.length === 0 ? (
                    <div className="py-6 text-center text-xs text-muted-foreground">
                      {t("finance.reconcile.row.noLedgerMatches")}
                    </div>
                  ) : (
                    filteredTxns.map((m) => {
                      const isSelected = selectedMatchId === m.id
                      const budget = budgets.find((b) => b.id === m.budgetId)
                      const isExactAmount =
                        Number(m.amount) === Math.abs(lineAmount)
                      const isOutflow =
                        m.type === "EXPENSE" || m.type === "TRANSFER_OUT"

                      return (
                        <div
                          key={m.id}
                          onClick={() => m.id && setSelectedMatchId(m.id)}
                          className={cn(
                            "flex cursor-pointer items-center justify-between rounded-xl border p-2.5 text-xs transition-all",
                            isSelected
                              ? "border-blue-500 bg-blue-500/10 shadow-sm ring-1 ring-blue-500/40"
                              : "border-border/40 bg-background/30 hover:bg-background/60"
                          )}
                        >
                          <div className="min-w-0 space-y-1 pr-2">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span
                                className={cn(
                                  "py-0.2 rounded px-1.5 text-[9px] font-black tracking-wider uppercase",
                                  m.type === "EXPENSE" &&
                                    "border border-rose-500/20 bg-rose-500/10 text-rose-500",
                                  m.type === "TRANSFER_OUT" &&
                                    "border border-amber-500/20 bg-amber-500/10 text-amber-500",
                                  m.type === "INCOME" &&
                                    "border border-emerald-500/20 bg-emerald-500/10 text-emerald-500",
                                  m.type === "TRANSFER_IN" &&
                                    "border border-sky-500/20 bg-sky-500/10 text-sky-500",
                                  m.type === "BALANCE_ADJUSTMENT" &&
                                    "border border-purple-500/20 bg-purple-500/10 text-purple-500"
                                )}
                              >
                                {m.type &&
                                  getLocalizedEnumLabel(
                                    "finance",
                                    "transactionType",
                                    m.type,
                                    language
                                  )}
                              </span>

                              {isExactAmount && (
                                <span className="py-0.2 rounded border border-emerald-500/20 bg-emerald-500/10 px-1.5 text-[9px] font-bold text-emerald-500">
                                  {t("finance.reconcile.row.exactAmount")}
                                </span>
                              )}

                              <p className="truncate font-bold text-foreground">
                                {m.description ||
                                  t("finance.reconcile.row.uncategorized")}
                              </p>
                            </div>

                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                              <span>
                                {m.transactionDate
                                  ? tz.formatDate(m.transactionDate)
                                  : t("finance.reconcile.row.noDate")}
                              </span>
                              {budget && (
                                <>
                                  <span>•</span>
                                  <span className="font-semibold text-primary">
                                    {budget.name}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          <span
                            className={cn(
                              "shrink-0 font-mono text-xs font-bold",
                              isOutflow ? "text-rose-500" : "text-emerald-500"
                            )}
                          >
                            {isOutflow ? "-" : "+"}
                            {formatAmount(m.amount, m.currency)}
                          </span>
                        </div>
                      )
                    })
                  )}
                </div>

                {isAmountMismatch && selectedMatchObj && (
                  <div className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
                    <div className="flex items-center justify-between font-bold text-amber-500">
                      <span className="flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        {t("finance.reconcile.row.amountMismatch")}
                      </span>
                      <span className="font-mono text-[11px]">
                        {t("finance.reconcile.row.ledgerVsStatement", {
                          ledger: formatAmount(
                            selectedMatchObj.amount,
                            selectedMatchObj.currency
                          ),
                          statement: formatAmount(
                            Math.abs(lineAmount),
                            targetAccount?.currency
                          ),
                        })}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1.5 pt-1">
                      <label className="flex cursor-pointer items-start gap-2 rounded-lg p-1.5 transition-colors select-none hover:bg-background/40">
                        <input
                          type="radio"
                          name={`overwrite-search-${line.id}`}
                          checked={!overwriteTransaction}
                          onChange={() => setOverwriteTransaction(false)}
                          className="mt-0.5 text-primary focus:ring-primary"
                        />
                        <div className="min-w-0">
                          <span className="font-semibold text-foreground">
                            {t("finance.reconcile.row.keepLedgerAmount", {
                              amount: formatAmount(
                                selectedMatchObj.amount,
                                selectedMatchObj.currency
                              ),
                            })}
                          </span>
                          <p className="text-[10px] text-muted-foreground">
                            {t("finance.reconcile.row.keepLedgerDescription")}
                          </p>
                        </div>
                      </label>
                      <label className="flex cursor-pointer items-start gap-2 rounded-lg p-1.5 transition-colors select-none hover:bg-background/40">
                        <input
                          type="radio"
                          name={`overwrite-search-${line.id}`}
                          checked={overwriteTransaction}
                          onChange={() => setOverwriteTransaction(true)}
                          className="mt-0.5 text-primary focus:ring-primary"
                        />
                        <div className="min-w-0">
                          <span className="font-semibold text-primary">
                            {t("finance.reconcile.row.overwriteAmount", {
                              amount: formatAmount(
                                Math.abs(lineAmount),
                                targetAccount?.currency
                              ),
                            })}
                          </span>
                          <p className="text-[10px] text-muted-foreground">
                            {t("finance.reconcile.row.overwriteDescription")}
                          </p>
                        </div>
                      </label>
                    </div>
                  </div>
                )}

                <Button
                  size="sm"
                  disabled={!selectedMatchId || isPending}
                  onClick={() => {
                    setCustomMode(null)
                    onSaveChoice(line, "match", {
                      transactionId: selectedMatchId,
                      overwriteTransaction: isAmountMismatch
                        ? overwriteTransaction
                        : false,
                    })
                  }}
                  className="h-8 w-full rounded-lg bg-blue-600 text-xs font-bold text-white shadow-sm hover:bg-blue-700"
                >
                  <Check className="mr-1.5 h-3.5 w-3.5" />
                  {t("finance.reconcile.row.confirmMatchWithEntry")}
                </Button>
              </div>
            ) : (
              /* Default State: Fast 1-Click Match OR Inline Category Picker */
              <div className="flex flex-1 flex-col justify-between space-y-3">
                {hasExactMatches && firstMatch ? (
                  /* Scenario A: Suggested Match Found */
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1 rounded-md border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-500">
                        <Sparkles className="h-3 w-3" />
                        {t("finance.reconcile.row.exactMatchFound")}
                      </span>
                      {line.suggestions!.matches!.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setCustomMode("other_matches")}
                          className="text-[11px] font-semibold text-primary hover:underline"
                        >
                          {t("finance.reconcile.row.otherMatches", {
                            count: line.suggestions!.matches!.length - 1,
                          })}
                        </button>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-blue-500/20 bg-blue-500/5 p-3">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-foreground">
                          {firstMatch.description}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {t("finance.reconcile.row.recordedOn", {
                            date: tz.formatDate(firstMatch.effectiveDate),
                          })}
                        </p>
                      </div>
                      <span className="shrink-0 font-mono text-xs font-black text-foreground">
                        {formatAmount(firstMatch.amount, firstMatch.currency)}
                      </span>
                    </div>
                  </div>
                ) : isExpense ? (
                  /* Scenario B: Outflow / Expense -> Direct Inline Budget Picker */
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                        {t("finance.reconcile.row.assignBudgetCategory")}
                      </Label>
                    </div>
                    <BudgetSelect
                      value={selectedBudgetId}
                      onValueChange={setSelectedBudgetId}
                      budgets={budgets}
                      className="!h-9 text-xs"
                    />
                  </div>
                ) : (
                  /* Scenario C: Inflow / Income -> Quick Record */
                  <div className="flex items-center space-x-2.5 rounded-xl border border-border/40 bg-emerald-500/5 p-2.5 text-xs text-emerald-600 dark:text-emerald-400">
                    <ArrowDownLeft className="h-4 w-4 shrink-0" />
                    <span>{t("finance.reconcile.row.inflowHint")}</span>
                  </div>
                )}

                {/* Bottom Row Actions */}
                <div className="flex items-center justify-between gap-2 pt-1">
                  {/* More Options Dropdown */}
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 rounded-lg px-2.5 text-xs text-muted-foreground hover:text-foreground"
                        >
                          {t("finance.reconcile.row.more")}
                          <ChevronDown className="ml-1 h-3.5 w-3.5 opacity-60" />
                        </Button>
                      }
                    />
                    <DropdownMenuContent
                      align="start"
                      className="w-56 rounded-xl p-1 shadow-xl"
                    >
                      <DropdownMenuItem
                        onClick={() => setCustomMode("search_match")}
                        className="cursor-pointer text-xs font-semibold text-blue-500 focus:text-blue-500"
                      >
                        <Search className="mr-2 h-3.5 w-3.5" />
                        {t("finance.reconcile.row.findAndMatch")}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {hasExactMatches && (
                        <DropdownMenuItem
                          onClick={() => {
                            setSelectedBudgetId(budgets[0]?.id || "")
                          }}
                          className="cursor-pointer text-xs"
                        >
                          {t("finance.reconcile.row.createNewExpense")}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onClick={() => setCustomMode("scheduled")}
                        className="cursor-pointer text-xs"
                      >
                        <CalendarClock className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                        {t("finance.reconcile.row.linkScheduledPayment")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setCustomMode("repayment")}
                        className="cursor-pointer text-xs"
                      >
                        <HandCoins className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                        {t("finance.reconcile.row.linkBorrowingRecord")}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => onSaveChoice(line, "skip", {})}
                        className="cursor-pointer text-xs text-amber-500 focus:text-amber-500"
                      >
                        <SkipForward className="mr-2 h-3.5 w-3.5" />
                        {t("finance.reconcile.row.skipThisLine")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {/* Right Actions: Direct Transfer Button + Primary Action Button */}
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCustomMode("transfer")}
                      className="h-8 rounded-lg border-border/60 px-3 text-xs font-semibold transition-all hover:border-primary/50 hover:bg-primary/5"
                    >
                      <ArrowRightLeft className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
                      {t("finance.reconcile.row.transfer")}
                    </Button>

                    {hasExactMatches && firstMatch ? (
                      <Button
                        size="sm"
                        disabled={isPending}
                        onClick={() =>
                          onSaveChoice(line, "match", {
                            transactionId: firstMatch.id,
                          })
                        }
                        className="h-8 rounded-lg bg-blue-600 px-4 text-xs font-bold text-white shadow-sm transition-all hover:bg-blue-700"
                      >
                        <Check className="mr-1.5 h-3.5 w-3.5" />
                        {t("finance.reconcile.row.match")}
                      </Button>
                    ) : isExpense ? (
                      <Button
                        size="sm"
                        disabled={!selectedBudgetId || isPending}
                        onClick={() =>
                          onSaveChoice(line, "expense", {
                            budgetId: selectedBudgetId,
                          })
                        }
                        className="h-8 rounded-lg bg-primary px-4 text-xs font-bold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
                      >
                        {t("finance.reconcile.row.createExpense")}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        disabled={isPending}
                        onClick={() => onSaveChoice(line, "income", {})}
                        className="h-8 rounded-lg bg-emerald-600 px-4 text-xs font-bold text-white shadow-sm transition-all hover:bg-emerald-700"
                      >
                        {t("finance.reconcile.row.recordIncome")}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
