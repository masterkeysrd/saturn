import { describe, expect, it } from "vitest"
import {
  API_KEY_EXPIRATION_PRESETS,
  API_KEY_SCOPES,
  API_KEY_SCOPE_GROUPS,
  CreateAPIKeySchema,
  UpdateAPIKeySchema,
} from "./index"

describe("API key schemas", () => {
  it("validates a complete CreateAPIKey payload", () => {
    const result = CreateAPIKeySchema.safeParse({
      name: "  CLI Automation  ",
      description: "Reads budgets and transactions",
      scopes: ["spaces:read", "finance:read"],
      spaceIds: ["spc_01H7B6K5Z8A3QW9J4C2N6P0Y1R"],
      expiresAt: "2026-12-31T23:59:59.000Z",
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.name).toBe("CLI Automation")
      expect(result.data.scopes).toEqual(["spaces:read", "finance:read"])
    }
  })

  it("rejects empty name, empty scopes, empty spaces, and invalid scope", () => {
    expect(
      CreateAPIKeySchema.safeParse({
        name: "   ",
        scopes: ["finance:read"],
        spaceIds: ["spc_1"],
      }).success
    ).toBe(false)

    expect(
      CreateAPIKeySchema.safeParse({
        name: "My Key",
        scopes: [],
        spaceIds: ["spc_1"],
      }).success
    ).toBe(false)

    expect(
      CreateAPIKeySchema.safeParse({
        name: "My Key",
        scopes: ["finance:read"],
        spaceIds: [],
      }).success
    ).toBe(false)

    expect(
      CreateAPIKeySchema.safeParse({
        name: "My Key",
        scopes: ["*"] as unknown as ["finance:read"],
        spaceIds: ["spc_1"],
      }).success
    ).toBe(false)
  })

  it("validates UpdateAPIKey payload", () => {
    expect(
      UpdateAPIKeySchema.safeParse({
        name: "Renamed Key",
        description: "",
        scopes: ["calendar:read", "calendar:write"],
        spaceIds: ["spc_1", "spc_2"],
      }).success
    ).toBe(true)
  })

  it("covers all API_KEY_SCOPES in API_KEY_SCOPE_GROUPS", () => {
    const groupedScopes = API_KEY_SCOPE_GROUPS.flatMap((g) =>
      g.scopes.map((s) => s.scope)
    )
    expect(groupedScopes).toEqual([...API_KEY_SCOPES])
    expect(API_KEY_EXPIRATION_PRESETS.length).toBeGreaterThanOrEqual(5)
  })
})
