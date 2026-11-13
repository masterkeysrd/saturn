import { describe, it, expect, afterEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { SandboxedEmailFrame } from "./sandboxed-email-frame"

describe("SandboxedEmailFrame", () => {
  afterEach(() => {
    document.documentElement.classList.remove("dark")
  })

  it("renders emails on a clean light paper canvas without a paper toggle", () => {
    document.documentElement.classList.add("dark")
    render(<SandboxedEmailFrame html="<p>Hello</p>" />)

    const iframe = screen.getByTestId(
      "sandboxed-email-frame"
    ) as HTMLIFrameElement
    expect(iframe.srcdoc).toContain("color-scheme: light;")
    expect(iframe.srcdoc).toContain("background-color: #ffffff;")
    expect(screen.queryByTestId("toggle-email-paper-btn")).toBeNull()
  })

  it("does not grow iframe height indefinitely when email contains height: 100% styles", () => {
    render(
      <SandboxedEmailFrame html="<style>html, body { height: 100% !important; }</style><table height='100%'><tr><td>Coursera Update</td></tr></table>" />
    )

    const iframe = screen.getByTestId(
      "sandboxed-email-frame"
    ) as HTMLIFrameElement
    expect(iframe.srcdoc).toContain('id="saturn-email-root"')
    expect(iframe.srcdoc).toContain(
      "html, body { height: auto !important; min-height: 0 !important; }"
    )

    // Mock contentDocument where documentElement/body reflect the iframe's current height,
    // while #saturn-email-root stays at the intrinsic content height (320px).
    const mockRoot = {
      scrollHeight: 320,
      getBoundingClientRect: () => ({ height: 320 }),
    }
    const mockDoc = {
      readyState: "complete",
      body: {
        scrollHeight: 600,
        offsetHeight: 600,
      },
      documentElement: {
        scrollHeight: 600,
        offsetHeight: 600,
      },
      getElementById: (id: string) =>
        id === "saturn-email-root" ? mockRoot : null,
      images: [],
    }
    Object.defineProperty(iframe, "contentDocument", {
      value: mockDoc,
      configurable: true,
    })

    fireEvent.load(iframe)
    const heightAfterFirstLoad = iframe.style.height
    expect(heightAfterFirstLoad).toBe("320px")

    // Subsequent load/resize ticks must keep height fixed at 320px, not +8px forever
    fireEvent.load(iframe)
    fireEvent.load(iframe)
    expect(iframe.style.height).toBe("320px")
  })
})
