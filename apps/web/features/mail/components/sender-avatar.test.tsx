import { describe, it, expect, afterEach } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { SenderAvatar } from "./sender-avatar"

describe("SenderAvatar favicon URL normalization", () => {
  afterEach(() => {
    cleanup()
  })

  it("normalizes domain query param on google.com and subdomains only", () => {
    const { rerender } = render(
      <SenderAvatar
        email="support@mail.example.com"
        avatarUrl="https://www.google.com/s2/favicons?domain=mail.example.com&sz=128"
        showPopover={false}
      />
    )
    expect(screen.getByRole("img").getAttribute("src")).toBe(
      "https://www.google.com/s2/favicons?domain=example.com&sz=128"
    )

    rerender(
      <SenderAvatar
        email="support@mail.example.com"
        avatarUrl="https://google.com/s2/favicons?domain=mail.example.com&sz=128"
        showPopover={false}
      />
    )
    expect(screen.getByRole("img").getAttribute("src")).toBe(
      "https://google.com/s2/favicons?domain=example.com&sz=128"
    )

    rerender(
      <SenderAvatar
        email="support@mail.example.com"
        avatarUrl="https://evilgoogle.com/s2/favicons?domain=mail.example.com&sz=128"
        showPopover={false}
      />
    )
    expect(screen.getByRole("img").getAttribute("src")).toBe(
      "https://evilgoogle.com/s2/favicons?domain=mail.example.com&sz=128"
    )
  })
})
