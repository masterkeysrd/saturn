import { useState, useEffect } from "react"
import type { InboxReviewFormValues } from "./schemas/inbox-review"
import { InboxItemReviewPanel } from "./components/inbox-item-review-panel"
import { useUrlState } from "@/lib/use-url-state"
import { useDebounce } from "@/lib/use-debounce"
import {
  useListInboxItemsQuery,
  useApproveInboxItemMutation,
  useDiscardInboxItemMutation,
  useUpdateInboxItemMutation,
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
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
import { Inbox, Loader2 } from "lucide-react"
import { toast } from "@/components/ui/toast"

export function InboxView() {
  const { spaceId } = useActiveSpaceContext()
  const [urlState, setUrlState] = useUrlState({
    search: "",
    docType: "ALL",
    selected: "",
  })

  const search = urlState.search
  const docType = urlState.docType
  const selectedItemId = urlState.selected || null

  const [searchQuery, setSearchQuery] = useState(search)
  const debouncedSearch = useDebounce(searchQuery, 300)

  const [prevSearch, setPrevSearch] = useState(search)
  if (search !== prevSearch) {
    setPrevSearch(search)
    setSearchQuery(search)
  }

  useEffect(() => {
    setUrlState({ search: debouncedSearch })
  }, [debouncedSearch, setUrlState])

  const [pageToken, setPageToken] = useState("")
  const [allStagedItems, setAllStagedItems] = useState<InboxItem[]>([])

  const [prevFilter, setPrevFilter] = useState({ search, docType })
  if (prevFilter.search !== search || prevFilter.docType !== docType) {
    setPrevFilter({ search, docType })
    setPageToken("")
    setAllStagedItems([])
  }

  // 1. Query inbox items
  const {
    data: inboxData,
    isLoading: inboxLoading,
    refetch: refetchInbox,
  } = useListInboxItemsQuery(
    {
      status: "PENDING",
      pageSize: 20,
      pageToken: pageToken,
      sort: "",
      view: "FULL",
      searchQuery: search || undefined,
      docType:
        docType !== "ALL"
          ? (docType as Parameters<typeof useListInboxItemsQuery>[0]["docType"])
          : undefined,
    },
    {
      enabled: !!spaceId,
      placeholderData: (prev) => prev,
    }
  )

  const [prevInboxData, setPrevInboxData] =
    useState<typeof inboxData>(undefined)
  if (inboxData && inboxData !== prevInboxData) {
    setPrevInboxData(inboxData)
    if (pageToken === "") {
      setAllStagedItems(inboxData.inboxItems || [])
    } else {
      setAllStagedItems((prev) => {
        const existingIds = new Set(prev.map((item) => item.id))
        const uniqueNew = (inboxData.inboxItems || []).filter(
          (item) => item.id && !existingIds.has(item.id)
        )
        return [...prev, ...uniqueNew]
      })
    }
  }

  const inboxItems = allStagedItems

  // 2. State for the selected inbox item
  const [error, setError] = useState<string | null>(null)
  const selectedItem =
    inboxItems.find((item) => item.id === selectedItemId) || null

  const [prevSelectedId, setPrevSelectedId] = useState(selectedItemId)
  if (selectedItemId !== prevSelectedId) {
    setPrevSelectedId(selectedItemId)
    setError(null)
  }

  useEffect(() => {
    if (!selectedItemId && inboxItems.length > 0) {
      setUrlState({ selected: inboxItems[0].id || "" })
    }
  }, [inboxItems, selectedItemId, setUrlState])

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
      status: "PENDING",
      pageSize: 100,
      pageToken: "",
      startDate: "",
      endDate: "",
    },
    { enabled: !!spaceId }
  )
  const payments = paymentsData?.scheduledPayments || []

  const { data: borrowingsData } = useListBorrowingsQuery(
    { status: "ACTIVE", pageSize: 100, pageToken: "" },
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
  const updateInboxMutation = useUpdateInboxItemMutation()
  const createRepaymentMutation = useCreateBorrowingRepaymentMutation()

  const handleApprove = async (
    tx: InboxItem,
    values: InboxReviewFormValues
  ) => {
    setError(null)
    const id = tx.id || ""
    const accId = values.accountId || ""
    const budId = values.budgetId || ""
    const payId = values.scheduledPaymentId || ""
    const borrowingId = values.borrowingId || ""
    const amtStr = values.amountStr || ""
    const desc = values.description || ""
    const docType = values.docType
    const txnType = values.transactionType
    const destAccId = values.destinationAccountId || ""
    const txnId = values.selectedTxId || ""
    const currency = values.currency || tx.currency || "USD"
    const transferLeg = values.transferLeg
    const overwriteLinkedTx = values.overwriteLinkedTx

    // Validate required fields and present explicit user feedback
    const isVerificationItem =
      tx.docType === "SYSTEM_VERIFICATION" || docType === "SYSTEM_VERIFICATION"

    const isLinking = txnId && txnId !== "none"
    if (!isLinking && !isVerificationItem) {
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
      // 1. Save refined draft fields via UpdateInboxItem
      const metadataObj: Record<string, unknown> = {}
      if (txnType) metadataObj["transaction_type"] = txnType
      if (destAccId) metadataObj["destination_account_id"] = destAccId
      if (transferLeg) metadataObj["transfer_leg"] = transferLeg
      metadataObj["overwrite_linked_transaction"] = overwriteLinkedTx

      await updateInboxMutation.mutateAsync({
        id,
        req: {
          id,
          inboxItem: {
            id,
            spaceId: tx.spaceId,
            integrationId: tx.integrationId,
            status: tx.status,
            docType: docType as Parameters<
              typeof updateInboxMutation.mutateAsync
            >[0]["req"]["inboxItem"]["docType"],
            amount: finalAmount,
            currency: currency,
            vendorName: desc || tx.vendorName || "",
            transactionDate: tx.transactionDate,
            accountId: accId || "",
            budgetId: budId || "",
            scheduledPaymentId: payId || "",
            transactionId: txnId || "",
            rawPayload: tx.rawPayload,
            metadataJson: JSON.stringify(metadataObj),
          },
        },
      })

      // 2. Call standard Inbox Approval
      await approveMutation.mutateAsync({
        id,
        req: {
          id,
        },
      })

      // 3. If a borrowing option is selected, create a repayment record
      if (borrowingId && borrowingId !== "none") {
        await createRepaymentMutation.mutateAsync({
          borrowing_id: borrowingId,
          req: {
            borrowingId,
            repayment: {
              borrowingId,
              amount: finalAmount,
              paymentDate: tx.transactionDate || new Date().toISOString(),
              notes: `Inbox payment match for vendor: ${desc || tx.vendorName}`,
              accountId: accId,
            },
          },
        })
      }

      // 4. Select next available item
      const remaining = inboxItems.filter((item) => item.id !== id)
      if (remaining.length > 0) {
        setUrlState({ selected: remaining[0].id || "" })
      } else {
        setUrlState({ selected: "" })
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
        setUrlState({ selected: remaining[0].id || "" })
      } else {
        setUrlState({ selected: "" })
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
      {inboxLoading && !inboxData ? (
        <div className="flex flex-col items-center justify-center gap-3 py-32">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">
            Opening your financial inbox...
          </span>
        </div>
      ) : inboxItems.length === 0 && !search && docType === "ALL" ? (
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
            <div className="flex flex-col gap-2 px-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                  Staged Items ({inboxItems.length})
                </span>
              </div>
              <div className="grid grid-cols-12 gap-2">
                <div className="col-span-8">
                  <Input
                    placeholder="Search staged items..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-9 rounded-2xl border-border/30 bg-card/40 text-xs"
                  />
                </div>
                <div className="col-span-4">
                  <Select
                    value={docType}
                    onValueChange={(val) =>
                      setUrlState({ docType: val || "ALL" })
                    }
                  >
                    <SelectTrigger className="h-9 rounded-2xl border-border/30 bg-card/40 text-xs">
                      <SelectValue placeholder="All">
                        {docType === "ALL" && "All"}
                        {docType === "RECEIPT" && "Receipt"}
                        {docType === "INVOICE" && "Invoice"}
                        {docType === "BANK_NOTIFICATION" && "Notification"}
                        {docType === "SYSTEM_VERIFICATION" && "Verification"}
                        {docType === "UNKNOWN" && "Unknown"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl border-border/30 bg-card/90 backdrop-blur-xl">
                      <SelectItem value="ALL" className="rounded-xl text-xs">
                        All
                      </SelectItem>
                      <SelectItem
                        value="RECEIPT"
                        className="rounded-xl text-xs"
                      >
                        Receipt
                      </SelectItem>
                      <SelectItem
                        value="INVOICE"
                        className="rounded-xl text-xs"
                      >
                        Invoice
                      </SelectItem>
                      <SelectItem
                        value="BANK_NOTIFICATION"
                        className="rounded-xl text-xs"
                      >
                        Notification
                      </SelectItem>
                      <SelectItem
                        value="SYSTEM_VERIFICATION"
                        className="rounded-xl text-xs"
                      >
                        Verification
                      </SelectItem>
                      <SelectItem
                        value="UNKNOWN"
                        className="rounded-xl text-xs"
                      >
                        Unknown
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <ScrollArea className="h-[calc(100vh-320px)] rounded-3xl border border-border/30 bg-card/20 p-2 backdrop-blur-xl">
              <div className="space-y-2 p-1">
                {inboxItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center text-xs text-muted-foreground/60">
                    <span>No staged items match these criteria.</span>
                  </div>
                ) : (
                  inboxItems.map((tx) => {
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
                        onClick={() => setUrlState({ selected: tx.id || "" })}
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
                              tx.docType === "INVOICE"
                                ? "border-amber-500/20 bg-amber-500/10 text-amber-500"
                                : tx.docType === "BANK_NOTIFICATION"
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
                              ? new Date(
                                  tx.transactionDate
                                ).toLocaleDateString()
                              : tx.createTime
                                ? new Date(tx.createTime).toLocaleDateString()
                                : ""}
                          </span>
                        </div>
                      </button>
                    )
                  })
                )}
              </div>
            </ScrollArea>

            {/* Pagination Controls */}
            {!!inboxData?.nextPageToken && (
              <div className="px-1 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-full rounded-xl bg-card/30 text-xs hover:bg-card/50"
                  onClick={() => setPageToken(inboxData.nextPageToken)}
                  disabled={inboxLoading}
                >
                  {inboxLoading && (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  )}
                  Load More
                </Button>
              </div>
            )}
          </div>

          {/* Detail Panel (Right, 8 cols) */}
          <div className="lg:col-span-8">
            {selectedItem ? (
              <InboxItemReviewPanel
                selectedItem={selectedItem}
                accounts={accounts}
                budgets={budgets}
                payments={payments}
                borrowings={borrowings}
                transactions={transactions}
                onApprove={handleApprove}
                onDiscard={handleDiscard}
                onSkip={() => {
                  const idx = inboxItems.findIndex(
                    (item) => item.id === selectedItemId
                  )
                  if (idx !== -1 && idx < inboxItems.length - 1) {
                    setUrlState({
                      selected: inboxItems[idx + 1].id || "",
                    })
                  }
                }}
                isPending={approveMutation.isPending}
                isDiscarding={discardMutation.isPending}
                hasMore={inboxItems.length > 1}
                error={error}
              />
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
