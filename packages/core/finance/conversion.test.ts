import { describe, it, expect } from "vitest"
import { convertCentsToBase, convertCurrency } from "./conversion"

describe("finance currency conversion", () => {
  const rates = [
    {
      fromCurrency: "EUR",
      toCurrency: "USD",
      rate: 1.1,
      rateDate: "2026-04-01T00:00:00Z",
    },
    {
      fromCurrency: "USD",
      toCurrency: "DOP",
      rate: 60,
      rateDate: "2026-04-01T00:00:00Z",
    },
  ]

  it("converts direct and inverse currency amounts in cents", () => {
    expect(convertCentsToBase(10000, "USD", "USD", rates)).toBe(10000)
    expect(convertCentsToBase(10000, "EUR", "USD", rates)).toBe(11000)
    // Inverse lookup: DOP -> USD using USD -> DOP = 60
    expect(convertCentsToBase(6000, "DOP", "USD", rates)).toBe(100)
  })

  it("returns conversion preview error when rate is missing", () => {
    const res = convertCurrency(100, "JPY", "USD", rates)
    expect("error" in res).toBe(true)
  })
})
