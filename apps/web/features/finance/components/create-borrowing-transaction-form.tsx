import { useEffect } from "react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { ArrowLeft } from "lucide-react"
import { FormDrawer } from "@/components/ui/form-drawer"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { DatePicker } from "@/components/ui/date-picker"
import { AccountSelect } from "./account-select"
import {
  type Borrowing,
  type Account,
  type BorrowingTransactionType,
  useLogBorrowingTransactionMutation,
} from "@/gen/saturn/finance/v1/finance"
import { z } from "zod"
import { toCentsString, formatCents } from "../utils"

const borrowingTransactionSchema = z.object({
  type: z.enum([
    "BORROWING_TRANSACTION_TYPE_PAYMENT",
    "BORROWING_TRANSACTION_TYPE_DISBURSEMENT",
  ]),
  amount: z
    .string()
    .min(1, "Amount is required")
    .refine(
      (val) => {
        const num = parseFloat(val)
        return !isNaN(num) && num > 0
      },
      { message: "Amount must be greater than zero" }
    ),
  accountId: z.string().min(1, "Account is required"),
  notes: z.string().optional(),
  transactionDate: z.date(),
})

type BorrowingTransactionFormValues = z.infer<typeof borrowingTransactionSchema>

interface CreateBorrowingTransactionFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  borrowing: Borrowing
  accounts?: Account[]
  refetchData?: () => void
  onBack: () => void
}

