import { useEffect } from "react"
import { type Budget } from "@saturn/api/gen/saturn/finance/v1/finance"
import { useTimezone } from "@saturn/hooks"
import { MoneyAmount } from "@/components/ui/money-amount"
import { AlertTriangle } from "lucide-react"
import {
  formatCents,
  getBudgetColors,
  computeBudgetPacePercent,
} from "../utils"
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

  const pacePercent = computeBudgetPacePercent(budget, now)
  const paceDelta =
    pacePercent !== null ? Math.round(actualPercent - pacePercent) : null

  const isCrossCurrency =
    period && budget.currency && period.baseCurrency
      ? budget.currency !== period.baseCurrency
      : false
  const rateToBase = period?.exchangeRateToBase ?? 0
  const isRateMissing = isCrossCurrency && rateToBase <= 0
  const baseLimitCents = Math.round(limitCents * rateToBase)

  const barColor = isOverBudget
    ? "bg-destructive"
    : isNearLimit
      ? "bg-warning"
      : themeColors.bar

  const badgeColorClass = isOverBudget
    ? "border-destructive/20 bg-destructive/10 text-destructive"
    : isNearLimit
      ? "border-warning/20 bg-warning/10 text-warning"
      : "border-success/20 bg-success/10 text-success"

  if (!period) {
    return (
      <div className="mt-4 space-y-1.5">
        <span className="block text-xs font-medium text-muted-foreground">
          Template limit
        </span>
        <MoneyAmount
          cents={limitCents}
          currency={budget.currency}
          size="xl"
          className="block text-foreground"
        />
        <p className="text-xs text-muted-foreground">
          No activity recorded for this period yet.
        </p>
      </div>
    )
  }

  if (isRateMissing) {
    return (
      <div className="mt-4 flex flex-col gap-1.5 rounded-lg border border-warning/25 bg-warning/10 p-3 text-xs">
        <div className="flex items-center gap-1.5 font-medium text-warning">
          <AlertTriangle className="size-4 shrink-0" />
          <span>Exchange rate required</span>
        </div>
        <p className="leading-relaxed text-muted-foreground">
          No conversion rate configured from{" "}
          <span className="font-mono font-medium text-foreground">
            {budget.currency}
          </span>{" "}
          to{" "}
          <span className="font-mono font-medium text-foreground">
            {period?.baseCurrency}
          </span>
          . Configure a rate to track this budget.
        </p>
      </div>
    )
  }

  return (
    <div className="mt-4 space-y-2.5">
      {/* Hero Metric Row */}
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          <span className="block text-xs font-medium text-muted-foreground">
            {isOverBudget ? "Over budget" : "Remaining"}
          </span>
          <div className="mt-0.5 flex min-w-0 items-baseline gap-1.5">
            <MoneyAmount
              cents={isOverBudget ? overCents : remainingCents}
              currency={budget.currency}
              showSign={isOverBudget}
              size="xl"
              className={cn(
                "truncate",
                isOverBudget ? "text-destructive" : "text-foreground"
              )}
            />
          </div>
        </div>

        <span
          className={cn(
            "shrink-0 rounded-md border px-2 py-0.5 font-mono text-xs font-medium tabular-nums",
            badgeColorClass
          )}
        >
          {actualPercent}%
        </span>
      </div>

      {/* 6px Progress Track with Today Pace Tick */}
      <div className="relative w-full py-1">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500 ease-out",
              barColor
            )}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        {pacePercent !== null && (
          <div
            data-testid="budget-pace-tick"
            title={`Today · ${Math.round(pacePercent)}% elapsed`}
            aria-label={`Today pace marker at ${Math.round(pacePercent)}% elapsed`}
            className="pointer-events-none absolute top-0 h-3.5 w-0.5 -translate-x-1/2 rounded-full bg-foreground/70 ring-1 ring-card"
            style={{ left: `${pacePercent}%` }}
          />
        )}
      </div>

      {/* Sub-captions */}
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="truncate font-mono tabular-nums">
          {tz.formatMoney(spentCents, budget.currency)} /{" "}
          {tz.formatMoney(limitCents, budget.currency)}
        </span>
        <span className="shrink-0 font-medium">
          {isOverBudget ? (
            <span className="text-destructive">Exceeded</span>
          ) : paceDelta !== null && paceDelta > 5 ? (
            <span className="text-warning">Ahead of pace (+{paceDelta}%)</span>
          ) : pacePercent !== null ? (
            <span>
              On pace · {daysLeft > 0 ? `${daysLeft}d left` : dateRangeStr}
            </span>
          ) : (
            <span>{daysLeft > 0 ? `${daysLeft}d left` : dateRangeStr}</span>
          )}
        </span>
      </div>

      {/* Cross-Currency Conversion Info */}
      {isCrossCurrency && rateToBase > 0 && (
        <div className="flex items-center justify-between border-t border-border/60 pt-2 text-xs text-muted-foreground">
          <span className="font-mono text-[11px]">
            1 {budget.currency} = {rateToBase.toFixed(4)} {period?.baseCurrency}
          </span>
          <span className="font-mono text-[11px] tabular-nums">
            Limit: {tz.formatMoney(baseLimitCents, period?.baseCurrency)}
          </span>
        </div>
      )}
    </div>
  )
}
