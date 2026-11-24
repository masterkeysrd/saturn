import { useEffect, useMemo, useRef, useState } from "react"
import { useForm, Controller, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useI18n, useTimezone } from "@saturn/hooks"
import { FormSelect } from "@/components/ui/form-select"
import { FormDrawer, FormFieldItem } from "@/components/ui/form-drawer"
import { ArrowLeft } from "lucide-react"
import { TransactionSchema, type TransactionFormValues } from "@saturn/schemas"
import {
  type Account,
  type Budget,
  type Transaction,
  useCreateExpenseMutation,
  useUpdateExpenseMutation,
  useListCurrenciesQuery,
  useListAccountsQuery,
} from "@saturn/api/gen/saturn/finance/v1/finance"
import { useCurrencyConversionPreview } from "@/hooks/use-currency-conversion"
import { BudgetSelect } from "./budget-select"
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

interface CreateExpenseFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  spaceId?: string
  baseCurrency?: string
  budgets?: Budget[]
  accounts?: Account[]
  editTransaction?: Transaction | null
  preselectedBudgetId?: string
  refetchData?: () => void
  onBack?: () => void
  headerExtra?: React.ReactNode
}

const EMPTY_BUDGETS: Budget[] = []

interface RecordedExpenseSnapshot {
  amountCents: number
  currency: string
  secondaryAmountHint?: string
  summaryTitle?: string
  details: RecordedDetailRow[]
}

