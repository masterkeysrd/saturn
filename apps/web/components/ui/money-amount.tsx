import { formatMoneyWithLocale, useTimezone } from "@saturn/hooks"
import { formatCents } from "@saturn/core"
import { cn } from "@/lib/utils"

export type MoneyAmountSize = "sm" | "md" | "lg" | "xl"

export interface MoneyAmountProps {
  cents: string | number | null | undefined
  currency?: string
  colored?: boolean
  showSign?: boolean
  size?: MoneyAmountSize
  locale?: string
  minimumFractionDigits?: number
  maximumFractionDigits?: number
  className?: string
}

const SIZE_CLASSES: Record<MoneyAmountSize, string> = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-lg font-semibold",
  xl: "text-2xl font-semibold tracking-tight",
}

export function MoneyAmount({
  cents,
  currency,
  colored = false,
  showSign = false,
  size = "md",
  locale,
  minimumFractionDigits,
  maximumFractionDigits,
  className,
}: MoneyAmountProps) {
  const tz = useTimezone()
  const resolvedLocale = locale || tz?.locale || "en-US"
  const amount = formatCents(cents)

  const formatted = tz?.formatMoney
    ? tz.formatMoney(cents, currency, {
        showSign,
        locale: resolvedLocale,
        minimumFractionDigits,
        maximumFractionDigits,
      })
    : formatMoneyWithLocale(cents, currency, resolvedLocale, {
        showSign,
        minimumFractionDigits,
        maximumFractionDigits,
      })

  let colorClass = ""
  if (colored) {
    if (amount > 0) {
      colorClass = "text-success"
    } else if (amount < 0) {
      colorClass = "text-destructive"
    } else {
      colorClass = "text-muted-foreground"
    }
  }

  return (
    <span
      data-slot="money-amount"
      className={cn(
        "font-mono tabular-nums",
        SIZE_CLASSES[size],
        colorClass,
        className
      )}
    >
      {formatted}
    </span>
  )
}
