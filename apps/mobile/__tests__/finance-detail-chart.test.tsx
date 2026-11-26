import { it, expect, vi, afterEach } from "vitest"
import { render, fireEvent, cleanup } from "@testing-library/react"
import type { PropsWithChildren } from "react"
import { DetailChart } from "../components/finance/detail-chart"
vi.mock("react-native", () => ({
  StyleSheet: { hairlineWidth: 1 },
  View: ({
    children,
    onAccessibilityAction,
    accessibilityLabel,
  }: PropsWithChildren<{
    accessibilityLabel?: string
    onAccessibilityAction?: (e: { nativeEvent: { actionName: string } }) => void
  }>) => (
    <div
      role={onAccessibilityAction ? "slider" : undefined}
      aria-label={accessibilityLabel}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft")
          onAccessibilityAction?.({ nativeEvent: { actionName: "decrement" } })
      }}
    >
      {children}
    </div>
  ),
  Text: ({ children }: PropsWithChildren) => <span>{children}</span>,
}))
vi.mock("react-native-svg", () => ({
  default: ({ children }: PropsWithChildren) => <svg>{children}</svg>,
  Path: "path",
  Rect: "rect",
  Line: "line",
  G: "g",
  Circle: "circle",
}))
vi.mock("../lib/theme", () => ({
  useThemedStyles: (create: (t: object) => unknown) =>
    create({ colors: {}, radius: {} }),
  useTheme: () => ({ colors: { primary: "teal" } }),
}))
vi.mock("../lib/haptics", () => ({ haptics: { selection: vi.fn() } }))
it("renders the single closing balance and full-width ceiling", () => {
  const { container } = render(
    <DetailChart
      title="Balance"
      points={[{ date: "2025-03-01", value: 12, ceiling: 20 }]}
    />
  )
  expect(
    Number(container.querySelector("circle")?.getAttribute("r"))
  ).toBeGreaterThan(0)
  expect(container.querySelector('path[d$=" H586"]')).toBeTruthy()
})

afterEach(cleanup)
it("moves the marker and the inspected amount together", () => {
  const view = render(
    <DetailChart
      title="Balance"
      currency="USD"
      valueLabel="Balance"
      points={[
        { date: "2025-03-01", value: 100 },
        { date: "2025-03-02", value: 250 },
        { date: "2025-03-03", value: null },
      ]}
    />
  )
  expect(view.getByText("Balance $2.50")).toBeTruthy()
  const first = view.container.querySelector("circle")?.getAttribute("cx")
  fireEvent.keyDown(view.getByRole("slider", { name: "Balance" }), {
    key: "ArrowLeft",
  })
  expect(view.getByText("Balance $1.00")).toBeTruthy()
  expect(view.container.querySelector("circle")?.getAttribute("cx")).not.toBe(
    first
  )
})

it("outlines the selected history period without dimming the inspection strip", () => {
  const { container, getByText } = render(
    <DetailChart
      title="History"
      bars
      activeDate="2025-03-01"
      onSelect={vi.fn()}
      valueLabel="Spent"
      currency="USD"
      points={[
        { date: "2025-03-01", value: 100 },
        { date: "2025-03-02", value: 200 },
      ]}
    />
  )
  const bars = container.querySelectorAll("rect")
  expect(bars[0].getAttribute("opacity")).toBe("1")
  expect(bars[1].getAttribute("opacity")).toBe("0.55")
  expect(getByText("Spent $2.00")).toBeTruthy()
})

it("renders an optional footer inside the chart card", () => {
  const { getByText } = render(
    <DetailChart
      title="Balance"
      points={[{ date: "2025-03-01", value: 100 }]}
      footer={<span>30D · 90D</span>}
    />
  )
  expect(getByText("30D · 90D")).toBeTruthy()
})
