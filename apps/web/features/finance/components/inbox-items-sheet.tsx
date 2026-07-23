import { useState } from "react"
import {
  useListInboxItemsQuery,
  useApproveInboxItemMutation,
  useDiscardInboxItemMutation,
  useListScheduledPaymentsQuery,
  useListAccountsQuery,
  type Budget,
} from "@/gen/saturn/finance/v1/finance"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Check, Trash2, Inbox, Calendar, Loader2 } from "lucide-react"
import { AccountSelect } from "./account-select"
import { BudgetSelect } from "./budget-select"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
import { formatCents } from "../utils"

interface InboxItemsSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  spaceId: string
  budgets: Budget[]
  refetchTransactions: () => void
  refetchBudgets: () => void
}

export function InboxItemsSheet({
  open,
  onOpenChange,
  spaceId,
  budgets,
  refetchTransactions,
  refetchBudgets,
}: InboxItemsSheetProps) {
  // 1. Fetch inbox items
  const {
    data: inboxData,
    isLoading: inboxLoading,
    refetch: refetchInbox,
  } = useListInboxItemsQuery({}, { enabled: open && !!spaceId })

  const inboxItems = inboxData?.inboxItems || []

  // 2. Fetch active accounts
  const { data: accountsData } = useListAccountsQuery(
    {},
    { enabled: open && !!spaceId }
  )
  const accounts = accountsData?.accounts || []

  // 3. Fetch pending scheduled payments
  const { data: paymentsData } = useListScheduledPaymentsQuery(
    {
      status: "pending",
      pageSize: 100,
      pageToken: "",
      startDate: "",
      endDate: "",
    },
    { enabled: open && !!spaceId }
  )
  const payments = paymentsData?.scheduledPayments || []

  // Mutations
  const approveMutation = useApproveInboxItemMutation()
  const discardMutation = useDiscardInboxItemMutation()

  // Manage overrides state for each inbox item
  const [overrides, setOverrides] = useState<
    Record<
      string,
      {
        accountId?: string
        budgetId?: string
        scheduledPaymentId?: string
        amountStr?: string
        description?: string
      }
    >
  >({})

  const getVal = (
    id: string,
    key:
      | "accountId"
      | "budgetId"
      | "scheduledPaymentId"
      | "amountStr"
      | "description",
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
      | "amountStr"
      | "description",
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

  const handleApprove = async (
    id: string,
    originalAmount: string,
    originalVendor: string
  ) => {
    const accId = getVal(id, "accountId", "")
    const budId = getVal(id, "budgetId", "")
    const payId = getVal(id, "scheduledPaymentId", "")
    const amtStr = getVal(id, "amountStr", "")
    const desc = getVal(id, "description", "")

    let finalAmount = originalAmount
    if (amtStr) {
      const cents = parseFloat(amtStr) * 100
      if (!isNaN(cents)) {
        finalAmount = Math.round(cents).toString()
      }
    }

    try {
      await approveMutation.mutateAsync({
        id,
        req: {
          id,
          accountId: accId,
          budgetId: budId,
          scheduledPaymentId: payId,
          amount: finalAmount,
          description: desc || originalVendor,
        },
      })
      refetchInbox()
      refetchTransactions()
      refetchBudgets()
    } catch (err) {
      console.error("Failed to approve inbox item", err)
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
      refetchInbox()
    } catch (err) {
      console.error("Failed to discard inbox item", err)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto border-l border-border/40 bg-background/95 backdrop-blur-xl sm:max-w-2xl">
        <SheetHeader className="mb-6">
          <SheetTitle className="flex items-center gap-2 text-xl font-bold">
            <Inbox className="h-5 w-5 animate-pulse text-indigo-500" />
            Inbound Ingestion Queue
          </SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">
            Review receipts, bank alerts, and invoices parsed from your
            integrations. Verify details before reconciling them to the ledger.
          </SheetDescription>
        </SheetHeader>

        {inboxLoading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            <span className="text-xs text-muted-foreground">
              Retrieving inbox pipeline...
            </span>
          </div>
        ) : inboxItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border/40 bg-card/20 px-6 py-20 text-center">
            <Inbox className="mb-4 h-12 w-12 text-muted-foreground/30" />
            <h4 className="text-sm font-semibold text-foreground">
              Inbox is Empty
            </h4>
            <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
              Forward bank alerts or invoices to your Saturn email integration.
              They will appear here for audit and reconciliation.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {inboxItems.map((tx) => {
              const txId = tx.id || ""
              const currentAccountId = getVal(
                txId,
                "accountId",
                tx.accountId || ""
              )
              const currentBudgetId = getVal(
                txId,
                "budgetId",
                tx.budgetId || ""
              )
              const currentPaymentId = getVal(
                txId,
                "scheduledPaymentId",
                tx.scheduledPaymentId || ""
              )
              const currentAmountStr = getVal(
                txId,
                "amountStr",
                (Number(tx.amount || 0) / 100).toFixed(2)
              )
              const currentDescription = getVal(
                txId,
                "description",
                tx.vendorName || ""
              )

              // Parse metadata details
              let meta: { sender?: string; subject?: string } = {}
              try {
                if (tx.metadataJson) {
                  meta = JSON.parse(tx.metadataJson)
                }
              } catch (err) {
                console.error("Failed to parse metadataJson", err)
              }

              const isApproving =
                approveMutation.isPending &&
                approveMutation.variables?.id === txId
              const isDiscarding =
                discardMutation.isPending &&
                discardMutation.variables?.id === txId

              return (
                <div
                  key={txId}
                  className="relative space-y-4 overflow-hidden rounded-2xl border border-border/40 bg-card/35 p-5 shadow-lg backdrop-blur-xl"
                >
                  {/* Top Header info */}
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-2.5 py-0.5 text-[10px] font-bold text-indigo-400">
                        {tx.docType ? tx.docType.toUpperCase() : "AI PARSED"}
                      </span>
                      <h4 className="mt-1.5 text-sm font-bold text-foreground">
                        {tx.vendorName}
                      </h4>
                      {meta.sender && (
                        <span className="mt-0.5 block text-[10px] text-muted-foreground">
                          From: {meta.sender}
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="block text-sm font-black text-foreground">
                        {tx.currency || "USD"}{" "}
                        {(Number(tx.amount || 0) / 100).toLocaleString(
                          undefined,
                          { minimumFractionDigits: 2 }
                        )}
                      </span>
                      <span className="mt-0.5 block text-[9px] text-muted-foreground">
                        {tx.transactionDate
                          ? new Date(tx.transactionDate).toLocaleDateString()
                          : tx.createTime
                            ? new Date(tx.createTime).toLocaleDateString()
                            : ""}
                      </span>
                    </div>
                  </div>

                  {/* Editable form overrides fields */}
                  <div className="grid grid-cols-1 gap-4 border-t border-border/10 pt-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold text-muted-foreground uppercase">
                        Vendor / Description
                      </Label>
                      <Input
                        className="h-8 bg-background/50 text-xs"
                        value={currentDescription}
                        onChange={(e) =>
                          setVal(txId, "description", e.target.value)
                        }
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold text-muted-foreground uppercase">
                        Amount Override ({tx.currency || "USD"})
                      </Label>
                      <Input
                        type="number"
                        step="0.01"
                        className="h-8 bg-background/50 text-xs"
                        value={currentAmountStr}
                        onChange={(e) =>
                          setVal(txId, "amountStr", e.target.value)
                        }
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold text-muted-foreground uppercase">
                        Checking / Card Account
                      </Label>
                      <AccountSelect
                        value={currentAccountId}
                        onValueChange={(val) => setVal(txId, "accountId", val)}
                        accounts={accounts}
                        className="h-8 text-xs"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold text-muted-foreground uppercase">
                        Budget Category
                      </Label>
                      <BudgetSelect
                        value={currentBudgetId}
                        onValueChange={(val) => setVal(txId, "budgetId", val)}
                        budgets={budgets}
                        className="h-8 text-xs"
                      />
                    </div>

                    {payments.length > 0 && (
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground uppercase">
                          <Calendar className="h-3 w-3 text-indigo-400" />
                          Link Scheduled Bill / Payment
                        </Label>
                        <Select
                          value={currentPaymentId || "none"}
                          onValueChange={(val) =>
                            setVal(
                              txId,
                              "scheduledPaymentId",
                              val === "none" || !val ? "" : val
                            )
                          }
                        >
                          <SelectTrigger className="h-8 bg-background/50 text-xs">
                            <SelectValue placeholder="Choose a pending bill..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none" className="text-xs">
                              None / Standard Expense
                            </SelectItem>
                            {payments.map((p) => (
                              <SelectItem
                                key={p.id}
                                value={p.id}
                                className="text-xs"
                              >
                                Due {new Date(p.dueDate).toLocaleDateString()} -{" "}
                                {p.currency} {formatCents(p.amount)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>

                  {/* Action buttons footer */}
                  <div className="flex justify-end gap-3 border-t border-border/10 pt-4">
                    <Button
                      variant="ghost"
                      size="xs"
                      className="h-8 cursor-pointer px-3 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                      onClick={() => handleDiscard(txId)}
                      disabled={isApproving || isDiscarding}
                    >
                      {isDiscarding ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      Discard
                    </Button>

                    <Button
                      size="xs"
                      className="h-8 cursor-pointer bg-indigo-500 px-4 text-white shadow-md hover:bg-indigo-600"
                      onClick={() =>
                        handleApprove(
                          txId,
                          tx.amount || "0",
                          tx.vendorName || ""
                        )
                      }
                      disabled={
                        isApproving ||
                        isDiscarding ||
                        (tx.docType !== "invoice" && !currentAccountId)
                      }
                    >
                      {isApproving ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Check className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      Approve & Commit
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
