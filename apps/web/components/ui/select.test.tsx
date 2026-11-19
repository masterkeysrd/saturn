import { describe, it, expect, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select"

describe("Select", () => {
  afterEach(() => {
    cleanup()
  })

  it("displays the human-readable SelectItem label instead of the raw value while closed", () => {
    render(
      <Select value="confirm_writes">
        <SelectTrigger aria-label="Tool Approval Policy">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="confirm_writes">
            Confirm mutating tools (Recommended)
          </SelectItem>
          <SelectItem value="auto">Auto-approve all tools</SelectItem>
          <SelectItem value="deny_writes">
            Deny mutating tools (Read-only)
          </SelectItem>
        </SelectContent>
      </Select>
    )

    expect(
      screen.getByText("Confirm mutating tools (Recommended)")
    ).toBeTruthy()
    expect(screen.queryByText("confirm_writes")).toBeNull()
  })

  it("resolves labels nested inside SelectGroup while closed", () => {
    render(
      <Select value="custom_headers">
        <SelectTrigger aria-label="Authentication">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="none">None</SelectItem>
            <SelectItem value="bearer">Bearer Token</SelectItem>
            <SelectItem value="custom_headers">Custom Headers</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    )

    expect(screen.getByText("Custom Headers")).toBeTruthy()
    expect(screen.queryByText("custom_headers")).toBeNull()
  })
})
