import { useState, useEffect, useMemo } from "react"
import {
  useListInboxItemsQuery,
  useApproveInboxItemMutation,
  useDiscardInboxItemMutation,
  useListScheduledPaymentsQuery,
  useListAccountsQuery,
  useListBorrowingsQuery,
  useCreateBorrowingRepaymentMutation,
  useListBudgetsQuery,
  useListTransactionsQuery,
  type InboxItem,
} from "@/gen/saturn/finance/v1/finance"
import { useActiveSpaceContext } from "@/features/space/use-space"
import { FinancePageLayout } from "./components/finance-page-layout"
import { AccountSelect } from "./components/account-select"
import { cn } from "@/lib/utils"
import { BudgetSelect } from "./components/budget-select"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
import {
  Check,
  Trash2,
  Inbox,
  Calendar,
  Loader2,
  Mail,
  Sparkles,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  ArrowLeftRight,
  Info,
} from "lucide-react"
import { formatCents } from "./utils"
import { toast } from "@/components/ui/toast"

export function InboxView() {
  const { spaceId } = useActiveSpaceContext()

  // 1. Query inbox items
  const {
    data: inboxData,
    isLoading: inboxLoading,
    refetch: refetchInbox,
  } = useListInboxItemsQuery({}, { enabled: !!spaceId })

  const inboxItems = useMemo(
    () => inboxData?.inboxItems || [],
    [inboxData?.inboxItems]
  )

  // 2. State for the selected inbox item
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const selectedItem =
    inboxItems.find((item) => item.id === selectedItemId) || null

  const [txSearch, setTxSearch] = useState("")
  const [popoverOpen, setPopoverOpen] = useState(false)

  useEffect(() => {
    if (!popoverOpen) {
      setTxSearch("")
    }
  }, [popoverOpen])

  const [overwriteLinkedTx, setOverwriteLinkedTx] = useState(false)
  const [transferLeg, setTransferLeg] = useState<"SOURCE" | "DESTINATION">(
    "SOURCE"
  )

  useEffect(() => {
    setError(null)
    setOverwriteLinkedTx(false)

    let initialLeg: "SOURCE" | "DESTINATION" = "SOURCE"
    try {
      if (selectedItem?.metadataJson) {
        const meta = JSON.parse(selectedItem.metadataJson)
        const legVal = meta.suggested_transfer_leg || meta.transfer_leg
        if (
          legVal &&
          (legVal.toUpperCase() === "DESTINATION" ||
            legVal.toUpperCase() === "CREDIT" ||
            legVal.toUpperCase() === "INFLOW")
        ) {
          initialLeg = "DESTINATION"
        }
      }
    } catch {
      // Ignore JSON parse errors
    }
    setTransferLeg(initialLeg)
  }, [selectedItemId, selectedItem])

  useEffect(() => {
    if (!selectedItemId && inboxItems.length > 0) {
      setSelectedItemId(inboxItems[0].id || null)
    }
  }, [inboxItems, selectedItemId])

  // 3. Query supporting context
  const { data: accountsData } = useListAccountsQuery(
    {},
    { enabled: !!spaceId }
  )
  const accounts = accountsData?.accounts || []

  const { data: budgetsData } = useListBudgetsQuery(
    { pageSize: 100, pageToken: "" },
    { enabled: !!spaceId }
  )
  const budgets = budgetsData?.budgets || []

  const { data: paymentsData } = useListScheduledPaymentsQuery(
    {
      status: "pending",
      pageSize: 100,
      pageToken: "",
      startDate: "",
      endDate: "",
    },
    { enabled: !!spaceId }
  )
  const payments = paymentsData?.scheduledPayments || []

  const { data: borrowingsData } = useListBorrowingsQuery(
    { status: "BORROWING_STATUS_ACTIVE", pageSize: 100, pageToken: "" },
    { enabled: !!spaceId }
  )
  const borrowings = borrowingsData?.borrowings || []

  const { data: txnsData } = useListTransactionsQuery(
    {
      budgetId: "",
      type: "TYPE_UNSPECIFIED",
      pageSize: 100,
      pageToken: "",
      sourceType: "",
      sourceId: "",
    },
    { enabled: !!spaceId }
  )
  const transactions = txnsData?.transactions || []

  // 4. Mutations
  const approveMutation = useApproveInboxItemMutation()
  const discardMutation = useDiscardInboxItemMutation()
  const createRepaymentMutation = useCreateBorrowingRepaymentMutation()

  // 5. Overrides state management
  const [overrides, setOverrides] = useState<
    Record<
      string,
      {
        accountId?: string
        budgetId?: string
        scheduledPaymentId?: string
        borrowingId?: string
        amountStr?: string
        description?: string
        docType?: string
        transactionType?: string
        destinationAccountId?: string
        transactionId?: string
        currency?: string
      }
    >
  >({})

  const [rawOpen, setRawOpen] = useState(false)

  const getVal = (
    id: string,
    key:
      | "accountId"
      | "budgetId"
      | "scheduledPaymentId"
      | "borrowingId"
      | "amountStr"
      | "description"
      | "docType"
      | "transactionType"
      | "destinationAccountId"
      | "transactionId"
      | "currency",
    fallback: string
  ) => {
    return overrides[id]?.[key] ?? fallback
  }

  const setVal = (
    id: string,
    key:
      | "accountId"
      | "budgetId"
      | "scheduledPaymentId"
      | "borrowingId"
      | "amountStr"
      | "description"
      | "docType"
      | "transactionType"
      | "destinationAccountId"
      | "transactionId"
      | "currency",
    val: string
  ) => {
    setOverrides((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        [key]: val,
      },
    }))
  }

  useEffect(() => {
    if (selectedItem) {
      const id = selectedItem.id || ""
      if (!overrides[id]) {
        let meta: {
          suggested_borrowing_id?: string
          transaction_type?: string
          potential_duplicate_id?: string
        } = {}
        try {
          if (selectedItem.metadataJson) {
            meta = JSON.parse(selectedItem.metadataJson)
          }
        } catch {
          // Ignore JSON parse errors
        }

        setOverrides((prev) => ({
          ...prev,
          [id]: {
            accountId: selectedItem.accountId || "",
            budgetId: selectedItem.budgetId || "",
            scheduledPaymentId: selectedItem.scheduledPaymentId || "",
            borrowingId: meta.suggested_borrowing_id || "",
            amountStr: (Number(selectedItem.amount || 0) / 100).toFixed(2),
            description: selectedItem.vendorName || "",
            docType: (selectedItem.docType || "RECEIPT").toUpperCase(),
            transactionType: (meta.transaction_type || "EXPENSE").toUpperCase(),
            destinationAccountId: "",
            transactionId: meta.potential_duplicate_id || "",
            currency: selectedItem.currency || "USD",
          },
        }))
      }
    }
  }, [selectedItem, overrides])

  const handleApprove = async (tx: InboxItem) => {
    setError(null)
    const id = tx.id || ""
    const accId = getVal(id, "accountId", "")
    const budId = getVal(id, "budgetId", "")
    const payId = getVal(id, "scheduledPaymentId", "")
    const borrowingId = getVal(id, "borrowingId", "")
    const amtStr = getVal(id, "amountStr", "")
    const desc = getVal(id, "description", "")
    const docType = getVal(id, "docType", tx.docType || "RECEIPT").toUpperCase()
    const txnType = getVal(id, "transactionType", "EXPENSE").toUpperCase()
    const destAccId = getVal(id, "destinationAccountId", "")
    const txnId = getVal(id, "transactionId", "")
    const currency = getVal(id, "currency", tx.currency || "USD")

    // Validate required fields and present explicit user feedback
    const isLinking = txnId && txnId !== "none"
    if (!isLinking) {
      if (txnType === "TRANSFER") {
        if (!accId || !destAccId) {
          const errMsg =
            "Both Source Account and Destination Account are required for Transfer transactions."
          setError(errMsg)
          return
        }
      } else if (docType === "INVOICE") {
        if (!budId) {
          const errMsg =
            "Budget Category is required to schedule an unpaid Invoice."
          setError(errMsg)
          return
        }
      } else {
        if (!accId) {
          const errMsg =
            "Debit/Credit Account is required to record this transaction."
          setError(errMsg)
          return
        }
      }
    }

    let finalAmount = tx.amount || "0"
    if (amtStr) {
      const cents = parseFloat(amtStr) * 100
      if (!isNaN(cents)) {
        finalAmount = Math.round(cents).toString()
      }
    }

    try {
      // 1. Call standard Inbox Approval
      await approveMutation.mutateAsync({
        id,
        req: {
          id,
          accountId: accId,
          budgetId: budId,
          scheduledPaymentId: payId,
          amount: finalAmount,
          description: desc || tx.vendorName || "",
          docType: docType,
          transactionType: txnType,
          destinationAccountId: destAccId,
          transactionId: txnId,
          overwriteLinkedTransaction: overwriteLinkedTx,
          transferLeg: transferLeg,
          currency: currency,
        },
      })

      // 2. If a borrowing option is selected, create a repayment record
      if (borrowingId && borrowingId !== "none") {
        await createRepaymentMutation.mutateAsync({
          borrowing_id: borrowingId,
          req: {
            borrowingId,
            repayment: {
              amount: finalAmount,
              paymentDate: tx.transactionDate || new Date().toISOString(),
              notes: `Inbox payment match for vendor: ${desc || tx.vendorName}`,
              accountId: accId,
            },
          },
        })
      }

      // 3. Select next available item
      const remaining = inboxItems.filter((item) => item.id !== id)
      if (remaining.length > 0) {
        setSelectedItemId(remaining[0].id || null)
      } else {
        setSelectedItemId(null)
      }

      refetchInbox()
      toast.add({
        title: "Reconciliation Approved",
        description: `Successfully reconciled ${desc || tx.vendorName || "transaction"}.`,
        type: "success",
      })
    } catch (err: unknown) {
      console.error("Reconciliation approval failed", err)
      const errorVal = err as { message?: string }
      setError(errorVal.message || "Reconciliation approval failed")
    }
  }

  const handleDiscard = async (id: string) => {
    if (!confirm("Are you sure you want to discard this inbox item?")) {
      return
    }
    try {
      await discardMutation.mutateAsync({
        id,
        req: { id },
      })
      const remaining = inboxItems.filter((item) => item.id !== id)
      if (remaining.length > 0) {
        setSelectedItemId(remaining[0].id || null)
      } else {
        setSelectedItemId(null)
      }
      refetchInbox()
      toast.add({
        title: "Item Discarded",
        description: "Successfully discarded the inbox item.",
        type: "success",
      })
    } catch (err: unknown) {
      console.error("Failed to discard inbox item", err)
      const errorVal = err as { message?: string }
      toast.add({
        title: "Discard Failed",
        description: errorVal.message || "Failed to discard the item.",
        type: "error",
      })
    }
  }

  return (
    <FinancePageLayout
      title="Reconciliation Queue"
      description="Verify parsed bank statements, receipts, and outstanding invoices side-by-side to review and commit entries to the general ledger."
      icon={Inbox}
    >
      {inboxLoading ? (
        <div className="flex flex-col items-center justify-center gap-3 py-32">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">
            Opening your financial inbox...
          </span>
        </div>
      ) : inboxItems.length === 0 ? (
        <div className="flex animate-in flex-col items-center justify-center rounded-3xl border border-dashed border-border/40 bg-card/10 px-6 py-24 text-center duration-300 fade-in">
          <Inbox className="mb-4 h-16 w-16 text-muted-foreground/20" />
          <h4 className="text-lg font-bold text-foreground">
            No items pending review
          </h4>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
            All your transaction receipts, bank swipes, and email integrations
            have been successfully reconciled. Clean ledger!
          </p>
        </div>
      ) : (
        <div className="grid animate-in grid-cols-1 gap-8 duration-300 fade-in lg:grid-cols-12">
          {/* Master Panel (Left, 4 cols) */}
          <div className="space-y-4 lg:col-span-4">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                Staged Items ({inboxItems.length})
              </span>
            </div>
            <ScrollArea className="h-[calc(100vh-280px)] rounded-3xl border border-border/30 bg-card/20 p-2 backdrop-blur-xl">
              <div className="space-y-2 p-1">
                {inboxItems.map((tx) => {
                  const isSelected = tx.id === selectedItemId
                  const amt = (Number(tx.amount || 0) / 100).toLocaleString(
                    undefined,
                    { minimumFractionDigits: 2 }
                  )
                  let meta: { duplicate_warning?: boolean } = {}
                  try {
                    if (tx.metadataJson) {
                      meta = JSON.parse(tx.metadataJson)
                    }
                  } catch {
                    // Ignore JSON parse errors
                  }

                  return (
                    <button
                      key={tx.id}
                      onClick={() => setSelectedItemId(tx.id || null)}
                      className={`group relative flex w-full cursor-pointer flex-col gap-2 overflow-hidden rounded-2xl border p-4 text-left transition-all duration-300 ${
                        isSelected
                          ? "border-primary bg-primary/10 shadow-md"
                          : "border-border/40 bg-card/45 hover:border-border/80 hover:bg-card/75"
                      }`}
                    >
                      {meta.duplicate_warning && (
                        <div className="absolute top-0 right-0 h-3 w-3 rounded-bl-lg bg-amber-500" />
                      )}
                      <div className="flex items-start justify-between gap-2">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-bold tracking-wider uppercase ${
                            tx.docType === "invoice"
                              ? "border-amber-500/20 bg-amber-500/10 text-amber-500"
                              : tx.docType === "bank_notification"
                                ? "border-teal-500/20 bg-teal-500/10 text-teal-400"
                                : "border-indigo-500/20 bg-indigo-500/10 text-indigo-400"
                          }`}
                        >
                          {tx.docType || "AI PARSED"}
                        </span>
                        <span className="text-xs font-black text-foreground">
                          {tx.currency || "USD"} {amt}
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="line-clamp-1 text-sm font-bold text-foreground">
                          {tx.vendorName || "Unknown Vendor"}
                        </span>
                        <span className="mt-0.5 text-[10px] text-muted-foreground">
                          {tx.transactionDate
                            ? new Date(tx.transactionDate).toLocaleDateString()
                            : tx.createTime
                              ? new Date(tx.createTime).toLocaleDateString()
                              : ""}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </ScrollArea>
          </div>

          {/* Detail Panel (Right, 8 cols) */}
          <div className="lg:col-span-8">
            {selectedItem ? (
              <Card className="flex animate-in flex-col gap-3 rounded-3xl border border-border/40 bg-card/35 p-5 shadow-2xl backdrop-blur-xl duration-300 slide-in-from-right-4">
                {/* Selected Item Title Header */}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <span className="inline-flex animate-pulse items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-0.5 text-[10px] font-black tracking-wider text-primary uppercase">
                      <Sparkles className="h-3 w-3" />
                      Ingestion Auditor
                    </span>
                    <h3 className="text-xl font-bold text-foreground">
                      {selectedItem.vendorName || "Review Transaction"}
                    </h3>
                  </div>
                  <div className="text-left sm:text-right">
                    <span className="block text-2xl font-black tracking-tight text-foreground">
                      {selectedItem.currency || "USD"}{" "}
                      {(Number(selectedItem.amount || 0) / 100).toLocaleString(
                        undefined,
                        { minimumFractionDigits: 2 }
                      )}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      Received via Inbound Integration
                    </span>
                  </div>
                </div>

                {/* Collapsible raw payload/email details */}
                <div className="overflow-hidden rounded-2xl border border-border/30 bg-muted/20">
                  <button
                    onClick={() => setRawOpen(!rawOpen)}
                    className="flex w-full cursor-pointer items-center justify-between px-4 py-3 text-sm font-bold text-muted-foreground transition-colors hover:bg-muted/40"
                  >
                    <span className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-indigo-400" />
                      View Original Email Contents
                    </span>
                    {rawOpen ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </button>
                  {rawOpen && (
                    <div className="max-h-60 overflow-y-auto border-t border-border/20 bg-background/50 p-4 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
                      {selectedItem.rawPayload || "No raw text available."}
                    </div>
                  )}
                </div>

                {/* Warnings (e.g. duplicate alerts) */}
                {(() => {
                  let meta: {
                    duplicate_warning?: boolean
                    duplicate_reason?: string
                    potential_duplicate_id?: string
                  } = {}
                  try {
                    if (selectedItem.metadataJson) {
                      meta = JSON.parse(selectedItem.metadataJson)
                    }
                  } catch {
                    // Ignore JSON parse errors
                  }

                  if (meta.duplicate_warning) {
                    const dupTx = meta.potential_duplicate_id
                      ? transactions.find(
                          (t) => t.id === meta.potential_duplicate_id
                        )
                      : undefined

                    return (
                      <div className="flex animate-in gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs leading-relaxed text-amber-500 duration-300 fade-in">
                        <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
                        <div className="flex-grow">
                          <span className="block font-bold">
                            Potential Duplicate Warning
                          </span>
                          <span className="mt-0.5 block text-muted-foreground">
                            {meta.duplicate_reason ||
                              "This transaction may have already been registered on the ledger."}
                          </span>
                          {dupTx && (
                            <div className="mt-3 rounded-xl border border-amber-500/10 bg-amber-500/10 p-3 text-amber-600 dark:text-amber-400">
                              <span className="block font-semibold">
                                Matched Transaction:
                              </span>
                              <div className="mt-1 grid grid-cols-2 gap-1 text-[11px]">
                                <div>
                                  <span className="text-muted-foreground">
                                    Date:
                                  </span>{" "}
                                  {dupTx.transactionDate
                                    ? new Date(
                                        dupTx.transactionDate
                                      ).toLocaleDateString()
                                    : "N/A"}
                                </div>
                                <div>
                                  <span className="text-muted-foreground">
                                    Amount:
                                  </span>{" "}
                                  {dupTx.currency}{" "}
                                  {(Number(dupTx.amount || 0) / 100).toFixed(2)}
                                </div>
                                <div className="col-span-2">
                                  <span className="text-muted-foreground">
                                    Vendor:
                                  </span>{" "}
                                  {dupTx.description || "N/A"}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  }
                  return null
                })()}

                <Separator className="bg-border/20" />

                {/* Form fields */}
                <div className="grid grid-cols-1 gap-x-6 gap-y-3.5 md:grid-cols-2">
                  {(() => {
                    const currentDocType = getVal(
                      selectedItem.id || "",
                      "docType",
                      selectedItem.docType || "RECEIPT"
                    ).toUpperCase()
                    const currentTxnType = getVal(
                      selectedItem.id || "",
                      "transactionType",
                      "EXPENSE"
                    ).toUpperCase()
                    const txnId = getVal(
                      selectedItem.id || "",
                      "transactionId",
                      ""
                    )
                    const isLinking = !!(txnId && txnId !== "none")
                    const selectedTxId = txnId

                    const filteredTransactions = transactions.filter((t) => {
                      const q = txSearch.toLowerCase().trim()
                      if (!q) return true
                      const vendor = (t.description || "").toLowerCase()
                      const amountStr = (Number(t.amount || 0) / 100).toFixed(2)
                      const budgetName =
                        budgets
                          .find((b) => b.id === t.budgetId)
                          ?.name?.toLowerCase() || ""
                      const accountName =
                        accounts
                          .find((a) => a.id === t.accountId)
                          ?.name?.toLowerCase() || ""
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

                    return (
                      <>
                        {(currentDocType === "RECEIPT" ||
                          currentDocType === "BANK_NOTIFICATION" ||
                          currentDocType === "INVOICE") && (
                          <div className="space-y-2 md:col-span-2">
                            <Label className="flex items-center gap-1.5 text-xs font-bold tracking-wider text-muted-foreground uppercase">
                              <ArrowLeftRight className="h-3.5 w-3.5" />
                              Link to Existing Transaction (Optional)
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
                                    if (!matched) return "Selected Transaction"
                                    const dateStr = matched.transactionDate
                                      ? new Date(
                                          matched.transactionDate
                                        ).toLocaleDateString()
                                      : ""
                                    const amtStr = formatCents(
                                      matched.amount || "0"
                                    )
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
                                              "No description"}
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
                                    Search or select an existing transaction to
                                    link...
                                  </span>
                                )}
                                <ChevronDown className="h-4 w-4 shrink-0 pl-1 opacity-50" />
                              </PopoverTrigger>
                              <PopoverContent
                                align="start"
                                className="flex w-[var(--anchor-width)] min-w-[320px] flex-col gap-2 rounded-2xl border border-border/50 bg-card/95 p-2 shadow-2xl backdrop-blur-xl"
                              >
                                <Input
                                  placeholder="Type to search (vendor, amount, budget, account...)"
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
                                        const id = selectedItem.id || ""
                                        setVal(id, "transactionId", "none")
                                        setVal(
                                          id,
                                          "amountStr",
                                          (
                                            Number(selectedItem.amount || 0) /
                                            100
                                          ).toFixed(2)
                                        )
                                        setVal(
                                          id,
                                          "description",
                                          selectedItem.vendorName || ""
                                        )
                                        setVal(
                                          id,
                                          "accountId",
                                          selectedItem.accountId || ""
                                        )
                                        setVal(
                                          id,
                                          "budgetId",
                                          selectedItem.budgetId || ""
                                        )
                                        setPopoverOpen(false)
                                      }}
                                    >
                                      None (Create new transaction)
                                    </button>
                                    <Separator className="my-0.5 bg-border/10" />
                                    {filteredTransactions.length === 0 ? (
                                      <div className="p-4 text-center text-xs text-muted-foreground">
                                        No transactions found.
                                      </div>
                                    ) : (
                                      filteredTransactions.map((t) => {
                                        const dateStr = t.transactionDate
                                          ? new Date(
                                              t.transactionDate
                                            ).toLocaleDateString()
                                          : ""
                                        const amtStr = formatCents(
                                          t.amount || "0"
                                        )
                                        const budgetName =
                                          budgets.find(
                                            (b) => b.id === t.budgetId
                                          )?.name || ""
                                        const accountName =
                                          accounts.find(
                                            (a) => a.id === t.accountId
                                          )?.name || ""
                                        const isSelected = selectedTxId === t.id

                                        return (
                                          <button
                                            key={t.id}
                                            type="button"
                                            className={cn(
                                              "flex w-full cursor-pointer items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs transition-colors hover:bg-muted/10",
                                              isSelected &&
                                                "border border-primary/20 bg-primary/10 hover:bg-primary/15"
                                            )}
                                            onClick={() => {
                                              const id = selectedItem.id || ""
                                              setVal(
                                                id,
                                                "transactionId",
                                                t.id || ""
                                              )
                                              setVal(
                                                id,
                                                "amountStr",
                                                (
                                                  Number(t.amount || 0) / 100
                                                ).toFixed(2)
                                              )
                                              setVal(
                                                id,
                                                "description",
                                                t.description || ""
                                              )
                                              setVal(
                                                id,
                                                "accountId",
                                                t.accountId || ""
                                              )
                                              setVal(
                                                id,
                                                "budgetId",
                                                t.budgetId || ""
                                              )
                                              setPopoverOpen(false)
                                            }}
                                          >
                                            <div className="flex min-w-0 flex-col gap-0.5">
                                              <div className="flex items-center gap-1.5 truncate pr-2 font-semibold text-foreground">
                                                <span
                                                  className={cn(
                                                    "h-1.5 w-1.5 shrink-0 rounded-full",
                                                    t.type === "INCOME"
                                                      ? "bg-emerald-500"
                                                      : "bg-rose-500"
                                                  )}
                                                />
                                                {t.description ||
                                                  "No description"}
                                              </div>
                                              <div className="flex flex-wrap gap-x-1.5 gap-y-0.5 text-[10px] text-muted-foreground">
                                                <span>{dateStr}</span>
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
                                                {amtStr} {t.currency}
                                              </span>
                                              {budgetName && (
                                                <span className="text-[9px] font-semibold tracking-wider text-muted-foreground uppercase">
                                                  {budgetName}
                                                </span>
                                              )}
                                            </div>
                                          </button>
                                        )
                                      })
                                    )}
                                  </div>
                                </ScrollArea>
                              </PopoverContent>
                            </Popover>
                            {(() => {
                              if (!selectedTxId || selectedTxId === "none")
                                return null
                              const matched = transactions.find(
                                (t) => t.id === selectedTxId
                              )
                              if (!matched) return null

                              const hasAmountMismatch =
                                Number(matched.amount) !==
                                Number(selectedItem.amount)
                              const hasCurrencyMismatch =
                                matched.currency !== selectedItem.currency

                              if (!hasAmountMismatch && !hasCurrencyMismatch)
                                return null

                              const stagingAmt = formatCents(
                                selectedItem.amount?.toString() || "0"
                              )
                              const ledgerAmt = formatCents(
                                matched.amount?.toString() || "0"
                              )

                              return (
                                <div className="mt-2.5 flex animate-in flex-col gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3 duration-200 fade-in md:col-span-2">
                                  <div className="flex items-start gap-2">
                                    <AlertTriangle className="mt-0.5 h-4.5 w-4.5 shrink-0 text-amber-500" />
                                    <div className="flex min-w-0 flex-col gap-0.5">
                                      <span className="text-xs font-bold text-amber-400">
                                        Reconciliation Mismatch Detected
                                      </span>
                                      <p className="text-[11px] leading-normal text-muted-foreground">
                                        The details on the staging receipt do
                                        not match the existing ledger
                                        transaction.
                                      </p>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-2 gap-3 rounded-xl border border-border/20 bg-background/30 p-2.5 text-xs">
                                    <div className="flex flex-col gap-0.5">
                                      <span className="text-[9px] font-semibold tracking-wider text-muted-foreground uppercase">
                                        Staged Receipt
                                      </span>
                                      <span className="font-bold text-foreground">
                                        {stagingAmt} {selectedItem.currency}
                                      </span>
                                      <span className="truncate text-[10px] text-muted-foreground">
                                        {selectedItem.vendorName ||
                                          "No description"}
                                      </span>
                                    </div>
                                    <div className="flex flex-col gap-0.5 border-l border-border/10 pl-3">
                                      <span className="text-[9px] font-semibold tracking-wider text-muted-foreground uppercase">
                                        Ledger Entry
                                      </span>
                                      <span className="font-bold text-foreground">
                                        {ledgerAmt} {matched.currency}
                                      </span>
                                      <span className="truncate text-[10px] text-muted-foreground">
                                        {matched.description ||
                                          "No description"}
                                      </span>
                                    </div>
                                  </div>

                                  <div className="flex flex-col gap-2">
                                    <span className="text-[9px] font-bold tracking-wider text-muted-foreground uppercase">
                                      Reconciliation Action
                                    </span>
                                    <RadioGroup
                                      value={
                                        overwriteLinkedTx ? "overwrite" : "keep"
                                      }
                                      onValueChange={(val) => {
                                        const isOverwrite = val === "overwrite"
                                        setOverwriteLinkedTx(isOverwrite)
                                        const id = selectedItem.id || ""
                                        if (matched) {
                                          if (isOverwrite) {
                                            setVal(
                                              id,
                                              "amountStr",
                                              (
                                                Number(
                                                  selectedItem.amount || 0
                                                ) / 100
                                              ).toFixed(2)
                                            )
                                            setVal(
                                              id,
                                              "description",
                                              selectedItem.vendorName || ""
                                            )
                                          } else {
                                            setVal(
                                              id,
                                              "amountStr",
                                              (
                                                Number(matched.amount || 0) /
                                                100
                                              ).toFixed(2)
                                            )
                                            setVal(
                                              id,
                                              "description",
                                              matched.description || ""
                                            )
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
                                            Keep ledger transaction details
                                            (Recommended)
                                          </span>
                                          <span className="mt-0.5 text-[10px] text-muted-foreground">
                                            The receipt is linked as supporting
                                            proof, leaving transaction balances
                                            intact.
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
                                            Overwrite ledger transaction with
                                            receipt details
                                          </span>
                                          <span className="mt-0.5 text-[10px] text-muted-foreground">
                                            Updates transaction amount to{" "}
                                            {stagingAmt} {selectedItem.currency}{" "}
                                            and adjusts balances.
                                          </span>
                                        </div>
                                      </label>
                                    </RadioGroup>
                                  </div>
                                </div>
                              )
                            })()}
                          </div>
                        )}

                        <div className="space-y-2">
                          <Label className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                            Document Classification
                          </Label>
                          <Select
                            value={currentDocType}
                            onValueChange={(val) =>
                              setVal(
                                selectedItem.id || "",
                                "docType",
                                val || "RECEIPT"
                              )
                            }
                          >
                            <SelectTrigger className="h-10 w-full rounded-xl border-border/60 bg-background/40">
                              <SelectValue placeholder="Select classification">
                                {currentDocType === "RECEIPT"
                                  ? "Receipt (Completed/Paid purchase)"
                                  : currentDocType === "INVOICE"
                                    ? "Invoice (Unpaid bill / Future payment)"
                                    : currentDocType === "BANK_NOTIFICATION"
                                      ? "Bank Notification (Bank alert, wire)"
                                      : "Select classification"}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent className="rounded-xl border border-border/50 bg-card/90 shadow-xl backdrop-blur-xl">
                              <SelectItem value="RECEIPT">
                                Receipt (Completed/Paid purchase)
                              </SelectItem>
                              <SelectItem value="INVOICE">
                                Invoice (Unpaid bill / Future payment)
                              </SelectItem>
                              <SelectItem value="BANK_NOTIFICATION">
                                Bank Notification (Bank alert, wire)
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {currentDocType === "INVOICE" && (
                          <div className="flex animate-in gap-2 rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 text-[11px] leading-relaxed text-blue-400 duration-300 slide-in-from-top-2 md:col-span-2">
                            <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
                            <span>
                              <strong>Pro Tip:</strong> If this invoice has
                              already been paid, change the Document
                              Classification to{" "}
                              <strong>Receipt (Completed/Paid purchase)</strong>{" "}
                              to log the transaction directly on your ledger.
                            </span>
                          </div>
                        )}

                        {currentDocType === "RECEIPT" && (
                          <div className="flex animate-in gap-2 rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 text-[11px] leading-relaxed text-blue-400 duration-300 slide-in-from-top-2 md:col-span-2">
                            <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
                            <span>
                              <strong>Pro Tip:</strong> If this receipt has not
                              been paid yet, change the Document Classification
                              to{" "}
                              <strong>
                                Invoice (Unpaid bill / Future payment)
                              </strong>{" "}
                              to schedule a future payment.
                            </span>
                          </div>
                        )}

                        <div className="space-y-2">
                          <Label className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                            Transaction Type
                          </Label>
                          <Select
                            value={currentTxnType}
                            onValueChange={(val) =>
                              setVal(
                                selectedItem.id || "",
                                "transactionType",
                                val || "EXPENSE"
                              )
                            }
                            disabled={isLinking}
                          >
                            <SelectTrigger className="h-10 w-full rounded-xl border-border/60 bg-background/40">
                              <SelectValue placeholder="Select type">
                                {currentTxnType === "EXPENSE"
                                  ? "Expense (Outflow)"
                                  : currentTxnType === "INCOME"
                                    ? "Income (Inflow)"
                                    : currentTxnType === "TRANSFER"
                                      ? "Transfer (Between owned accounts)"
                                      : "Select type"}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent className="rounded-xl border border-border/50 bg-card/90 shadow-xl backdrop-blur-xl">
                              <SelectItem value="EXPENSE">
                                Expense (Outflow)
                              </SelectItem>
                              <SelectItem value="INCOME">
                                Income (Inflow)
                              </SelectItem>
                              <SelectItem value="TRANSFER">
                                Transfer (Between owned accounts)
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                            Vendor / Description
                          </Label>
                          <Input
                            className="h-10 w-full rounded-xl border-border/60 bg-background/40"
                            value={getVal(
                              selectedItem.id || "",
                              "description",
                              selectedItem.vendorName || ""
                            )}
                            onChange={(e) =>
                              setVal(
                                selectedItem.id || "",
                                "description",
                                e.target.value
                              )
                            }
                            disabled={isLinking}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                            Amount Override
                          </Label>
                          <div className="flex gap-2">
                            <Input
                              type="number"
                              step="0.01"
                              className="h-10 flex-1 rounded-xl border-border/60 bg-background/40"
                              value={getVal(
                                selectedItem.id || "",
                                "amountStr",
                                ""
                              )}
                              onChange={(e) =>
                                setVal(
                                  selectedItem.id || "",
                                  "amountStr",
                                  e.target.value
                                )
                              }
                              disabled={isLinking}
                            />
                            <Select
                              value={getVal(
                                selectedItem.id || "",
                                "currency",
                                selectedItem.currency || "USD"
                              )}
                              onValueChange={(val) =>
                                setVal(
                                  selectedItem.id || "",
                                  "currency",
                                  val || "USD"
                                )
                              }
                              disabled={isLinking}
                            >
                              <SelectTrigger className="h-10 w-24 rounded-xl border-border/60 bg-background/40 font-semibold focus:ring-1 focus:ring-ring">
                                <SelectValue placeholder="USD" />
                              </SelectTrigger>
                              <SelectContent className="rounded-xl border border-border/50 bg-card/90 shadow-xl backdrop-blur-xl">
                                <SelectItem value="USD">USD</SelectItem>
                                <SelectItem value="DOP">DOP</SelectItem>
                                <SelectItem value="EUR">EUR</SelectItem>
                                <SelectItem value="GBP">GBP</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        {currentTxnType === "TRANSFER" ? (
                          <>
                            <div className="space-y-1.5">
                              <Label className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                                Source Account (Debit) (Required)
                              </Label>
                              <AccountSelect
                                className="h-10 w-full rounded-xl border-border/60 bg-background/40"
                                value={getVal(
                                  selectedItem.id || "",
                                  "accountId",
                                  selectedItem.accountId || ""
                                )}
                                onValueChange={(val) =>
                                  setVal(
                                    selectedItem.id || "",
                                    "accountId",
                                    val
                                  )
                                }
                                accounts={accounts}
                                disabled={isLinking}
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                                Destination Account (Credit) (Required)
                              </Label>
                              <AccountSelect
                                className="h-10 w-full rounded-xl border-border/60 bg-background/40"
                                value={getVal(
                                  selectedItem.id || "",
                                  "destinationAccountId",
                                  ""
                                )}
                                onValueChange={(val) =>
                                  setVal(
                                    selectedItem.id || "",
                                    "destinationAccountId",
                                    val
                                  )
                                }
                                accounts={accounts}
                                disabled={isLinking}
                              />
                            </div>
                            <div className="mt-1.5 flex flex-col gap-1 space-y-2 rounded-2xl border border-border/10 bg-background/10 p-3 md:col-span-2">
                              <span className="block text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                                Attach Document To
                              </span>
                              <RadioGroup
                                value={transferLeg}
                                onValueChange={(val) =>
                                  setTransferLeg(
                                    val as "SOURCE" | "DESTINATION"
                                  )
                                }
                                className="mt-0.5 flex gap-4"
                              >
                                <label
                                  htmlFor="leg-source"
                                  className="flex cursor-pointer items-center gap-2 text-xs font-medium text-foreground select-none"
                                >
                                  <RadioGroupItem
                                    value="SOURCE"
                                    id="leg-source"
                                  />
                                  <span>Source Account (Debit leg)</span>
                                </label>
                                <label
                                  htmlFor="leg-destination"
                                  className="flex cursor-pointer items-center gap-2 text-xs font-medium text-foreground select-none"
                                >
                                  <RadioGroupItem
                                    value="DESTINATION"
                                    id="leg-destination"
                                  />
                                  <span>Destination Account (Credit leg)</span>
                                </label>
                              </RadioGroup>
                            </div>
                          </>
                        ) : currentTxnType === "INCOME" ? (
                          <>
                            {currentDocType !== "INVOICE" ? (
                              <div className="space-y-1.5">
                                <Label className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                                  Deposit Account (Required)
                                </Label>
                                <AccountSelect
                                  className="h-10 w-full rounded-xl border-border/60 bg-background/40"
                                  value={getVal(
                                    selectedItem.id || "",
                                    "accountId",
                                    selectedItem.accountId || ""
                                  )}
                                  onValueChange={(val) =>
                                    setVal(
                                      selectedItem.id || "",
                                      "accountId",
                                      val
                                    )
                                  }
                                  accounts={accounts}
                                  disabled={isLinking}
                                />
                              </div>
                            ) : (
                              <div className="space-y-1.5">
                                <Label className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                                  Deposit Account
                                </Label>
                                <div className="flex h-10 w-full items-center rounded-xl border border-dashed border-border/40 bg-muted/10 px-3">
                                  <span className="line-clamp-1 text-[11px] text-muted-foreground">
                                    No bank account required for Invoice.
                                  </span>
                                </div>
                              </div>
                            )}
                          </>
                        ) : (
                          <>
                            {currentDocType !== "INVOICE" ? (
                              <div className="space-y-1.5">
                                <Label className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                                  Payment Account (Required)
                                </Label>
                                <AccountSelect
                                  className="h-10 w-full rounded-xl border-border/60 bg-background/40"
                                  value={getVal(
                                    selectedItem.id || "",
                                    "accountId",
                                    selectedItem.accountId || ""
                                  )}
                                  onValueChange={(val) =>
                                    setVal(
                                      selectedItem.id || "",
                                      "accountId",
                                      val
                                    )
                                  }
                                  accounts={accounts}
                                  disabled={isLinking}
                                />
                              </div>
                            ) : (
                              <div className="space-y-1.5">
                                <Label className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                                  Payment Account
                                </Label>
                                <div className="flex h-10 w-full items-center rounded-xl border border-dashed border-border/40 bg-muted/10 px-3">
                                  <span className="line-clamp-1 text-[11px] text-muted-foreground">
                                    No bank account required for Invoice.
                                  </span>
                                </div>
                              </div>
                            )}

                            <div className="space-y-1.5">
                              <Label className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                                {currentDocType === "INVOICE"
                                  ? "Budget Category (Required)"
                                  : "Budget Category"}
                              </Label>
                              <BudgetSelect
                                className="h-10 w-full rounded-xl border-border/60 bg-background/40"
                                value={getVal(
                                  selectedItem.id || "",
                                  "budgetId",
                                  selectedItem.budgetId || ""
                                )}
                                onValueChange={(val) =>
                                  setVal(selectedItem.id || "", "budgetId", val)
                                }
                                budgets={budgets}
                                allowNone
                                disabled={isLinking}
                              />
                            </div>
                          </>
                        )}
                      </>
                    )
                  })()}

                  {/* Links / Integrations Section */}
                  <div className="space-y-2.5 pt-1 md:col-span-2">
                    <span className="block text-[10px] font-black tracking-widest text-muted-foreground uppercase">
                      Advanced Mappings
                    </span>

                    <div className="grid grid-cols-1 gap-x-6 gap-y-3.5 sm:grid-cols-2">
                      {/* Scheduled payments link */}
                      {(() => {
                        const docType = getVal(
                          selectedItem.id || "",
                          "docType",
                          selectedItem.docType || "RECEIPT"
                        ).toUpperCase()
                        return (
                          <>
                            {/* Scheduled payments link */}
                            <div className="space-y-2">
                              <Label className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground uppercase">
                                <Calendar className="h-3.5 w-3.5 text-indigo-400" />
                                Link Scheduled Bill
                              </Label>
                              {payments.length > 0 ? (
                                <Select
                                  value={
                                    getVal(
                                      selectedItem.id || "",
                                      "scheduledPaymentId",
                                      ""
                                    ) || "none"
                                  }
                                  onValueChange={(val) =>
                                    setVal(
                                      selectedItem.id || "",
                                      "scheduledPaymentId",
                                      (val ?? "") === "none" ? "" : (val ?? "")
                                    )
                                  }
                                >
                                  <SelectTrigger className="h-10 w-full rounded-xl border-border/60 bg-background/40">
                                    <SelectValue placeholder="No bill matched">
                                      {(() => {
                                        const matchedVal = getVal(
                                          selectedItem.id || "",
                                          "scheduledPaymentId",
                                          ""
                                        )
                                        if (!matchedVal)
                                          return "None / New Expense"
                                        const p = payments.find(
                                          (pay) => pay.id === matchedVal
                                        )
                                        return p
                                          ? `Due ${new Date(p.dueDate).toLocaleDateString()} - ${p.currency} ${formatCents(p.amount)}`
                                          : "None / New Expense"
                                      })()}
                                    </SelectValue>
                                  </SelectTrigger>
                                  <SelectContent className="rounded-xl border border-border/50 bg-card/90 shadow-xl backdrop-blur-xl">
                                    <SelectItem value="none">
                                      None / New Expense
                                    </SelectItem>
                                    {payments.map((p) => (
                                      <SelectItem
                                        key={p.id || ""}
                                        value={p.id || ""}
                                      >
                                        Due{" "}
                                        {new Date(
                                          p.dueDate
                                        ).toLocaleDateString()}{" "}
                                        - {p.currency} {formatCents(p.amount)}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <div className="flex h-10 w-full items-center justify-between rounded-xl border border-dashed border-border/40 bg-muted/10 px-3">
                                  <span className="text-[11px] text-muted-foreground">
                                    No pending bills found.
                                  </span>
                                  <a
                                    href="/finance/recurring"
                                    className="flex items-center gap-0.5 text-[10px] font-semibold text-primary hover:underline"
                                  >
                                    Manage Templates ↗
                                  </a>
                                </div>
                              )}
                            </div>

                            {/* Borrowings link */}
                            {docType !== "INVOICE" && (
                              <div className="space-y-2">
                                <Label className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground uppercase">
                                  <ArrowLeftRight className="h-3.5 w-3.5 text-teal-400" />
                                  Link Debt / Borrowing
                                </Label>
                                <Select
                                  value={
                                    getVal(
                                      selectedItem.id || "",
                                      "borrowingId",
                                      ""
                                    ) || "none"
                                  }
                                  onValueChange={(val) =>
                                    setVal(
                                      selectedItem.id || "",
                                      "borrowingId",
                                      (val ?? "") === "none" ? "" : (val ?? "")
                                    )
                                  }
                                >
                                  <SelectTrigger className="h-10 w-full rounded-xl border-border/60 bg-background/40">
                                    <SelectValue placeholder="No loan matched">
                                      {(() => {
                                        const matchedVal = getVal(
                                          selectedItem.id || "",
                                          "borrowingId",
                                          ""
                                        )
                                        if (!matchedVal)
                                          return "None / General ledger"
                                        const b = borrowings.find(
                                          (borrow) => borrow.id === matchedVal
                                        )
                                        return b
                                          ? `${b.counterparty} (${b.direction === "BORROWING_DIRECTION_LENT" ? "Lent out" : "Borrowed"}) - Bal: ${b.currency} ${formatCents(b.remainingAmount)}`
                                          : "None / General ledger"
                                      })()}
                                    </SelectValue>
                                  </SelectTrigger>
                                  <SelectContent className="rounded-xl">
                                    <SelectItem value="none">
                                      None / General ledger
                                    </SelectItem>
                                    {borrowings.map((b) => (
                                      <SelectItem
                                        key={b.id || ""}
                                        value={b.id || ""}
                                      >
                                        {b.counterparty} (
                                        {b.direction ===
                                        "BORROWING_DIRECTION_LENT"
                                          ? "Lent out"
                                          : "Borrowed"}
                                        ) - Bal: {b.currency}{" "}
                                        {formatCents(b.remainingAmount)}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                          </>
                        )
                      })()}
                    </div>
                  </div>
                </div>

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
                    variant="ghost"
                    className="cursor-pointer self-start rounded-2xl text-red-400 hover:bg-red-500/10 hover:text-red-300"
                    disabled={
                      approveMutation.isPending || discardMutation.isPending
                    }
                    onClick={() => handleDiscard(selectedItem.id || "")}
                  >
                    {discardMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="mr-2 h-4 w-4" />
                    )}
                    Discard Transaction
                  </Button>

                  <div className="flex items-center gap-3">
                    <Button
                      variant="outline"
                      className="cursor-pointer rounded-2xl"
                      onClick={() => {
                        const idx = inboxItems.findIndex(
                          (item) => item.id === selectedItemId
                        )
                        if (idx !== -1 && idx < inboxItems.length - 1) {
                          setSelectedItemId(inboxItems[idx + 1].id || null)
                        }
                      }}
                      disabled={inboxItems.length <= 1}
                    >
                      Skip
                    </Button>
                    <Button
                      className="flex cursor-pointer items-center gap-2 rounded-2xl bg-primary text-white shadow-lg hover:bg-primary/95"
                      onClick={() => handleApprove(selectedItem)}
                      disabled={
                        approveMutation.isPending || discardMutation.isPending
                      }
                    >
                      {approveMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Reconciling...
                        </>
                      ) : (
                        <>
                          <Check className="h-4 w-4" />
                          {(() => {
                            const id = selectedItem.id || ""
                            const docType = getVal(
                              id,
                              "docType",
                              selectedItem.docType || "RECEIPT"
                            ).toUpperCase()
                            const txnType = getVal(
                              id,
                              "transactionType",
                              "EXPENSE"
                            ).toUpperCase()
                            const hasScheduledBill = !!getVal(
                              id,
                              "scheduledPaymentId",
                              ""
                            )
                            const txnId = getVal(id, "transactionId", "")
                            const isLinking = txnId && txnId !== "none"

                            if (isLinking) {
                              return "Link Transaction"
                            }
                            if (txnType === "TRANSFER") {
                              return "Record Transfer"
                            }
                            if (docType === "INVOICE") {
                              if (hasScheduledBill) {
                                return "Link Scheduled Bill"
                              }
                              return "Schedule Bill"
                            }
                            if (hasScheduledBill) {
                              return "Confirm Bill Payment"
                            }
                            if (txnType === "INCOME") {
                              return "Record Income"
                            }
                            return "Record Expense"
                          })()}
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </Card>
            ) : (
              <div className="flex h-full min-h-[450px] animate-in flex-col items-center justify-center rounded-3xl border border-dashed border-border/40 bg-card/10 text-center duration-300 fade-in">
                <Inbox className="mb-4 h-12 w-12 text-muted-foreground/20" />
                <h4 className="text-sm font-semibold text-foreground">
                  Select an Inbox Item
                </h4>
                <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground">
                  Choose a pending notification from the list on the left to
                  verify and link details.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </FinancePageLayout>
  )
}
