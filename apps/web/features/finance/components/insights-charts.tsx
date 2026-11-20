import { useRef } from "react"
import type {
  IncomeInsights_AccountContribution,
  SpentInsights_BudgetContribution,
} from "@saturn/api/gen/saturn/finance/v1/finance"
import { useI18n, useTimezone } from "@saturn/hooks"
import { AVAILABLE_COLORS, getColorHex } from "@saturn/core"
import { cn } from "@/lib/utils"

export interface MergedTrendPoint {
  label: string
  startDate: string
  outflowTotal: number
  inflowTotal: number
  spentContributions: SpentInsights_BudgetContribution[]
  incomeContributions: IncomeInsights_AccountContribution[]
}

export interface InspectedSegmentInfo {
  periodLabel: string
  periodTotal: number
  title: string
  colorHex: string
  amountInBase: number
  amountInLocal: number
  localCurrency: string
  percentage: number
}

const CHART_WIDTH = 680
const CHART_HEIGHT = 240
const PAD_LEFT = 76
const PAD_RIGHT = 16
const PAD_TOP = 16
const PAD_BOTTOM = 30
const PLOT_WIDTH = CHART_WIDTH - PAD_LEFT - PAD_RIGHT
const PLOT_HEIGHT = CHART_HEIGHT - PAD_TOP - PAD_BOTTOM

function formatCompactAxisCents(
  cents: number,
  formatMoney: (
    c: number,
    cur?: string,
    opts?: { minimumFractionDigits?: number; maximumFractionDigits?: number }
  ) => string,
  currency: string
): string {
  return formatMoney(Math.round(cents), currency, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}

export interface CashFlowSvgChartProps {
  points: MergedTrendPoint[]
  baseCurrency: string
  activeIndex: number | null
  onInspectIndex: (index: number | null) => void
  onSelectPeriod: (point: MergedTrendPoint) => void
}

export function CashFlowSvgChart({
  points,
  baseCurrency,
  activeIndex,
  onInspectIndex,
  onSelectPeriod,
}: CashFlowSvgChartProps) {
  const tz = useTimezone()
  const { t } = useI18n()
  const groupRefs = useRef<(SVGGElement | null)[]>([])

  if (points.length === 0) {
    return (
      <div className="flex h-[240px] items-center justify-center text-xs text-muted-foreground">
        {t("finance.insights.chart.noCashFlow")}
      </div>
    )
  }

  const nets = points.map((pt) => pt.inflowTotal - pt.outflowTotal)
  const maxVal = Math.max(
    ...points.map((pt) => Math.max(pt.inflowTotal, pt.outflowTotal)),
    100
  )
  const minVal = Math.min(0, ...nets)
  const span = Math.max(maxVal - minVal, 100)

  const yForValue = (val: number) =>
    PAD_TOP + ((maxVal - val) / span) * PLOT_HEIGHT

  const zeroY = yForValue(0)
  const slotWidth = PLOT_WIDTH / points.length
  const barWidth = Math.min(Math.max(slotWidth * 0.28, 8), 22)
  const barGap = 4

  const yTicks =
    minVal < 0 ? [maxVal, maxVal / 2, 0, minVal] : [maxVal, maxVal / 2, 0]

  const netLinePoints = points
    .map((pt, idx) => {
      const cx = PAD_LEFT + idx * slotWidth + slotWidth / 2
      const cy = yForValue(pt.inflowTotal - pt.outflowTotal)
      return `${cx.toFixed(1)},${cy.toFixed(1)}`
    })
    .join(" ")

  const labelStep = points.length > 12 ? Math.ceil(points.length / 8) : 1

  return (
    <svg
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      role="img"
      aria-label={t("finance.insights.chart.cashFlowAria")}
      className="h-[240px] w-full overflow-visible select-none"
    >
      {/* Horizontal gridlines & Y-axis labels */}
      {yTicks.map((tick, idx) => {
        const y = yForValue(tick)
        const isZero = tick === 0
        return (
          <g key={idx}>
            <line
              x1={PAD_LEFT}
              x2={CHART_WIDTH - PAD_RIGHT}
              y1={y}
              y2={y}
              stroke="var(--border)"
              strokeDasharray={isZero ? undefined : "3 3"}
              strokeOpacity={isZero ? 0.9 : 0.65}
            />
            <text
              x={PAD_LEFT - 8}
              y={y + 4}
              textAnchor="end"
              fontSize={11}
              className="fill-muted-foreground font-mono tabular-nums"
            >
              {formatCompactAxisCents(tick, tz.formatMoney, baseCurrency)}
            </text>
          </g>
        )
      })}

      {/* Period bars */}
      {points.map((pt, idx) => {
        const slotX = PAD_LEFT + idx * slotWidth
        const centerX = slotX + slotWidth / 2
        const inflowTop = yForValue(pt.inflowTotal)
        const inflowH = Math.max(zeroY - inflowTop, pt.inflowTotal > 0 ? 3 : 0)
        const outflowTop = yForValue(pt.outflowTotal)
        const outflowH = Math.max(
          zeroY - outflowTop,
          pt.outflowTotal > 0 ? 3 : 0
        )
        const isActive = activeIndex === idx
        const net = pt.inflowTotal - pt.outflowTotal

        return (
          <g
            key={pt.startDate || idx}
            ref={(el) => {
              groupRefs.current[idx] = el
            }}
            role="button"
            tabIndex={0}
            aria-label={t("finance.insights.chart.cashFlowBarAria", {
              label: pt.label,
              inflow: tz.formatMoney(pt.inflowTotal, baseCurrency),
              outflow: tz.formatMoney(pt.outflowTotal, baseCurrency),
              net: tz.formatMoney(net, baseCurrency, { showSign: true }),
            })}
            onMouseEnter={() => onInspectIndex(idx)}
            onMouseLeave={() => onInspectIndex(null)}
            onFocus={() => onInspectIndex(idx)}
            onClick={() => onSelectPeriod(pt)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") {
                e.preventDefault()
                const next = Math.min(idx + 1, points.length - 1)
                groupRefs.current[next]?.focus()
                onInspectIndex(next)
              } else if (e.key === "ArrowLeft") {
                e.preventDefault()
                const prev = Math.max(idx - 1, 0)
                groupRefs.current[prev]?.focus()
                onInspectIndex(prev)
              } else if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                onSelectPeriod(pt)
              }
            }}
            className="cursor-pointer outline-none"
          >
            {/* Hover / Focus highlight column */}
            <rect
              x={slotX + 2}
              y={PAD_TOP}
              width={Math.max(slotWidth - 4, 8)}
              height={PLOT_HEIGHT}
              rx={6}
              fill="var(--muted)"
              fillOpacity={isActive ? 0.55 : 0}
            />

            {/* Inflow Bar */}
            <rect
              x={centerX - barWidth - barGap / 2}
              y={inflowTop}
              width={barWidth}
              height={inflowH}
              rx={3}
              fill="var(--success)"
              fillOpacity={isActive ? 1 : 0.85}
            />

            {/* Outflow Bar */}
            <rect
              x={centerX + barGap / 2}
              y={outflowTop}
              width={barWidth}
              height={outflowH}
              rx={3}
              fill="var(--destructive)"
              fillOpacity={isActive ? 1 : 0.85}
            />

            {/* X-axis label */}
            {(idx % labelStep === 0 || isActive) && (
              <text
                x={centerX}
                y={CHART_HEIGHT - 8}
                textAnchor="middle"
                fontSize={11}
                className={cn(
                  "font-medium",
                  isActive ? "fill-foreground" : "fill-muted-foreground"
                )}
              >
                {pt.label}
              </text>
            )}
          </g>
        )
      })}

      {/* Net Cash Flow Trend Polyline & Dots */}
      {points.length > 1 && (
        <polyline
          fill="none"
          stroke="var(--primary)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          points={netLinePoints}
          className="pointer-events-none"
        />
      )}
      {points.map((pt, idx) => {
        const cx = PAD_LEFT + idx * slotWidth + slotWidth / 2
        const cy = yForValue(pt.inflowTotal - pt.outflowTotal)
        const isActive = activeIndex === idx
        return (
          <circle
            key={`net-${pt.startDate || idx}`}
            cx={cx}
            cy={cy}
            r={isActive ? 4.5 : 3}
            fill="var(--card)"
            stroke="var(--primary)"
            strokeWidth={2}
            className="pointer-events-none"
          />
        )
      })}
    </svg>
  )
}

