import { useMemo, useCallback } from "react"
import { useForm, Controller, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useI18n } from "@saturn/hooks"
import { FormDrawer, FormFieldItem } from "@/components/ui/form-drawer"
import { TransferSchema, type TransferFormValues } from "@saturn/schemas"
import {
  type Account,
  useCreateTransferMutation,
  useListExchangeRatesQuery,
} from "@saturn/api/gen/saturn/finance/v1/finance"
import { AccountSelect } from "./account-select"
import { Input } from "@/components/ui/input"
import { AmountInput } from "@/components/ui/amount-input"
import { DatePicker } from "@/components/ui/date-picker"
import { ArrowRightLeft, AlertTriangle } from "lucide-react"
import { toast } from "@/components/ui/toast"
import { toCentsString } from "../utils"

interface CreateTransferSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sourceAccountId?: string
  accounts: Account[]
  refetchAccounts: () => void
  refetchTransfers: () => void
}

export function CreateTransferSheet({
  open,
  onOpenChange,
  accounts,
  sourceAccountId = "",
  refetchAccounts,
  refetchTransfers,
}: CreateTransferSheetProps) {
  const { t } = useI18n()
  const activeAccounts = useMemo(
    () => accounts.filter((a) => a.isActive),
    [accounts]
  )

  const { data: ratesData } = useListExchangeRatesQuery(
    { pageSize: 100, pageToken: "" },
    { enabled: open }
  )
  const rates = useMemo(
    () => ratesData?.exchangeRates || [],
    [ratesData?.exchangeRates]
  )
  const createMutation = useCreateTransferMutation()

  const transferDefaultValues = useMemo<TransferFormValues>(
    () => ({
      sourceAccountId,
      destinationAccountId: "",
      sourceAmount: "",
      destinationAmount: "",
      transferDate: new Date(),
      notes: "",
    }),
    [sourceAccountId]
  )

  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    formState: { errors },
  } = useForm<TransferFormValues>({
    resolver: zodResolver(TransferSchema),
    defaultValues: transferDefaultValues,
    values: transferDefaultValues,
    resetOptions: { keepDirtyValues: true },
  })

  const srcId = useWatch({ control, name: "sourceAccountId" })
  const dstId = useWatch({ control, name: "destinationAccountId" })
  const srcAmount = useWatch({ control, name: "sourceAmount" })

  const srcAcc = activeAccounts.find((a) => a.id === srcId)
  const dstAcc = activeAccounts.find((a) => a.id === dstId)

  // Autocalculate target amount if currencies match, or apply exchange rate
  const updateTargetAmount = useCallback(
    (amountStr: string, sId: string, dId: string) => {
      const sAcc = activeAccounts.find((a) => a.id === sId)
      const dAcc = activeAccounts.find((a) => a.id === dId)
      if (!sAcc || !dAcc || !amountStr) return

      const srcVal = parseFloat(amountStr)
      if (isNaN(srcVal) || srcVal <= 0) return

      if (sAcc.currency === dAcc.currency) {
        setValue("destinationAmount", amountStr)
      } else {
        const rate = rates
          .filter(
            (r) =>
              r.fromCurrency === sAcc.currency && r.toCurrency === dAcc.currency
          )
          .sort(
            (a, b) =>
              new Date(b.rateDate).getTime() - new Date(a.rateDate).getTime()
          )[0]

        if (rate) {
          setValue("destinationAmount", (srcVal * rate.rate).toFixed(2))
        }
      }
    },
    [activeAccounts, rates, setValue]
  )

  const onSubmit = async (data: TransferFormValues) => {
    try {
      await createMutation.mutateAsync({
        sourceAccountId: data.sourceAccountId,
        destinationAccountId: data.destinationAccountId,
        sourceAmount: toCentsString(data.sourceAmount),
        destinationAmount: toCentsString(data.destinationAmount),
        transferDate: data.transferDate.toISOString(),
        notes: data.notes || "",
      })
      onOpenChange(false)
      reset()
      refetchAccounts()
      refetchTransfers()
    } catch (err: unknown) {
      toast.add({
        type: "error",
        title: t("finance.accounts.transfer.failedTitle"),
        description:
          err instanceof Error
            ? err.message
            : t("finance.accounts.transfer.failedDescription"),
      })
    }
  }

  return (
    <FormDrawer
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
      title={t("finance.transactions.transferForm.title")}
      icon={<ArrowRightLeft className="h-5 w-5 text-primary" />}
      description={t("finance.transactions.transferForm.description")}
      submitLabel={t("finance.transactions.transferForm.submit")}
      isPending={createMutation.isPending}
      onSubmit={handleSubmit(onSubmit)}
    >
      <FormFieldItem
        label={t("finance.transactions.transferForm.sourceAccount")}
        error={errors.sourceAccountId?.message}
      >
        <Controller
          control={control}
          name="sourceAccountId"
          render={({ field }) => (
            <AccountSelect
              value={field.value}
              onValueChange={(val) => {
                field.onChange(val)
                updateTargetAmount(srcAmount, val, dstId)
              }}
              accounts={activeAccounts.filter((a) => a.id !== dstId)}
              placeholder={t("finance.accounts.transfer.sourcePlaceholder")}
            />
          )}
        />
      </FormFieldItem>

      <FormFieldItem
        label={t("finance.transactions.transferForm.destinationAccount")}
        error={errors.destinationAccountId?.message}
      >
        <Controller
          control={control}
          name="destinationAccountId"
          render={({ field }) => (
            <AccountSelect
              value={field.value}
              onValueChange={(val) => {
                field.onChange(val)
                updateTargetAmount(srcAmount, srcId, val)
              }}
              accounts={activeAccounts.filter((a) => a.id !== srcId)}
              placeholder={t("finance.accounts.transfer.targetPlaceholder")}
            />
          )}
        />
      </FormFieldItem>

      <FormFieldItem
        label={t("finance.transactions.transferForm.sourceAmount", {
          currency: srcAcc?.currency || "",
        })}
        error={errors.sourceAmount?.message}
      >
        <AmountInput
          control={control}
          name="sourceAmount"
          onValueChange={(val) => {
            updateTargetAmount(val, srcId, dstId)
          }}
          currency={srcAcc?.currency}
          placeholder="0.00"
        />
      </FormFieldItem>

      <FormFieldItem
        label={t("finance.transactions.transferForm.destinationAmount", {
          currency: dstAcc?.currency || "",
        })}
        error={errors.destinationAmount?.message}
      >
        <AmountInput
          control={control}
          name="destinationAmount"
          currency={dstAcc?.currency}
          placeholder="0.00"
        />
      </FormFieldItem>

      {srcAcc && dstAcc && srcAcc.currency !== dstAcc.currency && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5 text-xs text-amber-500">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">
              {t("finance.accounts.transfer.multiCurrencyTitle")}
            </p>
            <p className="mt-0.5 leading-relaxed">
              {t("finance.accounts.transfer.multiCurrencyDescription", {
                source: srcAcc.currency,
                destination: dstAcc.currency,
              })}
            </p>
          </div>
        </div>
      )}

      <FormFieldItem
        label={t("finance.transactions.transferForm.transferDate")}
      >
        <Controller
          control={control}
          name="transferDate"
          render={({ field }) => (
            <DatePicker
              date={field.value}
              setDate={(d) => d && field.onChange(d)}
            />
          )}
        />
      </FormFieldItem>

      <FormFieldItem label={t("finance.transactions.transferForm.notesLabel")}>
        <Input
          placeholder={t("finance.transactions.transferForm.notesPlaceholder")}
          {...register("notes")}
        />
      </FormFieldItem>
    </FormDrawer>
  )
}
