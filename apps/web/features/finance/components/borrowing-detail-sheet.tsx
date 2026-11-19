import { useMemo, useState } from "react"
import { useForm, Controller, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useQueryClient } from "@tanstack/react-query"
import { useTimezone } from "@saturn/hooks"
import {
  useListTransactionsQuery,
  useLogBorrowingTransactionMutation,
  useDeleteBorrowingTransactionMutation,
  type BorrowingTransactionType,
  type Borrowing,
  useListAccountsQuery,
  useGetSettingsQuery,
} from "@saturn/api/gen/saturn/finance/v1/finance"
import { useCurrencyConversionPreview } from "@/hooks/use-currency-conversion"
import { WorkspaceInspectorPanel } from "@/components/ui/inspector-panel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Trash2, Calendar, HandCoins, Scale } from "lucide-react"
import { formatCents, toCentsString } from "../utils"
import { DatePicker } from "@/components/ui/date-picker"
import { CurrencyConversionPreview } from "./currency-conversion-preview"
import { AccountSelect } from "./account-select"
import { RepaymentSchema, type RepaymentFormValues } from "@saturn/schemas"
import { AdjustBorrowingModal } from "./adjust-borrowing-modal"

interface BorrowingDetailSheetProps {
  borrowing: Borrowing | null
  open: boolean
  onOpenChange: (open: boolean) => void
  spaceId: string
  refetchBorrowings: () => void
}

