import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { TimezoneProvider } from "@saturn/hooks"
import * as financeApi from "@saturn/api/gen/saturn/finance/v1/finance"
import * as spaceHooks from "@/features/space/use-space"
import { InsightsView } from "./insights-view"
import {
  CashFlowSvgChart,
  StackedBreakdownSvgChart,
  type MergedTrendPoint,
} from "./components/insights-charts"

import { computeNiceSignedTicks } from "@saturn/core"

const mockNavigate = vi.fn()

vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>("react-router-dom")
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock("@saturn/api/gen/saturn/finance/v1/finance", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@saturn/api/gen/saturn/finance/v1/finance")
    >()
  return {
    ...actual,
    useGetSettingsQuery: vi.fn(),
    useGetInsightsQuery: vi.fn(),
    useSetupMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useListCurrenciesQuery: () => ({ data: { currencies: [] } }),
    useListAccountsQuery: () => ({ data: { accounts: [] } }),
    useCreateBudgetMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useCreateAccountMutation: () => ({
      mutateAsync: vi.fn(),
      isPending: false,
    }),
  }
})

vi.mock("@/features/space/use-space", () => ({
  useActiveSpaceContext: vi.fn(),
  useSpacePermissions: vi.fn(),
  resolveSpacePath: (url: string, spaceId: string, requiresSpace = false) =>
    requiresSpace && spaceId ? `/space/${spaceId}${url}` : url,
}))

vi.mock("@saturn/hooks/ai", () => ({
  useRegisterCopilotView: vi.fn(),
}))

function wrapWithProviders(
  ui: React.ReactElement,
  initialEntries: string[] = ["/space/spc_1/finance/insights"],
  locale = "en-US"
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <TimezoneProvider timezone="UTC" locale={locale}>
        <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
      </TimezoneProvider>
    </QueryClientProvider>
  )
}

const PLOT_DRAW_HEIGHT = 182 // 240 - PAD_TOP(18) - PAD_BOTTOM(34) - 6

describe("computeNiceSignedTicks", () => {
  const cases = [
    {
      name: "all-zero fallback domain [0, 10000]",
      minCents: 0,
      maxCents: 0,
      targetTickCount: 5,
      expectMin: 0,
      expectMax: 10000,
    },
    {
      name: "outflows-only (inflow = 0, outflow > 0)",
      minCents: -300000,
      maxCents: 0,
      targetTickCount: 5,
      expectMin: -300000,
      expectMax: 0,
    },
    {
      name: "tiny negative net -$50 vs +$5,000 prevents $0 vs negative collision",
      minCents: -5000,
      maxCents: 500000,
      targetTickCount: 5,
      expectMin: -200000,
      expectMax: 600000,
    },
    {
      name: "symmetric cash flow -$1,000 to +$1,000",
      minCents: -100000,
      maxCents: 100000,
      targetTickCount: 5,
      expectMin: -100000,
      expectMax: 100000,
    },
    {
      name: "asymmetric mixed -$1,200 to +$1,800",
      minCents: -120000,
      maxCents: 180000,
      targetTickCount: 5,
      expectMin: -200000,
      expectMax: 200000,
    },
  ]

  it.each(cases)(
    "$name",
    ({ minCents, maxCents, targetTickCount, expectMin, expectMax }) => {
      const result = computeNiceSignedTicks(minCents, maxCents, targetTickCount)

      expect(result.domainMin).toBe(expectMin)
      expect(result.domainMax).toBe(expectMax)
      expect(result.ticks).toContain(0)
      expect(result.ticks[0]).toBe(result.domainMax)
      expect(result.ticks[result.ticks.length - 1]).toBe(result.domainMin)

      // No -0 values
      for (const tick of result.ticks) {
        expect(Object.is(tick, -0)).toBe(false)
      }

      // Even spacing between adjacent ticks and >= 28px vertical gap
      const diffs = new Set<number>()
      for (let i = 1; i < result.ticks.length; i++) {
        diffs.add(result.ticks[i - 1]! - result.ticks[i]!)
      }
      expect(diffs.size).toBe(1)

      const pxGap = PLOT_DRAW_HEIGHT / (result.ticks.length - 1)
      expect(pxGap).toBeGreaterThanOrEqual(28)
    }
  )
})

