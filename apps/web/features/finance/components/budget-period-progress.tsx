import { useEffect, useState } from "react"
import {
  useGetBudgetPeriodQuery,
  type Budget,
} from "@/gen/saturn/finance/v1/finance"
import { AlertTriangle, Calendar } from "lucide-react"
import { formatCents, getBudgetColors } from "../utils"
import { cn } from "@/lib/utils"

interface BudgetPeriodProgressProps {
  budget: Budget
  onPeriodLoaded?: (limitInBase: number) => void
}

export function BudgetPeriodProgress({
  budget,
  onPeriodLoaded,
}: BudgetPeriodProgressProps) {
  const [currentDate] = useState(() => new Date().toISOString())

  const {
    data: period,
    isLoading,
    error,
  } = useGetBudgetPeriodQuery(
    {
      budgetId: budget.id,
      date: currentDate,
    },
    {
      retry: false,
      staleTime: 5 * 60 * 1000, // 5 minutes cache fresh period
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
    }
  )

  // Propagate total limit in base currency to parent for dashboard overview stats
  useEffect(() => {
    if (period && onPeriodLoaded) {
      const limit = formatCents(period.limitAmount)
      const limitInBase = limit * period.exchangeRateToBase
      onPeriodLoaded(limitInBase)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period])

  if (isLoading) {
    return (
      <div className="mt-6 animate-pulse space-y-3">
        <div className="h-4 w-2/3 rounded bg-muted/50"></div>
        <div className="h-2 w-full rounded bg-muted/40"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mt-5 flex animate-in flex-col gap-1 rounded-2xl border border-amber-500/10 bg-amber-500/5 p-3.5 text-[11px] duration-300 fade-in">
        <div className="flex items-center gap-1.5 font-bold text-amber-500">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>Exchange Rate Required</span>
        </div>
        <p className="leading-relaxed text-muted-foreground">
          No conversion rate configured from{" "}
          <span className="font-semibold text-foreground">
            {budget.currency}
          </span>{" "}
          to base currency. Configure a rate in settings to track this budget.
        </p>
      </div>
    )
  }

  if (!period) return null

  const limit = formatCents(period.limitAmount)
  const spent = formatCents(period.spentAmount || "0")
  const progressPercent = limit > 0 ? Math.min((spent / limit) * 100, 100) : 0

  // Bounds display formatting
  const startStr = new Date(period.startDate).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
  const endStr = new Date(period.endDate).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })

  const baseLimit = limit * period.exchangeRateToBase

  const isOverBudget = spent >= limit
  const isNearLimit = spent >= limit * 0.85 && spent < limit
  const barColor = isOverBudget
    ? "bg-rose-500 animate-pulse"
    : isNearLimit
      ? "bg-amber-500"
      : getBudgetColors(budget.color).bar

  return (
    <div className="mt-5 space-y-3">
      <div className="flex items-center justify-between text-xs font-medium text-muted-foreground/80">
        <span className="flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          {startStr} - {endStr}
        </span>
        <span
          className={cn(
            "font-semibold",
            isOverBudget
              ? "text-rose-500"
              : isNearLimit
                ? "text-amber-500"
                : "text-foreground"
          )}
        >
          {spent.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}{" "}
          /{" "}
          {limit.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}{" "}
          {period.currency}
        </span>
      </div>

      {/* Dynamic Budget Color Progress bar */}
      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary/60 shadow-inner">
        <div
          className={`${barColor} h-full rounded-full transition-all duration-700 ease-out`}
          style={{ width: `${progressPercent}%` }}
        ></div>
      </div>

      {/* Status Alert Labels */}
      {(isOverBudget || isNearLimit) && (
        <div className="flex items-center gap-1 text-[9px] font-bold tracking-wider uppercase">
          {isOverBudget ? (
            <span className="flex items-center gap-1 text-rose-500">
              <AlertTriangle className="h-3.5 w-3.5 animate-bounce" />
              Budget Exceeded
            </span>
          ) : (
            <span className="flex items-center gap-1 text-amber-500">
              <AlertTriangle className="h-3.5 w-3.5" />
              Approaching Limit ({((spent / limit) * 100).toFixed(0)}% used)
            </span>
          )}
        </div>
      )}

      {/* Exchange Rate details for cross-currency templates */}
      {period.currency !== period.baseCurrency && (
        <div className="flex justify-between border-t border-border/20 pt-2.5 font-mono text-[10px] text-muted-foreground/60">
          <span>
            Rate: 1 {period.currency} = {period.exchangeRateToBase.toFixed(4)}{" "}
            {period.baseCurrency}
          </span>
          <span className="font-semibold">
            Limit:{" "}
            {baseLimit.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}{" "}
            {period.baseCurrency}
          </span>
        </div>
      )}
    </div>
  )
}
