import { useEffect, useMemo, useCallback, useRef, useState } from "react"
import { useForm, Controller, useWatch } from "react-hook-form"
import { useQueryClient } from "@tanstack/react-query"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTimezone } from "@saturn/hooks"
import { ArrowLeft, AlertTriangle } from "lucide-react"
import { FormDrawer, FormFieldItem } from "@/components/ui/form-drawer"
import { TransferSchema, type TransferFormValues } from "@saturn/schemas"
import {
  type Account,
  useCreateTransferMutation,
  useListExchangeRatesQuery,
} from "@saturn/api/gen/saturn/finance/v1/finance"
import { AccountSelect } from "./account-select"
import {
  TransactionRecordedSummary,
  type RecordedDetailRow,
} from "./transaction-recorded-summary"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AmountInput } from "@/components/ui/amount-input"
import { DatePicker } from "@/components/ui/date-picker"
import { toast } from "@/components/ui/toast"
import { toCentsString } from "../utils"

interface CreateTransferFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  accounts?: Account[]
  refetchData?: () => void
  onBack?: () => void
  headerExtra?: React.ReactNode
}

interface RecordedTransferSnapshot {
  amountCents: number
  currency: string
  secondaryAmountHint?: string
  summaryTitle?: string
  details: RecordedDetailRow[]
}