describe("DF-12 Insights SVG Charts", () => {
  afterEach(() => {
    cleanup()
  })

  it("CashFlowSvgChart renders positive inflow bars above zeroY and negative outflow bars below zeroY without overlapping ticks", () => {
    const points: MergedTrendPoint[] = [
      {
        label: "Apr 1",
        startDate: "2026-04-01T00:00:00Z",
        inflowTotal: 500000, // +$5,000
        outflowTotal: 250000, // -$2,500
        spentContributions: [],
        incomeContributions: [],
      },
      {
        label: "Apr 2",
        startDate: "2026-04-02T00:00:00Z",
        inflowTotal: 0,
        outflowTotal: 5000, // -$50 tiny negative net
        spentContributions: [],
        incomeContributions: [],
      },
    ]

    const { container } = wrapWithProviders(
      <CashFlowSvgChart
        points={points}
        baseCurrency="USD"
        activeIndex={null}
        onInspectIndex={vi.fn()}
        onSelectPeriod={vi.fn()}
      />
    )

    // Verify compact currency Y-axis labels including $0 and negative tick
    const yTickTexts = Array.from(
      container.querySelectorAll('svg > g > text[text-anchor="end"]')
    ).map((el) => ({
      text: el.textContent,
      y: Number(el.getAttribute("y")),
    }))
    expect(yTickTexts.some((t) => t.text === "$0")).toBe(true)
    expect(yTickTexts.some((t) => t.text?.startsWith("-$"))).toBe(true)

    // Verify every adjacent Y-axis tick label is separated by >= 28px
    for (let i = 1; i < yTickTexts.length; i++) {
      expect(yTickTexts[i]!.y - yTickTexts[i - 1]!.y).toBeGreaterThanOrEqual(28)
    }

    // Find the solid (non-dashed) zero gridline to get exact zeroY
    const gridLines = Array.from(container.querySelectorAll("svg > g > line"))
    const zeroLine = gridLines.find((l) => !l.getAttribute("stroke-dasharray"))
    expect(zeroLine).toBeTruthy()
    const zeroY = Number(zeroLine!.getAttribute("y1"))

    // Verify inflow bars sit strictly above zeroY (y + height === zeroY)
    const inflowBars = Array.from(
      container.querySelectorAll('rect[data-series="inflow"]')
    )
    expect(inflowBars).toHaveLength(2)
    const inflow1Y = Number(inflowBars[0]!.getAttribute("y"))
    const inflow1H = Number(inflowBars[0]!.getAttribute("height"))
    expect(inflow1H).toBeGreaterThan(0)
    expect(inflow1Y).toBeLessThan(zeroY)
    expect(inflow1Y + inflow1H).toBeCloseTo(zeroY, 4)

    // Zero inflow renders height 0
    expect(Number(inflowBars[1]!.getAttribute("height"))).toBe(0)

    // Verify outflow bars extend downward below zeroY (y >= zeroY, height > 0)
    const outflowBars = Array.from(
      container.querySelectorAll('rect[data-series="outflow"]')
    )
    expect(outflowBars).toHaveLength(2)
    for (const bar of outflowBars) {
      const y = Number(bar.getAttribute("y"))
      const h = Number(bar.getAttribute("height"))
      expect(y).toBeGreaterThanOrEqual(zeroY)
      expect(h).toBeGreaterThan(0)
    }

    // Verify net dots never collide with X-axis labels at y = 232
    const dots = Array.from(container.querySelectorAll("svg > circle"))
    expect(dots).toHaveLength(2)
    for (const dot of dots) {
      expect(Number(dot.getAttribute("cy"))).toBeLessThan(215)
    }
  })

  it("StackedBreakdownSvgChart scales by positive segment sum when refunds reduce ptTotal", () => {
    const points: MergedTrendPoint[] = [
      {
        label: "Apr 1",
        startDate: "2026-04-01T00:00:00Z",
        inflowTotal: 0,
        outflowTotal: 20000, // net $200 after -$300 refund
        spentContributions: [
          {
            budgetId: "b1",
            budgetName: "Groceries",
            budgetColor: "teal",
            amountInBase: "50000", // positive $500 > ptTotal
            amountInLocal: "50000",
            localCurrency: "USD",
            contributionPercentage: 100,
          },
          {
            budgetId: "b2",
            budgetName: "Refunds",
            budgetColor: "coral",
            amountInBase: "-30000",
            amountInLocal: "-30000",
            localCurrency: "USD",
            contributionPercentage: 0,
          },
        ],
        incomeContributions: [],
      },
    ]

    const { container } = wrapWithProviders(
      <StackedBreakdownSvgChart
        mode="OUTFLOWS"
        points={points}
        baseCurrency="USD"
        activeIndex={null}
        onInspectIndex={vi.fn()}
        onInspectSegment={vi.fn()}
        onSelectPeriod={vi.fn()}
      />
    )

    // Positive segment rect must not overflow above PAD_TOP = 18
    const segmentRects = Array.from(
      container.querySelectorAll('rect[stroke="var(--card)"]')
    )
    expect(segmentRects).toHaveLength(2)
    expect(Number(segmentRects[0]!.getAttribute("y"))).toBeGreaterThanOrEqual(
      18
    )
    // Negative refund segment has height 0
    expect(Number(segmentRects[1]!.getAttribute("height"))).toBe(0)
  })
})

