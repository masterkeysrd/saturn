import { useEffect, useState } from "react"
import {
  useGetBudgetPeriodQuery,
  type Budget,
} from "@/gen/saturn/finance/v1/finance"
import { AlertTriangle, Calendar } from "lucide-react"
import { formatCents, getBudgetColors } from "../utils"

interface BudgetPeriodProgressProps {
  spaceId: string
  budget: Budget
  onPeriodLoaded?: (limitInBase: number) => void
}

export function BudgetPeriodProgress({
  spaceId,
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
      spaceId,
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
  const spent = 0 // Transactions out of scope for MVP
  const progressPercent = Math.min((spent / limit) * 100, 100)

  // Bounds display formatting
  const startStr = new Date(period.startDate).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })
  const endStr = new Date(period.endDate).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })

  const baseLimit = limit * period.exchangeRateToBase

  return (
    <div className="mt-5 space-y-3">
      <div className="flex items-center justify-between text-xs font-medium text-muted-foreground/80">
        <span className="flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          {startStr} - {endStr}
        </span>
        <span className="font-semibold">
          {spent.toFixed(2)} / {limit.toFixed(2)} {period.currency}
        </span>
      </div>

      {/* Dynamic Budget Color Progress bar */}
      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary/60 shadow-inner">
        <div
          className={`${getBudgetColors(budget.color).bar} h-full rounded-full transition-all duration-700 ease-out`}
          style={{ width: `${progressPercent}%` }}
        ></div>
      </div>

      {/* Exchange Rate details for cross-currency templates */}
      {period.currency !== period.baseCurrency && (
        <div className="flex justify-between border-t border-border/20 pt-2.5 font-mono text-[10px] text-muted-foreground/60">
          <span>
            Rate: 1 {period.currency} = {period.exchangeRateToBase.toFixed(4)}{" "}
            {period.baseCurrency}
          </span>
          <span className="font-semibold">
            Limit: {baseLimit.toFixed(2)} {period.baseCurrency}
          </span>
        </div>
      )}
    </div>
  )
}
