import { Globe, Info } from "lucide-react"

interface CurrencyConversionPreviewProps {
  conversion:
    | { amount: number; rate: number; currency: string }
    | { error: string }
    | null
  fromCurrency: string
}

export function CurrencyConversionPreview({
  conversion,
  fromCurrency,
}: CurrencyConversionPreviewProps) {
  if (!conversion) return null

  if ("error" in conversion) {
    return (
      <div className="flex animate-in items-start gap-3 rounded-2xl border border-amber-500/10 bg-amber-500/5 p-4 duration-300 select-none fade-in">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
        <div>
          <span className="block text-[11px] font-bold text-amber-500 uppercase">
            Exchange Rate Required
          </span>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {conversion.error} Go to the{" "}
            <span className="font-semibold text-foreground">
              Exchange Rates
            </span>{" "}
            tab to configure this daily conversion rate before saving.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex animate-in items-start gap-3 rounded-2xl border border-primary/10 bg-primary/5 p-4 duration-300 select-none fade-in">
      <Globe className="mt-0.5 h-5 w-5 shrink-0 animate-pulse text-primary" />
      <div>
        <span className="block text-[11px] font-bold text-primary uppercase">
          Reporting Currency Conversion
        </span>
        <span className="mt-0.5 block text-sm font-extrabold text-foreground">
          {conversion.amount.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}{" "}
          {conversion.currency}
        </span>
        <span className="mt-1 block font-mono text-[10px] text-muted-foreground">
          Exchange rate: 1 {fromCurrency} = {conversion.rate.toFixed(4)}{" "}
          {conversion.currency}
        </span>
      </div>
    </div>
  )
}
