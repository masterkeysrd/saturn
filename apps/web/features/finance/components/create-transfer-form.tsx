import { useMemo, useEffect, useCallback } from "react"
import { useForm, Controller, useWatch } from "react-hook-form"
import { useQueryClient } from "@tanstack/react-query"
import { zodResolver } from "@hookform/resolvers/zod"
import { ArrowLeft, AlertTriangle } from "lucide-react"
import { FormDrawer, FormFieldItem } from "@/components/ui/form-drawer"
import { transferSchema, type TransferFormValues } from "../schemas/transfer"
import {
  type Account,
  useCreateTransferMutation,
  useListExchangeRatesQuery,
} from "@/gen/saturn/finance/v1/finance"
import { AccountSelect } from "./account-select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AmountInput } from "@/components/ui/amount-input"
import { DatePicker } from "@/components/ui/date-picker"
import { toCentsString } from "../utils"

interface CreateTransferFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  accounts?: Account[]
  refetchData?: () => void
  onBack: () => void
}

export function CreateTransferForm({
  open,
  onOpenChange,
  accounts = [],
  refetchData,
  onBack,
}: CreateTransferFormProps) {
  const queryClient = useQueryClient()
  const activeAccounts = accounts.filter((a) => a.isActive)

  const { data: ratesData } = useListExchangeRatesQuery(
    { pageSize: 100, pageToken: "" },
    { enabled: open }
  )
  const rates = useMemo(
    () => ratesData?.exchangeRates || [],
    [ratesData?.exchangeRates]
  )
  const createMutation = useCreateTransferMutation()

  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    formState: { errors },
  } = useForm<TransferFormValues>({
    resolver: zodResolver(transferSchema),
    defaultValues: {
      sourceAccountId: "",
      destinationAccountId: "",
      sourceAmount: "",
      destinationAmount: "",
      transferDate: new Date(),
      notes: "",
    },
  })

  useEffect(() => {
    if (open) {
      reset({
        sourceAccountId: "",
        destinationAccountId: "",
        sourceAmount: "",
        destinationAmount: "",
        transferDate: new Date(),
        notes: "",
      })
    }
  }, [open, reset])

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

  useEffect(() => {
    if (srcId && dstId && srcAmount) {
      updateTargetAmount(srcAmount, srcId, dstId)
    }
  }, [srcId, dstId, srcAmount, updateTargetAmount])

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
      await queryClient.invalidateQueries({
        queryKey: ["/api/v1/finance/transactions"],
      })
      await queryClient.invalidateQueries({
        queryKey: ["/api/v1/finance/accounts"],
      })

      refetchData?.()
      onOpenChange(false)
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Transfer failed.")
    }
  }

  return (
    <FormDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Perform Fund Transfer"
      description="Double-entry ledger entry: deducts from source and credits target."
      submitLabel="Perform Transfer"
      isPending={createMutation.isPending}
      onSubmit={handleSubmit(onSubmit)}
    >
      <div className="flex flex-col gap-5">
        {/* Navigation & Header */}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="-ml-2 h-8 rounded-lg px-2 text-xs font-semibold text-muted-foreground hover:bg-muted/10 hover:text-foreground"
          >
            <ArrowLeft className="mr-1 h-3.5 w-3.5" />
            Back to list
          </Button>
        </div>

        <FormFieldItem
          label="Source Account (Withdraw From)"
          error={errors.sourceAccountId?.message}
        >
          <AccountSelect
            control={control}
            name="sourceAccountId"
            accounts={activeAccounts.filter((a) => a.id !== dstId)}
            placeholder="Choose source account"
          />
        </FormFieldItem>

        <FormFieldItem
          label="Destination Account (Deposit To)"
          error={errors.destinationAccountId?.message}
        >
          <AccountSelect
            control={control}
            name="destinationAccountId"
            accounts={activeAccounts.filter((a) => a.id !== srcId)}
            placeholder="Choose target account"
          />
        </FormFieldItem>

        <FormFieldItem
          label={`Source Amount (${srcAcc?.currency || ""})`}
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
            className="h-11 rounded-xl bg-background/40"
          />
        </FormFieldItem>

        <FormFieldItem
          label={`Target Amount (${dstAcc?.currency || ""})`}
          error={errors.destinationAmount?.message}
        >
          <AmountInput
            control={control}
            name="destinationAmount"
            currency={dstAcc?.currency}
            placeholder="0.00"
            className="h-11 rounded-xl bg-background/40"
          />
        </FormFieldItem>

        {srcAcc && dstAcc && srcAcc.currency !== dstAcc.currency && (
          <div className="flex items-start gap-2 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3.5 text-[11px] text-amber-500">
            <AlertTriangle className="mt-0.5 h-4.5 w-4.5 shrink-0" />
            <div>
              <p className="font-bold">Multi-Currency Transfer</p>
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
            className="h-11 rounded-xl bg-background/40"
          />
        </FormFieldItem>
      </div>
    </FormDrawer>
  )
}
