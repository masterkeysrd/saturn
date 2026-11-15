import { describe, it, expect } from "vitest"
import {
  formatCents,
  formatAmount,
  toCents,
  formatInterval,
  formatStatus,
  isStatusActive,
  getCurrencySymbol,
} from "./formatting"

describe("finance formatting utilities", () => {
  it("converts between cents and decimal amounts", () => {
    expect(formatCents(1250)).toBe(12.5)
    expect(formatCents("999")).toBe(9.99)
    expect(formatCents(null)).toBe(0)

    expect(toCents("12.34")).toBe(1234)
    expect(toCents("$1,234.56")).toBe(123456)
    expect(toCents("-45.10")).toBe(-4510)
    expect(toCents("10.00", -1)).toBe(-1000)
  })

  it("formats amounts with optional currency", () => {
    expect(formatAmount(2500, "USD")).toContain("USD")
    expect(formatAmount(2500)).toMatch(/25\.00/)
  })

  it("formats intervals, statuses, and currency symbols", () => {
    expect(formatInterval("INTERVAL_MONTHLY")).toBe("Monthly")
    expect(formatInterval("one_time")).toBe("One-Time")
    expect(formatStatus("STATUS_PAUSED")).toBe("Paused")
    expect(isStatusActive("ACTIVE")).toBe(true)
    expect(isStatusActive("PAUSED")).toBe(false)
    expect(getCurrencySymbol("USD")).toBe("$")
  })
})
