import { useState } from "react"
import {
  useCreateExchangeRateMutation,
  type FinanceSettings,
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
import { Label } from "@/components/ui/label"
import { Loader2 } from "lucide-react"

interface CreateRateSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  spaceId: string
  settings: FinanceSettings | undefined
  refetchRates: () => void
}

export function CreateRateSheet({
  open,
  onOpenChange,
  spaceId,
  settings,
  refetchRates,
}: CreateRateSheetProps) {
  const [rateFrom, setRateFrom] = useState("EUR")
  const [rateTo, setRateTo] = useState(settings?.baseCurrency || "USD")
  const [rateValue, setRateValue] = useState("")
  const [rateDateStr, setRateDateStr] = useState(
    new Date().toISOString().split("T")[0]
  )
  const [rateDirection, setRateDirection] = useState<"direct" | "inverse">(
    "direct"
  )

  const [prevBase, setPrevBase] = useState<string | undefined>(
    settings?.baseCurrency
  )
  if (settings?.baseCurrency !== prevBase) {
    setPrevBase(settings?.baseCurrency)
    setRateTo(settings?.baseCurrency || "USD")
  }

  const createRateMutation = useCreateExchangeRateMutation()

  const handleCreateRate = async (e: React.FormEvent) => {
    e.preventDefault()
    const parsedInput = parseFloat(rateValue)
    if (isNaN(parsedInput) || parsedInput <= 0) return

    const finalRate =
      rateDirection === "inverse" ? 1.0 / parsedInput : parsedInput
    const dateObj = new Date(rateDateStr + "T00:00:00Z")

    await createRateMutation.mutateAsync({
      space_id: spaceId,
      req: {
        spaceId,
        fromCurrency: rateFrom,
        toCurrency: rateTo,
        rate: finalRate,
        rateDate: dateObj.toISOString(),
      },
    })

    onOpenChange(false)
    setRateValue("")
    refetchRates()
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="rounded-l-3xl border-l border-border/40 bg-card/95 p-6 shadow-2xl backdrop-blur-xl md:p-8">
        <SheetHeader className="p-0">
          <SheetTitle className="text-xl font-bold">
            Add Exchange Rate
          </SheetTitle>
          <SheetDescription className="mt-1">
            Configure a specific daily rate conversion rule to your reporting
            currency.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={handleCreateRate} className="mt-8 space-y-5">
          <div className="space-y-1.5">
            <Label
              htmlFor="rateFrom"
              className="text-xs font-semibold tracking-wider text-muted-foreground/90 uppercase"
            >
              From Currency
            </Label>
            <select
              id="rateFrom"
              value={rateFrom}
              onChange={(e) => setRateFrom(e.target.value)}
              className="flex h-11 w-full rounded-xl border border-border/60 bg-background/50 px-3 py-2 text-sm shadow-sm ring-offset-background focus-visible:outline-none"
            >
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
              <option value="CAD">CAD</option>
              <option value="DOP">DOP</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <Label
              htmlFor="rateTo"
              className="text-xs font-semibold tracking-wider text-muted-foreground/90 uppercase"
            >
              To Base Currency
            </Label>
            <select
              id="rateTo"
              value={rateTo}
              onChange={(e) => setRateTo(e.target.value)}
              className="flex h-11 w-full cursor-not-allowed rounded-xl border border-border/60 bg-background/50 px-3 py-2 text-sm opacity-80 shadow-sm ring-offset-background focus-visible:outline-none"
              disabled
            >
              <option value={settings?.baseCurrency}>
                {settings?.baseCurrency}
              </option>
            </select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold tracking-wider text-muted-foreground/90 uppercase">
              Rate Orientation
            </Label>
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-secondary/40 p-1">
              <button
                type="button"
                onClick={() => setRateDirection("direct")}
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
                onClick={() => setRateDirection("inverse")}
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
              value={rateValue}
              onChange={(e) => setRateValue(e.target.value)}
              placeholder={
                rateDirection === "direct" ? "e.g. 1.0900" : "e.g. 58.0000"
              }
              className="h-11 rounded-xl border-border/60 bg-background/50"
              required
            />

            {parseFloat(rateValue) > 0 && (
              <div className="mt-2 space-y-1 rounded-xl border border-border/20 bg-secondary/30 p-3 text-xs text-muted-foreground select-none">
                <div className="font-semibold text-foreground">
                  Live Conversion Preview:
                </div>
                <div>
                  Direct:{" "}
                  <span className="font-mono font-bold text-foreground">
                    1 {rateFrom} ={" "}
                    {rateDirection === "direct"
                      ? parseFloat(rateValue).toFixed(6)
                      : (1.0 / parseFloat(rateValue)).toFixed(6)}{" "}
                    {rateTo}
                  </span>
                </div>
                <div>
                  Inverse:{" "}
                  <span className="font-mono font-bold text-foreground">
                    1 {rateTo} ={" "}
                    {rateDirection === "direct"
                      ? (1.0 / parseFloat(rateValue)).toFixed(6)
                      : parseFloat(rateValue).toFixed(6)}{" "}
                    {rateFrom}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label
              htmlFor="rateDate"
              className="text-xs font-semibold tracking-wider text-muted-foreground/90 uppercase"
            >
              Rate Date
            </Label>
            <Input
              id="rateDate"
              type="date"
              value={rateDateStr}
              onChange={(e) => setRateDateStr(e.target.value)}
              className="h-11 rounded-xl border-border/60 bg-background/50"
              required
            />
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
