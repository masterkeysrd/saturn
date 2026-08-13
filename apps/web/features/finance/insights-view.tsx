import { useState } from "react"
import { useActiveSpaceContext } from "@/features/space/use-space"
import {
  useGetInsightsQuery,
  type InsightGranularity,
  useGetFinanceSettingsQuery,
} from "@/gen/saturn/finance/v1/finance"
import { FinancePageLayout } from "./components/finance-page-layout"
import {
  formatCents,
  formatAmount,
  getBudgetColors,
  getBudgetIcon,
} from "./utils"
import { cn } from "@/lib/utils"
import {
  TrendingDownIcon,
  TrendingUp,
  DollarSignIcon,
  CalendarIcon,
  PercentIcon,
  FlameIcon,
  LayersIcon,
  CoinsIcon,
  Loader2,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowRightLeft,
  Scale,
} from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"

const ACCOUNT_COLORS = [
  { bar: "bg-teal-500", text: "text-teal-500", bg: "bg-teal-500/10" },
  { bar: "bg-sky-500", text: "text-sky-500", bg: "bg-sky-500/10" },
  { bar: "bg-emerald-500", text: "text-emerald-500", bg: "bg-emerald-500/10" },
  { bar: "bg-indigo-500", text: "text-indigo-500", bg: "bg-indigo-500/10" },
  { bar: "bg-violet-500", text: "text-violet-500", bg: "bg-violet-500/10" },
  { bar: "bg-amber-500", text: "text-amber-500", bg: "bg-amber-500/10" },
]

function getAccountColor(index: number) {
  return ACCOUNT_COLORS[index % ACCOUNT_COLORS.length]
}