export function CreateExpenseForm({
  open,
  onOpenChange,
  spaceId,
  baseCurrency,
  budgets = EMPTY_BUDGETS,
  accounts: initialAccounts,
  editTransaction,
  preselectedBudgetId,
  refetchData,
  onBack,
  headerExtra,
}: CreateExpenseFormProps) {
  const tz = useTimezone()
  const { t } = useI18n()
  const [initialDate] = useState(() => new Date())
  const amountInputRef = useRef<HTMLInputElement | null>(null)
  const [recordedExpense, setRecordedExpense] =
    useState<RecordedExpenseSnapshot | null>(null)
  const [sessionCount, setSessionCount] = useState(0)
  const [prevOpen, setPrevOpen] = useState(open)

  if (open !== prevOpen) {
    setPrevOpen(open)
    if (!open) {
      setRecordedExpense(null)
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

  const createExpenseMutation = useCreateExpenseMutation({
    onError: (err: unknown) => {
      const msg =
        err instanceof Error
          ? err.message
          : t("finance.transactions.expenseForm.recordFailedDesc")
      toast.add({
        title: t("finance.transactions.expenseForm.recordFailed"),
        description: msg,
        type: "error",
      })
    },
  })

  const updateExpenseMutation = useUpdateExpenseMutation({
    onError: (err: unknown) => {
      const msg =
        err instanceof Error
          ? err.message
          : t("finance.transactions.expenseForm.updateFailedDesc")
      toast.add({
        title: t("finance.transactions.expenseForm.updateFailed"),
        description: msg,
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

  const expenseDefaultValues = useMemo<TransactionFormValues>(() => {
    if (editTransaction) {
      const txDate = editTransaction.transactionDate
        ? new Date(editTransaction.transactionDate)
        : new Date()
      const effDate = editTransaction.effectiveDate
        ? new Date(editTransaction.effectiveDate)
        : txDate
      const isDiff = txDate.toDateString() !== effDate.toDateString()

      return {
        budgetId: editTransaction.budgetId || "",
        amount: formatCents(editTransaction.amount).toString(),
        currency: editTransaction.currency || baseCurrency || "USD",
        description: editTransaction.description || "",
        transactionDate: txDate,
        effectiveDate: effDate,
        hasCustomEffectiveDate: isDiff,
        accountId: editTransaction.accountId || "",
      }
    }

    const selectedBudgetId =
      preselectedBudgetId || (budgets.length > 0 ? budgets[0].id : "")
    const initialBudget = budgets.find((b) => b.id === selectedBudgetId)

    const defaultCurrency = initialBudget?.currency || baseCurrency || "USD"

    const storedAccountId = getStoredLastAccountId(spaceId)
    const validStoredAccount = storedAccountId
      ? activeAccounts.find((a) => a.id === storedAccountId)
      : undefined
    const budgetDefaultAccount = initialBudget?.defaultAccountId
      ? activeAccounts.find((a) => a.id === initialBudget.defaultAccountId)
      : undefined
    const defaultAcc = activeAccounts.find((a) => a.isDefault)
    const initialAccId =
      validStoredAccount?.id ||
      budgetDefaultAccount?.id ||
      defaultAcc?.id ||
      activeAccounts[0]?.id ||
      ""

    return {
      budgetId: selectedBudgetId || "",
      amount: "",
      currency: defaultCurrency,
      description: "",
      transactionDate: initialDate,
      effectiveDate: initialDate,
      hasCustomEffectiveDate: false,
      accountId: initialAccId,
    }
  }, [
    editTransaction,
    preselectedBudgetId,
    budgets,
    activeAccounts,
    baseCurrency,
    initialDate,
    spaceId,
  ])

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<TransactionFormValues>({
    resolver: zodResolver(TransactionSchema),
    defaultValues: {
      budgetId: "",
      accountId: "",
      description: "",
      amount: "",
      currency: baseCurrency || "USD",
      transactionDate: new Date(),
      effectiveDate: new Date(),
      hasCustomEffectiveDate: false,
    },
    values: expenseDefaultValues,
    resetOptions: { keepDirtyValues: true },
  })

  useEffect(() => {
    if (!open || editTransaction) return
    const timer = window.setTimeout(() => {
      amountInputRef.current?.focus()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [open, editTransaction])

  const budgetIdValue = useWatch({ control, name: "budgetId" })
  const amountValue = useWatch({ control, name: "amount" })
  const currencyValue = useWatch({ control, name: "currency" })
  const transactionDateValue = useWatch({ control, name: "transactionDate" })
  const hasCustomEffectiveDate = useWatch({
    control,
    name: "hasCustomEffectiveDate",
  })

  const handleBudgetChange = (newBudgetId: string) => {
    const b = budgets.find((x) => x.id === newBudgetId)
    if (b) {
      setValue("currency", b.currency)
      const storedAccountId = getStoredLastAccountId(spaceId)
      const hasValidStored =
        storedAccountId && activeAccounts.some((a) => a.id === storedAccountId)
      if (!hasValidStored) {
        const globalDefault = activeAccounts.find((a) => a.isDefault)
        if (b.defaultAccountId || globalDefault?.id) {
          setValue("accountId", b.defaultAccountId || globalDefault?.id || "")
        }
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
  const conversion = getConversionPreview(amountValue, currencyValue)
  const isSubmitDisabled =
    !budgetIdValue || !!(conversion && "error" in conversion)

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
      refetchData?.()
      onOpenChange(false)
      return
    }

    const centsStr = toCentsString(data.amount)
    await createExpenseMutation.mutateAsync({
      expense: {
        budgetId: data.budgetId,
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

    const matchedBudget = budgets.find((b) => b.id === data.budgetId)
    const matchedAccount = activeAccounts.find((a) => a.id === data.accountId)
    const details: RecordedDetailRow[] = [
      {
        label: t("finance.transactions.facetBudget"),
        value: matchedBudget?.name || "—",
      },
      {
        label: t("finance.transactions.facetAccount"),
        value:
          matchedAccount?.name ||
          t("finance.transactions.expenseForm.unlinked"),
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
    setRecordedExpense({
      amountCents: -Math.abs(Number(centsStr)),
      currency: data.currency,
      secondaryAmountHint,
      summaryTitle: data.description.trim() || undefined,
      details,
    })
  }

  const handleAddAnother = () => {
    setRecordedExpense(null)
    setValue("amount", "", { shouldDirty: false, shouldValidate: false })
    setValue("description", "", { shouldDirty: false, shouldValidate: false })
    window.setTimeout(() => {
      amountInputRef.current?.focus()
    }, 0)
  }

  if (recordedExpense && !editTransaction) {
    return (
      <TransactionRecordedSummary
        open={open}
        onOpenChange={onOpenChange}
        title={t("finance.transactions.expenseForm.recordedTitle")}
        amountCents={recordedExpense.amountCents}
        currency={recordedExpense.currency}
        colored
        showSign
        secondaryAmountHint={recordedExpense.secondaryAmountHint}
        summaryTitle={recordedExpense.summaryTitle}
        details={recordedExpense.details}
        sessionCount={sessionCount}
        addAnotherLabel={t("finance.transactions.expenseForm.addAnother")}
        onAddAnother={handleAddAnother}
        onChooseAnotherType={
          onBack
            ? () => {
                setRecordedExpense(null)
                onBack()
              }
            : undefined
        }
        onDone={() => {
          setRecordedExpense(null)
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
          ? t("finance.transactions.expenseForm.titleEdit")
          : t("finance.transactions.expenseForm.title")}
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
          ? t("finance.transactions.expenseForm.descriptionEdit")
          : t("finance.transactions.expenseForm.description")
      }
      headerExtra={editTransaction ? undefined : headerExtra}
      submitLabel={
        editTransaction
          ? t("finance.transactions.expenseForm.submitUpdate")
          : t("finance.transactions.expenseForm.submit")
      }
      isPending={isPending}
      disabled={isSubmitDisabled}
      onSubmit={handleSubmit(onSubmit)}
    >
      <FormFieldItem
        label={t("finance.transactions.expenseForm.amountLabel")}
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

      <FormFieldItem
        label={t("finance.transactions.expenseForm.budgetLabel")}
        error={errors.budgetId?.message}
      >
        <BudgetSelect
          control={control}
          name="budgetId"
          budgets={budgets}
          onBudgetChange={handleBudgetChange}
          placeholder={t("finance.transactions.expenseForm.budgetPlaceholder")}
        />
      </FormFieldItem>

      <FormFieldItem label={t("finance.transactions.expenseForm.accountLabel")}>
        <AccountSelect
          control={control}
          name="accountId"
          accounts={activeAccounts}
          placeholder={t("finance.transactions.expenseForm.accountPlaceholder")}
          allowNone
        />
      </FormFieldItem>

      <FormFieldItem
        label={t("finance.transactions.expenseForm.descriptionLabel")}
        error={errors.description?.message}
      >
        <Input
          {...register("description")}
          placeholder={t(
            "finance.transactions.expenseForm.descriptionPlaceholder"
          )}
        />
      </FormFieldItem>

      <div className="space-y-3.5">
        <FormFieldItem
          label={t("finance.transactions.expenseForm.transactionDateLabel")}
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
            {t("finance.transactions.expenseForm.customEffectiveCheckbox")}
          </Label>
        </div>

        {hasCustomEffectiveDate && (
          <FormFieldItem
            label={t("finance.transactions.expenseForm.effectiveDateLabel")}
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