export interface StackedBreakdownSvgChartProps {
  mode: "OUTFLOWS" | "INFLOWS"
  points: MergedTrendPoint[]
  baseCurrency: string
  activeIndex: number | null
  onInspectIndex: (index: number | null) => void
  onInspectSegment: (segment: InspectedSegmentInfo | null) => void
  onSelectPeriod: (point: MergedTrendPoint) => void
}

export function StackedBreakdownSvgChart({
  mode,
  points,
  baseCurrency,
  activeIndex,
  onInspectIndex,
  onInspectSegment,
  onSelectPeriod,
}: StackedBreakdownSvgChartProps) {
  const tz = useTimezone()
  const { t } = useI18n()
  const groupRefs = useRef<(SVGGElement | null)[]>([])

  if (points.length === 0) {
    return (
      <div className="flex h-[240px] items-center justify-center text-xs text-muted-foreground">
        {mode === "OUTFLOWS"
          ? t("finance.insights.chart.noOutflow")
          : t("finance.insights.chart.noInflow")}
      </div>
    )
  }

  const maxVal = Math.max(
    ...points.map((pt) =>
      mode === "OUTFLOWS" ? pt.outflowTotal : pt.inflowTotal
    ),
    100
  )

  const yForValue = (val: number) =>
    PAD_TOP + ((maxVal - val) / maxVal) * PLOT_HEIGHT
  const baseY = PAD_TOP + PLOT_HEIGHT

  const slotWidth = PLOT_WIDTH / points.length
  const barWidth = Math.min(Math.max(slotWidth * 0.45, 12), 36)
  const yTicks = [maxVal, maxVal / 2, 0]
  const labelStep = points.length > 12 ? Math.ceil(points.length / 8) : 1

  return (
    <svg
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      role="img"
      aria-label={
        mode === "OUTFLOWS"
          ? t("finance.insights.chart.outflowAria")
          : t("finance.insights.chart.inflowAria")
      }
      className="h-[240px] w-full overflow-visible select-none"
    >
      {/* Gridlines */}
      {yTicks.map((tick, idx) => {
        const y = yForValue(tick)
        return (
          <g key={idx}>
            <line
              x1={PAD_LEFT}
              x2={CHART_WIDTH - PAD_RIGHT}
              y1={y}
              y2={y}
              stroke="var(--border)"
              strokeDasharray={tick === 0 ? undefined : "3 3"}
              strokeOpacity={tick === 0 ? 0.9 : 0.65}
            />
            <text
              x={PAD_LEFT - 8}
              y={y + 4}
              textAnchor="end"
              fontSize={11}
              className="fill-muted-foreground font-mono tabular-nums"
            >
              {formatCompactAxisCents(tick, tz.formatMoney, baseCurrency)}
            </text>
          </g>
        )
      })}

      {/* Stacked Period Bars */}
      {points.map((pt, idx) => {
        const slotX = PAD_LEFT + idx * slotWidth
        const centerX = slotX + slotWidth / 2
        const barX = centerX - barWidth / 2
        const ptTotal = mode === "OUTFLOWS" ? pt.outflowTotal : pt.inflowTotal
        const isActive = activeIndex === idx

        const segments =
          mode === "OUTFLOWS"
            ? pt.spentContributions.map((c) => ({
                key: c.budgetId || c.budgetName,
                title: c.budgetName,
                colorHex: getColorHex(c.budgetColor),
                amountInBase: Number(c.amountInBase),
                amountInLocal: Number(c.amountInLocal),
                localCurrency: c.localCurrency,
                percentage: c.contributionPercentage,
              }))
            : pt.incomeContributions.map((c, cIdx) => {
                const paletteKey =
                  AVAILABLE_COLORS[cIdx % AVAILABLE_COLORS.length]
                return {
                  key: c.accountId || c.accountName,
                  title: c.accountName,
                  colorHex: getColorHex(paletteKey),
                  amountInBase: Number(c.amountInBase),
                  amountInLocal: Number(c.amountInLocal),
                  localCurrency: c.localCurrency,
                  percentage:
                    ptTotal > 0 ? (Number(c.amountInBase) / ptTotal) * 100 : 0,
                }
              })

        let cursorY = baseY

        return (
          <g
            key={pt.startDate || idx}
            ref={(el) => {
              groupRefs.current[idx] = el
            }}
            role="button"
            tabIndex={0}
            aria-label={t("finance.insights.chart.stackedBarAria", {
              label: pt.label,
              total: tz.formatMoney(ptTotal, baseCurrency),
            })}
            onMouseEnter={() => onInspectIndex(idx)}
            onMouseLeave={() => {
              onInspectIndex(null)
              onInspectSegment(null)
            }}
            onFocus={() => onInspectIndex(idx)}
            onClick={() => onSelectPeriod(pt)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") {
                e.preventDefault()
                const next = Math.min(idx + 1, points.length - 1)
                groupRefs.current[next]?.focus()
                onInspectIndex(next)
              } else if (e.key === "ArrowLeft") {
                e.preventDefault()
                const prev = Math.max(idx - 1, 0)
                groupRefs.current[prev]?.focus()
                onInspectIndex(prev)
              } else if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                onSelectPeriod(pt)
              }
            }}
            className="cursor-pointer outline-none"
          >
            <rect
              x={slotX + 2}
              y={PAD_TOP}
              width={Math.max(slotWidth - 4, 8)}
              height={PLOT_HEIGHT}
              rx={6}
              fill="var(--muted)"
              fillOpacity={isActive ? 0.55 : 0}
            />

            {segments.map((seg) => {
              const segH =
                seg.amountInBase > 0
                  ? Math.max((seg.amountInBase / maxVal) * PLOT_HEIGHT, 2)
                  : 0
              cursorY -= segH
              const segY = cursorY

              return (
                <rect
                  key={seg.key}
                  x={barX}
                  y={segY}
                  width={barWidth}
                  height={segH}
                  rx={2}
                  fill={seg.colorHex}
                  fillOpacity={isActive ? 1 : 0.88}
                  stroke="var(--card)"
                  strokeWidth={1}
                  onMouseEnter={() =>
                    onInspectSegment({
                      periodLabel: pt.label,
                      periodTotal: ptTotal,
                      title: seg.title,
                      colorHex: seg.colorHex,
                      amountInBase: seg.amountInBase,
                      amountInLocal: seg.amountInLocal,
                      localCurrency: seg.localCurrency,
                      percentage: seg.percentage,
                    })
                  }
                />
              )
            })}

            {(idx % labelStep === 0 || isActive) && (
              <text
                x={centerX}
                y={CHART_HEIGHT - 8}
                textAnchor="middle"
                fontSize={11}
                className={cn(
                  "font-medium",
                  isActive ? "fill-foreground" : "fill-muted-foreground"
                )}
              >
                {pt.label}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
