import { useEffect } from "react"
import { useForm, Controller, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  useCreateRecurringExpenseMutation,
  useUpdateRecurringExpenseMutation,
  type RecurringExpense,
  type Budget,
  type CurrencyInfo,
  type RecurringExpense_Interval,
  type RecurringExpense_Status,
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
import { Checkbox } from "@/components/ui/checkbox"
import { DatePicker } from "@/components/ui/date-picker"
import { Loader2 } from "lucide-react"
import { CurrencyConversionPreview } from "./currency-conversion-preview"
import { BudgetSelect } from "./budget-select"
import { FormSelect } from "@/components/ui/form-select"
import { toCentsString, formatCents } from "../utils"
import {
  recurringExpenseSchema,
  type RecurringExpenseFormValues,
} from "../schemas/recurring-expense"

const INTERVAL_ITEMS = [
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "YEARLY", label: "Yearly" },
]

const STATUS_ITEMS = [
  { value: "ACTIVE", label: "Active" },
  { value: "PAUSED", label: "Paused" },
  { value: "ENDED", label: "Ended" },
]

interface CreateRecurringExpenseSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  budgets: Budget[]
  baseCurrency: string
  editExpense?: RecurringExpense | null
  refetchExpenses: () => void
  getConversionPreview: (
    amountStr: string,
    fromCurr: string
  ) =>
    | { amount: number; rate: number; currency: string }
    | { error: string }
    | null
  currencies?: CurrencyInfo[]
}

