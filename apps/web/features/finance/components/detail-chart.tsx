import { useId, type ElementType, type ReactNode, useState } from "react"
import { chartGeometry, type DetailChartPoint } from "@saturn/core"
import { Skeleton } from "@/components/ui/skeleton"
import { useI18n, useTimezone } from "@saturn/hooks"
export function DetailChart({
  points,
  title,
  currency,
  bars = false,
  stepped = false,
  activeDate,
  onSelect,
  loading,
  icon: Icon,
  headerExtra,
  toolbar,
  valueLabel,
  comparisonLabel,
  ceilingLabel,
  accent = "var(--primary)",
}: {
  points: DetailChartPoint[]
  loading?: boolean
  icon?: ElementType
  toolbar?: ReactNode
  headerExtra?: ReactNode
  valueLabel?: string
  comparisonLabel?: string
  ceilingLabel?: string
  title: string
  currency?: string
  stepped?: boolean
  bars?: boolean
  activeDate?: string
  onSelect?: (date: string) => void
  accent?: string
}) {
  const { t } = useI18n()
  const gradient = useId()
  const tz = useTimezone(),
    [inspected, setInspected] = useState<number | null>(null),
    observed = points.findLastIndex((p) => p.value != null),
    defaultIndex = observed < 0 ? points.length - 1 : observed,
    active =
      inspected !== null && inspected < points.length
        ? inspected
        : defaultIndex,
    cashFlow = bars && !onSelect,
    p = points[active],
    g = chartGeometry(points, bars, stepped)
  const formatValue = (v: number, series: number) =>
    tz.formatMoney(cashFlow && series === 1 ? Math.abs(v) : v, currency)
  const compact = new Intl.NumberFormat(tz.locale, {
    notation: "compact",
    ...(currency ? { style: "currency", currency } : {}),
    maximumFractionDigits: 1,
  })
  return (
    <figure className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-5 shadow-2xs">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <figcaption className="flex items-center gap-2 text-sm font-semibold text-foreground">
          {Icon && <Icon className="size-4 text-primary" />}
          {title}
        </figcaption>
        {headerExtra}
      </div>
      {toolbar}
      {p && (
        <output
          aria-live="polite"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-xs"
        >
          <span className="font-medium text-foreground">
            {tz.format(p.date)}
          </span>
          <span className="flex flex-wrap gap-3">
            {[p.value, p.comparison, p.ceiling].map(
              (v, i) =>
                v != null && (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1.5 text-muted-foreground"
                  >
                    <span
                      className="size-2 rounded-full"
                      style={{
                        backgroundColor: [
                          bars && p.ceiling != null && v > p.ceiling
                            ? "var(--destructive)"
                            : cashFlow
                              ? "var(--success)"
                              : accent,
                          bars
                            ? "var(--destructive)"
                            : "var(--muted-foreground)",
                          "var(--info)",
                        ][i],
                      }}
                    />
                    {[valueLabel, comparisonLabel, ceilingLabel][i]}{" "}
                    <strong className="font-mono font-medium text-foreground tabular-nums">
                      {formatValue(v, i)}
                    </strong>
                  </span>
                )
            )}
          </span>
        </output>
      )}
      {loading ? (
        <div role="status">
          <span className="sr-only">{t("common.loading")}</span>
          <Skeleton className="h-44 w-full" />
        </div>
      ) : (
        points.length > 0 && (
          <svg
            viewBox="-75 0 680 170"
            className="h-[220px] w-full overflow-visible select-none"
            onMouseLeave={() => setInspected(null)}
            role="group"
            aria-label={title}
          >
            {g.ticks.map((t) => (
              <text
                key={t}
                x={4}
                y={g.y(t) + 3}
                textAnchor="end"
                className="fill-muted-foreground font-mono tabular-nums"
                fontSize={11}
                fill="var(--muted-foreground)"
              >
                {compact.format(
                  t / (currency === "JPY" || currency === "KRW" ? 1 : 100)
                )}
              </text>
            ))}
            {points.length > 0 && (
              <>
                <text
                  x={12}
                  y={160}
                  fill="var(--muted-foreground)"
                  fontSize={11}
                >
                  {tz.format(points[0].date)}
                </text>
                <text
                  x={590}
                  y={160}
                  textAnchor="end"
                  fill="var(--muted-foreground)"
                  fontSize={11}
                >
                  {tz.format(points[points.length - 1].date)}
                </text>
              </>
            )}
            {g.ticks.map((t) => (
              <line
                key={t}
                x1="10"
                x2="590"
                y1={g.y(t)}
                y2={g.y(t)}
                stroke="var(--border)"
                strokeDasharray={t === 0 ? undefined : "3 3"}
                strokeOpacity={t === 0 ? 1 : 0.65}
              />
            ))}
            <defs>
              <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={accent} stopOpacity={0.22} />
                <stop offset="100%" stopColor={accent} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            {p && (
              <rect
                x={g.left(active)}
                width={g.right(active) - g.left(active)}
                y={10}
                height={130}
                fill="var(--muted)"
                fillOpacity={0.35}
              />
            )}
            {!bars && <path d={g.area} fill={`url(#${gradient})`} />}
            {!bars && (
              <path
                d={g.path("value")}
                fill="none"
                stroke={accent}
                strokeWidth="2.5"
              />
            )}
            {(!bars || onSelect) && (
              <path
                d={g.path("comparison")}
                fill="none"
                stroke="var(--muted-foreground)"
                strokeDasharray="5 4"
              />
            )}
            <path
              d={g.path("ceiling")}
              fill="none"
              stroke="var(--info)"
              strokeDasharray="2 4"
              strokeOpacity={0.8}
            />
            {g.marker && <circle {...g.marker} r={4} fill={accent} />}
            {points.map((p, i) => (
              <g key={p.date}>
                {bars &&
                  [p.value, p.comparison].map(
                    (v, k) =>
                      v != null && (
                        <rect
                          key={k}
                          opacity={
                            onSelect && activeDate && p.date !== activeDate
                              ? 0.55
                              : 1
                          }
                          stroke={
                            onSelect && activeDate === p.date
                              ? "var(--foreground)"
                              : undefined
                          }
                          rx={3}
                          x={g.x(i) - g.width / 2}
                          width={g.width}
                          y={Math.min(g.y(0), g.y(v))}
                          height={Math.abs(g.y(v) - g.y(0))}
                          fill={
                            v < 0 || (p.ceiling != null && v > p.ceiling)
                              ? "var(--destructive)"
                              : cashFlow
                                ? "var(--success)"
                                : accent
                          }
                        />
                      )
                  )}
                <rect
                  x={g.left(i)}
                  width={g.right(i) - g.left(i)}
                  height="150"
                  fill="transparent"
                  tabIndex={i === active ? 0 : -1}
                  className={onSelect ? "cursor-pointer" : undefined}
                  aria-pressed={
                    onSelect && activeDate ? activeDate === p.date : undefined
                  }
                  role={onSelect ? "button" : "img"}
                  aria-label={`${tz.format(p.date)}: ${[p.value, p.comparison, p.ceiling].flatMap((v, j) => (v == null ? [] : [[[valueLabel, comparisonLabel, ceilingLabel][j], formatValue(v, j)].filter(Boolean).join(" ")])).join(", ")}`}
                  onMouseEnter={() => setInspected(i)}
                  onFocus={() => setInspected(i)}
                  onClick={() => onSelect?.(p.date)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                      e.preventDefault()
                      const next = Math.max(
                        0,
                        Math.min(
                          points.length - 1,
                          i + (e.key === "ArrowRight" ? 1 : -1)
                        )
                      )
                      const strips =
                        e.currentTarget.ownerSVGElement?.querySelectorAll<SVGRectElement>(
                          "rect[tabindex]"
                        )
                      strips?.item(next)?.focus()
                    }
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      onSelect?.(p.date)
                    }
                  }}
                />
              </g>
            ))}
            {p && (
              <g pointerEvents="none">
                <line
                  x1={g.x(active)}
                  x2={g.x(active)}
                  y1={10}
                  y2={140}
                  stroke="var(--muted-foreground)"
                  strokeOpacity={0.55}
                />
                {!bars && p.value != null && (
                  <circle
                    cx={g.x(active)}
                    cy={g.y(p.value)}
                    r={4}
                    fill="var(--card)"
                    stroke={accent}
                    strokeWidth={2}
                  />
                )}
              </g>
            )}
          </svg>
        )
      )}
    </figure>
  )
}
