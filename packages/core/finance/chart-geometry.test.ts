import { expect, it } from "vitest"
import { chartGeometry } from "./chart-geometry"
it.each([[5], [0, null, null], [null, 5, null]])(
  "places a visible marker on the sole actual value in %j",
  (...values) => {
    const points = values.map((value, i) => ({
      date: `2026-02-0${i + 1}`,
      value,
    }))
    const g = chartGeometry(points, false)
    const i = values.findIndex((v) => v !== null)
    expect(g.marker).toEqual({ cx: g.x(i), cy: g.y(values[i]!) })
  }
)
it("draws a single ceiling across the entire plot", () => {
  const g = chartGeometry(
    [{ date: "2026-02-01", value: 0, ceiling: 25 }],
    false
  )
  expect(g.path("ceiling")).toBe(`M14,${g.y(25)} H586`)
})