export function CreateRecurringExpenseSheet({
  open,
  onOpenChange,
  budgets,
  baseCurrency,
  editExpense,
  refetchExpenses,
  getConversionPreview,
  currencies = [],
}: CreateRecurringExpenseSheetProps) {
  const createMutation = useCreateRecurringExpenseMutation()
  const updateMutation = useUpdateRecurringExpenseMutation()

  const currencyItems = currencies.map((cur) => ({
    value: cur.code,
    label: `${cur.code}${cur.name ? ` (${cur.name})` : ""}`,
  }))

  const normalizeIntervalVal = (
    intv: string | undefined
  ): RecurringExpense_Interval => {
    if (!intv) return "MONTHLY"
    const clean = intv.replace(/^INTERVAL_/i, "").toUpperCase()
    if (clean === "WEEKLY" || clean === "MONTHLY" || clean === "YEARLY") {
      return clean as RecurringExpense_Interval
    }
    return "MONTHLY"
  }

  const normalizeStatusVal = (
    st: string | undefined
  ): RecurringExpense_Status => {
    if (!st) return "ACTIVE"
    const clean = st
      .replace(/^(STATUS_|RECURRING_EXPENSE_STATUS_)/i, "")
      .toUpperCase()
    if (clean === "ACTIVE" || clean === "PAUSED" || clean === "ENDED") {
      return clean as RecurringExpense_Status
    }
    return "ACTIVE"
  }

  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    formState: { errors },
  } = useForm<RecurringExpenseFormValues>({
    resolver: zodResolver(recurringExpenseSchema),
    defaultValues: {
      budgetId: "",
      name: "",
      amount: "",
      currency: baseCurrency || "USD",
      interval: "MONTHLY",
      nextDueDate: new Date(),
      gracePeriodDays: 0,
      isVariable: false,
      status: "ACTIVE",
    },
  })

  useEffect(() => {
    if (open) {
      if (editExpense) {
        const rawNextDueDate =
          editExpense.executionState?.nextDueDate ||
          ((
            editExpense.executionState as unknown as
              Record<string, unknown> | undefined
          )?.next_due_date as string | undefined) ||
          ((editExpense as unknown as Record<string, unknown>).nextDueDate as
            string | undefined) ||
          ((editExpense as unknown as Record<string, unknown>).next_due_date as
            string | undefined)
        const parsedDate = rawNextDueDate
          ? new Date(rawNextDueDate)
          : new Date()

        reset({
          budgetId: editExpense.budgetId,
          name: editExpense.name,
          amount: formatCents(editExpense.amount).toString(),
          currency: editExpense.currency,
          interval: normalizeIntervalVal(editExpense.interval),
          nextDueDate:
            parsedDate && !isNaN(parsedDate.getTime())
              ? parsedDate
              : new Date(),
          gracePeriodDays: editExpense.gracePeriodDays || 0,
          isVariable: editExpense.isVariable,
          status: normalizeStatusVal(editExpense.status),
        })
      } else {
        reset({
          budgetId: "",
          name: "",
          amount: "",
          currency: baseCurrency || "USD",
          interval: "MONTHLY",
          nextDueDate: new Date(),
          gracePeriodDays: 0,
          isVariable: false,
          status: "ACTIVE",
        })
      }
    }
  }, [open, editExpense, baseCurrency, reset])

  const amountValue = useWatch({ control, name: "amount" })
  const currencyValue = useWatch({ control, name: "currency" })
  const isVariableValue = useWatch({ control, name: "isVariable" })

  const handleBudgetChange = (newBudgetId: string) => {
    const b = budgets.find((x) => x.id === newBudgetId)
    if (b) {
      setValue("currency", b.currency)
    }
  }

  const toLocalISODate = (d: Date): string => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const date = String(d.getDate()).padStart(2, "0")
    return `${y}-${m}-${date}T12:00:00Z`
  }

  const isPending = createMutation.isPending || updateMutation.isPending
  const conversion = getConversionPreview(amountValue, currencyValue)

  const onSubmit = async (data: RecurringExpenseFormValues) => {
    const centsAmount = toCentsString(data.amount)
    const nextDueDateStr = toLocalISODate(data.nextDueDate)

    if (editExpense) {
      await updateMutation.mutateAsync({
        id: editExpense.id || "",
        req: {
          id: editExpense.id || "",
          recurringExpense: {
            id: editExpense.id || "",
            spaceId: editExpense.spaceId || "",
            budgetId: data.budgetId,
            name: data.name,
            amount: centsAmount,
            currency: data.currency,
            interval: data.interval,
            executionState: {
              nextDueDate: nextDueDateStr,
            },
            isVariable: data.isVariable,
            status: data.status,
            gracePeriodDays: data.gracePeriodDays,
          },
        },
      })
    } else {
      await createMutation.mutateAsync({
        recurringExpense: {
          budgetId: data.budgetId,
          name: data.name,
          amount: centsAmount,
          currency: data.currency,
          interval: data.interval,
          executionState: {
            nextDueDate: nextDueDateStr,
          },
          isVariable: data.isVariable,
          status: "ACTIVE",
          gracePeriodDays: data.gracePeriodDays,
        },
      })
    }

    refetchExpenses()
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full rounded-none border-none border-border/40 bg-card/95 p-6 shadow-2xl backdrop-blur-xl sm:max-w-md sm:rounded-l-3xl sm:border-l md:p-8">
        <SheetHeader className="p-0">
          <SheetTitle className="text-xl font-bold">
            {editExpense
              ? "Edit Recurrent Expense"
              : "Create Recurrent Expense"}
          </SheetTitle>
          <SheetDescription className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            {editExpense
              ? "Modify the rules for this recurrent expense template."
              : "Configure a recurrent expense template (e.g. rent or subscriptions)."}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-6">
          <div className="space-y-2">
            <Label
              htmlFor="budgetId"
              className="text-xs font-bold tracking-wider text-muted-foreground uppercase"
            >
              Budget
            </Label>
            <BudgetSelect
              control={control}
              name="budgetId"
              budgets={budgets}
              onBudgetChange={handleBudgetChange}
              placeholder="Select a budget..."
            />
            {errors.budgetId && (
              <p className="text-[11px] font-semibold text-destructive">
                {errors.budgetId.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="name"
              className="text-xs font-bold tracking-wider text-muted-foreground uppercase"
            >
              Template Name
            </Label>
            <Input
              id="name"
              {...register("name")}
              placeholder="e.g. Office Rent, Netflix"
              className="h-12 rounded-xl border-border/60 bg-background/50"
            />
            {errors.name && (
              <p className="text-[11px] font-semibold text-destructive">
                {errors.name.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="amount"
              className="text-xs font-bold tracking-wider text-muted-foreground uppercase"
            >
              Expected Amount
            </Label>
            <div className="flex h-12 items-center overflow-hidden rounded-xl border border-border/60 bg-background/50 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20">
              <input
                id="amount"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                {...register("amount")}
                className="h-full w-full flex-1 bg-transparent px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
              />

              <div className="h-6 w-px shrink-0 bg-border/40" />

              <FormSelect
                control={control}
                name="currency"
                items={currencyItems}
                triggerClassName="!h-full w-28 border-0 bg-transparent focus-visible:ring-0"
              />
            </div>
            {errors.amount && (
              <p className="text-[11px] font-semibold text-destructive">
                {errors.amount.message}
              </p>
            )}
          </div>

          <CurrencyConversionPreview
            conversion={conversion}
            fromCurrency={currencyValue}
          />

          <FormSelect
            control={control}
            name="interval"
            label="Interval"
            items={INTERVAL_ITEMS}
          />

          <div className="space-y-2">
            <Label className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
              Next Due Date
            </Label>
            <Controller
              control={control}
              name="nextDueDate"
              render={({ field }) => (
                <DatePicker
                  date={field.value}
                  setDate={(d) => d && field.onChange(d)}
                />
              )}
            />
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="gracePeriodDays"
              className="text-xs font-bold tracking-wider text-muted-foreground uppercase"
            >
              Grace Period (in days)
            </Label>
            <Input
              id="gracePeriodDays"
              type="number"
              min="0"
              placeholder="e.g. 5"
              {...register("gracePeriodDays", { valueAsNumber: true })}
              className="h-12 rounded-xl border-border/60 bg-background/50"
            />
            {errors.gracePeriodDays && (
              <p className="text-[11px] font-semibold text-destructive">
                {errors.gracePeriodDays.message}
              </p>
            )}
          </div>

          <div className="flex items-center gap-3.5 rounded-2xl border border-muted/20 bg-muted/5 p-4 select-none">
            <Checkbox
              id="isVariable"
              checked={isVariableValue}
              onCheckedChange={(checked) => setValue("isVariable", !!checked)}
            />
            <div className="grid gap-1">
              <Label
                htmlFor="isVariable"
                className="cursor-pointer text-xs leading-none font-semibold text-foreground/80"
              >
                Variable Amount Bill
              </Label>
              <span className="text-[10px] text-muted-foreground">
                Check if the amount changes month-to-month (e.g. electricity
                bills).
              </span>
            </div>
          </div>

          {editExpense && (
            <FormSelect
              control={control}
              name="status"
              label="Status"
              items={STATUS_ITEMS}
            />
          )}

          <Button
            type="submit"
            className="h-12 w-full rounded-xl bg-gradient-to-r from-primary to-accent font-semibold text-white shadow-lg shadow-primary/20 transition-all hover:scale-[1.01] hover:opacity-95"
            disabled={isPending}
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editExpense ? "Save Changes" : "Create Template"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}
