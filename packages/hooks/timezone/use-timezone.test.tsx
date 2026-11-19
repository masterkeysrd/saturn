import { describe, it, expect, vi, afterEach } from "vitest"
import { renderHook } from "@testing-library/react"
import type { ReactNode } from "react"
import { TimezoneProvider, useTimezone } from "./use-timezone"

describe("useTimezone", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("consumes timezone from TimezoneProvider and formats dates", () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <TimezoneProvider timezone="America/New_York">
        {children}
      </TimezoneProvider>
    )

    const { result } = renderHook(() => useTimezone(), { wrapper })
    expect(result.current.timezone).toBe("America/New_York")
    expect(result.current.format("2026-01-15T03:30:00.000Z")).toBe(
      "Jan 14, 2026"
    )
    expect(result.current.formatRelative(new Date())).toBe("Today")
  })

  it("handles 25-hour fall-back and 23-hour spring-forward DST days accurately", () => {
    vi.useFakeTimers()

    // Fall-back day in New York: 2026-11-01 (25 hours).
    // At 00:30 AM EDT (04:30 UTC), now - 86400s would land on 2026-10-31 00:30 EDT,
    // while at 23:30 EST on 2026-11-01 (2026-11-02T04:30Z), now - 86400s would be
    // 2026-11-01 00:30 EDT (same day, NOT yesterday!).
    vi.setSystemTime(new Date("2026-11-02T04:30:00.000Z")) // 2026-11-01 23:30 EST
    const { result: fallResult } = renderHook(() =>
      useTimezone("America/New_York")
    )
    expect(fallResult.current.isYesterday("2026-10-31T18:00:00.000Z")).toBe(
      true
    )
    expect(fallResult.current.isYesterday("2026-11-01T04:30:00.000Z")).toBe(
      false
    )
    expect(fallResult.current.formatRelative("2026-10-31T18:00:00.000Z")).toBe(
      "Yesterday"
    )

    // Spring-forward day in New York: 2026-03-08 (23 hours).
    // At 00:30 EST on 2026-03-08 (05:30Z), now + 86400s would land on 2026-03-09 01:30 EDT,
    // while at 00:30 EST on 2026-03-07, wait - check 2026-03-08 23:30 EDT (2026-03-09T03:30Z) -> tomorrow is 2026-03-09,
    // and at 2026-03-08T05:30Z (00:30 EST on 2026-03-08), tomorrow is 2026-03-09 (even early 00:15 EDT = 04:15Z):
    vi.setSystemTime(new Date("2026-03-08T05:30:00.000Z")) // 2026-03-08 00:30 EST
    const { result: springResult } = renderHook(() =>
      useTimezone("America/New_York")
    )
    expect(springResult.current.isTomorrow("2026-03-09T04:15:00.000Z")).toBe(
      true
    )
    expect(
      springResult.current.formatRelative("2026-03-09T04:15:00.000Z")
    ).toBe("Tomorrow")
  })

  it("falls back to UTC for invalid override timezone", () => {
    const { result } = renderHook(() => useTimezone("Invalid/Timezone"))
    expect(result.current.timezone).toBe("UTC")
  })

  it("exposes user-scoped locale, hourCycle, weekStartsOn, and deterministic formatMoney", () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <TimezoneProvider
        timezone="UTC"
        locale="en-US"
        hourCycle="h23"
        weekStartsOn={1}
      >
        {children}
      </TimezoneProvider>
    )

    const { result } = renderHook(() => useTimezone(), { wrapper })
    expect(result.current.locale).toBe("en-US")
    expect(result.current.hourCycle).toBe("h23")
    expect(result.current.weekStartsOn).toBe(1)
    expect(result.current.formatTime("2026-01-15T17:05:00.000Z")).toBe("17:05")
    expect(result.current.formatMoney(123456, "USD")).toBe("$1,234.56")
    expect(result.current.formatMoney(2500, "USD", { showSign: true })).toBe(
      "+$25.00"
    )
    expect(result.current.formatMoney(-2500, "USD", { showSign: true })).toBe(
      "-$25.00"
    )
    expect(result.current.formatMoney(5000, "INVALID")).toBe("50.00 INVALID")
  })
})