export function CreateTransferForm({
  open,
  onOpenChange,
  accounts = [],
  refetchData,
  onBack,
  headerExtra,
}: CreateTransferFormProps) {
  const queryClient = useQueryClient()
  const tz = useTimezone()
  const sourceAmountRef = useRef<HTMLInputElement | null>(null)
  const activeAccounts = accounts.filter((a) => a.isActive)
  const [recordedTransfer, setRecordedTransfer] =
    useState<RecordedTransferSnapshot | null>(null)
  const [sessionCount, setSessionCount] = useState(0)
  const [prevOpen, setPrevOpen] = useState(open)

  if (open !== prevOpen) {
    setPrevOpen(open)
    if (!open) {
      setRecordedTransfer(null)
      setSessionCount(0)
    }
  }

  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => {
      sourceAmountRef.current?.focus()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [open])

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
      sourceAccountId: "",
      destinationAccountId: "",
      sourceAmount: "",
      destinationAmount: "",
      transferDate: new Date(),
      notes: "",
    }),
    []
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
      const sourceCentsStr = toCentsString(data.sourceAmount)
      const destCentsStr = toCentsString(data.destinationAmount)
      await createMutation.mutateAsync({
        sourceAccountId: data.sourceAccountId,
        destinationAccountId: data.destinationAccountId,
        sourceAmount: sourceCentsStr,
        destinationAmount: destCentsStr,
        transferDate: data.transferDate.toISOString(),
        notes: data.notes || "",
      })
      await queryClient.invalidateQueries({
        queryKey: ["/api/v1/finance/transactions"],
      })
      await queryClient.invalidateQueries({
        queryKey: ["/api/v1/finance/accounts"],
      })

      refetchData?.()

      const matchedSrc = activeAccounts.find(
        (a) => a.id === data.sourceAccountId
      )
      const matchedDst = activeAccounts.find(
        (a) => a.id === data.destinationAccountId
      )
      const srcCurrency = matchedSrc?.currency || "USD"
      const dstCurrency = matchedDst?.currency || srcCurrency

      const details: RecordedDetailRow[] = [
        { label: "From account", value: matchedSrc?.name || "—" },
        { label: "To account", value: matchedDst?.name || "—" },
        { label: "Transfer date", value: tz.format(data.transferDate) },
      ]

      const secondaryAmountHint =
        srcCurrency !== dstCurrency
          ? `→ ${tz.formatMoney(Number(destCentsStr), dstCurrency)} credited`
          : undefined

      setSessionCount((c) => c + 1)
      setRecordedTransfer({
        amountCents: Math.abs(Number(sourceCentsStr)),
        currency: srcCurrency,
        secondaryAmountHint,
        summaryTitle: data.notes?.trim() || undefined,
        details,
      })
    } catch (err: unknown) {
      toast.add({
        type: "error",
        title: "Transfer Failed",
        description: err instanceof Error ? err.message : "Transfer failed.",
      })
    }
  }

  const handleAddAnother = () => {
    setRecordedTransfer(null)
    setValue("sourceAmount", "", { shouldDirty: false, shouldValidate: false })
    setValue("destinationAmount", "", {
      shouldDirty: false,
      shouldValidate: false,
    })
    setValue("notes", "", { shouldDirty: false, shouldValidate: false })
    window.setTimeout(() => {
      sourceAmountRef.current?.focus()
    }, 0)
  }

  if (recordedTransfer) {
    return (
      <TransactionRecordedSummary
        open={open}
        onOpenChange={(next) => {
          if (!next) reset()
          onOpenChange(next)
        }}
        title="Transfer Recorded"
        amountCents={recordedTransfer.amountCents}
        currency={recordedTransfer.currency}
        secondaryAmountHint={recordedTransfer.secondaryAmountHint}
        summaryTitle={recordedTransfer.summaryTitle}
        details={recordedTransfer.details}
        sessionCount={sessionCount}
        addAnotherLabel="Add another transfer"
        onAddAnother={handleAddAnother}
        onChooseAnotherType={
          onBack
            ? () => {
                setRecordedTransfer(null)
                reset()
                onBack()
              }
            : undefined
        }
        onDone={() => {
          setRecordedTransfer(null)
          setSessionCount(0)
          reset()
          onOpenChange(false)
        }}
      />
    )
  }

  return (
    <FormDrawer
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
      title="Perform Fund Transfer"
      description="Double-entry ledger entry: deducts from source and credits target."
      headerExtra={headerExtra}
      submitLabel="Perform Transfer"
      isPending={createMutation.isPending}
      onSubmit={handleSubmit(onSubmit)}
    >
      <div className="flex flex-col gap-5">
        {onBack && (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onBack}
              className="-ml-2 h-8 rounded-lg px-2 text-xs font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground"
            >
              <ArrowLeft className="mr-1 h-3.5 w-3.5" />
              Back to list
            </Button>
          </div>
        )}

        <FormFieldItem
          label={`Source Amount (${srcAcc?.currency || "Currency"})`}
          error={errors.sourceAmount?.message}
        >
          <AmountInput
            control={control}
            name="sourceAmount"
            inputRef={sourceAmountRef}
            autoFocus
            onValueChange={(val) => {
              updateTargetAmount(val, srcId, dstId)
            }}
            currency={srcAcc?.currency}
            placeholder="0.00"
          />
        </FormFieldItem>

        <FormFieldItem
          label={`Target Amount (${dstAcc?.currency || "Currency"})`}
          error={errors.destinationAmount?.message}
        >
          <AmountInput
            control={control}
            name="destinationAmount"
            currency={dstAcc?.currency}
            placeholder="0.00"
          />
        </FormFieldItem>

        <FormFieldItem
          label="Source Account (Withdraw From)"
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
                placeholder="Choose source account"
              />
            )}
          />
        </FormFieldItem>

        <FormFieldItem
          label="Destination Account (Deposit To)"
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
                placeholder="Choose target account"
              />
            )}
          />
        </FormFieldItem>

        {srcAcc && dstAcc && srcAcc.currency !== dstAcc.currency && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">Multi-Currency Transfer</p>
              <p className="mt-0.5 leading-relaxed">
                Funds will be converted from {srcAcc.currency} to{" "}
                {dstAcc.currency} using your rates configuration.
              </p>
            </div>
          </div>
        )}

        <FormFieldItem label="Transfer Date">
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

        <FormFieldItem label="Transfer Notes">
          <Input
            placeholder="e.g. Monthly savings allocation"
            {...register("notes")}
          />
        </FormFieldItem>
      </div>
    </FormDrawer>
  )
}