export function CreateBorrowingTransactionForm({
  open,
  onOpenChange,
  borrowing,
  accounts = [],
  refetchData,
  onBack,
}: CreateBorrowingTransactionFormProps) {
  const logTransactionMutation = useLogBorrowingTransactionMutation()

  const defaultAccount =
    accounts.find((a) => a.isDefault && a.isActive) ||
    accounts.find((a) => a.isActive)

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<BorrowingTransactionFormValues>({
    resolver: zodResolver(borrowingTransactionSchema),
    defaultValues: {
      type: "BORROWING_TRANSACTION_TYPE_PAYMENT",
      amount: "",
      accountId: defaultAccount?.id || "",
      notes: "",
      transactionDate: new Date(),
    },
  })

  // Keep form default account updated when list loads
  useEffect(() => {
    if (open) {
      reset({
        type: "BORROWING_TRANSACTION_TYPE_PAYMENT",
        amount: "",
        accountId: defaultAccount?.id || "",
        notes: "",
        transactionDate: new Date(),
      })
    }
  }, [open, borrowing, defaultAccount?.id, reset])

  const onSubmit = async (values: BorrowingTransactionFormValues) => {
    try {
      const centsAmount = toCentsString(values.amount)
      await logTransactionMutation.mutateAsync({
        borrowing_id: borrowing.id || "",
        req: {
          borrowingId: borrowing.id || "",
          transaction: {
            type: values.type as BorrowingTransactionType,
            amount: centsAmount,
            transactionDate: values.transactionDate.toISOString(),
            notes: values.notes || "",
            accountId: values.accountId,
          },
        },
      })

      refetchData?.()
      onOpenChange(false)
    } catch (err) {
      console.error("Failed to log borrowing transaction", err)
    }
  }

  const isLent = borrowing.direction === "LENT"
  const activeAccounts = accounts.filter((a) => a.isActive)

  return (
    <FormDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={isLent ? "Log Lending Transaction" : "Log Borrowing Transaction"}
      description={`Record a payment or disbursement linked to ${borrowing.counterparty}.`}
      submitLabel="Record Transaction"
      onSubmit={handleSubmit(onSubmit)}
      isPending={logTransactionMutation.isPending}
    >
      <div className="flex flex-col gap-5">
        {/* Navigation & Header */}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="-ml-2 h-8 rounded-lg px-2 text-xs font-semibold text-muted-foreground hover:bg-muted/10 hover:text-foreground"
          >
            <ArrowLeft className="mr-1 h-3.5 w-3.5" />
            Back to list
          </Button>
        </div>

        {/* Selected Agreement Summary Card */}
        <div className="rounded-xl border border-border/40 bg-muted/20 p-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
              Borrowing Agreement
            </span>
            <span className="text-[10px] font-bold text-indigo-400 uppercase">
              {isLent ? "You Lent" : "You Borrowed"}
            </span>
          </div>
          <div className="mt-1.5 flex items-baseline justify-between">
            <span className="max-w-[240px] truncate text-sm font-bold text-foreground">
              {borrowing.counterparty}
            </span>
            <span className="text-base font-black text-foreground">
              {formatCents(borrowing.remainingAmount).toFixed(2)}{" "}
              <span className="text-[10px] font-bold text-muted-foreground uppercase">
                {borrowing.currency || "USD"}
              </span>
            </span>
          </div>
        </div>

        {/* Transaction Type Radio Options */}
        <div className="space-y-2">
          <Label className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
            Transaction Action
          </Label>
          <Controller
            control={control}
            name="type"
            render={({ field }) => (
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() =>
                    field.onChange("BORROWING_TRANSACTION_TYPE_PAYMENT")
                  }
                  className={`flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition-all ${
                    field.value === "BORROWING_TRANSACTION_TYPE_PAYMENT"
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border/60 bg-background/40 text-muted-foreground hover:bg-muted/5"
                  }`}
                >
                  <span className="text-xs font-bold text-foreground">
                    {isLent ? "Receive Repayment" : "Make Repayment"}
                  </span>
                  <span className="text-[10px] leading-snug opacity-95">
                    Reduces outstanding balance.
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    field.onChange("BORROWING_TRANSACTION_TYPE_DISBURSEMENT")
                  }
                  className={`flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition-all ${
                    field.value === "BORROWING_TRANSACTION_TYPE_DISBURSEMENT"
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border/60 bg-background/40 text-muted-foreground hover:bg-muted/5"
                  }`}
                >
                  <span className="text-xs font-bold text-foreground">
                    {isLent ? "Lend More Funds" : "Additional Loan Drawdown"}
                  </span>
                  <span className="text-[10px] leading-snug opacity-95">
                    Increases outstanding balance.
                  </span>
                </button>
              </div>
            )}
          />
        </div>

        {/* Amount field */}
        <div className="space-y-2">
          <Label className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
            Amount
          </Label>
          <div className="relative">
            <Input
              type="number"
              step="0.01"
              className="h-11 rounded-xl border-border/60 bg-background/40 pr-12 focus-visible:ring-primary"
              {...register("amount")}
            />
            <div className="absolute inset-y-0 right-0 flex items-center pr-3">
              <span className="text-xs font-bold text-muted-foreground uppercase">
                {borrowing.currency || "USD"}
              </span>
            </div>
          </div>
          {errors.amount && (
            <p className="text-[11px] font-semibold text-destructive">
              {errors.amount.message}
            </p>
          )}
        </div>

        {/* Account Select */}
        <div className="space-y-1.5">
          <Label className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
            Bank Account
          </Label>
          <AccountSelect
            control={control}
            name="accountId"
            accounts={activeAccounts}
            className="h-11 rounded-xl border-border/60 bg-background/40"
          />
          {errors.accountId && (
            <p className="text-[11px] font-semibold text-destructive">
              {errors.accountId.message}
            </p>
          )}
        </div>

        {/* Notes/Description field */}
        <div className="space-y-2">
          <Label className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
            Notes / Reference
          </Label>
          <Input
            placeholder="e.g. Monthly installment, bank transfer ID, cash repayment"
            className="h-11 rounded-xl border-border/60 bg-background/40"
            {...register("notes")}
          />
          {errors.notes && (
            <p className="text-[11px] font-semibold text-destructive">
              {errors.notes.message}
            </p>
          )}
        </div>

        {/* Date Picker */}
        <div className="space-y-1.5">
          <Label className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
            Transaction Date
          </Label>
          <Controller
            control={control}
            name="transactionDate"
            render={({ field }) => (
              <DatePicker date={field.value} setDate={field.onChange} />
            )}
          />
        </div>
      </div>
    </FormDrawer>
  )
}
