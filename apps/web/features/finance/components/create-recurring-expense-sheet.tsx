import { useEffect } from "react"
import { useForm, Controller, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { FormSelect } from "@/components/ui/form-select"
import { FormDrawer, FormFieldItem } from "@/components/ui/form-drawer"
import {
  recurringExpenseSchema,
  type RecurringExpenseFormValues,
} from "../schemas/recurring-expense"
import {
  type Budget,
  type RecurringExpense,
  type UpdateRecurringExpenseRequest,
  useCreateRecurringExpenseMutation,
  useUpdateRecurringExpenseMutation,
  useListCurrenciesQuery,
} from "@/gen/saturn/finance/v1/finance"
import { usePatch } from "@/hooks/use-patch"
import { useCurrencyConversionPreview } from "@/hooks/use-currency-conversion"
import { BudgetSelect } from "./budget-select"
import { CurrencyConversionPreview } from "./currency-conversion-preview"
import { Input } from "@/components/ui/input"
import { AmountInput } from "@/components/ui/amount-input"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { DatePicker } from "@/components/ui/date-picker"
import { toCentsString, formatCents } from "../utils"

interface CreateRecurringExpenseSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  spaceId?: string
  baseCurrency?: string
  budgets?: Budget[]
  editExpense?: RecurringExpense | null
  refetchExpenses?: () => void
  getConversionPreview?: (amountStr: string, fromCurr: string) => unknown
  currencies?: unknown[]
}

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

