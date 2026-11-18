import { describe, it, expect, afterEach } from "vitest"
import { act, render, screen, fireEvent } from "@testing-library/react"
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

  it("blocks remote CSS/poster URLs, dangerous tags, and javascript: URIs until Load images is clicked, and enforces CSP", () => {
    const html = [
      '<link rel="stylesheet" href="https://tracker.test/a.css">',
      '<iframe src="https://evil.test/frame"></iframe>',
      '<style>.hero { background: url("https://tracker.test/bg.png"); color: #111; }</style>',
      '<div style="background-image: url(https://tracker.test/inline.png); padding: 4px;">',
      '<a href="javascript:alert(1)">Click</a>',
      '<video poster="https://tracker.test/poster.jpg"></video>',
      "</div>",
    ].join("")

    render(<SandboxedEmailFrame html={html} />)

    const iframe = screen.getByTestId(
      "sandboxed-email-frame"
    ) as HTMLIFrameElement
    expect(iframe.srcdoc).toContain("Content-Security-Policy")
    expect(iframe.srcdoc).toContain("img-src data: blob: 'self'")
    expect(iframe.srcdoc).not.toContain("https://tracker.test")
    expect(iframe.srcdoc).not.toContain("<iframe")
    expect(iframe.srcdoc).not.toContain("<link")
    expect(iframe.srcdoc).not.toMatch(/javascript:/i)

    // Banner appears because remote URLs were detected; clicking Load images restores remote CSS/poster
    fireEvent.click(screen.getByTestId("load-remote-images-btn"))
    expect(iframe.srcdoc).toContain("img-src https: http: data: blob: 'self'")
    expect(iframe.srcdoc).toContain("https://tracker.test/bg.png")
  })

  it("expands immediately once #saturn-email-root parses even before slow images fire iframe load", async () => {
    const rafCallbacks: FrameRequestCallback[] = []
    const origRaf = window.requestAnimationFrame
    window.requestAnimationFrame = (cb: FrameRequestCallback) => {
      rafCallbacks.push(cb)
      return rafCallbacks.length
    }

    try {
      const { rerender } = render(<SandboxedEmailFrame html="<p>Initial</p>" />)
      const iframe = screen.getByTestId(
        "sandboxed-email-frame"
      ) as HTMLIFrameElement

      // Simulate Chromium state right as srcDoc changes: old/blank document has no matching #saturn-email-root yet
      Object.defineProperty(iframe, "contentDocument", {
        value: {
          readyState: "complete",
          body: { scrollHeight: 0 },
          getElementById: () => null,
          images: [],
        },
        configurable: true,
      })
      rafCallbacks.length = 0

      rerender(
        <SandboxedEmailFrame html="<div><h1>Watch: Inside the Signal</h1></div>" />
      )
      expect(rafCallbacks.length).toBeGreaterThan(0)

      // Next frame: HTML parsed (readyState: "interactive"), slow images still pending (iframe.onload NOT fired!)
      const parsedRoot = {
        scrollHeight: 1480,
        getBoundingClientRect: () => ({ height: 1480 }),
      }
      Object.defineProperty(iframe, "contentDocument", {
        value: {
          readyState: "interactive",
          body: { scrollHeight: 1480 },
          getElementById: (id: string) =>
            id === "saturn-email-root" ? parsedRoot : null,
          images: [],
        },
        configurable: true,
      })

      act(() => {
        const nextCb = rafCallbacks.shift()
        nextCb?.(16)
      })

      expect(iframe.style.height).toBe("1480px")
    } finally {
      window.requestAnimationFrame = origRaf
    }
  })
})
