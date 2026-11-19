import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useUrlState } from "@/lib/use-url-state"
import {
  resolveSpacePath,
  useActiveSpaceContext,
} from "@/features/space/use-space"
import { useTimezone } from "@saturn/hooks"
import { useRegisterCopilotView } from "@saturn/hooks/ai"
import { formatCents } from "@saturn/core"
import {
  useGetInsightsQuery,
  type InsightGranularity,
  useGetSettingsQuery,
} from "@saturn/api/gen/saturn/finance/v1/finance"
import {
  TrendingDownIcon,
  TrendingUp,
  DollarSignIcon,
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
import { MoneyAmount } from "@/components/ui/money-amount"
import { cn } from "@/lib/utils"
import { FinancePageLayout } from "./components/finance-page-layout"
import { FinancePeriodPicker } from "./components/finance-period-picker"
import { resolveFinancePeriodBounds } from "./period-bounds"
import {
  CashFlowSvgChart,
  StackedBreakdownSvgChart,
  type InspectedSegmentInfo,
  type MergedTrendPoint,
} from "./components/insights-charts"
import { getBudgetColors, getBudgetIcon, getPeriodDateBounds } from "./utils"

const INSIGHTS_URL_DEFAULTS = {
  period: "this_month" as string,
  month: "" as string,
  from: "" as string,
  to: "" as string,
  granularity: "" as string,
  tab: "CASH_FLOW" as string,
}

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
  const tz = useTimezone()
  const navigate = useNavigate()
  const { data: settings } = useGetSettingsQuery({}, { enabled: !!spaceId })

  const [urlState, setUrlState] = useUrlState(INSIGHTS_URL_DEFAULTS)

  const activeTab: "OUTFLOWS" | "INFLOWS" | "CASH_FLOW" =
    urlState.tab === "OUTFLOWS" || urlState.tab === "INFLOWS"
      ? urlState.tab
      : "CASH_FLOW"

  const now = tz.now()
  const periodBounds = useMemo(
    () =>
      resolveFinancePeriodBounds(
        {
          period: urlState.period,
          month: urlState.month,
          dateFrom: urlState.from,
          dateTo: urlState.to,
        },
        now,
        tz.timezone,
        tz.locale
      ),
    [
      urlState.period,
      urlState.month,
      urlState.from,
      urlState.to,
      now,
      tz.timezone,
      tz.locale,
    ]
  )

  const granularity: InsightGranularity =
    urlState.granularity === "DAILY" ||
    urlState.granularity === "WEEKLY" ||
    urlState.granularity === "MONTHLY" ||
    urlState.granularity === "YEARLY"
      ? urlState.granularity
      : periodBounds.recommendedGranularity

  const {
    data: insightsData,
    isLoading: insightsLoading,
    isPending: insightsPending,
    error: insightsError,
  } = useGetInsightsQuery(
    {
      granularity,
      startDate: periodBounds.startISO,
      endDate: periodBounds.endISO,
    },
    {
      enabled: !!spaceId && !!settings,
      refetchOnWindowFocus: false,
    }
  )

  useRegisterCopilotView({
    viewId: "finance.insights",
    title: "Financial Insights",
    suggestions: [
      "Summarize my cash flow and biggest spending drivers for this period",
      "Where am I spending more compared to my budget limits?",
      "How can I improve my savings rate based on these trends?",
    ],
  })

  const [inspectedIndex, setInspectedIndex] = useState<number | null>(null)
  const [inspectedSegment, setInspectedSegment] =
    useState<InspectedSegmentInfo | null>(null)

  const spentInsights = insightsData?.spent
  const incomeInsights = insightsData?.income
  const baseCurrency = settings?.baseCurrency || "USD"

  const mergedTrend = useMemo<MergedTrendPoint[]>(() => {
    const spentTrend = spentInsights?.trend || []
    const incomeTrend = incomeInsights?.trend || []
    const pointsMap = new Map<string, MergedTrendPoint>()

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
  }, [spentInsights?.trend, incomeInsights?.trend])

  const navigateToTransactions = (params: Record<string, string>) => {
    const search = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
      if (v) search.set(k, v)
    }
    const basePath = resolveSpacePath("/finance/transactions", spaceId, true)
    const qs = search.toString()
    navigate(qs ? `${basePath}?${qs}` : basePath)
  }

  const handlePeriodDrilldown = (point: MergedTrendPoint) => {
    const bounds = getPeriodDateBounds(
      point.startDate,
      granularity,
      tz.timezone
    )
    const params: Record<string, string> = {}
    if (bounds.dateFrom) params.dateFrom = bounds.dateFrom
    if (bounds.dateTo) params.dateTo = bounds.dateTo
    if (activeTab === "OUTFLOWS") params.type = "EXPENSE"
    if (activeTab === "INFLOWS") params.type = "INCOME"
    navigateToTransactions(params)
  }

  const isQueryEnabled = !!spaceId && !!settings
  const showLoadingSpinner =
    insightsLoading || (insightsPending && isQueryEnabled)

  if (showLoadingSpinner) {
    return (
      <FinancePageLayout
        title="Insights"
        description="Financial trends, cash flow pacing, and category allocation."
        icon={TrendingUp}
      >
        <div className="flex h-[400px] items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-xs font-medium text-muted-foreground">
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
        <div className="flex h-[300px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card p-8 text-center">
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

  const activePoint =
    inspectedIndex !== null && mergedTrend[inspectedIndex]
      ? mergedTrend[inspectedIndex]
      : mergedTrend.length > 0
        ? mergedTrend[mergedTrend.length - 1]
        : null

  return (
    <FinancePageLayout
      title="Insights"
      description="Financial trends, cash flow pacing, and category allocation."
      icon={TrendingUp}
    >
      <div className="space-y-6 pb-6">
        {/* Top Controls: Stream Tabs + Period Picker */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          {/* Stream Tabs */}
          <div
            role="tablist"
            aria-label="Insights view"
            className="flex max-w-sm items-center gap-1 rounded-lg bg-muted/60 p-1"
          >
            {(
              [
                {
                  id: "CASH_FLOW",
                  label: "Cash Flow",
                  icon: Scale,
                  iconColor: "text-primary",
                },
                {
                  id: "OUTFLOWS",
                  label: "Outflows",
                  icon: TrendingDownIcon,
                  iconColor: "text-destructive",
                },
                {
                  id: "INFLOWS",
                  label: "Inflows",
                  icon: TrendingUp,
                  iconColor: "text-success",
                },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon
              const isSelected = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => {
                    setUrlState({ tab: tab.id })
                    setInspectedIndex(null)
                    setInspectedSegment(null)
                  }}
                  className={cn(
                    "flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
                    isSelected
                      ? "bg-card text-foreground shadow-2xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className={cn("size-3.5", tab.iconColor)} />
                  <span>{tab.label}</span>
                </button>
              )
            })}
          </div>

          {/* Shared Period Picker */}
          <div className="flex flex-wrap items-center gap-2">
            <FinancePeriodPicker
              value={{
                period: urlState.period,
                month: urlState.month,
                dateFrom: urlState.from,
                dateTo: urlState.to,
              }}
              onChange={(next) => {
                setUrlState({
                  period: next.period,
                  month: next.month,
                  from: next.dateFrom,
                  to: next.dateTo,
                  granularity: "",
                })
                setInspectedIndex(null)
                setInspectedSegment(null)
              }}
            />
          </div>
        </div>

        {/* Top Half split layout: 1/3 Metrics Sidebar, 2/3 SVG Chart */}
        <div className="grid gap-6 md:grid-cols-3">
          {/* 1/3 Sidebar Metrics Column */}
          {activeTab === "OUTFLOWS" && (
            <div className="flex flex-col justify-between gap-3 md:col-span-1">
              <div className="rounded-xl border border-border bg-card p-4 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">
                    Total Spent
                  </span>
                  <TrendingDownIcon className="size-4 text-destructive" />
                </div>
                <MoneyAmount
                  cents={spentInsights.totalSpent}
                  currency={baseCurrency}
                  size="lg"
                  className="mt-2 block text-foreground"
                />
              </div>

              <div className="rounded-xl border border-border bg-card p-4 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">
                    Active Limit
                  </span>
                  <LayersIcon className="size-4 text-info" />
                </div>
                <MoneyAmount
                  cents={spentInsights.totalLimit}
                  currency={baseCurrency}
                  size="lg"
                  className="mt-2 block text-foreground"
                />
              </div>

              <div className="rounded-xl border border-border bg-card p-4 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">
                    Remaining
                  </span>
                  <PercentIcon className="size-4 text-success" />
                </div>
                <MoneyAmount
                  cents={spentInsights.remainingBudget}
                  currency={baseCurrency}
                  size="lg"
                  className="mt-2 block text-foreground"
                />
              </div>

              <div className="rounded-xl border border-border bg-card p-4 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">
                    Daily Burn Rate
                  </span>
                  <FlameIcon className="size-4 text-warning" />
                </div>
                <MoneyAmount
                  cents={Math.round(spentInsights.burnRate)}
                  currency={baseCurrency}
                  size="lg"
                  className="mt-2 block text-foreground"
                />
              </div>
            </div>
          )}

          {activeTab === "INFLOWS" && (
            <div className="flex flex-col justify-between gap-3 md:col-span-1">
              <div className="rounded-xl border border-border bg-card p-4 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">
                    Total Inflow
                  </span>
                  <TrendingUp className="size-4 text-success" />
                </div>
                <MoneyAmount
                  cents={incomeInsights?.totalIncome || "0"}
                  currency={baseCurrency}
                  size="lg"
                  className="mt-2 block text-foreground"
                />
              </div>

              <div className="rounded-xl border border-border bg-card p-4 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">
                    Top Inflow Source
                  </span>
                  <CoinsIcon className="size-4 text-primary" />
                </div>
                <span className="mt-2 block truncate text-base font-semibold text-foreground">
                  {incomeInsights?.distributions?.[0]?.name || "None"}
                </span>
              </div>

              <div className="rounded-xl border border-border bg-card p-4 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">
                    Inflow Events
                  </span>
                  <LayersIcon className="size-4 text-info" />
                </div>
                <span className="mt-2 block font-mono text-lg font-semibold text-foreground tabular-nums">
                  {incomeInsights?.topIncomes?.length || 0}
                </span>
              </div>

              <div className="rounded-xl border border-border bg-card p-4 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">
                    Target Accounts
                  </span>
                  <ArrowRightLeft className="size-4 text-primary" />
                </div>
                <span className="mt-2 block font-mono text-lg font-semibold text-foreground tabular-nums">
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
          )}

          {activeTab === "CASH_FLOW" && (
            <div className="flex flex-col justify-between gap-3 md:col-span-1">
              {(() => {
                const totalIn = Number(incomeInsights?.totalIncome || 0)
                const totalOut = Number(spentInsights.totalSpent || 0)
                const netCash = totalIn - totalOut
                const savingsPct = totalIn > 0 ? (netCash / totalIn) * 100 : 0

                return (
                  <>
                    <div className="rounded-xl border border-border bg-card p-4 shadow-2xs">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">
                          Net Savings
                        </span>
                        <Scale
                          className={cn(
                            "size-4",
                            netCash >= 0 ? "text-success" : "text-destructive"
                          )}
                        />
                      </div>
                      <MoneyAmount
                        cents={netCash}
                        currency={baseCurrency}
                        showSign
                        colored
                        size="lg"
                        className="mt-2 block"
                      />
                    </div>

                    <div className="rounded-xl border border-border bg-card p-4 shadow-2xs">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">
                          Savings Rate
                        </span>
                        <PercentIcon className="size-4 text-primary" />
                      </div>
                      <span
                        className={cn(
                          "mt-2 block font-mono text-lg font-semibold tabular-nums",
                          savingsPct >= 0 ? "text-success" : "text-destructive"
                        )}
                      >
                        {savingsPct.toFixed(1)}%
                      </span>
                    </div>

                    <div className="rounded-xl border border-border bg-card p-4 shadow-2xs">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">
                          Total Inflow
                        </span>
                        <ArrowUpRight className="size-4 text-success" />
                      </div>
                      <MoneyAmount
                        cents={totalIn}
                        currency={baseCurrency}
                        size="lg"
                        className="mt-2 block text-foreground"
                      />
                    </div>

                    <div className="rounded-xl border border-border bg-card p-4 shadow-2xs">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">
                          Total Outflow
                        </span>
                        <ArrowDownLeft className="size-4 text-destructive" />
                      </div>
                      <MoneyAmount
                        cents={totalOut}
                        currency={baseCurrency}
                        size="lg"
                        className="mt-2 block text-foreground"
                      />
                    </div>
                  </>
                )
              })()}
            </div>
          )}

          {/* 2/3 Trend SVG Chart Column */}
          <div className="flex flex-col justify-between rounded-xl border border-border bg-card p-5 shadow-2xs md:col-span-2">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  {activeTab === "OUTFLOWS" && (
                    <>
                      <TrendingDownIcon className="size-4 text-destructive" />
                      <span>Outflow Trend</span>
                    </>
                  )}
                  {activeTab === "INFLOWS" && (
                    <>
                      <TrendingUp className="size-4 text-success" />
                      <span>Inflow Trend</span>
                    </>
                  )}
                  {activeTab === "CASH_FLOW" && (
                    <>
                      <Scale className="size-4 text-primary" />
                      <span>Cash Flow Comparison</span>
                    </>
                  )}
                </h3>
              </div>

              {/* Granularity Selector */}
              <div
                role="group"
                aria-label="Chart granularity"
                className="flex items-center self-start rounded-lg bg-muted/60 p-0.5 sm:self-auto"
              >
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
                    type="button"
                    aria-pressed={granularity === mode}
                    onClick={() => setUrlState({ granularity: mode })}
                    className={cn(
                      "cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                      granularity === mode
                        ? "bg-card text-foreground shadow-2xs"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {mode.charAt(0) + mode.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Pinned Interactive Inspection Strip */}
            <div
              aria-live="polite"
              className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-xs"
            >
              {activeTab === "CASH_FLOW" && activePoint ? (
                <>
                  <span className="font-medium text-foreground">
                    {activePoint.label}
                  </span>
                  <div className="flex flex-wrap items-center gap-4 font-mono tabular-nums">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <span className="size-2 rounded-full bg-success" />
                      In:{" "}
                      <strong className="font-medium text-foreground">
                        {tz.formatMoney(activePoint.inflowTotal, baseCurrency)}
                      </strong>
                    </span>
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <span className="size-2 rounded-full bg-destructive" />
                      Out:{" "}
                      <strong className="font-medium text-foreground">
                        {tz.formatMoney(activePoint.outflowTotal, baseCurrency)}
                      </strong>
                    </span>
                    <span className="text-muted-foreground">
                      Net:{" "}
                      <strong
                        className={cn(
                          "font-medium",
                          activePoint.inflowTotal - activePoint.outflowTotal >=
                            0
                            ? "text-success"
                            : "text-destructive"
                        )}
                      >
                        {tz.formatMoney(
                          activePoint.inflowTotal - activePoint.outflowTotal,
                          baseCurrency,
                          { showSign: true }
                        )}
                      </strong>
                    </span>
                  </div>
                </>
              ) : inspectedSegment ? (
                <>
                  <div className="flex items-center gap-2">
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: inspectedSegment.colorHex }}
                    />
                    <span className="font-medium text-foreground">
                      {inspectedSegment.periodLabel} · {inspectedSegment.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 font-mono tabular-nums">
                    <span className="font-medium text-foreground">
                      {tz.formatMoney(
                        inspectedSegment.amountInBase,
                        baseCurrency
                      )}
                    </span>
                    {inspectedSegment.localCurrency !== baseCurrency && (
                      <span className="text-muted-foreground">
                        (
                        {tz.formatMoney(
                          inspectedSegment.amountInLocal,
                          inspectedSegment.localCurrency
                        )}
                        )
                      </span>
                    )}
                    <span className="text-primary">
                      {inspectedSegment.percentage.toFixed(1)}%
                    </span>
                  </div>
                </>
              ) : activePoint ? (
                <>
                  <span className="font-medium text-foreground">
                    {activePoint.label}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-medium text-foreground tabular-nums">
                      {tz.formatMoney(
                        activeTab === "OUTFLOWS"
                          ? activePoint.outflowTotal
                          : activePoint.inflowTotal,
                        baseCurrency
                      )}
                    </span>
                    <span className="text-muted-foreground">
                      Click or press Enter on a bar to filter ledger
                    </span>
                  </div>
                </>
              ) : (
                <span className="text-muted-foreground">
                  No period data available
                </span>
              )}
            </div>

            {/* Native Accessible SVG Chart */}
            <div className="mt-4">
              {activeTab === "CASH_FLOW" ? (
                <CashFlowSvgChart
                  points={mergedTrend}
                  baseCurrency={baseCurrency}
                  activeIndex={inspectedIndex}
                  onInspectIndex={setInspectedIndex}
                  onSelectPeriod={handlePeriodDrilldown}
                />
              ) : (
                <StackedBreakdownSvgChart
                  mode={activeTab}
                  points={mergedTrend}
                  baseCurrency={baseCurrency}
                  activeIndex={inspectedIndex}
                  onInspectIndex={setInspectedIndex}
                  onInspectSegment={setInspectedSegment}
                  onSelectPeriod={handlePeriodDrilldown}
                />
              )}
            </div>
          </div>
        </div>

        {/* Bottom Half Distributions & Lists */}
        {activeTab === "OUTFLOWS" && (
          <div className="grid gap-6 md:grid-cols-2">
            {/* Budget Allocations */}
            <div className="flex flex-col rounded-xl border border-border bg-card p-5 shadow-2xs">
              <h3 className="mb-3.5 flex items-center gap-2 text-sm font-semibold text-foreground">
                <CoinsIcon className="size-4 text-primary" />
                <span>Budget Allocations</span>
              </h3>

              {spentInsights.distributions.length === 0 ? (
                <div className="flex h-[200px] items-center justify-center text-xs text-muted-foreground">
                  No active budget configurations found.
                </div>
              ) : (
                <ScrollArea className="h-[260px]">
                  <div className="space-y-2.5 pr-3">
                    {spentInsights.distributions.map((dist) => {
                      const Icon = getBudgetIcon(dist.budgetIcon)
                      const colors = getBudgetColors(dist.budgetColor)
                      const isOver = dist.usagePercentage >= 100
                      const isNear =
                        dist.usagePercentage >= 85 && dist.usagePercentage < 100
                      const barColor = isOver
                        ? "bg-destructive"
                        : isNear
                          ? "bg-warning"
                          : colors.bar
                      const textColor = isOver
                        ? "text-destructive"
                        : isNear
                          ? "text-warning"
                          : colors.text

                      return (
                        <button
                          key={dist.budgetId}
                          type="button"
                          onClick={() =>
                            navigateToTransactions({
                              type: "EXPENSE",
                              budgetId: dist.budgetId,
                              dateFrom: periodBounds.ymdFrom,
                              dateTo: periodBounds.ymdTo,
                            })
                          }
                          className="group block w-full cursor-pointer rounded-xl border border-border/70 bg-muted/20 p-3 text-left transition-colors hover:border-foreground/20 hover:bg-muted/40"
                        >
                          <div className="mb-1.5 flex items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-2.5">
                              <div
                                className={cn(
                                  "rounded-lg border p-2",
                                  colors.bg,
                                  colors.border,
                                  isOver
                                    ? "border-destructive/20 text-destructive"
                                    : isNear
                                      ? "border-warning/20 text-warning"
                                      : colors.text
                                )}
                              >
                                <Icon className="size-3.5" />
                              </div>
                              <div className="min-w-0">
                                <span className="block truncate text-xs font-semibold text-foreground group-hover:text-primary">
                                  {dist.budgetName}
                                </span>
                                <span className="block text-[11px] text-muted-foreground">
                                  Limit:{" "}
                                  {Number(dist.limit) > 0
                                    ? formatCents(dist.limit).toLocaleString()
                                    : "No limit"}
                                </span>
                              </div>
                            </div>

                            <div className="shrink-0 text-right font-mono tabular-nums">
                              <span
                                className={cn(
                                  "block text-xs font-semibold",
                                  isOver
                                    ? "text-destructive"
                                    : isNear
                                      ? "text-warning"
                                      : "text-foreground"
                                )}
                              >
                                {formatCents(dist.spent).toLocaleString()}
                              </span>
                              <span className="block text-[11px] text-muted-foreground">
                                {tz.formatMoney(dist.spentInBase, baseCurrency)}
                              </span>
                            </div>
                          </div>

                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all duration-500",
                                barColor
                              )}
                              style={{
                                width: `${Math.min(dist.usagePercentage, 100)}%`,
                              }}
                            />
                          </div>
                          <div className="mt-1.5 flex items-center justify-between text-[11px]">
                            <span className="text-muted-foreground">
                              Usage pacing
                            </span>
                            <span
                              className={cn(
                                "font-mono font-medium tabular-nums",
                                textColor
                              )}
                            >
                              {dist.usagePercentage.toFixed(1)}%
                            </span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </ScrollArea>
              )}
            </div>

            {/* Top Outflows */}
            <div className="flex flex-col rounded-xl border border-border bg-card p-5 shadow-2xs">
              <h3 className="mb-3.5 flex items-center gap-2 text-sm font-semibold text-foreground">
                <DollarSignIcon className="size-4 text-primary" />
                <span>Top Outflows</span>
              </h3>

              {spentInsights.topExpenses.length === 0 ? (
                <div className="flex h-[200px] items-center justify-center text-xs text-muted-foreground">
                  No purchases logged in this period.
                </div>
              ) : (
                <ScrollArea className="h-[260px]">
                  <div className="divide-y divide-border/60 pr-3">
                    {spentInsights.topExpenses.map((exp, idx) => (
                      <button
                        key={exp.transactionId}
                        type="button"
                        onClick={() =>
                          navigateToTransactions({
                            type: "EXPENSE",
                            q: exp.description || "",
                            dateFrom: periodBounds.ymdFrom,
                            dateTo: periodBounds.ymdTo,
                          })
                        }
                        className="flex w-full cursor-pointer items-center justify-between gap-3 py-2.5 text-left transition-colors first:pt-0 last:pb-0 hover:bg-muted/30"
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-destructive/10 font-mono text-[11px] font-medium text-destructive">
                            #{idx + 1}
                          </div>
                          <div className="min-w-0">
                            <span className="block truncate text-xs font-medium text-foreground">
                              {exp.description || "Unspecified Expense"}
                            </span>
                            <span className="block text-[11px] text-muted-foreground">
                              {exp.budgetName} ·{" "}
                              {tz.format(exp.transactionDate, {
                                month: "short",
                                day: "numeric",
                              })}
                            </span>
                          </div>
                        </div>

                        <div className="shrink-0 text-right">
                          <MoneyAmount
                            cents={-Math.abs(Number(exp.amount || 0))}
                            currency={exp.currency}
                            showSign
                            colored
                            size="sm"
                            className="block font-medium"
                          />
                          {exp.currency !== baseCurrency && (
                            <MoneyAmount
                              cents={exp.amountInBase}
                              currency={baseCurrency}
                              size="sm"
                              className="block text-[11px] text-muted-foreground"
                            />
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          </div>
        )}

        {activeTab === "INFLOWS" && (
          <div className="grid gap-6 md:grid-cols-2">
            {/* Income Sources */}
            <div className="flex flex-col rounded-xl border border-border bg-card p-5 shadow-2xs">
              <h3 className="mb-3.5 flex items-center gap-2 text-sm font-semibold text-foreground">
                <CoinsIcon className="size-4 text-success" />
                <span>Income Sources Breakdown</span>
              </h3>

              {!incomeInsights || incomeInsights.distributions.length === 0 ? (
                <div className="flex h-[200px] items-center justify-center text-xs text-muted-foreground">
                  No income distribution logged.
                </div>
              ) : (
                <ScrollArea className="h-[260px]">
                  <div className="space-y-2.5 pr-3">
                    {incomeInsights.distributions.map((source, idx) => {
                      const color = getAccountColor(idx)
                      return (
                        <button
                          key={source.name}
                          type="button"
                          onClick={() =>
                            navigateToTransactions({
                              type: "INCOME",
                              q: source.name,
                              dateFrom: periodBounds.ymdFrom,
                              dateTo: periodBounds.ymdTo,
                            })
                          }
                          className="group block w-full cursor-pointer rounded-xl border border-border/70 bg-muted/20 p-3 text-left transition-colors hover:border-foreground/20 hover:bg-muted/40"
                        >
                          <div className="mb-1.5 flex items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-2.5">
                              <div
                                className={cn(
                                  "rounded-lg p-2",
                                  color.bg,
                                  color.text
                                )}
                              >
                                <ArrowUpRight className="size-3.5" />
                              </div>
                              <span className="truncate text-xs font-semibold text-foreground group-hover:text-primary">
                                {source.name}
                              </span>
                            </div>

                            <MoneyAmount
                              cents={source.amount}
                              currency={baseCurrency}
                              size="sm"
                              className="shrink-0 font-semibold text-success"
                            />
                          </div>

                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all duration-500",
                                color.bar
                              )}
                              style={{
                                width: `${Math.min(source.percentage, 100)}%`,
                              }}
                            />
                          </div>
                          <div className="mt-1.5 flex items-center justify-between text-[11px]">
                            <span className="text-muted-foreground">
                              Contribution
                            </span>
                            <span
                              className={cn(
                                "font-mono font-medium tabular-nums",
                                color.text
                              )}
                            >
                              {source.percentage.toFixed(1)}%
                            </span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </ScrollArea>
              )}
            </div>

            {/* Top Inflows */}
            <div className="flex flex-col rounded-xl border border-border bg-card p-5 shadow-2xs">
              <h3 className="mb-3.5 flex items-center gap-2 text-sm font-semibold text-foreground">
                <DollarSignIcon className="size-4 text-success" />
                <span>Top Inflows</span>
              </h3>

              {!incomeInsights || incomeInsights.topIncomes.length === 0 ? (
                <div className="flex h-[200px] items-center justify-center text-xs text-muted-foreground">
                  No income entries logged.
                </div>
              ) : (
                <ScrollArea className="h-[260px]">
                  <div className="divide-y divide-border/60 pr-3">
                    {incomeInsights.topIncomes.map((inc, idx) => (
                      <button
                        key={inc.transactionId}
                        type="button"
                        onClick={() =>
                          navigateToTransactions({
                            type: "INCOME",
                            q: inc.description || "",
                            dateFrom: periodBounds.ymdFrom,
                            dateTo: periodBounds.ymdTo,
                          })
                        }
                        className="flex w-full cursor-pointer items-center justify-between gap-3 py-2.5 text-left transition-colors first:pt-0 last:pb-0 hover:bg-muted/30"
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-success/10 font-mono text-[11px] font-medium text-success">
                            #{idx + 1}
                          </div>
                          <div className="min-w-0">
                            <span className="block truncate text-xs font-medium text-foreground">
                              {inc.description || "Unspecified Income"}
                            </span>
                            <span className="block text-[11px] text-muted-foreground">
                              {tz.format(inc.transactionDate, {
                                month: "short",
                                day: "numeric",
                              })}
                            </span>
                          </div>
                        </div>

                        <div className="shrink-0 text-right">
                          <MoneyAmount
                            cents={Math.abs(Number(inc.amount || 0))}
                            currency={inc.currency}
                            showSign
                            colored
                            size="sm"
                            className="block font-medium"
                          />
                          {inc.currency !== baseCurrency && (
                            <MoneyAmount
                              cents={inc.amountInBase}
                              currency={baseCurrency}
                              size="sm"
                              className="block text-[11px] text-muted-foreground"
                            />
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          </div>
        )}

        {activeTab === "CASH_FLOW" && (
          <div className="grid gap-6 md:grid-cols-2">
            {/* Recent Inflows */}
            <div className="flex flex-col rounded-xl border border-border bg-card p-5 shadow-2xs">
              <h3 className="mb-3.5 flex items-center gap-2 text-sm font-semibold text-foreground">
                <ArrowUpRight className="size-4 text-success" />
                <span>Recent Inflows</span>
              </h3>
              {!incomeInsights || incomeInsights.topIncomes.length === 0 ? (
                <div className="flex h-[200px] items-center justify-center text-xs text-muted-foreground">
                  No inflow entries logged.
                </div>
              ) : (
                <ScrollArea className="h-[260px]">
                  <div className="divide-y divide-border/60 pr-3">
                    {incomeInsights.topIncomes.map((inc) => (
                      <button
                        key={inc.transactionId}
                        type="button"
                        onClick={() =>
                          navigateToTransactions({
                            type: "INCOME",
                            q: inc.description || "",
                            dateFrom: periodBounds.ymdFrom,
                            dateTo: periodBounds.ymdTo,
                          })
                        }
                        className="flex w-full cursor-pointer items-center justify-between gap-3 py-2.5 text-left transition-colors first:pt-0 last:pb-0 hover:bg-muted/30"
                      >
                        <div className="min-w-0">
                          <span className="block truncate text-xs font-medium text-foreground">
                            {inc.description || "Unspecified Income"}
                          </span>
                          <span className="block text-[11px] text-muted-foreground">
                            {tz.format(inc.transactionDate, {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        </div>
                        <MoneyAmount
                          cents={Math.abs(Number(inc.amount || 0))}
                          currency={inc.currency}
                          showSign
                          colored
                          size="sm"
                          className="shrink-0 font-medium"
                        />
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>

            {/* Recent Outflows */}
            <div className="flex flex-col rounded-xl border border-border bg-card p-5 shadow-2xs">
              <h3 className="mb-3.5 flex items-center gap-2 text-sm font-semibold text-foreground">
                <ArrowDownLeft className="size-4 text-destructive" />
                <span>Recent Outflows</span>
              </h3>
              {spentInsights.topExpenses.length === 0 ? (
                <div className="flex h-[200px] items-center justify-center text-xs text-muted-foreground">
                  No purchases logged in this period.
                </div>
              ) : (
                <ScrollArea className="h-[260px]">
                  <div className="divide-y divide-border/60 pr-3">
                    {spentInsights.topExpenses.map((exp) => (
                      <button
                        key={exp.transactionId}
                        type="button"
                        onClick={() =>
                          navigateToTransactions({
                            type: "EXPENSE",
                            q: exp.description || "",
                            dateFrom: periodBounds.ymdFrom,
                            dateTo: periodBounds.ymdTo,
                          })
                        }
                        className="flex w-full cursor-pointer items-center justify-between gap-3 py-2.5 text-left transition-colors first:pt-0 last:pb-0 hover:bg-muted/30"
                      >
                        <div className="min-w-0">
                          <span className="block truncate text-xs font-medium text-foreground">
                            {exp.description || "Unspecified Expense"}
                          </span>
                          <span className="block text-[11px] text-muted-foreground">
                            {exp.budgetName} ·{" "}
                            {tz.format(exp.transactionDate, {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        </div>
                        <MoneyAmount
                          cents={-Math.abs(Number(exp.amount || 0))}
                          currency={exp.currency}
                          showSign
                          colored
                          size="sm"
                          className="shrink-0 font-medium"
                        />
                      </button>
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
