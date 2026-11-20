import { useEffect, useMemo, useRef, useState } from "react"
import { useForm, Controller, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useI18n, useTimezone } from "@saturn/hooks"
import { FormSelect } from "@/components/ui/form-select"
import { FormDrawer, FormFieldItem } from "@/components/ui/form-drawer"
import { ArrowLeft } from "lucide-react"
import { IncomeSchema, type IncomeFormValues } from "@saturn/schemas"
import {
  type Account,
  type Transaction,
  useCreateIncomeMutation,
  useUpdateIncomeMutation,
  useListCurrenciesQuery,
  useListAccountsQuery,
} from "@saturn/api/gen/saturn/finance/v1/finance"
import { useCurrencyConversionPreview } from "@/hooks/use-currency-conversion"
import { AccountSelect } from "./account-select"
import { CurrencyConversionPreview } from "./currency-conversion-preview"
import {
  TransactionRecordedSummary,
  type RecordedDetailRow,
} from "./transaction-recorded-summary"
import { Input } from "@/components/ui/input"
import { AmountInput } from "@/components/ui/amount-input"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { DatePicker } from "@/components/ui/date-picker"
import { toast } from "@/components/ui/toast"
import { toCentsString, formatCents } from "../utils"

function getStoredLastAccountId(spaceId?: string): string | null {
  if (!spaceId) return null
  try {
    return localStorage.getItem(`saturn:last-account:${spaceId}`)
  } catch {
    return null
  }
}

function setStoredLastAccountId(
  spaceId: string | undefined,
  accountId: string | undefined
) {
  if (!spaceId || !accountId) return
  try {
    localStorage.setItem(`saturn:last-account:${spaceId}`, accountId)
  } catch {
    // Ignore storage quota or security errors
  }
}

interface CreateIncomeFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  spaceId?: string
  baseCurrency?: string
  accounts?: Account[]
  editTransaction?: Transaction | null
  refetchData?: () => void
  onBack?: () => void
  headerExtra?: React.ReactNode
}

