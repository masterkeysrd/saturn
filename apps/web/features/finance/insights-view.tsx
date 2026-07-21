import { useState } from "react"
import { useWorkspaceFinance } from "./use-workspace-finance"
import { FinancePageLayout } from "./components/finance-page-layout"
import { formatCents, getBudgetColors, getBudgetIcon } from "./utils"
import { cn } from "@/lib/utils"
import {
  useGetInsightsQuery,
  type InsightGranularity,
  type GetInsightsRequest,
} from "@/gen/saturn/finance/v1/finance"
import {
  TrendingDownIcon,
  DollarSignIcon,
  CalendarIcon,
  PercentIcon,
  FlameIcon,
  LayersIcon,
  CoinsIcon,
  Loader2,
} from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"

export function InsightsView() {
  const { spaceId, settings } = useWorkspaceFinance()
  const [granularity, setGranularity] = useState<InsightGranularity>("MONTHLY")

  // Fetch spent insights from the newly implemented gRPC backend service
  const {
    data: insightsData,
    isLoading: insightsLoading,
    isPending: insightsPending,
    error: insightsError,
  } = useGetInsightsQuery(
    {
      spaceId,
      granularity,
    } as unknown as GetInsightsRequest,
    {
      enabled: !!spaceId && !!settings,
      refetchOnWindowFocus: false,
    }
  )

  const spentInsights = insightsData?.spent
  const baseCurrency = settings?.baseCurrency || "USD"

  // Active hover states for custom stacked bar chart tooltips
  const [activeTooltip, setActiveTooltip] = useState<{
    label: string
    total: number
    contrib: {
      budgetName: string
      budgetColor: string
      amountInBase: number
      amountInLocal: number
      localCurrency: string
      percentage: number
    }
  } | null>(null)

  // Track loading/pending status to prevent showing error states while query is initializing
  const isQueryEnabled = !!spaceId && !!settings
  const showLoadingSpinner =
    insightsLoading || (insightsPending && isQueryEnabled)

  if (showLoadingSpinner) {
    return (
      <FinancePageLayout
        title="Insights"
        description="Loading financial insights"
      >
        <div className="flex h-[400px] items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-pulse animate-spin text-primary" />
            <p className="animate-pulse text-xs font-medium text-muted-foreground">
              Generating your financial insights...
            </p>
          </div>
        </div>
      </FinancePageLayout>
    )
  }

  if (!settings) {
    return (
      <FinancePageLayout
        title="Insights"
        description="Configure finance to view insights"
      >
        <div className="flex min-h-[400px] items-center justify-center" />
      </FinancePageLayout>
    )
  }

  if (insightsError || (isQueryEnabled && !spentInsights && !insightsPending)) {
    return (
      <FinancePageLayout title="Insights" description="Unable to load insights">
        <div className="flex h-[300px] flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-muted/30 bg-muted/10 p-8 text-center">
          <TrendingDownIcon className="h-10 w-10 text-muted-foreground/60" />
          <h3 className="text-sm font-semibold">Could not load insights</h3>
          <p className="max-w-sm text-xs text-muted-foreground">
            Please make sure exchange rates are configured and transactions are
            logged in the active workspace.
          </p>
        </div>
      </FinancePageLayout>
    )
  }

  if (!spentInsights) {
    return null
  }

  // Calculate some chart metric ranges
  const maxTrendAmount = Math.max(
    ...spentInsights.trend.map((pt) => Number(pt.amountInBase)),
    100
  )

  return (
    <FinancePageLayout
      title="Insights"
      description="Financial trends and overview"
    >
      <div className="animate-in space-y-6 pb-6 duration-500 fade-in">
        {/* Top Half split layout: 1/3 Metrics Sidebar, 2/3 Stacked Trend Chart */}
        <div className="grid gap-6 md:grid-cols-3">
          {/* 1/3 Sidebar Metrics Column */}
          <div className="flex flex-col justify-between gap-3 md:col-span-1">
            {/* Total Spent Box */}
            <div className="relative overflow-hidden rounded-2xl border border-muted/15 bg-card/60 p-4 shadow-sm transition-all duration-300 hover:shadow">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                  Total Spent
                </span>
                <TrendingDownIcon className="h-3.5 w-3.5 text-rose-500" />
              </div>
              <div className="mt-2.5 flex items-baseline gap-1">
                <span className="text-xl font-bold tracking-tight">
                  {baseCurrency}{" "}
                  {formatCents(spentInsights.totalSpent).toLocaleString(
                    undefined,
                    { minimumFractionDigits: 2, maximumFractionDigits: 2 }
                  )}
                </span>
              </div>
            </div>

            {/* Active Limit Box */}
            <div className="relative overflow-hidden rounded-2xl border border-muted/15 bg-card/60 p-4 shadow-sm transition-all duration-300 hover:shadow">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                  Active Limit
                </span>
                <LayersIcon className="h-3.5 w-3.5 text-blue-500" />
              </div>
              <div className="mt-2.5 flex items-baseline gap-1">
                <span className="text-xl font-bold tracking-tight">
                  {baseCurrency}{" "}
                  {formatCents(spentInsights.totalLimit).toLocaleString(
                    undefined,
                    { minimumFractionDigits: 2, maximumFractionDigits: 2 }
                  )}
                </span>
              </div>
            </div>

            {/* Remaining Budget Box */}
            <div className="relative overflow-hidden rounded-2xl border border-muted/15 bg-card/60 p-4 shadow-sm transition-all duration-300 hover:shadow">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                  Remaining
                </span>
                <PercentIcon className="h-3.5 w-3.5 text-emerald-500" />
              </div>
              <div className="mt-2.5 flex items-baseline gap-1">
                <span className="text-xl font-bold tracking-tight">
                  {baseCurrency}{" "}
                  {formatCents(spentInsights.remainingBudget).toLocaleString(
                    undefined,
                    { minimumFractionDigits: 2, maximumFractionDigits: 2 }
                  )}
                </span>
              </div>
            </div>

            {/* Burn Rate Box */}
            <div className="relative overflow-hidden rounded-2xl border border-muted/15 bg-card/60 p-4 shadow-sm transition-all duration-300 hover:shadow">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                  Daily Burn Rate
                </span>
                <FlameIcon className="h-3.5 w-3.5 text-amber-500" />
              </div>
              <div className="mt-2.5 flex items-baseline gap-1">
                <span className="text-xl font-bold tracking-tight">
                  {baseCurrency}{" "}
                  {formatCents(
                    Math.round(spentInsights.burnRate)
                  ).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
            </div>
          </div>

          {/* 2/3 Trend Chart Column */}
          <div className="flex flex-col justify-between rounded-3xl border border-muted/20 bg-card p-5 shadow-sm md:col-span-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="flex items-center gap-1.5 text-xs font-bold tracking-tight text-muted-foreground uppercase">
                  <TrendingDownIcon className="h-3.5 w-3.5 text-primary" />
                  Outflow Trend
                </h3>
              </div>

              {/* Granularity Selector buttons */}
              <div className="flex items-center self-start rounded-xl border border-muted/20 bg-muted/30 p-0.5 sm:self-auto">
                {(
                  [
                    "DAILY",
                    "WEEKLY",
                    "MONTHLY",
                    "YEARLY",
                  ] as InsightGranularity[]
                ).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setGranularity(mode)}
                    className={`cursor-pointer rounded-lg px-2.5 py-1 text-[9px] font-bold transition-all duration-300 ${
                      granularity === mode
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Interactive Stacked Bar Chart */}
            <div className="relative mt-4">
              <div className="relative flex h-[170px] items-end gap-2.5 border-b border-muted/15 px-2 sm:gap-4">
                {/* Vertical Grid Y-axis Guide Markers */}
                <div className="pointer-events-none absolute top-0 right-0 bottom-0 left-0 flex flex-col justify-between font-mono text-[8px] text-muted-foreground/30">
                  <div className="w-full border-t border-dashed border-muted/10 pt-0.5">
                    {baseCurrency}{" "}
                    {formatCents(Math.round(maxTrendAmount)).toLocaleString()}
                  </div>
                  <div className="w-full border-t border-dashed border-muted/10 pt-0.5">
                    {baseCurrency}{" "}
                    {formatCents(
                      Math.round(maxTrendAmount / 2)
                    ).toLocaleString()}
                  </div>
                  <div className="w-full"></div>
                </div>

                {spentInsights.trend.length === 0 ? (
                  <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                    No transactions recorded for this range.
                  </div>
                ) : (
                  spentInsights.trend.map((pt, ptIdx) => {
                    const ptTotal = Number(pt.amountInBase)
                    const heightPercent =
                      ptTotal > 0 ? (ptTotal / maxTrendAmount) * 100 : 0

                    return (
                      <div
                        key={ptIdx}
                        className="group relative flex h-full flex-1 flex-col items-center justify-end"
                      >
                        {/* Vertical Bar Stack */}
                        <div
                          className="flex w-full flex-col justify-end overflow-hidden rounded-t-md bg-muted/5 transition-all duration-350 hover:ring-2 hover:ring-primary/20 sm:w-8"
                          style={{ height: `${heightPercent}%` }}
                        >
                          {pt.contributions.map((c, cIdx) => {
                            const cPercent =
                              ptTotal > 0
                                ? (Number(c.amountInBase) / ptTotal) * 100
                                : 0
                            const color = getBudgetColors(c.budgetColor)

                            return (
                              <div
                                key={cIdx}
                                className={cn(
                                  "relative w-full cursor-pointer border-t border-background/25 transition-all first:border-0 hover:brightness-110 active:scale-[0.98]",
                                  color.bar
                                )}
                                style={{
                                  height: `${cPercent}%`,
                                }}
                                onMouseEnter={() =>
                                  setActiveTooltip({
                                    label: pt.label,
                                    total: ptTotal,
                                    contrib: {
                                      budgetName: c.budgetName,
                                      budgetColor: c.budgetColor,
                                      amountInBase: Number(c.amountInBase),
                                      amountInLocal: Number(c.amountInLocal),
                                      localCurrency: c.localCurrency,
                                      percentage: c.contributionPercentage,
                                    },
                                  })
                                }
                                onMouseLeave={() => setActiveTooltip(null)}
                              />
                            )
                          })}
                        </div>

                        {/* X-Axis labels */}
                        <span className="mt-1.5 text-[8px] font-bold text-muted-foreground transition-colors duration-200 group-hover:text-foreground">
                          {pt.label}
                        </span>
                      </div>
                    )
                  })
                )}
              </div>

              {/* Dynamic Interactive Tooltip Card */}
              {activeTooltip && (
                <div className="absolute top-0 right-0 z-20 w-56 animate-in rounded-xl border border-muted/15 bg-card p-3 shadow-lg duration-150 zoom-in-95 sm:right-2">
                  <div className="mb-1.5 flex items-center gap-1">
                    <CalendarIcon className="h-2.5 w-2.5 text-primary" />
                    <span className="text-[8px] font-bold tracking-wide text-muted-foreground uppercase">
                      {activeTooltip.label} • {baseCurrency}{" "}
                      {formatCents(activeTooltip.total).toFixed(2)}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "h-2 w-2 rounded-full",
                          getBudgetColors(activeTooltip.contrib.budgetColor).bar
                        )}
                      />
                      <span className="text-[10px] font-bold text-foreground">
                        {activeTooltip.contrib.budgetName}
                      </span>
                    </div>
                    <div className="space-y-0.5 pl-3.5 text-[9px]">
                      <div className="flex justify-between text-muted-foreground">
                        <span>Spent:</span>
                        <span className="font-bold text-foreground">
                          {activeTooltip.contrib.localCurrency}{" "}
                          {formatCents(
                            activeTooltip.contrib.amountInLocal
                          ).toFixed(2)}
                        </span>
                      </div>
                      {activeTooltip.contrib.localCurrency !== baseCurrency && (
                        <div className="flex justify-between text-muted-foreground">
                          <span>Converted:</span>
                          <span className="font-semibold text-foreground">
                            {baseCurrency}{" "}
                            {formatCents(
                              activeTooltip.contrib.amountInBase
                            ).toFixed(2)}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between border-t border-muted/10 pt-0.5 text-muted-foreground">
                        <span>Ratio:</span>
                        <span className="font-black text-primary">
                          {activeTooltip.contrib.percentage.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom Half grid layout: 50% scrollable Budgets, 50% scrollable Top Outflows */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Budget Distributions */}
          <div className="flex flex-col rounded-3xl border border-muted/20 bg-card p-5 shadow-sm">
            <h3 className="mb-3.5 flex items-center gap-1.5 text-xs font-bold tracking-tight text-muted-foreground uppercase">
              <CoinsIcon className="h-4 w-4 text-primary" />
              Budget Allocations
            </h3>

            {spentInsights.distributions.length === 0 ? (
              <div className="flex h-[200px] items-center justify-center text-xs text-muted-foreground">
                No active budget configurations found.
              </div>
            ) : (
              <div className="max-h-[260px] scrollbar-thin space-y-2.5 overflow-y-auto pr-1.5">
                {spentInsights.distributions.map((dist) => {
                  const Icon = getBudgetIcon(dist.budgetIcon)
                  const colors = getBudgetColors(dist.budgetColor)

                  return (
                    <div
                      key={dist.budgetId}
                      className="group rounded-xl border border-muted/10 bg-muted/5 p-3 transition-all duration-300 hover:bg-muted/10"
                    >
                      <div className="mb-1.5 flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={cn(
                              "rounded-lg p-2",
                              colors.bg,
                              colors.text
                            )}
                          >
                            <Icon className="h-3.5 w-3.5" />
                          </div>
                          <div>
                            <span className="text-xs font-bold text-foreground">
                              {dist.budgetName}
                            </span>
                            <div className="text-[9px] text-muted-foreground">
                              Limit:{" "}
                              {Number(dist.limit) > 0
                                ? `${formatCents(dist.limit).toLocaleString()}`
                                : "No limit"}
                            </div>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="text-xs font-bold text-foreground">
                            {formatCents(dist.spent).toLocaleString()}
                          </span>
                          <span className="block text-[9px] text-muted-foreground">
                            {baseCurrency}{" "}
                            {formatCents(dist.spentInBase).toLocaleString()}
                          </span>
                        </div>
                      </div>

                      {/* Distribution progress bar */}
                      <div className="h-1 w-full overflow-hidden rounded-full bg-muted/20">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all duration-550",
                            colors.bar
                          )}
                          style={{
                            width: `${Math.min(dist.usagePercentage, 100)}%`,
                          }}
                        />
                      </div>
                      <div className="mt-1 flex items-center justify-between">
                        <span className="text-[8px] font-bold text-muted-foreground uppercase">
                          Usage Pacing
                        </span>
                        <span
                          className={cn("text-[8px] font-black", colors.text)}
                        >
                          {dist.usagePercentage.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Top Outflows (High value expenses) */}
          <div className="flex flex-col rounded-3xl border border-muted/20 bg-card p-5 shadow-sm">
            <h3 className="mb-3.5 flex items-center gap-1.5 text-xs font-bold tracking-tight text-muted-foreground uppercase">
              <DollarSignIcon className="h-4 w-4 text-primary" />
              Top Outflows
            </h3>

            {spentInsights.topExpenses.length === 0 ? (
              <div className="flex h-[200px] items-center justify-center text-xs text-muted-foreground">
                No purchases logged in this period.
              </div>
            ) : (
              <ScrollArea className="h-[260px]">
                <div className="space-y-3 pr-3">
                  {spentInsights.topExpenses.map((exp, idx) => (
                    <div
                      key={exp.transactionId}
                      className="flex items-center justify-between border-b border-muted/10 pb-2.5 last:border-0 last:pb-0"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-500/10 font-mono text-[9px] font-black text-rose-500">
                          #{idx + 1}
                        </div>
                        <div className="min-w-0">
                          <span className="block max-w-[150px] truncate text-xs font-semibold text-foreground sm:max-w-none">
                            {exp.description || "Unspecified Expense"}
                          </span>
                          <span className="block text-[9px] text-muted-foreground">
                            {exp.budgetName} •{" "}
                            {new Date(exp.transactionDate).toLocaleDateString(
                              undefined,
                              {
                                month: "short",
                                day: "numeric",
                                timeZone: "UTC",
                              }
                            )}
                          </span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-xs font-bold text-rose-500">
                          -{exp.currency} {formatCents(exp.amount).toFixed(2)}
                        </span>
                        {exp.currency !== baseCurrency && (
                          <span className="block text-[9px] text-muted-foreground">
                            {baseCurrency}{" "}
                            {formatCents(exp.amountInBase).toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        </div>
      </div>
    </FinancePageLayout>
  )
}
export default InsightsView
