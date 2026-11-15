import { describe, it, expect } from "vitest"
import { renderHook } from "@testing-library/react"
import type { ReactNode } from "react"
import { TimezoneProvider, useTimezone } from "./use-timezone"

describe("useTimezone", () => {
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

  it("falls back to UTC for invalid override timezone", () => {
    const { result } = renderHook(() => useTimezone("Invalid/Timezone"))
    expect(result.current.timezone).toBe("UTC")
  })
})
