import { useState } from "react"
import {
  useListBorrowingRepaymentsQuery,
  useCreateBorrowingRepaymentMutation,
  useDeleteBorrowingRepaymentMutation,
  type Borrowing,
  useListAccountsQuery,
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
import { Loader2, Trash2, Calendar, HandCoins } from "lucide-react"
import { formatCents, toCentsString } from "../utils"
import { DatePicker } from "@/components/ui/date-picker"
import { useWorkspaceFinance } from "../use-workspace-finance"
import { CurrencyConversionPreview } from "./currency-conversion-preview"
import { AccountSelect } from "./account-select"

interface BorrowingDetailSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  spaceId: string
  borrowing: Borrowing | null
  refetchBorrowings: () => void
}

export function BorrowingDetailSheet({
  open,
  onOpenChange,
  spaceId,
  borrowing,
  refetchBorrowings,
}: BorrowingDetailSheetProps) {
  const { getConversionPreview } = useWorkspaceFinance()
  const [amount, setAmount] = useState("")
  const [paymentDate, setPaymentDate] = useState<Date>(new Date())
  const [notes, setNotes] = useState("")
  const [accountId, setAccountId] = useState("")

  const { data: accountsData } = useListAccountsQuery(
    {},
    { enabled: open && !!spaceId }
  )
  const activeAccounts = accountsData?.accounts?.filter((a) => a.isActive) || []

  const {
    data: repaymentsData,
    isLoading: listLoading,
    refetch: refetchRepayments,
  } = useListBorrowingRepaymentsQuery(
    {
      borrowingId: borrowing?.id || "",
    },
    { enabled: open && !!borrowing?.id }
  )

  const createRepaymentMutation = useCreateBorrowingRepaymentMutation()
  const deleteRepaymentMutation = useDeleteBorrowingRepaymentMutation()

  const conversion = borrowing
    ? getConversionPreview(amount, borrowing.currency)
    : null

  const handleAddRepayment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!borrowing || !amount) return

    const cents = parseInt(toCentsString(amount))
    if (isNaN(cents) || cents <= 0) return

    try {
      await createRepaymentMutation.mutateAsync({
        borrowing_id: borrowing.id,
        req: {
          borrowingId: borrowing.id,
          repayment: {
            amount: cents.toString(),
            paymentDate: paymentDate.toISOString(),
            notes,
            accountId,
          },
        },
      })
      setAmount("")
      setNotes("")
      refetchRepayments()
      refetchBorrowings()
    } catch (err) {
      console.error("Failed to add repayment", err)
    }
  }

  const handleDeleteRepayment = async (repaymentId: string) => {
    if (!borrowing) return
    try {
      await deleteRepaymentMutation.mutateAsync({
        borrowing_id: borrowing.id,
        id: repaymentId,
        req: {
          borrowingId: borrowing.id,
          id: repaymentId,
        },
      })
      refetchRepayments()
      refetchBorrowings()
    } catch (err) {
      console.error("Failed to delete repayment", err)
    }
  }

  const repayments = repaymentsData?.repayments || []
  const currency = borrowing?.currency || "USD"
  const directionLabel =
    borrowing?.direction === "BORROWING_DIRECTION_LENT"
      ? "Lent to"
      : "Borrowed from"

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full flex-col overflow-hidden rounded-l-3xl border-l border-border/40 bg-card/95 p-6 shadow-2xl backdrop-blur-xl sm:max-w-2xl md:p-8">
        <SheetHeader className="mb-4">
          <SheetTitle className="flex items-center gap-2">
            <HandCoins className="h-5 w-5 text-primary" />
            Borrowing Details
          </SheetTitle>
          <SheetDescription>
            Track balance and installment history with{" "}
            {borrowing?.counterparty || ""}.
          </SheetDescription>
        </SheetHeader>

        {borrowing && (
          <div className="flex min-h-0 flex-1 flex-col space-y-6">
            {/* Overview Summary */}
            <div className="space-y-4 rounded-2xl border border-border/50 bg-muted/50 p-6">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                    {directionLabel}
                  </span>
                  <h4 className="text-xl font-bold text-foreground">
                    {borrowing.counterparty}
                  </h4>
                  {borrowing.contactInfo && (
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {borrowing.contactInfo}
                    </span>
                  )}
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                    Status
                  </span>
                  <span className="mt-1 block">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs leading-5 font-semibold ${
                        borrowing.status === "BORROWING_STATUS_ACTIVE"
                          ? "bg-emerald-500/10 text-emerald-500"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {borrowing.status === "BORROWING_STATUS_ACTIVE"
                        ? "Active"
                        : "Settled"}
                    </span>
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 border-t border-border/20 pt-4">
                <div>
                  <span className="block text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                    Remaining Balance
                  </span>
                  <span className="text-2xl font-black text-primary">
                    {formatCents(borrowing.remainingAmount).toLocaleString(
                      undefined,
                      {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      }
                    )}{" "}
                    <span className="font-sans text-xs font-normal text-muted-foreground">
                      {currency}
                    </span>
                  </span>
                </div>
                <div className="text-right">
                  <span className="block text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                    Total Agreement
                  </span>
                  <span className="text-lg font-bold text-foreground/80">
                    {formatCents(borrowing.totalAmount).toLocaleString(
                      undefined,
                      {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      }
                    )}{" "}
                    <span className="font-sans text-xs font-normal text-muted-foreground">
                      {currency}
                    </span>
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap justify-between gap-4 border-t border-border/20 pt-4 text-xs text-muted-foreground">
                <div className="whitespace-nowrap">
                  <span className="font-semibold text-foreground">
                    Established:
                  </span>{" "}
                  {new Date(borrowing.establishedAt).toLocaleDateString(
                    undefined,
                    {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    }
                  )}
                </div>
                {borrowing.dueAt && (
                  <div className="text-right whitespace-nowrap">
                    <span className="font-semibold text-foreground">Due:</span>{" "}
                    {new Date(borrowing.dueAt).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </div>
                )}
                {borrowing.notes && (
                  <div className="w-full border-t border-border/10 pt-2 text-[11px] break-words text-muted-foreground/80 italic">
                    "{borrowing.notes}"
                  </div>
                )}
              </div>
            </div>

            {/* Repayments History */}
            <div className="flex min-h-0 flex-1 flex-col space-y-3">
              <h4 className="flex items-center gap-1.5 text-sm font-bold tracking-tight text-foreground">
                Repayment History ({repayments.length})
              </h4>

              {listLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : repayments.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/40 bg-muted/20 py-8 text-center">
                  <Calendar className="mb-2 h-6 w-6 text-muted-foreground/30" />
                  <p className="text-xs font-bold text-muted-foreground">
                    No payments recorded yet
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground/80">
                    Use the form below to register installments.
                  </p>
                </div>
              ) : (
                <div className="max-h-[220px] space-y-2.5 overflow-y-auto pr-1">
                  {repayments.map((r) => (
                    <div
                      key={r.id}
                      className="flex animate-in items-center justify-between rounded-xl border border-border/30 bg-card/45 p-3 shadow-sm transition-all duration-250 fade-in hover:bg-card/70"
                    >
                      <div className="min-w-0 flex-1 pr-3">
                        <div className="flex items-baseline gap-2">
                          <span className="font-mono text-xs font-bold text-foreground">
                            {formatCents(r.amount).toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}{" "}
                            {currency}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(r.paymentDate).toLocaleDateString(
                              undefined,
                              {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              }
                            )}
                          </span>
                        </div>
                        {r.notes && (
                          <p className="mt-0.5 truncate text-[10px] text-muted-foreground/80 italic">
                            {r.notes}
                          </p>
                        )}
                      </div>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDeleteRepayment(r.id)}
                        disabled={deleteRepaymentMutation.isPending}
                      >
                        {deleteRepaymentMutation.isPending ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Record Installment Form */}
            {borrowing.status === "BORROWING_STATUS_ACTIVE" && (
              <form
                key={`${borrowing.id}-${open}`}
                onSubmit={handleAddRepayment}
                className="animate-in space-y-4 border-t border-border/20 pt-4 duration-300 fade-in"
              >
                <h5 className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                  Log Installment Payment
                </h5>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="paymentAmount">Amount</Label>
                    <div className="relative flex h-10 items-center overflow-hidden rounded-xl border border-border/60 bg-background/50 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20">
                      <input
                        id="paymentAmount"
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        required
                        className="h-full w-full flex-1 bg-transparent px-3 py-2 text-sm text-foreground focus:outline-none"
                      />
                      <span className="flex h-full items-center border-l border-border/40 bg-muted/20 px-3 text-xs font-semibold text-muted-foreground select-none">
                        {borrowing.currency}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col space-y-1.5">
                    <Label className="mb-1">Payment Date</Label>
                    <DatePicker
                      date={paymentDate}
                      setDate={(d) => d && setPaymentDate(d)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="mb-1">Payment Account</Label>
                    <AccountSelect
                      value={accountId}
                      onValueChange={setAccountId}
                      accounts={activeAccounts}
                      placeholder="Choose account for transaction"
                    />
                  </div>
                </div>

                {conversion && (
                  <div className="py-1">
                    <CurrencyConversionPreview
                      conversion={conversion}
                      fromCurrency={borrowing?.currency || "USD"}
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="paymentNotes">Payment Notes (Optional)</Label>
                  <Input
                    id="paymentNotes"
                    placeholder="e.g. Installment #1, bank transfer..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="h-10 rounded-xl border-border/60 bg-background/50"
                  />
                </div>

                <Button
                  type="submit"
                  className="h-11 w-full rounded-xl bg-gradient-to-r from-primary to-accent font-semibold text-white shadow-md shadow-primary/10 transition-all hover:scale-[1.005]"
                  disabled={
                    createRepaymentMutation.isPending ||
                    !!(conversion && "error" in conversion)
                  }
                >
                  {createRepaymentMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Add Payment"
                  )}
                </Button>
              </form>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