export function CreateRecurringExpenseSheet({
  open,
  onOpenChange,
  spaceId,
  baseCurrency,
  budgets = [],
  editExpense,
  refetchExpenses,
}: CreateRecurringExpenseSheetProps) {
  const createMutation = useCreateRecurringExpenseMutation()
  const updateMutation = useUpdateRecurringExpenseMutation()

  const patchMutation = usePatch<
    RecurringExpense,
    { id: string; req: UpdateRecurringExpenseRequest }
  >({
    entityKey: "recurring-expenses",
    mutationFn: (vars) => updateMutation.mutateAsync(vars),
    buildVariables: (id, payload, _dirtyPaths, expectedVersion) => ({
      id,
      req: {
        id,
        version: expectedVersion,
        recurringExpense: {
          ...(payload as Partial<RecurringExpense>),
        } as RecurringExpense,
      },
    }),
  })

  const { getConversionPreview } = useCurrencyConversionPreview({
    spaceId,
    enabled: open,
    baseCurrency,
  })

  const { data: currenciesData } = useListCurrenciesQuery(
    {},
    { enabled: open && !!spaceId, staleTime: 1000 * 60 * 30 }
  )
  const currencies = currenciesData?.currencies || []
  const currencyItems = currencies.map((c) => ({
    value: c.code,
    label: `${c.code}${c.name ? ` (${c.name})` : ""}`,
  }))

  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    formState: { errors, dirtyFields },
  } = useForm<RecurringExpenseFormValues>({
    resolver: zodResolver(recurringExpenseSchema),
    defaultValues: {
      budgetId: "",
      name: "",
      amount: "",
      currency: baseCurrency || "USD",
      interval: "MONTHLY",
      nextDueDate: new Date(),
      isVariable: false,
      status: "ACTIVE",
      gracePeriodDays: 3,
    },
  })

  useEffect(() => {
    if (open) {
      if (editExpense) {
        const nextDueDate = editExpense.executionState?.nextDueDate
          ? new Date(editExpense.executionState.nextDueDate)
          : new Date()

        reset({
          budgetId: editExpense.budgetId || "",
          name: editExpense.name || "",
          amount: formatCents(editExpense.amount).toString(),
          currency: editExpense.currency || baseCurrency || "USD",
          interval: editExpense.interval || "MONTHLY",
          nextDueDate,
          isVariable: editExpense.isVariable || false,
          status: editExpense.status || "ACTIVE",
          gracePeriodDays: editExpense.gracePeriodDays || 0,
        })
      } else {
        const defaultBudgetId = budgets.length > 0 ? budgets[0].id : ""
        const initialBudget = budgets.find((b) => b.id === defaultBudgetId)
        const defaultCurrency = initialBudget?.currency || baseCurrency || "USD"

        reset({
          budgetId: defaultBudgetId || "",
          name: "",
          amount: "",
          currency: defaultCurrency,
          interval: "MONTHLY",
          nextDueDate: new Date(),
          isVariable: false,
          status: "ACTIVE",
          gracePeriodDays: 3,
        })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const isPending = createMutation.isPending || patchMutation.isPending
  const conversion = getConversionPreview(amountValue, currencyValue)

  const onSubmit = async (data: RecurringExpenseFormValues) => {
    const centsAmount = toCentsString(data.amount)
    const nextDueDateStr = toLocalISODate(data.nextDueDate)

    if (editExpense) {
      await patchMutation.mutateAsync({
        id: editExpense.id || "",
        expectedVersion: editExpense.version,
        payload: {
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
        } as unknown as Partial<RecurringExpense>,
        dirtyFields,
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

    refetchExpenses?.()
    onOpenChange(false)
  }

  return (
    <FormDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={
        editExpense ? "Edit Recurrent Expense" : "Create Recurrent Expense"
      }
      description={
        editExpense
          ? "Modify the rules for this recurrent expense template."
          : "Configure a recurrent expense template (e.g. rent or subscriptions)."
      }
      submitLabel={editExpense ? "Save Changes" : "Create Template"}
      isPending={isPending}
      disabled={!!(conversion && "error" in conversion)}
      onSubmit={handleSubmit(onSubmit)}
    >
      <FormFieldItem label="Budget" error={errors.budgetId?.message}>
        <BudgetSelect
          control={control}
          name="budgetId"
          budgets={budgets}
          onBudgetChange={handleBudgetChange}
          placeholder="Select a budget..."
        />
      </FormFieldItem>

      <FormFieldItem label="Template Name" error={errors.name?.message}>
        <Input
          placeholder="e.g. Office Rent, Netflix"
          {...register("name")}
          className="h-12 rounded-xl border-border/60 bg-background/50"
        />
      </FormFieldItem>

      <FormFieldItem label="Expected Amount" error={errors.amount?.message}>
        <div className="flex h-12 items-center overflow-hidden rounded-xl border border-border/60 bg-background/50 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20">
          <AmountInput
            control={control}
            name="amount"
            placeholder="0.00"
            showError={false}
            className="h-full w-full flex-1 border-0 bg-transparent px-4 py-2 text-sm text-foreground shadow-none ring-0 focus-visible:ring-0 focus-visible:outline-none"
          />

          <div className="h-6 w-px shrink-0 bg-border/40" />

          <FormSelect
            control={control}
            name="currency"
            items={currencyItems}
            triggerClassName="!h-full w-28 border-0 bg-transparent focus-visible:ring-0"
          />
        </div>
      </FormFieldItem>

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

      <FormFieldItem label="Next Due Date">
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
      </FormFieldItem>

      <FormFieldItem
        label="Grace Period (in days)"
        error={errors.gracePeriodDays?.message}
      >
        <Input
          type="number"
          min="0"
          placeholder="e.g. 5"
          {...register("gracePeriodDays", { valueAsNumber: true })}
          className="h-12 rounded-xl border-border/60 bg-background/50"
        />
      </FormFieldItem>

      <div className="flex items-center gap-3.5 rounded-2xl border border-muted/20 bg-muted/5 p-4 select-none">
        <Checkbox
          id="isVariable"
          checked={isVariableValue}
          onCheckedChange={(checked) =>
            setValue("isVariable", !!checked, { shouldDirty: true })
          }
        />
        <div className="grid gap-1">
          <Label
            htmlFor="isVariable"
            className="cursor-pointer text-xs leading-none font-semibold text-foreground/80"
          >
            Variable Amount Bill
          </Label>
          <span className="text-[10px] text-muted-foreground">
            Check if the amount changes month-to-month (e.g. electricity bills).
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
    </FormDrawer>
  )
}
