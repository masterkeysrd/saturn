import { describe, it, expect } from "vitest"
import {
  UpdateConnectedAccountSchema,
  CONNECTOR_CAPABILITIES,
  CONNECTOR_CAPABILITY_LABELS,
  CONNECTOR_CAPABILITY_DESCRIPTIONS,
} from "./index"

describe("UpdateConnectedAccountSchema", () => {
  it("validates valid payload with all fields", () => {
    const data = {
      displayName: "Personal Gmail",
      color: "#3b82f6",
      enabledCapabilities: ["calendar", "mail"],
    }
    const result = UpdateConnectedAccountSchema.safeParse(data)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.displayName).toBe("Personal Gmail")
      expect(result.data.color).toBe("#3b82f6")
      expect(result.data.enabledCapabilities).toEqual(["calendar", "mail"])
    }
  })

  it("validates payload without optional displayName or color", () => {
    const data = {
      enabledCapabilities: ["contacts"],
    }
    const result = UpdateConnectedAccountSchema.safeParse(data)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.enabledCapabilities).toEqual(["contacts"])
    }
  })

  it("allows empty string for color to clear accent color", () => {
    const data = {
      color: "",
      enabledCapabilities: ["calendar"],
    }
    const result = UpdateConnectedAccountSchema.safeParse(data)
    expect(result.success).toBe(true)
  })

  it("rejects invalid hex color format", () => {
    const data = {
      color: "blue",
      enabledCapabilities: ["calendar"],
    }
    const result = UpdateConnectedAccountSchema.safeParse(data)
    expect(result.success).toBe(false)
  })

  it("rejects invalid capability", () => {
    const data = {
      enabledCapabilities: ["invalid_cap" as unknown as "calendar"],
    }
    const result = UpdateConnectedAccountSchema.safeParse(data)
    expect(result.success).toBe(false)
  })

  it("rejects displayName exceeding 100 characters", () => {
    const data = {
      displayName: "a".repeat(101),
      enabledCapabilities: ["mail"],
    }
    const result = UpdateConnectedAccountSchema.safeParse(data)
    expect(result.success).toBe(false)
  })

  it("exports connector capabilities constants and descriptions", () => {
    expect(CONNECTOR_CAPABILITIES).toContain("calendar")
    expect(CONNECTOR_CAPABILITIES).toContain("mail")
    expect(CONNECTOR_CAPABILITIES).toContain("contacts")
    expect(CONNECTOR_CAPABILITY_LABELS.calendar).toBe("Calendars")
    expect(CONNECTOR_CAPABILITY_DESCRIPTIONS.mail).toBeDefined()
  })
})
