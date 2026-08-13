import { useEffect } from "react"
import { useForm, Controller, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { FormSelect } from "@/components/ui/form-select"
import { FormDrawer, FormFieldItem } from "@/components/ui/form-drawer"
import { ArrowLeft } from "lucide-react"
import { incomeSchema, type IncomeFormValues } from "../schemas/transaction"
import {
  type Account,
  type Transaction,
  useCreateIncomeMutation,
  useUpdateIncomeMutation,
  useListCurrenciesQuery,
  useListAccountsQuery,
} from "@/gen/saturn/finance/v1/finance"
import { useCurrencyConversionPreview } from "@/hooks/use-currency-conversion"
import { AccountSelect } from "./account-select"
import { CurrencyConversionPreview } from "./currency-conversion-preview"
import { Input } from "@/components/ui/input"
import { AmountInput } from "@/components/ui/amount-input"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { DatePicker } from "@/components/ui/date-picker"
import { toCentsString, formatCents } from "../utils"

interface CreateIncomeFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  spaceId?: string
  baseCurrency?: string
  accounts?: Account[]
  editTransaction?: Transaction | null
  refetchData?: () => void
  onBack?: () => void
}

export function CreateIncomeForm({
  open,
  onOpenChange,
  spaceId,
  baseCurrency,
  accounts: initialAccounts,
  editTransaction,
  refetchData,
  onBack,
}: CreateIncomeFormProps) {
  const { data: accountsData } = useListAccountsQuery(
    {},
    { enabled: open && !initialAccounts }
  )
  const accountsList = initialAccounts || accountsData?.accounts || []
  const activeAccounts = accountsList.filter((a) => a.isActive)

  const createIncomeMutation = useCreateIncomeMutation({
    onSuccess: () => {
      refetchData?.()
      onOpenChange(false)
    },
    onError: (err: unknown) => {
      alert(err instanceof Error ? err.message : "Failed to record income.")
    },
  })

  const updateIncomeMutation = useUpdateIncomeMutation({
    onSuccess: () => {
      refetchData?.()
      onOpenChange(false)
    },
    onError: (err: unknown) => {
      alert(err instanceof Error ? err.message : "Failed to update income.")
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
  } = useForm<IncomeFormValues>({
    resolver: zodResolver(incomeSchema),
    defaultValues: {
      accountId: "",
      description: "",
      amount: "",
      currency: baseCurrency || "USD",
      transactionDate: new Date(),
      effectiveDate: new Date(),
      hasCustomEffectiveDate: false,
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
          amount: formatCents(editTransaction.amount).toString(),
          currency: editTransaction.currency || baseCurrency || "USD",
          description: editTransaction.description || "",
          transactionDate: txDate,
          effectiveDate: effDate,
          hasCustomEffectiveDate: isDiff,
          accountId: editTransaction.accountId || "",
        })
      } else {
        const defaultAcc = activeAccounts.find((a) => a.isDefault)
        const initialAccId = defaultAcc?.id || ""

        reset({
          amount: "",
          currency: baseCurrency || "USD",
          description: "",
          transactionDate: new Date(),
          effectiveDate: new Date(),
          hasCustomEffectiveDate: false,
          accountId: initialAccId,
        })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editTransaction, baseCurrency, reset])

  const amountValue = useWatch({ control, name: "amount" })
  const currencyValue = useWatch({ control, name: "currency" })
  const transactionDateValue = useWatch({ control, name: "transactionDate" })
  const hasCustomEffectiveDate = useWatch({
    control,
    name: "hasCustomEffectiveDate",
  })

  const { getConversionPreview } = useCurrencyConversionPreview({
    spaceId,
    enabled: open,
    baseCurrency,
  })

  const isPending =
    createIncomeMutation.isPending || updateIncomeMutation.isPending

  const onSubmit = async (data: IncomeFormValues) => {
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
      await updateIncomeMutation.mutateAsync({
        id: editTransaction.id || "",
        req: {
          id: editTransaction.id || "",
          income: {
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
      await createIncomeMutation.mutateAsync({
        income: {
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

  const customTitle = (
    <div className="flex items-center gap-2">
      {onBack && !editTransaction && (
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg p-1 transition-colors hover:bg-muted-foreground/10"
        >
          <ArrowLeft className="h-4.5 w-4.5 text-muted-foreground" />
        </button>
      )}
      <span>
        {editTransaction
          ? "Edit Standalone Income"
          : "Record Standalone Income"}
      </span>
    </div>
  )

  return (
    <FormDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={customTitle}
      description={
        editTransaction
          ? "Modify logged income details. Saturn will recompute currency base aggregates automatically."
          : "Record standalone manual income. The amount will be added to the target ledger account balance."
      }
      submitLabel={
        editTransaction ? "Update Standalone Income" : "Save Standalone Income"
      }
      isPending={isPending}
      disabled={!!(conversion && "error" in conversion)}
      onSubmit={handleSubmit(onSubmit)}
    >
      <FormFieldItem label="Deposit Account (Optional)">
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
          placeholder="e.g. Freelance Consulting, Salary Payout"
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
