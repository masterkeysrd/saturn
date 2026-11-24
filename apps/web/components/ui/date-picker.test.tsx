import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { TimezoneProvider } from "@saturn/hooks"
import { Calendar } from "./calendar"
import { DatePicker } from "./date-picker"

describe("Web DatePicker & Calendar localization", () => {
  afterEach(() => {
    cleanup()
  })

  it("renders localized placeholder and selected date without off-by-one shift", () => {
    const setDate = vi.fn()
    const selected = new Date(2026, 10, 5)

    const { rerender } = render(
      <TimezoneProvider
        timezone="America/Los_Angeles"
        locale="en-US"
        weekStartsOn={0}
      >
        <DatePicker date={undefined} setDate={setDate} />
      </TimezoneProvider>
    )
    expect(screen.getByRole("button").textContent).toContain("Pick a date")

    rerender(
      <TimezoneProvider
        timezone="America/Los_Angeles"
        locale="es-ES"
        weekStartsOn={1}
      >
        <DatePicker date={undefined} setDate={setDate} />
      </TimezoneProvider>
    )
    expect(screen.getByRole("button").textContent).toContain("Elegir una fecha")

    rerender(
      <TimezoneProvider
        timezone="America/Los_Angeles"
        locale="en-US"
        weekStartsOn={0}
      >
        <DatePicker date={selected} setDate={setDate} />
      </TimezoneProvider>
    )
    expect(screen.getByRole("button").textContent).toBe("Nov 5, 2026")

    rerender(
      <TimezoneProvider
        timezone="America/Los_Angeles"
        locale="es-ES"
        weekStartsOn={1}
      >
        <DatePicker date={selected} setDate={setDate} />
      </TimezoneProvider>
    )
    expect(screen.getByRole("button").textContent).toBe("5 Nov 2026")
  })

  it("opens popover calendar with Spanish month caption and Monday-first headers under es-ES weekStartsOn=1", () => {
    render(
      <TimezoneProvider
        timezone="Europe/Madrid"
        locale="es-ES"
        weekStartsOn={1}
      >
        <DatePicker date={new Date(2026, 10, 5)} setDate={vi.fn()} />
      </TimezoneProvider>
    )

    fireEvent.click(screen.getByRole("button"))

    expect(screen.getByText("Noviembre 2026")).toBeTruthy()

    const headers = screen
      .getAllByRole("columnheader", { hidden: true })
      .map((el) => el.textContent)
    expect(headers[0]).toBe("Lun")
    expect(headers[6]).toBe("Dom")

    expect(screen.getByLabelText("Mes anterior")).toBeTruthy()
    expect(screen.getByLabelText("Mes siguiente")).toBeTruthy()
  })

  it("renders English month caption and Sunday-first headers under en-US weekStartsOn=0", () => {
    render(
      <TimezoneProvider
        timezone="America/New_York"
        locale="en-US"
        weekStartsOn={0}
      >
        <Calendar mode="single" defaultMonth={new Date(2026, 10, 1)} />
      </TimezoneProvider>
    )

    expect(screen.getByText("November 2026")).toBeTruthy()

    const headers = screen
      .getAllByRole("columnheader", { hidden: true })
      .map((el) => el.textContent)
    expect(headers[0]).toBe("Sun")
    expect(headers[6]).toBe("Sat")

    expect(screen.getByLabelText("Previous month")).toBeTruthy()
    expect(screen.getByLabelText("Next month")).toBeTruthy()
  })
})
