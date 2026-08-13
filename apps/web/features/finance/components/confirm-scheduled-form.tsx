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
import { BudgetSelect } from "./budget-select"
import {
  confirmTransactionSchema,
  type ConfirmTransactionFormValues,
} from "../schemas/reconciliation"
import {
  useConfirmScheduledTransactionMutation,
  type ScheduledTransaction,
  type RecurringTransaction,
  type Account,
  type Budget,
} from "@/gen/saturn/finance/v1/finance"
import { toCentsString, formatCents, formatInterval } from "../utils"

interface ConfirmScheduledFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  scheduledTransaction: ScheduledTransaction
  accounts?: Account[]
  budgets?: Budget[]
  recurringTemplates?: RecurringTransaction[]
  refetchData?: () => void
  onBack: () => void
}

export function ConfirmScheduledForm({
  open,
  onOpenChange,
  scheduledTransaction,
  accounts = [],
  budgets = [],
  recurringTemplates = [],
  refetchData,
  onBack,
}: ConfirmScheduledFormProps) {
  const confirmMutation = useConfirmScheduledTransactionMutation()

  const matchedTemplate = recurringTemplates.find(
    (e) => e.id === scheduledTransaction.sourceId
  )
  const displayName =
    matchedTemplate?.name ||
    scheduledTransaction.recurringTransaction?.name ||
    scheduledTransaction.metadata?.description ||
    scheduledTransaction.metadata?.name ||
    "Scheduled Transaction"

  const intervalVal =
    matchedTemplate?.interval ||
    scheduledTransaction.recurringTransaction?.interval
  const intervalLabel = intervalVal ? formatInterval(intervalVal) : "One-Time"

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<ConfirmTransactionFormValues>({
    resolver: zodResolver(confirmTransactionSchema),
    defaultValues: {
      type: scheduledTransaction.type === "INCOME" ? "INCOME" : "EXPENSE",
      amount: (Number(scheduledTransaction.amount || 0) / 100).toFixed(2),
      accountId: scheduledTransaction.accountId || "",
      budgetId: scheduledTransaction.budgetId || "",
      description: displayName,
      transactionDate: new Date(scheduledTransaction.dueDate || new Date()),
      effectiveDate: new Date(),
    },
  })

  // Keep form in sync when transaction prop changes
  useEffect(() => {
    reset({
      type: scheduledTransaction.type === "INCOME" ? "INCOME" : "EXPENSE",
      amount: (Number(scheduledTransaction.amount || 0) / 100).toFixed(2),
      accountId: scheduledTransaction.accountId || "",
      budgetId: scheduledTransaction.budgetId || "",
      description: displayName,
      transactionDate: new Date(scheduledTransaction.dueDate || new Date()),
      effectiveDate: new Date(),
    })
  }, [scheduledTransaction, reset])

  const toLocalISODate = (d: Date): string => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const date = String(d.getDate()).padStart(2, "0")
    return `${y}-${m}-${date}T12:00:00Z`
  }

  const onSubmit = async (values: ConfirmTransactionFormValues) => {
    try {
      const centsAmount = toCentsString(values.amount)
      const txDateStr = toLocalISODate(values.transactionDate)
      const effDateStr = toLocalISODate(values.effectiveDate)

      await confirmMutation.mutateAsync({
        transaction_id: scheduledTransaction.id || "",
        req: {
          transactionId: scheduledTransaction.id || "",
          transactionDate: txDateStr,
          effectiveDate: effDateStr,
          actualAmount: centsAmount,
          description: values.description.trim() || undefined,
          accountId: values.accountId || undefined,
          budgetId:
            scheduledTransaction.type === "EXPENSE"
              ? values.budgetId || undefined
              : undefined,
        },
      })

      refetchData?.()
      onOpenChange(false)
    } catch (err) {
      console.error("Failed to confirm scheduled transaction", err)
    }
  }

  const isExpense = scheduledTransaction.type === "EXPENSE"

  return (
    <FormDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={isExpense ? "Confirm Payment" : "Confirm Deposit"}
      description={`Clear this scheduled ${isExpense ? "outflow" : "inflow"} from your calendar.`}
      submitLabel={isExpense ? "Confirm Payment" : "Confirm Deposit"}
      onSubmit={handleSubmit(onSubmit)}
      isPending={confirmMutation.isPending}
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

        {/* Selected Transaction Summary Card */}
        <div className="rounded-xl border border-border/40 bg-muted/20 p-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
              Scheduled Target
            </span>
            <span className="text-[10px] font-bold text-indigo-400 uppercase">
              {intervalLabel}
            </span>
          </div>
          <div className="mt-1.5 flex items-baseline justify-between">
            <span className="max-w-[240px] truncate text-sm font-bold text-foreground">
              {displayName}
            </span>
            <span className="text-base font-black text-foreground">
              {formatCents(scheduledTransaction.amount).toFixed(2)}{" "}
              <span className="text-[10px] font-bold text-muted-foreground uppercase">
                {scheduledTransaction.currency || "USD"}
              </span>
            </span>
          </div>
        </div>

        {/* Amount field */}
        <div className="space-y-2">
          <Label className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
            Actual Amount
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
                {scheduledTransaction.currency || "USD"}
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
            {isExpense ? "Payment Account" : "Deposit Account"}
          </Label>
          <AccountSelect
            control={control}
            name="accountId"
            accounts={accounts}
            className="h-11 rounded-xl border-border/60 bg-background/40"
          />
          {errors.accountId && (
            <p className="text-[11px] font-semibold text-destructive">
              {errors.accountId.message}
            </p>
          )}
        </div>

        {/* Budget Category Select (only for expenses) */}
        {isExpense && (
          <div className="space-y-1.5">
            <Label className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
              Budget Category
            </Label>
            <BudgetSelect
              control={control}
              name="budgetId"
              budgets={budgets}
              className="h-11 rounded-xl border-border/60 bg-background/40"
            />
            {errors.budgetId && (
              <p className="text-[11px] font-semibold text-destructive">
                {errors.budgetId.message}
              </p>
            )}
          </div>
        )}

        {/* Description field */}
        <div className="space-y-2">
          <Label className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
            Description
          </Label>
          <Input
            className="h-11 rounded-xl border-border/60 bg-background/40"
            {...register("description")}
          />
          {errors.description && (
            <p className="text-[11px] font-semibold text-destructive">
              {errors.description.message}
            </p>
          )}
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-4">
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

          <div className="space-y-1.5">
            <Label className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
              Effective Date
            </Label>
            <Controller
              control={control}
              name="effectiveDate"
              render={({ field }) => (
                <DatePicker date={field.value} setDate={field.onChange} />
              )}
            />
          </div>
        </div>
      </div>
    </FormDrawer>
  )
}
