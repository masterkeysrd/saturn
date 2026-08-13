import { useEffect } from "react"
import { useForm, Controller, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { FormSelect } from "@/components/ui/form-select"
import { FormDrawer, FormFieldItem } from "@/components/ui/form-drawer"
import {
  exchangeRateSchema,
  type ExchangeRateFormValues,
} from "../schemas/exchange-rate"
import {
  type FinanceSettings,
  useCreateExchangeRateMutation,
  useListCurrenciesQuery,
} from "@/gen/saturn/finance/v1/finance"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DatePicker } from "@/components/ui/date-picker"

interface CreateRateSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  spaceId?: string
  baseCurr?: string
  settings?: FinanceSettings
  refetchRates?: () => void
}

export function CreateRateSheet({
  open,
  onOpenChange,
  spaceId,
  baseCurr: initialBaseCurr,
  settings,
  refetchRates,
}: CreateRateSheetProps) {
  const baseCurr = initialBaseCurr || settings?.baseCurrency || "USD"
  const createRateMutation = useCreateExchangeRateMutation()

  const { data: currenciesData } = useListCurrenciesQuery(
    {},
    { enabled: open && (!!spaceId || !!settings), staleTime: 1000 * 60 * 30 }
  )
  const currencies = currenciesData?.currencies || []
  const currencyItems = currencies
    .filter((c) => c.code !== baseCurr)
    .map((c) => ({
      value: c.code,
      label: `${c.code}${c.name ? ` (${c.name})` : ""}`,
      triggerLabel: c.code,
    }))

  const defaultFrom = currencyItems.length > 0 ? currencyItems[0].value : "EUR"

  const {
    register,
    handleSubmit,
    control,
    setValue,
    reset,
    formState: { errors },
  } = useForm<ExchangeRateFormValues>({
    resolver: zodResolver(exchangeRateSchema),
    defaultValues: {
      fromCurrency: defaultFrom,
      toCurrency: baseCurr,
      rateDirection: "direct",
      rateValue: "",
      rateDate: new Date(),
    },
  })

  useEffect(() => {
    if (open) {
      reset({
        fromCurrency: defaultFrom,
        toCurrency: baseCurr,
        rateDirection: "direct",
        rateValue: "",
        rateDate: new Date(),
      })
    }
  }, [open, defaultFrom, baseCurr, reset])

  const rateFrom = useWatch({ control, name: "fromCurrency" })
  const rateTo = useWatch({ control, name: "toCurrency" })
  const rateDirection = useWatch({ control, name: "rateDirection" })
  const rateValueStr = useWatch({ control, name: "rateValue" })

  const onSubmit = async (data: ExchangeRateFormValues) => {
    const parsedInput = parseFloat(data.rateValue)
    if (isNaN(parsedInput) || parsedInput <= 0) return

    const finalRate =
      data.rateDirection === "inverse" ? 1.0 / parsedInput : parsedInput

    const y = data.rateDate.getFullYear()
    const m = String(data.rateDate.getMonth() + 1).padStart(2, "0")
    const d = String(data.rateDate.getDate()).padStart(2, "0")
    const dateObj = new Date(`${y}-${m}-${d}T12:00:00Z`)

    await createRateMutation.mutateAsync({
      exchangeRate: {
        fromCurrency: data.fromCurrency,
        toCurrency: data.toCurrency,
        rate: finalRate,
        rateDate: dateObj.toISOString(),
      },
    })

    onOpenChange(false)
    refetchRates?.()
  }

  const parsedVal = parseFloat(rateValueStr)

  return (
    <FormDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Add Exchange Rate"
      description="Configure a specific daily rate conversion rule to your reporting currency."
      submitLabel="Add Rate"
      isPending={createRateMutation.isPending}
      onSubmit={handleSubmit(onSubmit)}
    >
      <FormSelect
        control={control}
        name="fromCurrency"
        label="From Currency"
        items={currencyItems}
      />

      <FormSelect
        control={control}
        name="toCurrency"
        label="To Base Currency"
        items={[{ value: baseCurr, label: baseCurr }]}
        disabled
      />

      <div className="space-y-2">
        <Label className="text-xs font-semibold tracking-wider text-muted-foreground/90 uppercase">
          Rate Orientation
        </Label>
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-secondary/40 p-1">
          <button
            type="button"
            onClick={() => setValue("rateDirection", "direct")}
            className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              rateDirection === "direct"
                ? "bg-background font-bold text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            1 {rateFrom} = ? {rateTo} (Direct)
          </button>
          <button
            type="button"
            onClick={() => setValue("rateDirection", "inverse")}
            className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              rateDirection === "inverse"
                ? "bg-background font-bold text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            1 {rateTo} = ? {rateFrom} (Inverse)
          </button>
        </div>
      </div>

      <FormFieldItem
        label={
          rateDirection === "direct"
            ? `Rate (Value of 1 ${rateFrom} in ${rateTo})`
            : `Rate (Value of 1 ${rateTo} in ${rateFrom})`
        }
        error={errors.rateValue?.message}
      >
        <Input
          type="number"
          step="any"
          min="0.000001"
          {...register("rateValue")}
          placeholder={
            rateDirection === "direct" ? "e.g. 1.0900" : "e.g. 58.0000"
          }
          className="h-11 rounded-xl border-border/60 bg-background/50"
        />

        {!isNaN(parsedVal) && parsedVal > 0 && (
          <div className="mt-2 space-y-1 rounded-xl border border-border/20 bg-secondary/30 p-3 text-xs text-muted-foreground select-none">
            <div className="font-semibold text-foreground">
              Live Conversion Preview:
            </div>
            <div>
              Direct:{" "}
              <span className="font-mono font-bold text-foreground">
                1 {rateFrom} ={" "}
                {rateDirection === "direct"
                  ? parsedVal.toFixed(6)
                  : (1.0 / parsedVal).toFixed(6)}{" "}
                {rateTo}
              </span>
            </div>
            <div>
              Inverse:{" "}
              <span className="font-mono font-bold text-foreground">
                1 {rateTo} ={" "}
                {rateDirection === "direct"
                  ? (1.0 / parsedVal).toFixed(6)
                  : parsedVal.toFixed(6)}{" "}
                {rateFrom}
              </span>
            </div>
          </div>
        )}
      </FormFieldItem>

      <FormFieldItem label="Rate Date" error={errors.rateDate?.message}>
        <Controller
          control={control}
          name="rateDate"
          render={({ field }) => (
            <DatePicker
              date={field.value}
              setDate={(d) => d && field.onChange(d)}
            />
          )}
        />
      </FormFieldItem>
    </FormDrawer>
  )
}