interface RecordedIncomeSnapshot {
  amountCents: number
  currency: string
  secondaryAmountHint?: string
  summaryTitle?: string
  details: RecordedDetailRow[]
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
  headerExtra,
}: CreateIncomeFormProps) {
  const tz = useTimezone()
  const { t } = useI18n()
  const [initialDate] = useState(() => new Date())
  const amountInputRef = useRef<HTMLInputElement | null>(null)
  const [recordedIncome, setRecordedIncome] =
    useState<RecordedIncomeSnapshot | null>(null)
  const [sessionCount, setSessionCount] = useState(0)
  const [prevOpen, setPrevOpen] = useState(open)

  if (open !== prevOpen) {
    setPrevOpen(open)
    if (!open) {
      setRecordedIncome(null)
      setSessionCount(0)
    }
  }

  const { data: accountsData } = useListAccountsQuery(
    {},
    { enabled: open && !initialAccounts }
  )
  const activeAccounts = useMemo(() => {
    const accountsList = initialAccounts || accountsData?.accounts || []
    return accountsList.filter((a) => a.isActive)
  }, [initialAccounts, accountsData?.accounts])

  const createIncomeMutation = useCreateIncomeMutation({
    onError: (err: unknown) => {
      toast.add({
        title: "Failed to record income",
        description:
          err instanceof Error ? err.message : "Failed to record income.",
        type: "error",
      })
    },
  })

  const updateIncomeMutation = useUpdateIncomeMutation({
    onError: (err: unknown) => {
      toast.add({
        title: "Failed to update income",
        description:
          err instanceof Error ? err.message : "Failed to update income.",
        type: "error",
      })
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

  const incomeDefaultValues = useMemo<IncomeFormValues>(() => {
    if (editTransaction) {
      const txDate = editTransaction.transactionDate
        ? new Date(editTransaction.transactionDate)
        : new Date()
      const effDate = editTransaction.effectiveDate
        ? new Date(editTransaction.effectiveDate)
        : txDate
      const isDiff = txDate.toDateString() !== effDate.toDateString()

      return {
        amount: formatCents(editTransaction.amount).toString(),
        currency: editTransaction.currency || baseCurrency || "USD",
        description: editTransaction.description || "",
        transactionDate: txDate,
        effectiveDate: effDate,
        hasCustomEffectiveDate: isDiff,
        accountId: editTransaction.accountId || "",
      }
    }

    const storedAccountId = getStoredLastAccountId(spaceId)
    const validStoredAccount = storedAccountId
      ? activeAccounts.find((a) => a.id === storedAccountId)
      : undefined
    const defaultAcc = activeAccounts.find((a) => a.isDefault)
    const initialAccId =
      validStoredAccount?.id || defaultAcc?.id || activeAccounts[0]?.id || ""

    return {
      amount: "",
      currency: baseCurrency || "USD",
      description: "",
      transactionDate: initialDate,
      effectiveDate: initialDate,
      hasCustomEffectiveDate: false,
      accountId: initialAccId,
    }
  }, [editTransaction, activeAccounts, baseCurrency, initialDate, spaceId])

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<IncomeFormValues>({
    resolver: zodResolver(IncomeSchema),
    defaultValues: {
      accountId: "",
      description: "",
      amount: "",
      currency: baseCurrency || "USD",
      transactionDate: new Date(),
      effectiveDate: new Date(),
      hasCustomEffectiveDate: false,
    },
    values: incomeDefaultValues,
    resetOptions: { keepDirtyValues: true },
  })

  useEffect(() => {
    if (!open || editTransaction) return
    const timer = window.setTimeout(() => {
      amountInputRef.current?.focus()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [open, editTransaction])

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
  const conversion = getConversionPreview(amountValue, currencyValue)
  const isSubmitDisabled = !!(conversion && "error" in conversion)

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
      refetchData?.()
      onOpenChange(false)
      return
    }

    const centsStr = toCentsString(data.amount)
    await createIncomeMutation.mutateAsync({
      income: {
        amount: centsStr,
        currency: data.currency,
        description: data.description,
        transactionDate: txDateStr,
        effectiveDate: effDateStr,
        accountId: data.accountId || undefined,
      },
    })
    setStoredLastAccountId(spaceId, data.accountId)
    refetchData?.()

    const matchedAccount = activeAccounts.find((a) => a.id === data.accountId)
    const details: RecordedDetailRow[] = [
      {
        label: t("finance.transactions.incomeForm.depositAccount"),
        value:
          matchedAccount?.name || t("finance.transactions.incomeForm.unlinked"),
      },
      {
        label: t("finance.transactions.inspector.transactionDate"),
        value: tz.format(data.transactionDate),
      },
    ]
    if (data.hasCustomEffectiveDate) {
      details.push({
        label: t("finance.transactions.inspector.effectiveDate"),
        value: tz.format(data.effectiveDate),
      })
    }

    const secondaryAmountHint =
      conversion &&
      !("error" in conversion) &&
      data.currency !== conversion.currency
        ? `≈ ${tz.formatMoney(Math.round(conversion.amount * 100), conversion.currency)} (1 ${data.currency} = ${conversion.rate.toFixed(4)} ${conversion.currency})`
        : undefined

    setSessionCount((c) => c + 1)
    setRecordedIncome({
      amountCents: Math.abs(Number(centsStr)),
      currency: data.currency,
      secondaryAmountHint,
      summaryTitle: data.description.trim() || undefined,
      details,
    })
  }

  const handleAddAnother = () => {
    setRecordedIncome(null)
    setValue("amount", "", { shouldDirty: false, shouldValidate: false })
    setValue("description", "", { shouldDirty: false, shouldValidate: false })
    window.setTimeout(() => {
      amountInputRef.current?.focus()
    }, 0)
  }

  if (recordedIncome && !editTransaction) {
    return (
      <TransactionRecordedSummary
        open={open}
        onOpenChange={onOpenChange}
        title={t("finance.transactions.incomeForm.recordedTitle")}
        amountCents={recordedIncome.amountCents}
        currency={recordedIncome.currency}
        colored
        showSign
        secondaryAmountHint={recordedIncome.secondaryAmountHint}
        summaryTitle={recordedIncome.summaryTitle}
        details={recordedIncome.details}
        sessionCount={sessionCount}
        addAnotherLabel={t("finance.transactions.incomeForm.addAnother")}
        onAddAnother={handleAddAnother}
        onChooseAnotherType={
          onBack
            ? () => {
                setRecordedIncome(null)
                onBack()
              }
            : undefined
        }
        onDone={() => {
          setRecordedIncome(null)
          setSessionCount(0)
          onOpenChange(false)
        }}
      />
    )
  }

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
          ? t("finance.transactions.incomeForm.titleEdit")
          : t("finance.transactions.incomeForm.title")}
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
          ? t("finance.transactions.incomeForm.descriptionEdit")
          : t("finance.transactions.incomeForm.description")
      }
      headerExtra={editTransaction ? undefined : headerExtra}
      submitLabel={
        editTransaction
          ? t("finance.transactions.incomeForm.submitUpdate")
          : t("finance.transactions.incomeForm.submit")
      }
      isPending={isPending}
      disabled={isSubmitDisabled}
      onSubmit={handleSubmit(onSubmit)}
    >
      <FormFieldItem
        label={t("finance.transactions.incomeForm.amountLabel")}
        error={errors.amount?.message}
      >
        <div className="flex h-10 items-center overflow-hidden rounded-lg border border-border bg-control shadow-2xs transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40">
          <AmountInput
            control={control}
            name="amount"
            inputRef={amountInputRef}
            autoFocus={!editTransaction}
            placeholder="0.00"
            showError={false}
            className="h-full w-full flex-1 rounded-none border-0 bg-transparent px-3 py-1.5 text-sm text-foreground shadow-none ring-0 focus-visible:ring-0 focus-visible:outline-none"
          />

          <div className="h-5 w-px shrink-0 bg-border/70" />

          <FormSelect
            control={control}
            name="currency"
            items={currencyItems}
            triggerClassName="h-full w-24 shrink-0 rounded-none border-0 bg-transparent px-3 font-mono text-xs font-medium shadow-none hover:bg-muted/40 focus-visible:ring-0"
          />
        </div>
      </FormFieldItem>

      <CurrencyConversionPreview
        conversion={conversion}
        fromCurrency={currencyValue}
      />

      <FormFieldItem label={t("finance.transactions.incomeForm.accountLabel")}>
        <AccountSelect
          control={control}
          name="accountId"
          accounts={activeAccounts}
          placeholder={t("finance.transactions.incomeForm.accountPlaceholder")}
          allowNone
        />
      </FormFieldItem>

      <FormFieldItem
        label={t("finance.transactions.incomeForm.descriptionLabel")}
        error={errors.description?.message}
      >
        <Input
          {...register("description")}
          placeholder={t(
            "finance.transactions.incomeForm.descriptionPlaceholder"
          )}
        />
      </FormFieldItem>

      <div className="space-y-3.5">
        <FormFieldItem
          label={t("finance.transactions.incomeForm.transactionDateLabel")}
        >
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
            className="cursor-pointer text-xs font-medium text-foreground/80"
          >
            {t("finance.transactions.incomeForm.customEffectiveCheckbox")}
          </Label>
        </div>

        {hasCustomEffectiveDate && (
          <FormFieldItem
            label={t("finance.transactions.incomeForm.effectiveDateLabel")}
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
    </FormDrawer>
  )
}
