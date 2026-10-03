import { useEffect } from "react"
import { type Budget } from "@saturn/api/gen/saturn/finance/v1/finance"
import { useTimezone } from "@saturn/hooks"
import { AlertTriangle } from "lucide-react"
import { formatCents, formatAmount, getBudgetColors } from "../utils"
import { cn } from "@/lib/utils"

interface BudgetPeriodProgressProps {
  budget: Budget
  onPeriodLoaded?: (limitInBase: number) => void
}

export function BudgetPeriodProgress({
  budget,
  onPeriodLoaded,
}: BudgetPeriodProgressProps) {
  const tz = useTimezone()
  const period = budget.currentPeriod
  const themeColors = getBudgetColors(budget.color)

  // Propagate total limit in base currency to parent for dashboard overview stats
  useEffect(() => {
    if (period && onPeriodLoaded && (period.exchangeRateToBase ?? 0) > 0) {
      const limit = formatCents(budget.limitAmount)
      const limitInBase = limit * (period.exchangeRateToBase ?? 0)
      onPeriodLoaded(limitInBase)
    }
  }, [period, budget.limitAmount, onPeriodLoaded])

  const limitCents = Number(budget.limitAmount || "0")
  const spentCents = Number(period?.spentAmount || "0")
  const remainingCents = Math.max(limitCents - spentCents, 0)
  const overCents = Math.max(spentCents - limitCents, 0)
  const isOverBudget = limitCents > 0 && spentCents > limitCents
  const progressPercent =
    limitCents > 0 ? Math.min((spentCents / limitCents) * 100, 100) : 0
  const actualPercent =
    limitCents > 0 ? Math.round((spentCents / limitCents) * 100) : 0
  const isNearLimit = !isOverBudget && actualPercent >= 85

  const isOneTime = budget.interval === "ONE_TIME"

  // Date range and remaining days
  const startStr = period?.startDate
    ? tz.format(period.startDate, { month: "short", day: "numeric" })
    : ""
  const endStr = period?.endDate
    ? tz.format(period.endDate, { month: "short", day: "numeric" })
    : ""
  const dateRangeStr = isOneTime
    ? "Lifetime"
    : startStr && endStr
      ? `${startStr} – ${endStr}`
      : startStr || endStr || ""

  const now = tz.now()
  const end = period?.endDate ? new Date(period.endDate) : null
  const diffMs = end ? end.getTime() - now.getTime() : 0
  const daysLeft = diffMs > 0 ? Math.ceil(diffMs / (1000 * 60 * 60 * 24)) : 0

  // Cross-currency conversion calculation
  const isCrossCurrency =
    period && budget.currency && period.baseCurrency
      ? budget.currency !== period.baseCurrency
      : false
  const rateToBase = period?.exchangeRateToBase ?? 0
  const isRateMissing = isCrossCurrency && rateToBase <= 0
  const baseLimitCents = Math.round(limitCents * rateToBase)

  // Dynamic status-colored bar
  const barColor = isOverBudget
    ? "bg-rose-500 shadow-sm shadow-rose-500/50"
    : isNearLimit
      ? "bg-amber-500 shadow-sm shadow-amber-500/50"
      : themeColors.bar

  const badgeColorClass = isOverBudget
    ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
    : isNearLimit
      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
      : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"

  // Fallback when no period is active yet
  if (!period) {
    return (
      <div className="mt-4 space-y-2">
        <div>
          <span className="block text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            Template Limit
          </span>
          <div className="mt-0.5 flex min-w-0 items-baseline gap-1.5">
            <span className="text-2xl font-black tracking-tight whitespace-nowrap text-foreground">
              {formatAmount(limitCents)}
            </span>
            {budget.currency && (
              <span className="shrink-0 text-xs font-bold text-muted-foreground uppercase">
                {budget.currency}
              </span>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          No activity recorded for this period yet.
        </p>
      </div>
    )
  }

  // Check if exchange rate is missing
  if (isRateMissing) {
    return (
      <div className="mt-4 flex animate-in flex-col gap-1.5 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3.5 text-xs duration-300 fade-in">
        <div className="flex items-center gap-1.5 font-bold text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>Exchange Rate Required</span>
        </div>
        <p className="leading-relaxed text-muted-foreground">
          No conversion rate configured from{" "}
          <span className="font-semibold text-foreground">
            {budget.currency}
          </span>{" "}
          to{" "}
          <span className="font-semibold text-foreground">
            {period?.baseCurrency}
          </span>
          . Configure a rate in settings to track this budget.
        </p>
      </div>
    )
  }

  // Dynamic font sizing for large numbers (e.g. 10,000.00 DOP or 1,000,000.00 COP)
  const heroRawNumber = isOverBudget
    ? `+${formatAmount(overCents)}`
    : formatAmount(remainingCents)

  const heroFontSize =
    heroRawNumber.length > 14
      ? "text-lg"
      : heroRawNumber.length > 10
        ? "text-xl"
        : "text-2xl"

  return (
    <div className="mt-5 space-y-3">
      {/* Hero Metric Row: Remaining / Over Budget + Percentage Badge */}
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            {isOverBudget ? "Over Budget" : "Remaining"}
          </span>
          <div className="mt-0.5 flex min-w-0 items-baseline gap-1.5">
            <span
              title={`${heroRawNumber} ${budget.currency}`}
              className={cn(
                "truncate font-black tracking-tight whitespace-nowrap",
                heroFontSize,
                isOverBudget ? "text-rose-500" : "text-foreground"
              )}
            >
              {heroRawNumber}
            </span>
            {budget.currency && (
              <span className="shrink-0 text-xs font-bold text-muted-foreground uppercase">
                {budget.currency}
              </span>
            )}
            <span
              className={cn(
                "ml-0.5 shrink-0 text-xs font-semibold",
                isOverBudget ? "text-rose-500/80" : "text-muted-foreground"
              )}
            >
              {isOverBudget ? "exceeded" : "left"}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center">
          <span
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-[10px] font-bold tracking-wide whitespace-nowrap uppercase transition-colors",
              badgeColorClass
            )}
          >
            {actualPercent}%
          </span>
        </div>
      </div>

      {/* Progress Track */}
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary/70 shadow-inner">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-700 ease-out",
            barColor
          )}
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Sub-caption Directly Below Track */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="truncate">
          Spent {formatAmount(spentCents)} of{" "}
          {formatAmount(limitCents, budget.currency)}
        </span>
        <span className="ml-2 shrink-0 text-[11px] font-medium">
          {daysLeft > 0 ? `${daysLeft}d left` : dateRangeStr}
        </span>
      </div>

      {/* Cross-Currency Conversion Banner */}
      {isCrossCurrency && rateToBase > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-border/30 bg-muted/20 px-3 py-1.5 text-[11px] text-muted-foreground">
          <span className="font-mono text-[10px]">
            1 {budget.currency} = {rateToBase.toFixed(4)} {period?.baseCurrency}
          </span>
          <span>
            Limit:{" "}
            <strong className="font-semibold text-foreground">
              {formatAmount(baseLimitCents, period?.baseCurrency)}
            </strong>
          </span>
        </div>
      )}
    </div>
  )
}
