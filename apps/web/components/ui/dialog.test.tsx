import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./dialog"
import { Button } from "./button"

describe("DialogContent mobileFullscreen", () => {
  afterEach(() => {
    cleanup()
  })

  it("enables 100dvh mobile full-screen mode by default for form composers", () => {
    render(
      <Dialog open={true}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Transaction</DialogTitle>
            <DialogDescription>Fill out transaction details.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )

    const popup = document.querySelector('[data-slot="dialog-content"]')
    expect(popup).toBeTruthy()
    expect(popup?.getAttribute("data-mobile-fullscreen")).toBe("true")
    expect(popup?.className).toContain("max-sm:h-dvh!")
    expect(popup?.className).toContain("max-sm:inset-0!")
    expect(popup?.className).toContain("max-sm:rounded-none!")
  })

  it("allows compact confirmation dialogs to opt out via mobileFullscreen={false}", () => {
    render(
      <Dialog open={true}>
        <DialogContent mobileFullscreen={false}>
          <DialogHeader>
            <DialogTitle>Revoke Session</DialogTitle>
            <DialogDescription>Confirm revocation.</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    )

    const popup = document.querySelector('[data-slot="dialog-content"]')
    expect(popup).toBeTruthy()
    expect(popup?.getAttribute("data-mobile-fullscreen")).toBe("false")
    expect(popup?.className).not.toContain("max-sm:h-dvh!")
  })
})
