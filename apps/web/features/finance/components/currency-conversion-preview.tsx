import { Globe, Info } from "lucide-react"
import { useTimezone } from "@saturn/hooks"

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
  const tz = useTimezone()

  if (!conversion) return null

  if ("error" in conversion) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/8 p-3.5 select-none">
        <Info className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div>
          <span className="block text-xs font-medium text-amber-700 dark:text-amber-400">
            Exchange rate required
          </span>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {conversion.error} Go to the{" "}
            <span className="font-medium text-foreground">Exchange Rates</span>{" "}
            tab to configure this conversion rate before saving.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-3 rounded-xl border border-border/80 bg-muted/30 p-3.5 select-none">
      <Globe className="mt-0.5 size-4 shrink-0 text-primary" />
      <div>
        <span className="block text-xs font-medium text-muted-foreground">
          Reporting currency equivalent
        </span>
        <span className="mt-0.5 block font-mono text-sm font-semibold text-foreground tabular-nums">
          {tz.formatMoney(
            Math.round(conversion.amount * 100),
            conversion.currency
          )}
        </span>
        <span className="mt-0.5 block font-mono text-xs text-muted-foreground tabular-nums">
          1 {fromCurrency} = {conversion.rate.toFixed(4)} {conversion.currency}
        </span>
      </div>
    </div>
  )
}