export function InsightsView() {
  const { spaceId } = useActiveSpaceContext()
  const { data: settings } = useGetFinanceSettingsQuery(
    {},
    { enabled: !!spaceId }
  )
  const [granularity, setGranularity] = useState<InsightGranularity>("MONTHLY")
  const [activeTab, setActiveTab] = useState<
    "OUTFLOWS" | "INFLOWS" | "CASH_FLOW"
  >("CASH_FLOW")

  // Fetch unified spent and income insights from the backend
  const {
    data: insightsData,
    isLoading: insightsLoading,
    isPending: insightsPending,
    error: insightsError,
  } = useGetInsightsQuery(
    {
      granularity,
      startDate: "",
      endDate: "",
    },
    {
      enabled: !!spaceId && !!settings,
      refetchOnWindowFocus: false,
    }
  )

  const spentInsights = insightsData?.spent
  const incomeInsights = insightsData?.income
  const baseCurrency = settings?.baseCurrency || "USD"

  // Active hover states for tooltips
  const [activeTooltip, setActiveTooltip] = useState<{
    label: string
    total: number
    title: string
    colorClass: string
    amountInBase: number
    amountInLocal: number
    localCurrency: string
    percentage: number
  } | null>(null)

  const [activeCashFlowTooltip, setActiveCashFlowTooltip] = useState<{
    label: string
    inflow: number
    outflow: number
    net: number
    savingsRate: number
  } | null>(null)

  // Track loading status
  const isQueryEnabled = !!spaceId && !!settings
  const showLoadingSpinner =
    insightsLoading || (insightsPending && isQueryEnabled)

  if (showLoadingSpinner) {
    return (
      <FinancePageLayout
        title="Insights"
        description="Loading financial insights"
        icon={TrendingUp}
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
        icon={TrendingUp}
      >
        <div className="flex min-h-[400px] items-center justify-center" />
      </FinancePageLayout>
    )
  }

  if (insightsError || (isQueryEnabled && !spentInsights && !insightsPending)) {
    return (
      <FinancePageLayout
        title="Insights"
        description="Unable to load insights"
        icon={TrendingUp}
      >
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

  // Merge spent and income trends chronologically to guarantee no missing intervals
  const mergedTrend = (() => {
    const spentTrend = spentInsights.trend || []
    const incomeTrend = incomeInsights?.trend || []

    const pointsMap = new Map<
      string,
      {
        label: string
        startDate: string
        outflowTotal: number
        inflowTotal: number
        spentContributions: any[]
        incomeContributions: any[]
      }
    >()

    for (const pt of spentTrend) {
      pointsMap.set(pt.startDate, {
        label: pt.label,
        startDate: pt.startDate,
        outflowTotal: Number(pt.amountInBase),
        inflowTotal: 0,
        spentContributions: pt.contributions,
        incomeContributions: [],
      })
    }

    for (const pt of incomeTrend) {
      const existing = pointsMap.get(pt.startDate)
      if (existing) {
        existing.inflowTotal = Number(pt.amountInBase)
        existing.incomeContributions = pt.contributions
      } else {
        pointsMap.set(pt.startDate, {
          label: pt.label,
          startDate: pt.startDate,
          outflowTotal: 0,
          inflowTotal: Number(pt.amountInBase),
          spentContributions: [],
          incomeContributions: pt.contributions,
        })
      }
    }

    return Array.from(pointsMap.values()).sort(
      (a, b) =>
        new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
    )
  })()

  // Calculate chart max ranges based on active mode using merged trends
  let maxTrendAmount = 100
  if (activeTab === "OUTFLOWS") {
    maxTrendAmount = Math.max(...mergedTrend.map((pt) => pt.outflowTotal), 100)
  } else if (activeTab === "INFLOWS") {
    maxTrendAmount = Math.max(...mergedTrend.map((pt) => pt.inflowTotal), 100)
  } else if (activeTab === "CASH_FLOW") {
    maxTrendAmount = Math.max(
      ...mergedTrend.map((pt) => Math.max(pt.outflowTotal, pt.inflowTotal)),
      100
    )
  }

  return (
    <FinancePageLayout
      title="Insights"
      description="Financial trends and overview"
      icon={TrendingUp}
    >
      <div className="animate-in space-y-6 pb-6 duration-500 fade-in">
        {/* Navigation Selector Tabs at the Top */}
        <div className="flex max-w-sm items-center gap-1 self-start rounded-2xl border border-border/40 bg-muted/20 p-1">
          <button
            onClick={() => {
              setActiveTab("CASH_FLOW")
              setActiveTooltip(null)
              setActiveCashFlowTooltip(null)
            }}
            className={cn(
              "flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-bold transition-all duration-300",
              activeTab === "CASH_FLOW"
                ? "border border-border/40 bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Scale className="h-3.5 w-3.5 text-indigo-500" />
            Cash Flow
          </button>
          <button
            onClick={() => {
              setActiveTab("OUTFLOWS")
              setActiveTooltip(null)
              setActiveCashFlowTooltip(null)
            }}
            className={cn(
              "flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-bold transition-all duration-300",
              activeTab === "OUTFLOWS"
                ? "border border-border/40 bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <TrendingDownIcon className="h-3.5 w-3.5 text-rose-500" />
            Outflows
          </button>
          <button
            onClick={() => {
              setActiveTab("INFLOWS")
              setActiveTooltip(null)
              setActiveCashFlowTooltip(null)
            }}
            className={cn(
              "flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-bold transition-all duration-300",
              activeTab === "INFLOWS"
                ? "border border-border/40 bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
            Inflows
          </button>
        </div>

        {/* Top Half split layout: 1/3 Metrics Sidebar, 2/3 Stacked Trend Chart */}
        <div className="grid gap-6 md:grid-cols-3">
          {/* 1/3 Sidebar Metrics Column */}
          {activeTab === "OUTFLOWS" && (
            <div className="flex flex-col justify-between gap-3 md:col-span-1">
              <div className="relative overflow-hidden rounded-2xl border border-muted/15 bg-card/60 p-4 shadow-sm transition-all duration-300 hover:shadow">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                    Total Spent
                  </span>
                  <TrendingDownIcon className="h-3.5 w-3.5 text-rose-500" />
                </div>
                <div className="mt-2.5 flex items-baseline gap-1">
                  <span className="text-xl font-bold tracking-tight">
                    {formatAmount(spentInsights.totalSpent, baseCurrency)}
                  </span>
                </div>
              </div>

              <div className="relative overflow-hidden rounded-2xl border border-muted/15 bg-card/60 p-4 shadow-sm transition-all duration-300 hover:shadow">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                    Active Limit
                  </span>
                  <LayersIcon className="h-3.5 w-3.5 text-blue-500" />
                </div>
                <div className="mt-2.5 flex items-baseline gap-1">
                  <span className="text-xl font-bold tracking-tight">
                    {formatAmount(spentInsights.totalLimit, baseCurrency)}
                  </span>
                </div>
              </div>

              <div className="relative overflow-hidden rounded-2xl border border-muted/15 bg-card/60 p-4 shadow-sm transition-all duration-300 hover:shadow">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                    Remaining
                  </span>
                  <PercentIcon className="h-3.5 w-3.5 text-emerald-500" />
                </div>
                <div className="mt-2.5 flex items-baseline gap-1">
                  <span className="text-xl font-bold tracking-tight">
                    {formatAmount(spentInsights.remainingBudget, baseCurrency)}
                  </span>
                </div>
              </div>

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
          )}

          {activeTab === "INFLOWS" && (
            <div className="flex flex-col justify-between gap-3 md:col-span-1">
              <div className="relative overflow-hidden rounded-2xl border border-muted/15 bg-card/60 p-4 shadow-sm transition-all duration-300 hover:shadow">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                    Total Inflow
                  </span>
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                </div>
                <div className="mt-2.5 flex items-baseline gap-1">
                  <span className="text-xl font-bold tracking-tight">
                    {formatAmount(
                      incomeInsights?.totalIncome || "0",
                      baseCurrency
                    )}
                  </span>
                </div>
              </div>

              <div className="relative overflow-hidden rounded-2xl border border-muted/15 bg-card/60 p-4 shadow-sm transition-all duration-300 hover:shadow">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                    Top Inflow Source
                  </span>
                  <CoinsIcon className="h-3.5 w-3.5 text-teal-400" />
                </div>
                <div className="mt-2.5 flex w-full min-w-0 items-baseline gap-1">
                  <span className="max-w-[200px] truncate text-base font-bold tracking-tight">
                    {incomeInsights?.distributions?.[0]?.name || "None"}
                  </span>
                </div>
              </div>

              <div className="relative overflow-hidden rounded-2xl border border-muted/15 bg-card/60 p-4 shadow-sm transition-all duration-300 hover:shadow">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                    Inflow Events
                  </span>
                  <LayersIcon className="h-3.5 w-3.5 text-sky-400" />
                </div>
                <div className="mt-2.5 flex items-baseline gap-1">
                  <span className="text-xl font-bold tracking-tight">
                    {incomeInsights?.topIncomes?.length || 0}
                  </span>
                </div>
              </div>

              <div className="relative overflow-hidden rounded-2xl border border-muted/15 bg-card/60 p-4 shadow-sm transition-all duration-300 hover:shadow">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                    Target Accounts
                  </span>
                  <ArrowRightLeft className="h-3.5 w-3.5 text-indigo-400" />
                </div>
                <div className="mt-2.5 flex items-baseline gap-1">
                  <span className="text-xl font-bold tracking-tight">
                    {
                      Array.from(
                        new Set(
                          (incomeInsights?.trend || []).flatMap((pt) =>
                            pt.contributions.map((c) => c.accountId)
                          )
                        )
                      ).length
                    }
                  </span>
                </div>
              </div>
            </div>
          )}

          {activeTab === "CASH_FLOW" && (
            <div className="flex flex-col justify-between gap-3 md:col-span-1">
              {(() => {
                const totalIn = incomeInsights?.totalIncome || 0
                const totalOut = spentInsights.totalSpent
                const netCash = Number(totalIn) - Number(totalOut)
                const savingsPct =
                  Number(totalIn) > 0
                    ? (float64(netCash) / float64(totalIn)) * 100
                    : 0

                function float64(val: number | string) {
                  return typeof val === "string" ? parseFloat(val) : val
                }

                return (
                  <>
                    <div className="relative overflow-hidden rounded-2xl border border-muted/15 bg-card/60 p-4 shadow-sm transition-all duration-300 hover:shadow">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                          Net Savings
                        </span>
                        <Scale
                          className={cn(
                            "h-3.5 w-3.5",
                            netCash >= 0 ? "text-emerald-500" : "text-rose-500"
                          )}
                        />
                      </div>
                      <div className="mt-2.5 flex items-baseline gap-1">
                        <span
                          className={cn(
                            "text-xl font-bold tracking-tight",
                            netCash >= 0 ? "text-emerald-400" : "text-rose-400"
                          )}
                        >
                          {netCash >= 0 ? "+" : ""}
                          {formatAmount(netCash.toString(), baseCurrency)}
                        </span>
                      </div>
                    </div>

                    <div className="relative overflow-hidden rounded-2xl border border-muted/15 bg-card/60 p-4 shadow-sm transition-all duration-300 hover:shadow">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                          Savings Rate
                        </span>
                        <PercentIcon className="h-3.5 w-3.5 text-primary" />
                      </div>
                      <div className="mt-2.5 flex items-baseline gap-1">
                        <span
                          className={cn(
                            "text-xl font-bold tracking-tight",
                            savingsPct >= 0
                              ? "text-emerald-400"
                              : "text-rose-400"
                          )}
                        >
                          {savingsPct.toFixed(1)}%
                        </span>
                      </div>
                    </div>

                    <div className="relative overflow-hidden rounded-2xl border border-muted/15 bg-card/60 p-4 shadow-sm transition-all duration-300 hover:shadow">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                          Summary Inflow
                        </span>
                        <ArrowUpRight className="h-3.5 w-3.5 text-emerald-400" />
                      </div>
                      <div className="mt-2.5 flex items-baseline gap-1">
                        <span className="text-xl font-bold tracking-tight">
                          {formatAmount(totalIn.toString(), baseCurrency)}
                        </span>
                      </div>
                    </div>

                    <div className="relative overflow-hidden rounded-2xl border border-muted/15 bg-card/60 p-4 shadow-sm transition-all duration-300 hover:shadow">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                          Summary Outflow
                        </span>
                        <ArrowDownLeft className="h-3.5 w-3.5 text-rose-400" />
                      </div>
                      <div className="mt-2.5 flex items-baseline gap-1">
                        <span className="text-xl font-bold tracking-tight">
                          {formatAmount(totalOut.toString(), baseCurrency)}
                        </span>
                      </div>
                    </div>
                  </>
                )
              })()}
            </div>
          )}

          {/* 2/3 Trend Chart Column */}
          <div className="flex flex-col justify-between rounded-3xl border border-muted/20 bg-card p-5 shadow-sm md:col-span-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="flex items-center gap-1.5 text-xs font-bold tracking-tight text-muted-foreground uppercase">
                  {activeTab === "OUTFLOWS" && (
                    <>
                      <TrendingDownIcon className="h-3.5 w-3.5 text-rose-400" />
                      Outflow Trend
                    </>
                  )}
                  {activeTab === "INFLOWS" && (
                    <>
                      <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
                      Inflow Trend
                    </>
                  )}
                  {activeTab === "CASH_FLOW" && (
                    <>
                      <Scale className="h-3.5 w-3.5 text-indigo-400" />
                      Cash Flow Comparison
                    </>
                  )}
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

            {/* Custom Interactive Charts */}
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

                {activeTab === "OUTFLOWS" &&
                  (mergedTrend.length === 0 ? (
                    <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                      No outflow transactions recorded for this range.
                    </div>
                  ) : (
                    mergedTrend.map((pt, ptIdx) => {
                      const ptTotal = pt.outflowTotal
                      const heightPercent =
                        ptTotal > 0 ? (ptTotal / maxTrendAmount) * 100 : 0

                      return (
                        <div
                          key={ptIdx}
                          className="group relative flex h-full flex-1 flex-col items-center justify-end"
                        >
                          <div
                            className="flex w-full flex-col justify-end overflow-hidden rounded-t-md bg-muted/5 transition-all duration-350 hover:ring-2 hover:ring-primary/20 sm:w-8"
                            style={{ height: `${heightPercent}%` }}
                          >
                            {pt.spentContributions.map((c, cIdx) => {
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
                                      title: c.budgetName,
                                      colorClass: color.bar,
                                      amountInBase: Number(c.amountInBase),
                                      amountInLocal: Number(c.amountInLocal),
                                      localCurrency: c.localCurrency,
                                      percentage: c.contributionPercentage,
                                    })
                                  }
                                  onMouseLeave={() => setActiveTooltip(null)}
                                />
                              )
                            })}
                          </div>
                          <span className="mt-1.5 text-[8px] font-bold text-muted-foreground transition-colors duration-200 group-hover:text-foreground">
                            {pt.label}
                          </span>
                        </div>
                      )
                    })
                  ))}

                {activeTab === "INFLOWS" &&
                  (mergedTrend.length === 0 ? (
                    <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                      No inflow transactions recorded for this range.
                    </div>
                  ) : (
                    mergedTrend.map((pt, ptIdx) => {
                      const ptTotal = pt.inflowTotal
                      const heightPercent =
                        ptTotal > 0 ? (ptTotal / maxTrendAmount) * 100 : 0

                      return (
                        <div
                          key={ptIdx}
                          className="group relative flex h-full flex-1 flex-col items-center justify-end"
                        >
                          <div
                            className="flex w-full flex-col justify-end overflow-hidden rounded-t-md bg-muted/5 transition-all duration-350 hover:ring-2 hover:ring-emerald-500/20 sm:w-8"
                            style={{ height: `${heightPercent}%` }}
                          >
                            {pt.incomeContributions.map((c, cIdx) => {
                              const cPercent =
                                ptTotal > 0
                                  ? (Number(c.amountInBase) / ptTotal) * 100
                                  : 0
                              const color = getAccountColor(cIdx)

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
                                      title: c.accountName,
                                      colorClass: color.bar,
                                      amountInBase: Number(c.amountInBase),
                                      amountInLocal: Number(c.amountInLocal),
                                      localCurrency: c.localCurrency,
                                      percentage:
                                        ptTotal > 0
                                          ? (Number(c.amountInBase) / ptTotal) *
                                            100
                                          : 0,
                                    })
                                  }
                                  onMouseLeave={() => setActiveTooltip(null)}
                                />
                              )
                            })}
                          </div>
                          <span className="mt-1.5 text-[8px] font-bold text-muted-foreground transition-colors duration-200 group-hover:text-foreground">
                            {pt.label}
                          </span>
                        </div>
                      )
                    })
                  ))}

                {activeTab === "CASH_FLOW" &&
                  (mergedTrend.length === 0 ? (
                    <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                      No data recorded for this range.
                    </div>
                  ) : (
                    mergedTrend.map((pt, ptIdx) => {
                      const outflowTotal = pt.outflowTotal
                      const inflowTotal = pt.inflowTotal

                      const inflowHeight = (inflowTotal / maxTrendAmount) * 100
                      const outflowHeight =
                        (outflowTotal / maxTrendAmount) * 100

                      const net = inflowTotal - outflowTotal
                      const savingsRate =
                        inflowTotal > 0 ? (net / inflowTotal) * 100 : 0

                      return (
                        <div
                          key={ptIdx}
                          className="group relative flex h-full flex-1 flex-col items-center justify-end"
                        >
                          <div className="flex h-full w-full max-w-[40px] items-end justify-center gap-1 sm:gap-1.5">
                            {/* Inflow Bar (Green) */}
                            <div
                              className="w-[10px] cursor-pointer rounded-t-sm bg-emerald-500 transition-all duration-350 hover:brightness-110 sm:w-[14px]"
                              style={{
                                height: `${Math.max(inflowHeight, 2)}%`,
                              }}
                              onMouseEnter={() =>
                                setActiveCashFlowTooltip({
                                  label: pt.label,
                                  inflow: inflowTotal,
                                  outflow: outflowTotal,
                                  net,
                                  savingsRate,
                                })
                              }
                              onMouseLeave={() =>
                                setActiveCashFlowTooltip(null)
                              }
                            />
                            {/* Outflow Bar (Rose) */}
                            <div
                              className="w-[10px] cursor-pointer rounded-t-sm bg-rose-500 transition-all duration-350 hover:brightness-110 sm:w-[14px]"
                              style={{
                                height: `${Math.max(outflowHeight, 2)}%`,
                              }}
                              onMouseEnter={() =>
                                setActiveCashFlowTooltip({
                                  label: pt.label,
                                  inflow: inflowTotal,
                                  outflow: outflowTotal,
                                  net,
                                  savingsRate,
                                })
                              }
                              onMouseLeave={() =>
                                setActiveCashFlowTooltip(null)
                              }
                            />
                          </div>
                          <span className="mt-1.5 text-[8px] font-bold text-muted-foreground transition-colors duration-200 group-hover:text-foreground">
                            {pt.label}
                          </span>
                        </div>
                      )
                    })
                  ))}
              </div>

              {/* General Interactive Tooltip Card for Single Streams */}
              {activeTooltip && (
                <div className="absolute top-0 right-0 z-20 w-56 animate-in rounded-xl border border-muted/15 bg-card p-3 shadow-lg duration-150 zoom-in-95 sm:right-2">
                  <div className="mb-1.5 flex items-center gap-1">
                    <CalendarIcon className="h-2.5 w-2.5 text-primary" />
                    <span className="text-[8px] font-bold tracking-wide text-muted-foreground uppercase">
                      {activeTooltip.label} • {baseCurrency}{" "}
                      {formatCents(activeTooltip.total).toLocaleString(
                        undefined,
                        { minimumFractionDigits: 2, maximumFractionDigits: 2 }
                      )}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "h-2 w-2 rounded-full",
                          activeTooltip.colorClass
                        )}
                      />
                      <span className="max-w-[150px] truncate text-[10px] font-bold text-foreground">
                        {activeTooltip.title}
                      </span>
                    </div>
                    <div className="space-y-0.5 pl-3.5 text-[9px]">
                      <div className="flex justify-between text-muted-foreground">
                        <span>Local:</span>
                        <span className="font-bold text-foreground">
                          {activeTooltip.localCurrency}{" "}
                          {formatCents(
                            activeTooltip.amountInLocal
                          ).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </div>
                      {activeTooltip.localCurrency !== baseCurrency && (
                        <div className="flex justify-between text-muted-foreground">
                          <span>Converted:</span>
                          <span className="font-semibold text-foreground">
                            {baseCurrency}{" "}
                            {formatCents(
                              activeTooltip.amountInBase
                            ).toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between border-t border-muted/10 pt-0.5 text-muted-foreground">
                        <span>Ratio:</span>
                        <span className="font-black text-primary">
                          {activeTooltip.percentage.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Cash Flow Interactive Tooltip Card */}
              {activeCashFlowTooltip && (
                <div className="absolute top-0 right-0 z-20 w-56 animate-in rounded-xl border border-muted/15 bg-card p-3 shadow-lg duration-150 zoom-in-95 sm:right-2">
                  <div className="mb-1.5 flex items-center gap-1">
                    <CalendarIcon className="h-2.5 w-2.5 text-indigo-400" />
                    <span className="text-[8px] font-bold tracking-wide text-muted-foreground uppercase">
                      {activeCashFlowTooltip.label} Metrics
                    </span>
                  </div>
                  <div className="space-y-1.5 text-[10px]">
                    <div className="flex justify-between text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                        Inflow:
                      </span>
                      <span className="font-bold text-foreground">
                        {formatAmount(
                          activeCashFlowTooltip.inflow.toString(),
                          baseCurrency
                        )}
                      </span>
                    </div>

                    <div className="flex justify-between text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-rose-500" />
                        Outflow:
                      </span>
                      <span className="font-bold text-foreground">
                        {formatAmount(
                          activeCashFlowTooltip.outflow.toString(),
                          baseCurrency
                        )}
                      </span>
                    </div>

                    <div className="flex justify-between border-t border-muted/10 pt-1 text-muted-foreground">
                      <span className="font-semibold">Net Cash:</span>
                      <span
                        className={cn(
                          "font-bold",
                          activeCashFlowTooltip.net >= 0
                            ? "text-emerald-400"
                            : "text-rose-400"
                        )}
                      >
                        {activeCashFlowTooltip.net >= 0 ? "+" : ""}
                        {formatAmount(
                          activeCashFlowTooltip.net.toString(),
                          baseCurrency
                        )}
                      </span>
                    </div>

                    <div className="flex justify-between text-muted-foreground">
                      <span>Savings Rate:</span>
                      <span
                        className={cn(
                          "font-black",
                          activeCashFlowTooltip.savingsRate >= 0
                            ? "text-emerald-400"
                            : "text-rose-400"
                        )}
                      >
                        {activeCashFlowTooltip.savingsRate.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom Half grid layout: Distributions and Lists */}
        {activeTab === "OUTFLOWS" && (
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
                <ScrollArea className="h-[260px]">
                  <div className="space-y-3 pr-3">
                    {spentInsights.distributions.map((dist) => {
                      const Icon = getBudgetIcon(dist.budgetIcon)
                      const colors = getBudgetColors(dist.budgetColor)

                      const isOver = dist.usagePercentage >= 100
                      const isNear =
                        dist.usagePercentage >= 85 && dist.usagePercentage < 100
                      const barColor = isOver
                        ? "bg-rose-500 animate-pulse"
                        : isNear
                          ? "bg-amber-500"
                          : colors.bar
                      const textColor = isOver
                        ? "text-rose-500 font-extrabold"
                        : isNear
                          ? "text-amber-500 font-extrabold"
                          : colors.text

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
                                  isOver
                                    ? "border border-rose-500/20 text-rose-500"
                                    : isNear
                                      ? "border border-amber-500/20 text-amber-500"
                                      : colors.text
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
                              <span
                                className={cn(
                                  "text-xs font-bold",
                                  isOver
                                    ? "text-rose-500"
                                    : isNear
                                      ? "text-amber-500"
                                      : "text-foreground"
                                )}
                              >
                                {formatCents(dist.spent).toLocaleString()}
                              </span>
                              <span className="block text-[9px] text-muted-foreground">
                                {baseCurrency}{" "}
                                {formatCents(dist.spentInBase).toLocaleString()}
                              </span>
                            </div>
                          </div>

                          <div className="h-1 w-full overflow-hidden rounded-full bg-muted/20">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all duration-550",
                                barColor
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
                            <span className={cn("text-[8px]", textColor)}>
                              {dist.usagePercentage.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </ScrollArea>
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
                            -{exp.currency}{" "}
                            {formatCents(exp.amount).toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                          {exp.currency !== baseCurrency && (
                            <span className="block text-[9px] text-muted-foreground">
                              {baseCurrency}{" "}
                              {formatCents(exp.amountInBase).toLocaleString(
                                undefined,
                                {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                }
                              )}
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
        )}

        {activeTab === "INFLOWS" && (
          <div className="grid gap-6 md:grid-cols-2">
            {/* Income Sources breakdown */}
            <div className="flex flex-col rounded-3xl border border-muted/20 bg-card p-5 shadow-sm">
              <h3 className="mb-3.5 flex items-center gap-1.5 text-xs font-bold tracking-tight text-muted-foreground uppercase">
                <CoinsIcon className="h-4 w-4 text-emerald-500" />
                Income Sources Breakdown
              </h3>

              {!incomeInsights || incomeInsights.distributions.length === 0 ? (
                <div className="flex h-[200px] items-center justify-center text-xs text-muted-foreground">
                  No income distribution logged.
                </div>
              ) : (
                <ScrollArea className="h-[260px]">
                  <div className="space-y-3 pr-3">
                    {incomeInsights.distributions.map((source, idx) => {
                      const color = getAccountColor(idx)
                      return (
                        <div
                          key={source.name}
                          className="group rounded-xl border border-muted/10 bg-muted/5 p-3 transition-all duration-300 hover:bg-muted/10"
                        >
                          <div className="mb-1.5 flex items-center justify-between">
                            <div className="flex min-w-0 items-center gap-2.5">
                              <div
                                className={cn(
                                  "rounded-lg p-2",
                                  color.bg,
                                  color.text
                                )}
                              >
                                <ArrowUpRight className="h-3.5 w-3.5" />
                              </div>
                              <div className="min-w-0">
                                <span className="block max-w-[180px] truncate text-xs font-bold text-foreground">
                                  {source.name}
                                </span>
                              </div>
                            </div>

                            <div className="shrink-0 text-right">
                              <span className="text-xs font-bold text-emerald-400">
                                {formatAmount(
                                  source.amount.toString(),
                                  baseCurrency
                                )}
                              </span>
                            </div>
                          </div>

                          <div className="h-1 w-full overflow-hidden rounded-full bg-muted/20">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all duration-550",
                                color.bar
                              )}
                              style={{
                                width: `${Math.min(source.percentage, 100)}%`,
                              }}
                            />
                          </div>
                          <div className="mt-1 flex items-center justify-between">
                            <span className="text-[8px] font-bold text-muted-foreground uppercase">
                              Contribution
                            </span>
                            <span
                              className={cn("text-[8px] font-bold", color.text)}
                            >
                              {source.percentage.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </ScrollArea>
              )}
            </div>

            {/* Top Inflows (High value incomes) */}
            <div className="flex flex-col rounded-3xl border border-muted/20 bg-card p-5 shadow-sm">
              <h3 className="mb-3.5 flex items-center gap-1.5 text-xs font-bold tracking-tight text-muted-foreground uppercase">
                <DollarSignIcon className="h-4 w-4 text-emerald-500" />
                Top Inflows
              </h3>

              {!incomeInsights || incomeInsights.topIncomes.length === 0 ? (
                <div className="flex h-[200px] items-center justify-center text-xs text-muted-foreground">
                  No income entries logged.
                </div>
              ) : (
                <ScrollArea className="h-[260px]">
                  <div className="space-y-3 pr-3">
                    {incomeInsights.topIncomes.map((inc, idx) => (
                      <div
                        key={inc.transactionId}
                        className="flex items-center justify-between border-b border-muted/10 pb-2.5 last:border-0 last:pb-0"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/10 font-mono text-[9px] font-black text-emerald-500">
                            #{idx + 1}
                          </div>
                          <div className="min-w-0">
                            <span className="block max-w-[150px] truncate text-xs font-semibold text-foreground sm:max-w-none">
                              {inc.description || "Unspecified Income"}
                            </span>
                            <span className="block text-[9px] text-muted-foreground">
                              {new Date(inc.transactionDate).toLocaleDateString(
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
                          <span className="text-xs font-bold text-emerald-500">
                            +{inc.currency}{" "}
                            {formatCents(inc.amount).toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                          {inc.currency !== baseCurrency && (
                            <span className="block text-[9px] text-muted-foreground">
                              {baseCurrency}{" "}
                              {formatCents(inc.amountInBase).toLocaleString(
                                undefined,
                                {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                }
                              )}
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
        )}

        {activeTab === "CASH_FLOW" && (
          <div className="grid gap-6 md:grid-cols-2">
            {/* Top Inflows List in Cash Flow view */}
            <div className="flex flex-col rounded-3xl border border-muted/20 bg-card p-5 shadow-sm">
              <h3 className="mb-3.5 flex items-center gap-1.5 text-xs font-bold tracking-tight text-muted-foreground uppercase">
                <ArrowUpRight className="h-4 w-4 text-emerald-500" />
                Recent Inflows
              </h3>
              {!incomeInsights || incomeInsights.topIncomes.length === 0 ? (
                <div className="flex h-[200px] items-center justify-center text-xs text-muted-foreground">
                  No inflow entries logged.
                </div>
              ) : (
                <ScrollArea className="h-[260px]">
                  <div className="space-y-3 pr-3">
                    {incomeInsights.topIncomes.map((inc) => (
                      <div
                        key={inc.transactionId}
                        className="flex items-center justify-between border-b border-muted/10 pb-2.5 last:border-0 last:pb-0"
                      >
                        <div>
                          <span className="block max-w-[200px] truncate text-xs font-semibold text-foreground sm:max-w-none">
                            {inc.description || "Unspecified Income"}
                          </span>
                          <span className="block text-[9px] text-muted-foreground">
                            {new Date(inc.transactionDate).toLocaleDateString(
                              undefined,
                              {
                                month: "short",
                                day: "numeric",
                                timeZone: "UTC",
                              }
                            )}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-bold text-emerald-500">
                            +{inc.currency}{" "}
                            {formatCents(inc.amount).toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>

            {/* Top Outflows List in Cash Flow view */}
            <div className="flex flex-col rounded-3xl border border-muted/20 bg-card p-5 shadow-sm">
              <h3 className="mb-3.5 flex items-center gap-1.5 text-xs font-bold tracking-tight text-muted-foreground uppercase">
                <ArrowDownLeft className="h-4 w-4 text-rose-500" />
                Recent Outflows
              </h3>
              {spentInsights.topExpenses.length === 0 ? (
                <div className="flex h-[200px] items-center justify-center text-xs text-muted-foreground">
                  No purchases logged in this period.
                </div>
              ) : (
                <ScrollArea className="h-[260px]">
                  <div className="space-y-3 pr-3">
                    {spentInsights.topExpenses.map((exp) => (
                      <div
                        key={exp.transactionId}
                        className="flex items-center justify-between border-b border-muted/10 pb-2.5 last:border-0 last:pb-0"
                      >
                        <div>
                          <span className="block max-w-[200px] truncate text-xs font-semibold text-foreground sm:max-w-none">
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
                        <div className="text-right">
                          <span className="text-xs font-bold text-rose-500">
                            -{exp.currency}{" "}
                            {formatCents(exp.amount).toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          </div>
        )}
      </div>
    </FinancePageLayout>
  )
}
export default InsightsView
