import { useState, type ReactNode } from "react"
import { View, Text, StyleSheet } from "react-native"
import Svg, { Path, Line, Rect, G, Circle } from "react-native-svg"
import { chartGeometry, type DetailChartPoint } from "@saturn/core"
import { useTimezone } from "@saturn/hooks"
import {
  useTheme,
  useThemedStyles,
  type SaturnMobileTheme,
} from "../../lib/theme"
import { haptics } from "../../lib/haptics"
export function DetailChart({
  points,
  title,
  currency,
  bars = false,
  stepped = false,
  activeDate,
  onSelect,
  valueLabel,
  comparisonLabel,
  ceilingLabel,
  accent,
  footer,
}: {
  valueLabel?: string
  comparisonLabel?: string
  ceilingLabel?: string
  points: DetailChartPoint[]
  title: string
  currency?: string
  stepped?: boolean
  bars?: boolean
  activeDate?: string
  onSelect?: (date: string) => void
  accent?: string
  footer?: ReactNode
}) {
  const styles = useThemedStyles(createStyles)
  const tz = useTimezone(),
    { colors } = useTheme(),
    [inspected, setInspected] = useState<number | null>(null),
    [width, setWidth] = useState(1),
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
  function identify(x: number) {
    const plotWidth = Math.min(width, 500)
    return g.nearest((600 * (x - (width - plotWidth) / 2)) / plotWidth)
  }
  function select(x: number) {
    const i = identify(x)
    if (i !== active) {
      haptics.selection()
      setInspected(i)
    }
  }
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      {p && (
        <View style={styles.strip}>
          <Text style={styles.date}>{tz.format(p.date)}</Text>
          <View style={styles.legend}>
            {[p.value, p.comparison, p.ceiling].map(
              (v, i) =>
                v != null && (
                  <View key={i} style={styles.entry}>
                    <View
                      style={[
                        styles.dot,
                        {
                          backgroundColor: [
                            bars && p.ceiling != null && v > p.ceiling
                              ? colors.destructive
                              : cashFlow
                                ? colors.success
                                : accent || colors.primary,
                            bars ? colors.destructive : colors.textMuted,
                            colors.info,
                          ][i],
                        },
                      ]}
                    />
                    <Text style={styles.amount}>
                      {[
                        [valueLabel, comparisonLabel, ceilingLabel][i],
                        formatValue(v, i),
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    </Text>
                  </View>
                )
            )}
          </View>
        </View>
      )}
      {p && (
        <Text style={styles.amount}>
          {tz.formatMoney(Math.min(...g.ticks), currency)} –{" "}
          {tz.formatMoney(Math.max(...g.ticks), currency)}
        </Text>
      )}
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={title}
        accessibilityValue={{
          text: p
            ? `${tz.format(p.date)}: ${[p.value, p.comparison, p.ceiling].flatMap((v, i) => (v == null ? [] : [[[valueLabel, comparisonLabel, ceilingLabel][i], formatValue(v, i)].filter(Boolean).join(" ")])).join(", ")}`
            : title,
        }}
        accessibilityActions={[
          { name: "increment" },
          { name: "decrement" },
          ...(onSelect ? [{ name: "activate" }] : []),
        ]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === "activate" && p) {
            onSelect?.(p.date)
            return
          }
          haptics.selection()
          setInspected(
            Math.max(
              0,
              Math.min(
                points.length - 1,
                active + (e.nativeEvent.actionName === "increment" ? 1 : -1)
              )
            )
          )
        }}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onResponderGrant={(e) => {
          haptics.selection()
          setInspected(identify(e.nativeEvent.locationX))
        }}
        onResponderMove={(e) => select(e.nativeEvent.locationX)}
        onResponderRelease={(e) => {
          const point = points[identify(e.nativeEvent.locationX)]
          if (point) onSelect?.(point.date)
        }}
      >
        <Svg
          pointerEvents="none"
          viewBox="0 0 600 150"
          width="100%"
          height={125}
          preserveAspectRatio="xMidYMid meet"
        >
          {g.ticks.map((t) => (
            <Line
              key={t}
              x1={10}
              x2={590}
              y1={g.y(t)}
              y2={g.y(t)}
              stroke={colors.border}
              strokeDasharray={t === 0 ? undefined : "3 3"}
            />
          ))}
          {!bars && (
            <Path
              d={g.area}
              fill={accent || colors.primary}
              fillOpacity={0.1}
            />
          )}
          {!bars && (
            <Path
              d={g.path("value")}
              fill="none"
              stroke={accent || colors.primary}
              strokeWidth={3}
            />
          )}
          {!bars && (
            <Path
              d={g.path("comparison")}
              fill="none"
              stroke={colors.textMuted}
              strokeDasharray="6 4"
            />
          )}
          <Path
            d={g.path("ceiling")}
            fill="none"
            stroke={colors.info}
            strokeDasharray="2 4"
          />
          {g.marker && (
            <Circle {...g.marker} r={4} fill={accent || colors.primary} />
          )}
          {bars &&
            points.map((p, i) => (
              <G key={p.date}>
                {[p.value, p.comparison].map(
                  (v, k) =>
                    v != null && (
                      <Rect
                        key={k}
                        opacity={
                          onSelect && activeDate && p.date !== activeDate
                            ? 0.55
                            : 1
                        }
                        stroke={
                          onSelect && activeDate === p.date
                            ? colors.textPrimary
                            : undefined
                        }
                        rx={3}
                        x={g.x(i) - g.width / 2}
                        width={g.width}
                        y={Math.min(g.y(0), g.y(v))}
                        height={Math.abs(g.y(v) - g.y(0))}
                        fill={
                          v < 0 || (p.ceiling != null && v > p.ceiling)
                            ? colors.destructive
                            : cashFlow
                              ? colors.success
                              : accent || colors.primary
                        }
                      />
                    )
                )}
              </G>
            ))}
          {p && (
            <G>
              <Line
                x1={g.x(active)}
                x2={g.x(active)}
                y1={10}
                y2={140}
                stroke={colors.textMuted}
                strokeOpacity={0.55}
              />
              {!bars && p.value != null && (
                <Circle
                  cx={g.x(active)}
                  cy={g.y(p.value)}
                  r={4}
                  fill={colors.surface}
                  stroke={accent || colors.primary}
                  strokeWidth={2}
                />
              )}
            </G>
          )}
        </Svg>
      </View>
      {p && (
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={styles.amount}>{tz.format(points[0].date)}</Text>
          <Text style={styles.amount}>
            {tz.format(points[points.length - 1].date)}
          </Text>
        </View>
      )}
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  )
}
const createStyles = (t: SaturnMobileTheme) => ({
  card: {
    backgroundColor: t.colors.surface,
    borderColor: t.colors.border,
    borderWidth: 1,
    borderRadius: t.radius.lg,
    padding: 16,
    gap: 10,
  },
  title: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
  },
  strip: {
    backgroundColor: t.colors.surfaceSubtle,
    borderRadius: t.radius.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    gap: 8,
  },
  date: {
    fontSize: 12,
    color: t.colors.textPrimary,
    fontWeight: "600" as const,
  },
  legend: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 8 },
  entry: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  amount: {
    fontSize: 12,
    color: t.colors.textSecondary,
    fontVariant: ["tabular-nums" as const],
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.colors.border,
    paddingTop: 10,
    gap: 8,
  },
})
