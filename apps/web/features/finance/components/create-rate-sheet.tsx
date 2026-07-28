import { useEffect } from "react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  useCreateExchangeRateMutation,
  type FinanceSettings,
  useListCurrenciesQuery,
} from "@/gen/saturn/finance/v1/finance"
import { useActiveSpaceContext } from "@/features/space/use-space"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DatePicker } from "@/components/ui/date-picker"
import { FormSelect } from "@/components/ui/form-select"
import { Loader2 } from "lucide-react"
import {
  exchangeRateSchema,
  type ExchangeRateFormValues,
} from "../schemas/exchange-rate"

interface CreateRateSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  settings: FinanceSettings | undefined
  refetchRates: () => void
}

export function CreateRateSheet({
  open,
  onOpenChange,
  settings,
  refetchRates,
}: CreateRateSheetProps) {
  const { spaceId } = useActiveSpaceContext()
  const { data: currenciesData } = useListCurrenciesQuery(
    {},
    { enabled: open && !!spaceId, staleTime: 1000 * 60 * 30 }
  )
  const currencies = currenciesData?.currencies || []
  const fallbackCurrencies = [
    { code: "USD" },
    { code: "EUR" },
    { code: "GBP" },
    { code: "CAD" },
    { code: "DOP" },
  ]
  const currencyList =
    currencies && currencies.length > 0 ? currencies : fallbackCurrencies

  const currencyItems = currencyList.map((c) => ({
    value: c.code,
    label: c.code,
  }))

  const createRateMutation = useCreateExchangeRateMutation()

  const baseCurr = settings?.baseCurrency || "USD"

  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ExchangeRateFormValues>({
    resolver: zodResolver(exchangeRateSchema),
    defaultValues: {
      fromCurrency: "EUR",
      toCurrency: baseCurr,
      rateValue: "",
      rateDirection: "direct",
      rateDate: new Date(),
    },
  })

  useEffect(() => {
    if (open) {
      reset({
        fromCurrency: "EUR",
        toCurrency: baseCurr,
        rateValue: "",
        rateDirection: "direct",
        rateDate: new Date(),
      })
    }
  }, [open, baseCurr, reset])

  const rateFrom = watch("fromCurrency")
  const rateTo = watch("toCurrency")
  const rateDirection = watch("rateDirection")
  const rateValueStr = watch("rateValue")

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
    refetchRates()
  }

  const parsedVal = parseFloat(rateValueStr)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="rounded-none border-none border-border/40 bg-card/95 p-6 shadow-2xl backdrop-blur-xl sm:rounded-l-3xl sm:border-l md:p-8">
        <SheetHeader className="p-0">
          <SheetTitle className="text-xl font-bold">
            Add Exchange Rate
          </SheetTitle>
          <SheetDescription className="mt-1">
            Configure a specific daily rate conversion rule to your reporting
            currency.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-5">
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

          <div className="space-y-1.5">
            <Label
              htmlFor="rateValue"
              className="text-xs font-semibold tracking-wider text-muted-foreground/90 uppercase"
            >
              {rateDirection === "direct"
                ? `Rate (Value of 1 ${rateFrom} in ${rateTo})`
                : `Rate (Value of 1 ${rateTo} in ${rateFrom})`}
            </Label>
            <Input
              id="rateValue"
              type="number"
              step="any"
              min="0.000001"
              {...register("rateValue")}
              placeholder={
                rateDirection === "direct" ? "e.g. 1.0900" : "e.g. 58.0000"
              }
              className="h-11 rounded-xl border-border/60 bg-background/50"
            />
            {errors.rateValue && (
              <p className="text-[11px] font-semibold text-destructive">
                {errors.rateValue.message}
              </p>
            )}

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
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold tracking-wider text-muted-foreground/90 uppercase">
              Rate Date
            </Label>
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
            {errors.rateDate && (
              <p className="text-[11px] font-semibold text-destructive">
                {errors.rateDate.message}
              </p>
            )}
          </div>

          <Button
            type="submit"
            disabled={createRateMutation.isPending}
            className="mt-8 h-11 w-full rounded-xl bg-gradient-to-r from-primary to-accent font-semibold text-white transition-all hover:scale-[1.01] hover:opacity-95"
          >
            {createRateMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Add Rate
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}
