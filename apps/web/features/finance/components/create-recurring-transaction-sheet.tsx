import { useEffect } from "react"
import { useForm, Controller, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { cn } from "@/lib/utils"
import { FormSelect } from "@/components/ui/form-select"
import { FormDrawer, FormFieldItem } from "@/components/ui/form-drawer"
import {
  recurringTransactionSchema,
  type RecurringTransactionFormValues,
} from "../schemas/recurring-transaction"
import {
  type Budget,
  type RecurringTransaction,
  type UpdateRecurringTransactionRequest,
  useCreateRecurringTransactionMutation,
  useUpdateRecurringTransactionMutation,
  useListCurrenciesQuery,
  useListAccountsQuery,
} from "@/gen/saturn/finance/v1/finance"
import { usePatch } from "@/hooks/use-patch"
import { useCurrencyConversionPreview } from "@/hooks/use-currency-conversion"
import { BudgetSelect } from "./budget-select"
import { AccountSelect } from "./account-select"
import { CurrencyConversionPreview } from "./currency-conversion-preview"
import { Input } from "@/components/ui/input"
import { AmountInput } from "@/components/ui/amount-input"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { DatePicker } from "@/components/ui/date-picker"
import { toCentsString, formatCents } from "../utils"

interface CreateRecurringTransactionSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  spaceId?: string
  baseCurrency?: string
  budgets?: Budget[]
  editTransaction?: RecurringTransaction | null
  refetchTransactions?: () => void
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

export function CreateRecurringTransactionSheet({
  open,
  onOpenChange,
  spaceId,
  baseCurrency,
  budgets = [],
  editTransaction,
  refetchTransactions,
}: CreateRecurringTransactionSheetProps) {
  const createMutation = useCreateRecurringTransactionMutation()
  const updateMutation = useUpdateRecurringTransactionMutation()

  const patchMutation = usePatch<
    RecurringTransaction,
    { id: string; req: UpdateRecurringTransactionRequest }
  >({
    entityKey: "recurring-transactions",
    mutationFn: (vars) => updateMutation.mutateAsync(vars),
    buildVariables: (id, payload, _dirtyPaths, expectedVersion) => ({
      id,
      req: {
        id,
        version: expectedVersion,
        recurringTransaction: {
          ...(payload as Partial<RecurringTransaction>),
        } as RecurringTransaction,
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
    triggerLabel: c.code,
  }))

  const { data: accountsData } = useListAccountsQuery(
    {},
    { enabled: open && !!spaceId }
  )
  const accounts = accountsData?.accounts || []

  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    formState: { errors, dirtyFields },
  } = useForm<RecurringTransactionFormValues>({
    resolver: zodResolver(recurringTransactionSchema),
    defaultValues: {
      type: "EXPENSE",
      budgetId: "",
      accountId: "",
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

  const typeValue = useWatch({ control, name: "type" })
  const amountValue = useWatch({ control, name: "amount" })
  const currencyValue = useWatch({ control, name: "currency" })
  const isVariableValue = useWatch({ control, name: "isVariable" })

  useEffect(() => {
    if (open) {
      if (editTransaction) {
        const nextDueDate = editTransaction.executionState?.nextDueDate
          ? new Date(editTransaction.executionState.nextDueDate)
          : new Date()

        reset({
          type: editTransaction.type === "INCOME" ? "INCOME" : "EXPENSE",
          budgetId: editTransaction.budgetId || "",
          accountId: editTransaction.accountId || "",
          name: editTransaction.name || "",
          amount: formatCents(editTransaction.amount).toString(),
          currency: editTransaction.currency || baseCurrency || "USD",
          interval: editTransaction.interval || "MONTHLY",
          nextDueDate,
          isVariable: editTransaction.isVariable || false,
          status: editTransaction.status || "ACTIVE",
          gracePeriodDays: editTransaction.gracePeriodDays || 0,
        })
      } else {
        const defaultBudgetId = budgets.length > 0 ? budgets[0].id : ""
        const initialBudget = budgets.find((b) => b.id === defaultBudgetId)
        const defaultCurrency = initialBudget?.currency || baseCurrency || "USD"

        reset({
          type: "EXPENSE",
          budgetId: defaultBudgetId || "",
          accountId: "",
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
  }, [open, editTransaction, baseCurrency, reset])

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

  const onSubmit = async (data: RecurringTransactionFormValues) => {
    const centsAmount = toCentsString(data.amount)
    const nextDueDateStr = toLocalISODate(data.nextDueDate)

    if (editTransaction) {
      await patchMutation.mutateAsync({
        id: editTransaction.id || "",
        expectedVersion: editTransaction.version,
        payload: {
          type: data.type,
          budgetId: data.type === "EXPENSE" ? data.budgetId : undefined,
          accountId: data.accountId || undefined,
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
        } as unknown as Partial<RecurringTransaction>,
        dirtyFields,
      })
    } else {
      await createMutation.mutateAsync({
        recurringTransaction: {
          type: data.type,
          budgetId: data.type === "EXPENSE" ? data.budgetId : undefined,
          accountId: data.accountId || undefined,
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

    refetchTransactions?.()
    onOpenChange(false)
  }

  return (
    <FormDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={
        editTransaction
          ? "Edit Recurring Transaction"
          : "Create Recurring Transaction"
      }
      description={
        editTransaction
          ? "Modify the rules for this recurring transaction template."
          : "Configure a recurring transaction template (e.g. rent, salaries, or subscriptions)."
      }
      submitLabel={editTransaction ? "Save Changes" : "Create Template"}
      isPending={isPending}
      disabled={!!(conversion && "error" in conversion)}
      onSubmit={handleSubmit(onSubmit)}
    >
      <FormFieldItem label="Transaction Type">
        <div className="flex rounded-xl border border-border/30 bg-muted/60 p-1">
          <button
            type="button"
            onClick={() => {
              setValue("type", "EXPENSE", { shouldDirty: true })
              if (budgets.length > 0) {
                setValue("budgetId", budgets[0].id, { shouldDirty: true })
              }
            }}
            className={cn(
              "flex-1 rounded-lg py-2 text-sm font-semibold transition-all duration-200",
              typeValue === "EXPENSE"
                ? "scale-[1.01] bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:bg-background/20 hover:text-foreground"
            )}
          >
            Expense
          </button>
          <button
            type="button"
            onClick={() => {
              setValue("type", "INCOME", { shouldDirty: true })
              setValue("budgetId", "", { shouldDirty: true })
            }}
            className={cn(
              "flex-1 rounded-lg py-2 text-sm font-semibold transition-all duration-200",
              typeValue === "INCOME"
                ? "scale-[1.01] bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:bg-background/20 hover:text-foreground"
            )}
          >
            Income
          </button>
        </div>
      </FormFieldItem>

      {typeValue === "EXPENSE" && (
        <FormFieldItem label="Budget" error={errors.budgetId?.message}>
          <BudgetSelect
            control={control}
            name="budgetId"
            budgets={budgets}
            onBudgetChange={handleBudgetChange}
            placeholder="Select a budget..."
          />
        </FormFieldItem>
      )}

      <FormFieldItem label="Template Name" error={errors.name?.message}>
        <Input
          placeholder={
            typeValue === "EXPENSE"
              ? "e.g. Office Rent, Netflix"
              : "e.g. Salary, Retainer"
          }
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

      <FormFieldItem label="Target Account (Optional)">
        <AccountSelect
          control={control}
          name="accountId"
          accounts={accounts}
          allowNone
          placeholder="Select default account..."
        />
      </FormFieldItem>

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
          placeholder="e.g. 3"
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
            Variable Amount Transaction
          </Label>
          <span className="text-[10px] text-muted-foreground">
            Check if the amount changes execution-to-execution.
          </span>
        </div>
      </div>

      {editTransaction && (
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
