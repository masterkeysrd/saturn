import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, cleanup } from "@testing-library/react"
import type { ReactNode } from "react"
import * as spaceApi from "@saturn/api/gen/saturn/space/v1/space"
import * as hooks from "@saturn/hooks"
import { useAuth } from "@/features/auth/use-auth"
import {
  ActiveSpaceProvider,
  useActiveSpaceContext,
  useSpacePermissions,
} from "./use-space"

vi.mock("@saturn/api/gen/saturn/space/v1/space", () => ({
  useListSpacesQuery: vi.fn(),
  useGetSettingsQuery: vi.fn(),
}))

vi.mock("@saturn/hooks", async () => {
  const actual = await vi.importActual<typeof hooks>("@saturn/hooks")
  return {
    ...actual,
    useSpaceRole: vi.fn(),
  }
})

vi.mock("@/features/auth/use-auth", () => ({
  useAuth: vi.fn(),
}))

describe("useSpacePermissions & ActiveSpaceProvider", () => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ActiveSpaceProvider>{children}</ActiveSpaceProvider>
  )

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    localStorage.setItem("active_space_id", "spc_1")
    localStorage.setItem(
      "space_meta",
      JSON.stringify({
        spaceId: "spc_1",
        spaceName: "Team Space",
        spaceRole: "",
      })
    )

    vi.mocked(useAuth).mockReturnValue({
      user: { id: "usr_member", email: "m@example.com", name: "Member" },
      isAuthenticated: true,
      isLoading: false,
    } as never)

    vi.mocked(spaceApi.useListSpacesQuery).mockReturnValue({
      data: {
        spaces: [{ id: "spc_1", name: "Team Space", ownerId: "usr_owner" }],
      },
      isLoading: false,
      error: null,
    } as never)

    vi.mocked(spaceApi.useGetSettingsQuery).mockReturnValue({
      data: { timezone: "America/New_York" },
    } as never)
  })

  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  it("grants isWritable=true and canManageSpace=true for owner", () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: "usr_owner", email: "o@example.com", name: "Owner" },
      isAuthenticated: true,
      isLoading: false,
    } as never)
    vi.mocked(hooks.useSpaceRole).mockReturnValue({
      role: "owner",
      isLoading: false,
    })

    const { result } = renderHook(() => useSpacePermissions(), { wrapper })
    expect(result.current).toEqual({
      spaceId: "spc_1",
      spaceRole: "owner",
      isWritable: true,
      canManageSpace: true,
    })
  })

  it("grants isWritable=true and canManageSpace=true for admin", () => {
    vi.mocked(hooks.useSpaceRole).mockReturnValue({
      role: "admin",
      isLoading: false,
    })

    const { result } = renderHook(() => useSpacePermissions(), { wrapper })
    expect(result.current).toEqual({
      spaceId: "spc_1",
      spaceRole: "admin",
      isWritable: true,
      canManageSpace: true,
    })
  })

  it("grants isWritable=true and canManageSpace=false for member", () => {
    vi.mocked(hooks.useSpaceRole).mockReturnValue({
      role: "member",
      isLoading: false,
    })

    const { result } = renderHook(() => useSpacePermissions(), { wrapper })
    expect(result.current).toEqual({
      spaceId: "spc_1",
      spaceRole: "member",
      isWritable: true,
      canManageSpace: false,
    })
  })

  it("grants isWritable=false and canManageSpace=false for viewer", () => {
    vi.mocked(hooks.useSpaceRole).mockReturnValue({
      role: "viewer",
      isLoading: false,
    })

    const { result } = renderHook(() => useSpacePermissions(), { wrapper })
    expect(result.current).toEqual({
      spaceId: "spc_1",
      spaceRole: "viewer",
      isWritable: false,
      canManageSpace: false,
    })
  })

  it("returns empty permissions and clears localStorage when unauthenticated", () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: false,
    } as never)
    vi.mocked(hooks.useSpaceRole).mockReturnValue({
      role: "viewer",
      isLoading: false,
    })

    const { result } = renderHook(
      () => ({
        perms: useSpacePermissions(),
        ctx: useActiveSpaceContext(),
      }),
      { wrapper }
    )

    expect(result.current.perms).toEqual({
      spaceId: "",
      spaceRole: "",
      isWritable: false,
      canManageSpace: false,
    })
    expect(result.current.ctx.timezone).toBeTruthy()
    expect(localStorage.getItem("active_space_id")).toBeNull()
    expect(localStorage.getItem("space_meta")).toBeNull()
  })
})
