import { useMemo } from "react"
import { useForm, Controller } from "react-hook-form"
import { useQueryClient } from "@tanstack/react-query"
import { zodResolver } from "@hookform/resolvers/zod"
import { ArrowLeft } from "lucide-react"
import { useI18n } from "@saturn/hooks"
import { getLocalizedIntervalLabel } from "@saturn/i18n"
import { FormDrawer } from "@/components/ui/form-drawer"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { DatePicker } from "@/components/ui/date-picker"
import { AccountSelect } from "./account-select"
import { BudgetSelect } from "./budget-select"
import {
  ConfirmTransactionSchema,
  type ConfirmTransactionFormValues,
} from "@saturn/schemas"
import {
  useConfirmScheduledTransactionMutation,
  type ScheduledTransaction,
  type RecurringTransaction,
  type Account,
  type Budget,
} from "@saturn/api/gen/saturn/finance/v1/finance"
import { getScheduledDisplayName } from "@saturn/core"
import { toCentsString, formatCents } from "../utils"

interface ConfirmScheduledFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  scheduledTransaction: ScheduledTransaction
  accounts?: Account[]
  budgets?: Budget[]
  recurringTemplates?: RecurringTransaction[]
  refetchData?: () => void
  onBack: () => void
  headerExtra?: React.ReactNode
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
  headerExtra,
}: ConfirmScheduledFormProps) {
  const queryClient = useQueryClient()
  const { t, language } = useI18n()
  const confirmMutation = useConfirmScheduledTransactionMutation()

  const matchedTemplate = recurringTemplates.find(
    (e) => e.id === scheduledTransaction.sourceId
  )
  const displayName = getScheduledDisplayName(
    scheduledTransaction,
    recurringTemplates
  )

  const intervalVal =
    matchedTemplate?.interval ||
    scheduledTransaction.recurringTransaction?.interval
  const intervalLabel = intervalVal
    ? getLocalizedIntervalLabel(intervalVal, language)
    : t("finance.transactions.scheduled.oneTime")

  const confirmScheduledDefaultValues = useMemo<ConfirmTransactionFormValues>(
    () => ({
      type: scheduledTransaction.type === "INCOME" ? "INCOME" : "EXPENSE",
      amount: (Number(scheduledTransaction.amount || 0) / 100).toFixed(2),
      accountId: scheduledTransaction.accountId || "",
      budgetId: scheduledTransaction.budgetId || "",
      description: displayName,
      transactionDate: new Date(scheduledTransaction.dueDate || new Date()),
      effectiveDate: new Date(),
    }),
    [scheduledTransaction, displayName]
  )

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<ConfirmTransactionFormValues>({
    resolver: zodResolver(ConfirmTransactionSchema),
    defaultValues: {
      type: scheduledTransaction.type === "INCOME" ? "INCOME" : "EXPENSE",
      amount: (Number(scheduledTransaction.amount || 0) / 100).toFixed(2),
      accountId: scheduledTransaction.accountId || "",
      budgetId: scheduledTransaction.budgetId || "",
      description: displayName,
      transactionDate: new Date(scheduledTransaction.dueDate || new Date()),
      effectiveDate: new Date(),
    },
    values: confirmScheduledDefaultValues,
    resetOptions: { keepDirtyValues: true },
  })

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

      await queryClient.invalidateQueries({
        queryKey: ["/api/v1/finance/scheduled-transactions"],
      })
      await queryClient.invalidateQueries({
        queryKey: ["/api/v1/finance/transactions"],
      })
      await queryClient.invalidateQueries({
        queryKey: ["/api/v1/finance/accounts"],
      })
      await queryClient.invalidateQueries({
        queryKey: ["/api/v1/finance/budgets"],
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
      title={
        isExpense
          ? t("finance.transactions.scheduled.confirmPayment")
          : t("finance.transactions.scheduled.confirmDeposit")
      }
      description={
        isExpense
          ? t("finance.transactions.scheduled.clearOutflowDescription")
          : t("finance.transactions.scheduled.clearInflowDescription")
      }
      headerExtra={headerExtra}
      submitLabel={
        isExpense
          ? t("finance.transactions.scheduled.confirmPayment")
          : t("finance.transactions.scheduled.confirmDeposit")
      }
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
            className="-ml-2 h-8 rounded-lg px-2 text-xs font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground"
          >
            <ArrowLeft className="mr-1 h-3.5 w-3.5" />
            {t("finance.transactions.scheduled.backToScheduled")}
          </Button>
        </div>

        {/* Selected Transaction Summary Card */}
        <div className="rounded-xl border border-border/40 bg-muted/20 p-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
              {t("finance.transactions.scheduled.target")}
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
        <div className="space-y-1.5">
          <Label className="text-[13px] font-medium text-foreground/90">
            {t("finance.transactions.scheduled.actualAmount")}
          </Label>
          <div className="relative">
            <Input
              type="number"
              step="0.01"
              className="pr-14 font-mono tabular-nums"
              {...register("amount")}
            />
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
              <span className="font-mono text-xs font-medium text-muted-foreground uppercase">
                {scheduledTransaction.currency || "USD"}
              </span>
            </div>
          </div>
          {errors.amount && (
            <p className="text-xs font-medium text-destructive">
              {errors.amount.message}
            </p>
          )}
        </div>

        {/* Account Select */}
        <div className="space-y-1.5">
          <Label className="text-[13px] font-medium text-foreground/90">
            {isExpense
              ? t("finance.transactions.scheduled.paymentAccount")
              : t("finance.transactions.scheduled.depositAccount")}
          </Label>
          <AccountSelect
            control={control}
            name="accountId"
            accounts={accounts}
          />
          {errors.accountId && (
            <p className="text-xs font-medium text-destructive">
              {errors.accountId.message}
            </p>
          )}
        </div>

        {/* Budget Category Select (only for expenses) */}
        {isExpense && (
          <div className="space-y-1.5">
            <Label className="text-[13px] font-medium text-foreground/90">
              {t("finance.transactions.scheduled.budgetCategory")}
            </Label>
            <BudgetSelect control={control} name="budgetId" budgets={budgets} />
            {errors.budgetId && (
              <p className="text-xs font-medium text-destructive">
                {errors.budgetId.message}
              </p>
            )}
          </div>
        )}

        {/* Description field */}
        <div className="space-y-1.5">
          <Label className="text-[13px] font-medium text-foreground/90">
            {t("finance.transactions.scheduled.descriptionLabel")}
          </Label>
          <Input {...register("description")} />
          {errors.description && (
            <p className="text-xs font-medium text-destructive">
              {errors.description.message}
            </p>
          )}
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-[13px] font-medium text-foreground/90">
              {t("finance.transactions.scheduled.transactionDate")}
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
            <Label className="text-[13px] font-medium text-foreground/90">
              {t("finance.transactions.scheduled.effectiveDate")}
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
