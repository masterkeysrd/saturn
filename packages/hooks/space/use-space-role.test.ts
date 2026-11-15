import { describe, it, expect } from "vitest"
import { mapSpaceMemberRole, resolveSpaceRole } from "./use-space-role"

describe("resolveSpaceRole", () => {
  it("returns owner when space.ownerId matches userId", () => {
    expect(
      resolveSpaceRole({
        space: { id: "spc_1", ownerId: "usr_1" },
        userId: "usr_1",
      })
    ).toBe("owner")
  })

  it("resolves admin, member, and viewer roles from space members", () => {
    const space = { id: "spc_1", ownerId: "usr_owner" }
    const members = [
      { userId: "usr_admin", role: "ADMIN" as const },
      { userId: "usr_member", role: "MEMBER" as const },
      { userId: "usr_viewer", role: "VIEWER" as const },
    ]

    expect(resolveSpaceRole({ space, userId: "usr_admin", members })).toBe(
      "admin"
    )
    expect(resolveSpaceRole({ space, userId: "usr_member", members })).toBe(
      "member"
    )
    expect(resolveSpaceRole({ space, userId: "usr_viewer", members })).toBe(
      "viewer"
    )
  })

  it("defaults to least-privilege viewer when user or member is unresolved", () => {
    expect(resolveSpaceRole({ space: null, userId: "usr_1" })).toBe("viewer")
    expect(
      resolveSpaceRole({
        space: { id: "spc_1", ownerId: "usr_owner" },
        userId: "usr_other",
        members: [],
      })
    ).toBe("viewer")
    expect(mapSpaceMemberRole("ROLE_UNSPECIFIED")).toBe("viewer")
  })
})
