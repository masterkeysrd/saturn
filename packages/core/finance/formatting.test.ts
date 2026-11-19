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

  it.each([
    { input: "12.34", defaultSign: undefined, expected: 1234 },
    { input: "$1,234.56", defaultSign: undefined, expected: 123456 },
    { input: "-45.10", defaultSign: undefined, expected: -4510 },
    { input: "10.00", defaultSign: -1 as const, expected: -1000 },
    { input: "12,50", defaultSign: undefined, expected: 1250 },
    { input: "12,5", defaultSign: undefined, expected: 1250 },
    { input: "1.234,56", defaultSign: undefined, expected: 123456 },
    { input: "1.234.567,89", defaultSign: undefined, expected: 123456789 },
    { input: "1,234,567.89", defaultSign: undefined, expected: 123456789 },
    { input: "1,000", defaultSign: undefined, expected: 100000 },
    { input: "1,234,567", defaultSign: undefined, expected: 123456700 },
    { input: "-12,50", defaultSign: undefined, expected: -1250 },
    { input: "€ 99,95", defaultSign: undefined, expected: 9995 },
    { input: "", defaultSign: undefined, expected: 0 },
  ])("toCents parses $input accurately", ({ input, defaultSign, expected }) => {
    expect(toCents(input, defaultSign)).toBe(expected)
  })

  it("formats amounts deterministically with en-US dot decimals", () => {
    expect(formatAmount(2500, "USD")).toBe("25.00 USD")
    expect(formatAmount(123456)).toBe("1,234.56")
  })

  it("formats intervals, statuses, and currency symbols", () => {
    expect(formatInterval("INTERVAL_MONTHLY")).toBe("Monthly")
    expect(formatInterval("WEEKLY")).toBe("Weekly")
    expect(formatInterval("YEARLY")).toBe("Yearly")
    expect(formatInterval("one_time")).toBe("One-Time")
    expect(formatInterval(undefined)).toBe("Monthly")
    expect(formatStatus("STATUS_PAUSED")).toBe("Paused")
    expect(formatStatus("RECURRING_TRANSACTION_STATUS_ACTIVE")).toBe("Active")
    expect(formatStatus("STATUS_UNSPECIFIED")).toBe("Active")
    expect(formatStatus("CANCELLED")).toBe("Cancelled")
    expect(isStatusActive("ACTIVE")).toBe(true)
    expect(isStatusActive("STATUS_ACTIVE")).toBe(true)
    expect(isStatusActive("PAUSED")).toBe(false)
    expect(getCurrencySymbol("USD")).toBe("$")
  })
})
