import { useEffect, useMemo } from "react"
import { useForm, Controller, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  useCreateExpenseMutation,
  useUpdateExpenseMutation,
  type Budget,
  type Transaction,
  useListAccountsQuery,
  useListCurrenciesQuery,
  useListExchangeRatesQuery,
  type ExchangeRate,
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
import { AmountInput } from "@/components/ui/amount-input"
import { Label } from "@/components/ui/label"
import { Loader2 } from "lucide-react"
import { CurrencyConversionPreview } from "./currency-conversion-preview"
import { toCentsString, formatCents } from "../utils"
import { AccountSelect } from "./account-select"
import { BudgetSelect } from "./budget-select"
import { FormSelect } from "@/components/ui/form-select"
import { DatePicker } from "@/components/ui/date-picker"
import { Checkbox } from "@/components/ui/checkbox"
import {
  transactionSchema,
  type TransactionFormValues,
} from "../schemas/transaction"

interface CreateTransactionSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  spaceId: string
  baseCurrency: string
  budgets: Budget[]
  preselectedBudgetId?: string
  editTransaction?: Transaction | null
  refetchTransactions: () => void
  refetchBudgets: () => void
}

export function CreateTransactionSheet({
  open,
  onOpenChange,
  spaceId,
  baseCurrency,
  budgets,
  preselectedBudgetId,
  editTransaction,
  refetchTransactions,
  refetchBudgets,
}: CreateTransactionSheetProps) {
  const { data: ratesData } = useListExchangeRatesQuery(
    { pageSize: 100, pageToken: "" },
    { enabled: open }
  )

  const { data: currenciesData } = useListCurrenciesQuery(
    {},
    { enabled: open && !!spaceId, staleTime: 1000 * 60 * 30 }
  )
  const currencies = currenciesData?.currencies || []
  const currencyItems = currencies.map((c) => ({
    value: c.code,
    label: c.code,
  }))

  const { data: accountsData } = useListAccountsQuery(
    {},
    { enabled: open && !!spaceId }
  )
  const activeAccounts = useMemo(
    () => accountsData?.accounts?.filter((a) => a.isActive) || [],
    [accountsData?.accounts]
  )

  const createExpenseMutation = useCreateExpenseMutation()
  const updateExpenseMutation = useUpdateExpenseMutation()

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
      budgetId:
        preselectedBudgetId || (budgets.length > 0 ? budgets[0].id || "" : ""),
      accountId: "",
      description: "",
      amount: "",
      currency: baseCurrency || "USD",
      transactionDate: new Date(),
      hasCustomEffectiveDate: false,
      effectiveDate: new Date(),
    },
  })

  // Synchronize form on sheet opening / editing
  useEffect(() => {
    if (open) {
      if (editTransaction) {
        const isCustomEff =
          new Date(
            editTransaction.effectiveDate || editTransaction.transactionDate
          )
            .toISOString()
            .split("T")[0] !==
          new Date(editTransaction.transactionDate).toISOString().split("T")[0]

        reset({
          budgetId: editTransaction.budgetId,
          accountId: editTransaction.accountId || "",
          description: editTransaction.description,
          amount: formatCents(editTransaction.amount).toString(),
          currency: editTransaction.currency,
          transactionDate: new Date(editTransaction.transactionDate),
          hasCustomEffectiveDate: isCustomEff,
          effectiveDate: new Date(
            editTransaction.effectiveDate || editTransaction.transactionDate
          ),
        })
      } else {
        const selected =
          preselectedBudgetId || (budgets.length > 0 ? budgets[0].id || "" : "")
        const b = budgets.find((x) => x.id === selected)
        const globalDefault = activeAccounts.find((a) => a.isDefault)

        reset({
          budgetId: selected,
          accountId: b?.defaultAccountId || globalDefault?.id || "",
          description: "",
          amount: "",
          currency: b?.currency || baseCurrency || "USD",
          transactionDate: new Date(),
          hasCustomEffectiveDate: false,
          effectiveDate: new Date(),
        })
      }
    }
  }, [
    open,
    editTransaction,
    preselectedBudgetId,
    baseCurrency,
    budgets,
    activeAccounts,
    reset,
  ])

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

  const getConversionPreview = (amountStr: string, fromCurr: string) => {
    const amount = parseFloat(amountStr)
    if (isNaN(amount) || amount <= 0) return null
    if (!baseCurrency || fromCurr === baseCurrency) return null

    const matchingRates =
      ratesData?.exchangeRates?.filter(
        (r: ExchangeRate) =>
          r.fromCurrency === fromCurr && r.toCurrency === baseCurrency
      ) || []

    if (matchingRates.length === 0) {
      return {
        error: `No exchange rate configured from ${fromCurr} to ${baseCurrency}.`,
      }
    }

    const latestRate = [...matchingRates].sort(
      (a, b) => new Date(b.rateDate).getTime() - new Date(a.rateDate).getTime()
    )[0]
    return {
      amount: amount * latestRate.rate,
      rate: latestRate.rate,
      currency: baseCurrency,
    }
  }

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

    onOpenChange(false)
    refetchTransactions()
    refetchBudgets()
  }

  const conversion = getConversionPreview(amountValue, currencyValue)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="rounded-none border-none border-border/40 bg-card/95 p-6 shadow-2xl backdrop-blur-xl sm:rounded-l-3xl sm:border-l md:p-8">
        <SheetHeader className="p-0">
          <SheetTitle className="text-xl font-bold">
            {editTransaction ? "Edit Expense" : "Record Expense"}
          </SheetTitle>
          <SheetDescription className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            {editTransaction
              ? "Modify logged expense details. Saturn will recompute currency base aggregates automatically."
              : "Record a new expense. The amount will be deducted from the active period of the selected budget template."}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-6">
          {/* Budget Dropdown */}
          <div className="space-y-2">
            <Label
              htmlFor="txBudget"
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

          {/* Account selector */}
          <div className="space-y-2">
            <Label
              htmlFor="txAccount"
              className="text-xs font-bold tracking-wider text-muted-foreground uppercase"
            >
              Account / Payment Method (Optional)
            </Label>
            <AccountSelect
              control={control}
              name="accountId"
              accounts={activeAccounts}
              placeholder="Choose account to impact balance"
              allowNone
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label
              htmlFor="txDescription"
              className="text-xs font-bold tracking-wider text-muted-foreground uppercase"
            >
              Description
            </Label>
            <Input
              id="txDescription"
              {...register("description")}
              placeholder="e.g. Amazon Web Services, Restaurant Dinner"
              className="h-12 rounded-xl border-border/60 bg-background/50"
            />
            {errors.description && (
              <p className="text-[11px] font-semibold text-destructive">
                {errors.description.message}
              </p>
            )}
          </div>

          {/* Date Configurations Grouped */}
          <div className="space-y-3.5">
            {/* Transaction Date (Full Width) */}
            <div className="space-y-2">
              <Label
                htmlFor="txDate"
                className="text-xs font-bold tracking-wider text-muted-foreground uppercase"
              >
                Transaction Date
              </Label>
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
            </div>

            {/* Ask user if effective date is different */}
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

            {/* Conditional Effective Date Picker */}
            {hasCustomEffectiveDate && (
              <div className="slide-in-from-top-1.5 animate-in space-y-2 duration-200">
                <Label
                  htmlFor="txEffectiveDate"
                  className="text-xs font-bold tracking-wider text-muted-foreground uppercase"
                >
                  Effective Date
                </Label>
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
              </div>
            )}
          </div>

          {/* Amount & Currency Joined */}
          <div className="space-y-2">
            <Label
              htmlFor="txAmount"
              className="text-xs font-bold tracking-wider text-muted-foreground uppercase"
            >
              Amount
            </Label>
            <div className="flex h-12 items-center overflow-hidden rounded-xl border border-border/60 bg-background/50 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20">
              <AmountInput
                control={control}
                name="amount"
                id="txAmount"
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

          {/* Submit */}
          <Button
            type="submit"
            disabled={
              isPending ||
              !budgetIdValue ||
              !!(conversion && "error" in conversion)
            }
            className="h-12 w-full rounded-xl bg-gradient-to-r from-primary to-accent font-semibold text-white shadow-lg shadow-primary/20 transition-all hover:scale-[1.01] hover:opacity-95"
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editTransaction ? "Update Expense" : "Save Expense"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}
