import { useMemo, useEffect, useCallback } from "react"
import { useForm, Controller, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
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
import { Label } from "@/components/ui/label"
import { DatePicker } from "@/components/ui/date-picker"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { ArrowRightLeft, AlertTriangle, Loader2 } from "lucide-react"
import { toCentsString } from "../utils"

interface CreateTransferSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  accounts: Account[]
  refetchAccounts: () => void
  refetchTransfers: () => void
}

export function CreateTransferSheet({
  open,
  onOpenChange,
  accounts,
  refetchAccounts,
  refetchTransfers,
}: CreateTransferSheetProps) {
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
      onOpenChange(false)
      reset()
      refetchAccounts()
      refetchTransfers()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Transfer failed.")
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="rounded-none border-none border-border/40 bg-card/95 p-6 shadow-2xl backdrop-blur-xl sm:rounded-l-3xl sm:border-l md:p-8">
        <SheetHeader className="p-0">
          <SheetTitle className="flex items-center gap-2 text-xl font-bold">
            <ArrowRightLeft className="h-5 w-5 text-primary" />
            Perform Fund Transfer
          </SheetTitle>
          <SheetDescription className="text-xs">
            Double-entry ledger entry: deducts from source and credits target.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-6">
          <div className="space-y-2">
            <Label className="text-xs font-bold tracking-wider text-foreground uppercase">
              Source Account (Withdraw From)
            </Label>
            <AccountSelect
              control={control}
              name="sourceAccountId"
              accounts={activeAccounts.filter((a) => a.id !== dstId)}
              placeholder="Choose source account"
            />
            {errors.sourceAccountId && (
              <p className="text-[11px] font-semibold text-destructive">
                {errors.sourceAccountId.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-bold tracking-wider text-foreground uppercase">
              Destination Account (Deposit To)
            </Label>
            <AccountSelect
              control={control}
              name="destinationAccountId"
              accounts={activeAccounts.filter((a) => a.id !== srcId)}
              placeholder="Choose target account"
            />
            {errors.destinationAccountId && (
              <p className="text-[11px] font-semibold text-destructive">
                {errors.destinationAccountId.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-bold tracking-wider text-foreground uppercase">
              Source Amount ({srcAcc?.currency || ""})
            </Label>
            <AmountInput
              control={control}
              name="sourceAmount"
              onValueChange={(val) => {
                updateTargetAmount(val, srcId, dstId)
              }}
              currency={srcAcc?.currency}
              placeholder="0.00"
              className="h-11 rounded-xl"
            />
            {errors.sourceAmount && (
              <p className="text-[11px] font-semibold text-destructive">
                {errors.sourceAmount.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-bold tracking-wider text-foreground uppercase">
              Target Amount ({dstAcc?.currency || ""})
            </Label>
            <AmountInput
              control={control}
              name="destinationAmount"
              currency={dstAcc?.currency}
              placeholder="0.00"
              className="h-11 rounded-xl"
            />
            {errors.destinationAmount && (
              <p className="text-[11px] font-semibold text-destructive">
                {errors.destinationAmount.message}
              </p>
            )}
          </div>

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

          <div className="space-y-2">
            <Label className="block text-xs font-bold tracking-wider text-foreground uppercase">
              Transfer Date
            </Label>
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
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="transfer-notes"
              className="text-xs font-bold tracking-wider text-foreground uppercase"
            >
              Transfer Notes
            </Label>
            <Input
              id="transfer-notes"
              placeholder="e.g. Monthly savings allocation"
              {...register("notes")}
              className="h-11 rounded-xl"
            />
          </div>

          <div className="w-full pt-4">
            <Button
              type="submit"
              disabled={createMutation.isPending}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-accent font-semibold text-white shadow-lg shadow-primary/10 transition-all hover:scale-[1.01]"
            >
              {createMutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              Perform Transfer
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
