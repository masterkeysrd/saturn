import { describe, it, expect, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import { TimezoneProvider } from "@saturn/hooks"
import { MoneyAmount } from "./money-amount"

describe("MoneyAmount", () => {
  afterEach(() => {
    cleanup()
  })

  it("renders tabular-nums monospace currency values deterministically", () => {
    render(
      <TimezoneProvider timezone="UTC" locale="en-US">
        <MoneyAmount cents={123456} currency="USD" />
      </TimezoneProvider>
    )

    const el = screen.getByText("$1,234.56")
    expect(el.className).toContain("font-mono")
    expect(el.className).toContain("tabular-nums")
  })

  it("supports colored positive, negative, and zero states with showSign", () => {
    render(
      <TimezoneProvider timezone="UTC" locale="en-US">
        <MoneyAmount cents={5000} currency="USD" colored showSign />
        <MoneyAmount cents={-2500} currency="USD" colored showSign />
        <MoneyAmount cents={0} currency="USD" colored />
      </TimezoneProvider>
    )

    expect(screen.getByText("+$50.00").className).toContain("text-success")
    expect(screen.getByText("-$25.00").className).toContain("text-destructive")
    expect(screen.getByText("$0.00").className).toContain(
      "text-muted-foreground"
    )
  })

  it("respects explicit locale override and size variants", () => {
    render(
      <TimezoneProvider timezone="UTC" locale="en-US">
        <MoneyAmount cents={125000} currency="EUR" locale="de-DE" size="xl" />
      </TimezoneProvider>
    )

    const el = screen.getByText(/1\.250,00/)
    expect(el.className).toContain("text-2xl")
  })
})