describe("DF-11 & DF-12 InsightsView", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date("2026-04-16T12:00:00Z"))
    window.HTMLElement.prototype.scrollIntoView = vi.fn()
    globalThis.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }

    vi.mocked(spaceHooks.useActiveSpaceContext).mockReturnValue({
      spaceId: "spc_1",
      spaceName: "Personal",
      spaceRole: "owner",
      timezone: "UTC",
      activeSpace: null,
      userPreferences: {
        regional: { locale: "en-US", hourCycle: "h12", weekStartsOn: 0 },
        mail: { autoLoadRemoteContent: false },
        calendar: { webView: "month", mobileView: "agenda" },
      },
      updateUserPreferences: vi.fn(),
      switchSpace: vi.fn(),
      clearActiveSpace: vi.fn(),
      isLoading: false,
    })

    vi.mocked(spaceHooks.useSpacePermissions).mockReturnValue({
      spaceId: "spc_1",
      spaceRole: "owner",
      isWritable: true,
      canManageSpace: true,
    })

    vi.mocked(financeApi.useGetSettingsQuery).mockReturnValue({
      data: { baseCurrency: "USD" },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as never)
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it("renders Savings Rate as '—' in text-muted-foreground when totalIn === 0 and totalOut > 0", () => {
    vi.mocked(financeApi.useGetInsightsQuery).mockReturnValue({
      data: {
        spent: {
          totalLimit: "100000",
          totalSpent: "125000",
          remainingBudget: "-25000",
          burnRate: 4166,
          trend: [
            {
              label: "Apr 1",
              startDate: "2026-04-01T00:00:00Z",
              amountInBase: "125000",
              transactionCount: 2,
              contributions: [],
            },
          ],
          distributions: [
            {
              budgetId: "bgt_1",
              budgetName: "Groceries",
              budgetColor: "teal",
              budgetIcon: "shopping-cart",
              limit: "100000",
              spent: "125000",
              spentInBase: "125000",
              usagePercentage: 125,
            },
          ],
          topExpenses: [],
        },
        income: {
          totalIncome: "0",
          trend: [],
          distributions: [
            {
              name: "Salary",
              amount: "50000",
              amountInBase: "50000",
              percentage: 100,
            },
          ],
          topIncomes: [],
        },
      },
      isLoading: false,
      isPending: false,
      error: null,
    } as never)

    wrapWithProviders(<InsightsView />)

    const savingsLabel = screen.getByText("Savings Rate")
    const savingsCard = savingsLabel.closest("div.rounded-xl")!
    const valueEl = savingsCard.querySelector("span.font-mono")!
    expect(valueEl.textContent).toBe("—")
    expect(valueEl.className).toContain("text-muted-foreground")
    expect(valueEl.className).not.toContain("text-success")
    expect(savingsCard.textContent).not.toContain("0.0%")
  })

  it("renders Budget Allocations and Income Sources as flat divide-y rows without nested bg-muted/20 sub-cards, and shows negative Remaining KPI in red", () => {
    vi.mocked(financeApi.useGetInsightsQuery).mockReturnValue({
      data: {
        spent: {
          totalLimit: "100000",
          totalSpent: "125000",
          remainingBudget: "-25000",
          burnRate: 4166,
          trend: [
            {
              label: "Apr 1",
              startDate: "2026-04-01T00:00:00Z",
              amountInBase: "125000",
              transactionCount: 2,
              contributions: [
                {
                  budgetId: "bgt_1",
                  budgetName: "Groceries",
                  budgetColor: "teal",
                  amountInBase: "125000",
                  amountInLocal: "125000",
                  localCurrency: "USD",
                  contributionPercentage: 100,
                },
              ],
            },
          ],
          distributions: [
            {
              budgetId: "bgt_1",
              budgetName: "Groceries",
              budgetColor: "teal",
              budgetIcon: "shopping-cart",
              limit: "100000",
              spent: "125000",
              spentInBase: "125000",
              usagePercentage: 125,
            },
          ],
          topExpenses: [],
        },
        income: {
          totalIncome: "200000",
          trend: [
            {
              label: "Apr 1",
              startDate: "2026-04-01T00:00:00Z",
              amountInBase: "200000",
              transactionCount: 1,
              contributions: [],
            },
          ],
          distributions: [
            {
              name: "Primary Payroll",
              amount: "200000",
              amountInBase: "200000",
              percentage: 100,
            },
          ],
          topIncomes: [],
        },
      },
      isLoading: false,
      isPending: false,
      error: null,
    } as never)

    const { container } = wrapWithProviders(<InsightsView />)

    // Switch to Outflows tab
    fireEvent.click(screen.getByRole("tab", { name: /Outflows/i }))

    // Negative Remaining KPI shows in red with negative sign
    const remainingLabel = screen.getByText("Remaining")
    const remainingCard = remainingLabel.closest("div.rounded-xl")!
    const remainingIcon = remainingCard.querySelector("svg")!
    expect(remainingIcon.getAttribute("class")).toContain("text-destructive")
    const remainingAmount = remainingCard.querySelector(
      '[data-slot="money-amount"]'
    )!
    expect(remainingAmount.textContent).toBe("-$250.00")
    expect(remainingAmount.className).toContain("text-destructive")

    // Budget Allocations uses flat divide-y list, zero nested bg-muted/20 bordered sub-cards
    const budgetHeading = screen.getByText("Budget Allocations")
    const budgetCard = budgetHeading.closest("div.rounded-xl")!
    expect(budgetCard.querySelector(".divide-y")).toBeTruthy()
    expect(budgetCard.querySelector('[class*="bg-muted/20"]')).toBeNull()
    expect(budgetCard.textContent).toContain("Groceries")
    expect(budgetCard.textContent).toContain("125.0%")
    expect(budgetCard.textContent).toContain("$1,250.00")
    expect(budgetCard.textContent).toContain("$1,000.00")
    expect(budgetCard.textContent).not.toContain("Usage pacing")

    // Switch to Inflows tab
    fireEvent.click(screen.getByRole("tab", { name: /Inflows/i }))

    // Income Sources uses flat divide-y list, zero nested bg-muted/20 bordered sub-cards
    const incomeHeading = screen.getByText("Income Sources Breakdown")
    const incomeCard = incomeHeading.closest("div.rounded-xl")!
    expect(incomeCard.querySelector(".divide-y")).toBeTruthy()
    expect(incomeCard.querySelector('[class*="bg-muted/20"]')).toBeNull()
    expect(incomeCard.textContent).toContain("Primary Payroll")
    expect(incomeCard.textContent).toContain("100.0%")
    expect(incomeCard.textContent).toContain("$2,000.00")
    expect(incomeCard.textContent).not.toContain("Contribution")

    // Double-check globally no nested bg-muted/20 sub-cards remain
    expect(container.querySelector('[class*="bg-muted/20"]')).toBeNull()
  })
})
