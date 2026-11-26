import { computeNiceSignedTicks } from "./chart-scale"
export interface DetailChartPoint {
  date: string
  value: number | null
  comparison?: number
  ceiling?: number
}
export function chartGeometry(
  points: DetailChartPoint[],
  bars: boolean,
  stepped = false
) {
  const { domainMin, domainMax, ticks } = computeNiceSignedTicks(
    points.reduce(
      (n, p) => Math.min(n, p.value ?? 0, p.comparison ?? 0, p.ceiling ?? 0),
      0
    ),
    points.reduce(
      (n, p) => Math.max(n, p.value ?? 0, p.comparison ?? 0, p.ceiling ?? 0),
      0
    )
  )
  const first = Date.parse(points[0]?.date || ""),
    last = Date.parse(points.at(-1)?.date || "")
  const x = (i: number) =>
    14 +
    572 *
      (bars
        ? (i + 0.5) / points.length
        : last > first
          ? (Date.parse(points[i].date) - first) / (last - first)
          : 0.5)
  const left = (i: number) => (i === 0 ? 0 : (x(i - 1) + x(i)) / 2)
  const right = (i: number) => (i === points.length - 1 ? 600 : left(i + 1))
  const nearest = (pos: number) => {
    let low = 0,
      high = points.length - 1
    while (low < high) {
      const mid = Math.floor((low + high) / 2)
      if (pos > right(mid)) low = mid + 1
      else high = mid
    }
    return low
  }
  const y = (amount: number) =>
    140 - (130 * (amount - domainMin)) / (domainMax - domainMin)
  const path = (field: "value" | "comparison" | "ceiling") =>
    field === "ceiling" && points.length === 1 && points[0].ceiling != null
      ? `M14,${y(points[0].ceiling)} H586`
      : points
          .flatMap((p, i) =>
            p[field] == null
              ? []
              : [
                  stepped &&
                  field === "value" &&
                  i > 0 &&
                  points[i - 1].value != null
                    ? `H${x(i)}V${y(p[field]!)}`
                    : `${i && points[i - 1][field] != null ? "L" : "M"}${x(i)},${y(p[field]!)}`,
                ]
          )
          .join(" ")
  const firstActual = points.findIndex((p) => p.value != null),
    lastActual = points.findLastIndex((p) => p.value != null)
  const area =
    firstActual < 0
      ? ""
      : `${path("value")} L${x(lastActual)},${y(0)} H${x(firstActual)} Z`
  return {
    x,
    y,
    ticks,
    path,
    area,
    marker:
      !bars && firstActual >= 0 && firstActual === lastActual
        ? { cx: x(firstActual), cy: y(points[firstActual].value!) }
        : null,
    left,
    right,
    nearest,
    width: Math.min(48, 300 / points.length),
  }
}