export function BorrowingDetailSheet({
  borrowing,
  open,
  onOpenChange,
  spaceId,
  refetchBorrowings,
}: BorrowingDetailSheetProps) {
  const queryClient = useQueryClient()
  const tz = useTimezone()
  const [openAdjustModal, setOpenAdjustModal] = useState<boolean>(false)
  const { data: settings } = useGetSettingsQuery(
    {},
    { enabled: open && !!spaceId }
  )
  const baseCurrency = settings?.baseCurrency || "USD"

  const { getConversionPreview } = useCurrencyConversionPreview({
    spaceId: spaceId || "",
    enabled: open && !!spaceId,
    baseCurrency,
  })

  const { data: accountsData } = useListAccountsQuery(
    {},
    { enabled: open && !!spaceId }
  )
  const activeAccounts = accountsData?.accounts?.filter((a) => a.isActive) || []

  const {
    data: transactionsData,
    isLoading: listLoading,
    refetch: refetchTransactions,
  } = useListTransactionsQuery(
    {
      borrowingId: borrowing?.id || "",
    },
    { enabled: open && !!borrowing?.id }
  )
  const repayments = transactionsData?.transactions || []

  const logTransactionMutation = useLogBorrowingTransactionMutation()
  const deleteTransactionMutation = useDeleteBorrowingTransactionMutation()

  const defaultAccount =
    activeAccounts.find((a) => a.isDefault) || activeAccounts[0]

  const repaymentDefaultValues = useMemo<RepaymentFormValues>(
    () => ({
      amount: "",
      paymentDate: new Date(),
      accountId: defaultAccount?.id || "",
      notes: "",
    }),
    [defaultAccount?.id]
  )

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<RepaymentFormValues>({
    resolver: zodResolver(RepaymentSchema),
    defaultValues: {
      amount: "",
      paymentDate: new Date(),
      accountId: "",
      notes: "",
    },
    values: repaymentDefaultValues,
    resetOptions: { keepDirtyValues: true },
  })

  const amountValue = useWatch({ control, name: "amount" })
  const conversion = borrowing
    ? getConversionPreview(amountValue, borrowing.currency)
    : null

  const onSubmitRepayment = async (data: RepaymentFormValues) => {
    if (!borrowing) return

    const cents = parseInt(toCentsString(data.amount))
    if (isNaN(cents) || cents <= 0) return

    try {
      await logTransactionMutation.mutateAsync({
        borrowing_id: borrowing.id || "",
        req: {
          borrowingId: borrowing.id || "",
          transaction: {
            type: "BORROWING_TRANSACTION_TYPE_PAYMENT" as BorrowingTransactionType,
            amount: cents.toString(),
            transactionDate: data.paymentDate.toISOString(),
            notes: data.notes || "",
            accountId: data.accountId || "",
          },
        },
      })
      reset({
        amount: "",
        paymentDate: new Date(),
        accountId: "",
        notes: "",
      })
      await queryClient.invalidateQueries({
        queryKey: ["/api/v1/finance/transactions"],
      })
      await queryClient.invalidateQueries({
        queryKey: ["/api/v1/finance/accounts"],
      })
      await queryClient.invalidateQueries({
        queryKey: ["/api/v1/finance/borrowings"],
      })
      refetchTransactions()
      refetchBorrowings()
    } catch (err) {
      console.error("Failed to add repayment", err)
    }
  }

  const handleDeleteRepayment = async (repaymentId: string) => {
    if (!borrowing) return
    try {
      await deleteTransactionMutation.mutateAsync({
        borrowing_id: borrowing.id || "",
        transaction_id: repaymentId,
        req: {
          borrowingId: borrowing.id || "",
          transactionId: repaymentId,
        },
      })
      await queryClient.invalidateQueries({
        queryKey: ["/api/v1/finance/transactions"],
      })
      await queryClient.invalidateQueries({
        queryKey: ["/api/v1/finance/accounts"],
      })
      await queryClient.invalidateQueries({
        queryKey: ["/api/v1/finance/borrowings"],
      })
      refetchTransactions()
      refetchBorrowings()
    } catch (err) {
      console.error("Failed to delete repayment", err)
    }
  }

  const currency = borrowing?.currency || "USD"
  const directionLabel =
    borrowing?.direction === "LENT" ? "Lent to" : "Borrowed from"

  return (
    <>
      <WorkspaceInspectorPanel
        open={open}
        onOpenChange={onOpenChange}
        icon={<HandCoins className="size-4" />}
        title="Borrowing Details"
        description={
          <>
            Balance &amp; installments with{" "}
            <span className="font-medium text-foreground">
              {borrowing?.counterparty || ""}
            </span>
          </>
        }
      >
        {borrowing && (
          <div className="space-y-5">
            {/* Overview Summary */}
            <section className="space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-xs font-medium text-muted-foreground">
                    {directionLabel}
                  </span>
                  <h4 className="truncate text-lg font-semibold text-foreground">
                    {borrowing.counterparty}
                  </h4>
                  {borrowing.contactInfo && (
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {borrowing.contactInfo}
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setOpenAdjustModal(true)}
                    className="h-8 cursor-pointer gap-1.5 text-xs"
                  >
                    <Scale className="h-3.5 w-3.5 text-emerald-500" />
                    Adjust
                  </Button>
                  <span
                    className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
                      borrowing.status === "ACTIVE"
                        ? "bg-emerald-500/10 text-emerald-500"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {borrowing.status === "ACTIVE" ? "Active" : "Settled"}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 border-t border-border/40 pt-3.5 tabular-nums">
                <div>
                  <span className="block text-xs text-muted-foreground">
                    Remaining Balance
                  </span>
                  <span className="font-mono text-xl font-bold text-primary">
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
                  <span className="block text-xs text-muted-foreground">
                    Total Agreement
                  </span>
                  <span className="font-mono text-base font-semibold text-foreground/80">
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

              <div className="flex flex-wrap justify-between gap-3 border-t border-border/40 pt-3 text-xs text-muted-foreground">
                <div className="whitespace-nowrap">
                  <span className="font-medium text-foreground">
                    Established:
                  </span>{" "}
                  {tz.format(borrowing.establishedAt, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </div>
                {borrowing.dueAt && (
                  <div className="text-right whitespace-nowrap">
                    <span className="font-medium text-foreground">Due:</span>{" "}
                    {tz.format(borrowing.dueAt, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </div>
                )}
                {borrowing.notes && (
                  <div className="w-full border-t border-border/40 pt-2 text-xs break-words text-muted-foreground italic">
                    &ldquo;{borrowing.notes}&rdquo;
                  </div>
                )}
              </div>
            </section>

            {/* Repayments History */}
            <section className="space-y-3 border-t border-border/40 pt-4">
              <h4 className="text-[13px] font-medium text-foreground">
                Repayment History ({repayments.length})
              </h4>

              {listLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : repayments.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <Calendar className="mb-2 h-6 w-6 text-muted-foreground/30" />
                  <p className="text-xs font-medium text-muted-foreground">
                    No payments recorded yet
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground/80">
                    Use the form below to register installments.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border/40">
                  {repayments.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0 flex-1 pr-3">
                        <div className="flex items-baseline gap-2">
                          <span className="font-mono text-xs font-semibold text-foreground tabular-nums">
                            {formatCents(r.amount).toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}{" "}
                            {currency}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {tz.format(
                              r.transactionDate || r.createTime || "",
                              {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              }
                            )}
                          </span>
                        </div>
                        {r.description && (
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {r.description}
                          </p>
                        )}
                      </div>
                      <Button
                        type="button"
                        size="icon-xs"
                        variant="ghost"
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDeleteRepayment(r.id || "")}
                        disabled={deleteTransactionMutation.isPending}
                      >
                        {deleteTransactionMutation.isPending ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Record Installment Form */}
            {borrowing.status === "ACTIVE" && (
              <form
                onSubmit={handleSubmit(onSubmitRepayment)}
                className="space-y-4 border-t border-border/40 pt-4"
              >
                <h5 className="text-[13px] font-medium text-foreground">
                  Log Installment Payment
                </h5>
                <div className="space-y-3.5">
                  <div className="space-y-1.5">
                    <Label htmlFor="paymentAmount">Amount</Label>
                    <div className="relative flex h-10 items-center overflow-hidden rounded-lg border border-border bg-control shadow-2xs transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40">
                      <input
                        id="paymentAmount"
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        {...register("amount")}
                        className="h-full w-full flex-1 bg-transparent px-3 py-1.5 font-mono text-sm font-semibold text-foreground tabular-nums placeholder:text-muted-foreground focus:outline-none"
                      />
                      <div className="h-5 w-px shrink-0 bg-border/70" />
                      <span className="flex h-full items-center px-3 font-mono text-xs font-medium text-muted-foreground select-none">
                        {borrowing.currency}
                      </span>
                    </div>
                    {errors.amount && (
                      <p className="text-xs font-medium text-destructive">
                        {errors.amount.message}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col space-y-1.5">
                    <Label>Payment Date</Label>
                    <Controller
                      control={control}
                      name="paymentDate"
                      render={({ field }) => (
                        <DatePicker
                          date={field.value}
                          setDate={(d) => d && field.onChange(d)}
                        />
                      )}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Payment Account</Label>
                    <AccountSelect
                      control={control}
                      name="accountId"
                      accounts={activeAccounts}
                      placeholder="Choose account for transaction"
                      allowNone
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
                    {...register("notes")}
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full cursor-pointer"
                  disabled={
                    logTransactionMutation.isPending ||
                    !!(conversion && "error" in conversion)
                  }
                >
                  {logTransactionMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Add Payment"
                  )}
                </Button>
              </form>
            )}
          </div>
        )}
      </WorkspaceInspectorPanel>

      <AdjustBorrowingModal
        open={openAdjustModal}
        onOpenChange={setOpenAdjustModal}
        borrowing={borrowing}
        spaceId={spaceId}
        refetchBorrowings={refetchBorrowings}
        refetchRepayments={refetchTransactions}
      />
    </>
  )
}

export { BorrowingDetailSheet as BorrowingDetailInspector }
