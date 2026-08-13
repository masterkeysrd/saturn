import { useEffect } from "react"
import { useForm, Controller, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { FormSelect } from "@/components/ui/form-select"
import { FormDrawer, FormFieldItem } from "@/components/ui/form-drawer"
import {
  transactionSchema,
  type TransactionFormValues,
} from "../schemas/transaction"
import {
  type Account,
  type Budget,
  type Transaction,
  useCreateExpenseMutation,
  useUpdateExpenseMutation,
  useListCurrenciesQuery,
  useListAccountsQuery,
} from "@/gen/saturn/finance/v1/finance"
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

interface CreateTransactionSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  spaceId?: string
  baseCurrency?: string
  budgets?: Budget[]
  accounts?: Account[]
  editTransaction?: Transaction | null
  preselectedBudgetId?: string
  refetchTransactions?: () => void
  refetchBudgets?: () => void
  refetchData?: () => void
}

export function CreateTransactionSheet({
  open,
  onOpenChange,
  spaceId,
  baseCurrency,
  budgets = [],
  accounts: initialAccounts,
  editTransaction,
  preselectedBudgetId,
  refetchTransactions,
  refetchBudgets,
  refetchData,
}: CreateTransactionSheetProps) {
  const handleRefetch = () => {
    refetchTransactions?.()
    refetchBudgets?.()
    refetchData?.()
  }

  const { data: accountsData } = useListAccountsQuery(
    {},
    { enabled: open && !initialAccounts }
  )
  const accountsList = initialAccounts || accountsData?.accounts || []
  const activeAccounts = accountsList.filter((a) => a.isActive)

  const createExpenseMutation = useCreateExpenseMutation({
    onSuccess: () => {
      handleRefetch()
      onOpenChange(false)
    },
    onError: (err: unknown) => {
      alert(err instanceof Error ? err.message : "Failed to record expense.")
    },
  })

  const updateExpenseMutation = useUpdateExpenseMutation({
    onSuccess: () => {
      handleRefetch()
      onOpenChange(false)
    },
    onError: (err: unknown) => {
      alert(err instanceof Error ? err.message : "Failed to update expense.")
    },
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

  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    formState: { errors },
  } = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      budgetId: "",
      amount: "",
      currency: baseCurrency || "USD",
      description: "",
      transactionDate: new Date(),
      effectiveDate: new Date(),
      hasCustomEffectiveDate: false,
      accountId: "",
    },
  })

  useEffect(() => {
    if (open) {
      if (editTransaction) {
        const txDate = editTransaction.transactionDate
          ? new Date(editTransaction.transactionDate)
          : new Date()
        const effDate = editTransaction.effectiveDate
          ? new Date(editTransaction.effectiveDate)
          : txDate
        const isDiff = txDate.toDateString() !== effDate.toDateString()

        reset({
          budgetId: editTransaction.budgetId || "",
          amount: formatCents(editTransaction.amount).toString(),
          currency: editTransaction.currency || baseCurrency || "USD",
          description: editTransaction.description || "",
          transactionDate: txDate,
          effectiveDate: effDate,
          hasCustomEffectiveDate: isDiff,
          accountId: editTransaction.accountId || "",
        })
      } else {
        const selectedBudgetId =
          preselectedBudgetId || (budgets.length > 0 ? budgets[0].id : "")
        const initialBudget = budgets.find((b) => b.id === selectedBudgetId)

        const defaultCurrency = initialBudget?.currency || baseCurrency || "USD"

        const defaultAcc = activeAccounts.find((a) => a.isDefault)
        const initialAccId =
          initialBudget?.defaultAccountId || defaultAcc?.id || ""

        reset({
          budgetId: selectedBudgetId || "",
          amount: "",
          currency: defaultCurrency,
          description: "",
          transactionDate: new Date(),
          effectiveDate: new Date(),
          hasCustomEffectiveDate: false,
          accountId: initialAccId,
        })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editTransaction, preselectedBudgetId, baseCurrency, reset])

  const budgetIdValue = useWatch({ control, name: "budgetId" })
  const amountValue = useWatch({ control, name: "amount" })
  const currencyValue = useWatch({ control, name: "currency" })
  const transactionDateValue = useWatch({ control, name: "transactionDate" })
  const hasCustomEffectiveDate = useWatch({
    control,
    name: "hasCustomEffectiveDate",
  })

  // Sync currency & default account when selected budget changes
  const handleBudgetChange = (newBudgetId: string) => {
    const b = budgets.find((x) => x.id === newBudgetId)
    if (b) {
      setValue("currency", b.currency)
      const globalDefault = activeAccounts.find((a) => a.isDefault)
      if (b.defaultAccountId || globalDefault?.id) {
        setValue("accountId", b.defaultAccountId || globalDefault?.id || "")
      }
    }
  }

  const { getConversionPreview } = useCurrencyConversionPreview({
    spaceId,
    enabled: open,
    baseCurrency,
  })

  const isPending =
    createExpenseMutation.isPending || updateExpenseMutation.isPending

  const onSubmit = async (data: TransactionFormValues) => {
    const toLocalISODate = (d: Date): string => {
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, "0")
      const date = String(d.getDate()).padStart(2, "0")
      return `${y}-${m}-${date}T12:00:00Z`
    }

    const txDateStr = toLocalISODate(data.transactionDate)
    const effDateStr = toLocalISODate(
      data.hasCustomEffectiveDate ? data.effectiveDate : data.transactionDate
    )

    if (editTransaction) {
      await updateExpenseMutation.mutateAsync({
        id: editTransaction.id || "",
        req: {
          id: editTransaction.id || "",
          expense: {
            budgetId: data.budgetId,
            amount: toCentsString(data.amount),
            currency: data.currency,
            description: data.description,
            transactionDate: txDateStr,
            effectiveDate: effDateStr,
            accountId: data.accountId || undefined,
          },
        },
      })
    } else {
      await createExpenseMutation.mutateAsync({
        expense: {
          budgetId: data.budgetId,
          amount: toCentsString(data.amount),
          currency: data.currency,
          description: data.description,
          transactionDate: txDateStr,
          effectiveDate: effDateStr,
          accountId: data.accountId || undefined,
        },
      })
    }
  }

  const conversion = getConversionPreview(amountValue, currencyValue)

  return (
    <FormDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={editTransaction ? "Edit Expense" : "Record Expense"}
      description={
        editTransaction
          ? "Modify logged expense details. Saturn will recompute currency base aggregates automatically."
          : "Record a new expense. The amount will be deducted from the active period of the selected budget template."
      }
      submitLabel={editTransaction ? "Update Expense" : "Save Expense"}
      isPending={isPending}
      disabled={!budgetIdValue || !!(conversion && "error" in conversion)}
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

      <FormFieldItem label="Account / Payment Method (Optional)">
        <AccountSelect
          control={control}
          name="accountId"
          accounts={activeAccounts}
          placeholder="Choose account to impact balance"
          allowNone
        />
      </FormFieldItem>

      <FormFieldItem label="Description" error={errors.description?.message}>
        <Input
          {...register("description")}
          placeholder="e.g. Amazon Web Services, Restaurant Dinner"
          className="h-12 rounded-xl border-border/60 bg-background/50"
        />
      </FormFieldItem>

      <div className="space-y-3.5">
        <FormFieldItem label="Transaction Date">
          <Controller
            control={control}
            name="transactionDate"
            render={({ field }) => (
              <DatePicker
                date={field.value}
                setDate={(newDate) => {
                  if (newDate) {
                    field.onChange(newDate)
                    if (!hasCustomEffectiveDate) {
                      setValue("effectiveDate", newDate)
                    }
                  }
                }}
              />
            )}
          />
        </FormFieldItem>

        <div className="flex items-center gap-2.5 py-1 select-none">
          <Checkbox
            id="txCustomEffective"
            checked={hasCustomEffectiveDate}
            onCheckedChange={(checked) => {
              const isChecked = !!checked
              setValue("hasCustomEffectiveDate", isChecked)
              if (!isChecked) {
                setValue("effectiveDate", transactionDateValue)
              }
            }}
          />
          <Label
            htmlFor="txCustomEffective"
            className="cursor-pointer text-xs font-semibold text-foreground/80"
          >
            Is this payment effective on a different date?
          </Label>
        </div>

        {hasCustomEffectiveDate && (
          <FormFieldItem
            label="Effective Date"
            className="slide-in-from-top-1.5 animate-in duration-200"
          >
            <Controller
              control={control}
              name="effectiveDate"
              render={({ field }) => (
                <DatePicker
                  date={field.value}
                  setDate={(newDate) => newDate && field.onChange(newDate)}
                />
              )}
            />
          </FormFieldItem>
        )}
      </div>

      <FormFieldItem label="Amount" error={errors.amount?.message}>
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
    </FormDrawer>
  )
}
