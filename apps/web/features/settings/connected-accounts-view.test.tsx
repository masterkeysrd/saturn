import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
  act,
} from "@testing-library/react"
import { createElement } from "react"
import { MemoryRouter } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ConnectedAccountsView } from "./connected-accounts-view"
import * as hooks from "@saturn/hooks"
import * as spaceHooks from "@/features/space/use-space"

vi.mock("@saturn/hooks", async () => {
  const actual = await vi.importActual<typeof hooks>("@saturn/hooks")
  return {
    ...actual,
    useConnectorProviders: vi.fn(),
    useConnectedAccounts: vi.fn(),
    useInitiateOAuth: vi.fn(),
    useUpdateConnectedAccount: vi.fn(),
    useDeleteConnectedAccount: vi.fn(),
    useSyncConnectedAccount: vi.fn(),
    useCalendars: vi.fn(() => ({ data: { calendars: [] }, isLoading: false })),
    useUpdateCalendar: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
    useTimezone: () => ({
      formatRelative: () => "today",
      formatDateTime: () => "Oct 20, 2026, 12:00 PM",
    }),
  }
})

vi.mock("@/features/space/use-space", () => ({
  useSpacePermissions: vi.fn(),
}))

describe("ConnectedAccountsView", () => {
  let queryClient: QueryClient
  const mutateInitiateOAuth = vi.fn()
  const mutateUpdateAccount = vi.fn()
  const mutateDeleteAccount = vi.fn()
  const mutateSyncAccount = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })

    vi.mocked(hooks.useConnectorProviders).mockReturnValue({
      data: {
        providers: [
          {
            id: "google",
            displayName: "Google",
            supportedCapabilities: ["calendar", "mail", "contacts"],
          },
        ],
      },
      isLoading: false,
    } as never)

    vi.mocked(hooks.useInitiateOAuth).mockReturnValue({
      mutateAsync: mutateInitiateOAuth,
      isPending: false,
    } as never)

    vi.mocked(hooks.useUpdateConnectedAccount).mockReturnValue({
      mutateAsync: mutateUpdateAccount,
      isPending: false,
    } as never)

    vi.mocked(hooks.useDeleteConnectedAccount).mockReturnValue({
      mutateAsync: mutateDeleteAccount,
      isPending: false,
    } as never)

    vi.mocked(hooks.useSyncConnectedAccount).mockReturnValue({
      mutateAsync: mutateSyncAccount,
      isPending: false,
    } as never)
  })

  afterEach(() => {
    cleanup()
  })

  function renderView() {
    return render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(
          MemoryRouter,
          null,
          createElement(ConnectedAccountsView, null)
        )
      )
    )
  }

  it("renders active connected account and status badges", () => {
    vi.mocked(spaceHooks.useSpacePermissions).mockReturnValue({
      spaceId: "spc_1",
      spaceRole: "admin",
      isWritable: true,
    })

    vi.mocked(hooks.useConnectedAccounts).mockReturnValue({
      data: {
        accounts: [
          {
            id: "cac_1",
            email: "alice@example.com",
            displayName: "Alice Google",
            provider: "google",
            status: "healthy",
            enabledCapabilities: ["calendar", "contacts"],
            lastSyncTime: "2026-10-20T12:00:00Z",
          },
        ],
      },
      isLoading: false,
      refetch: vi.fn(),
    } as never)

    renderView()

    expect(screen.getByText("Alice Google")).toBeDefined()
    expect(screen.getByText(/alice@example\.com/)).toBeDefined()
    expect(screen.getByText("Active")).toBeDefined()
    expect(screen.getByText("Synced today")).toBeDefined()
  })

  it("renders REAUTH_REQUIRED status and reconnect banner", () => {
    vi.mocked(spaceHooks.useSpacePermissions).mockReturnValue({
      spaceId: "spc_1",
      spaceRole: "admin",
      isWritable: true,
    })

    vi.mocked(hooks.useConnectedAccounts).mockReturnValue({
      data: {
        accounts: [
          {
            id: "cac_2",
            email: "bob@example.com",
            provider: "google",
            status: "reauth_required",
            enabledCapabilities: ["mail"],
          },
        ],
      },
      isLoading: false,
      refetch: vi.fn(),
    } as never)

    renderView()

    expect(screen.getByText("Reconnect Required")).toBeDefined()
    expect(
      screen.getByText(/Tokens have expired or authorization was revoked/)
    ).toBeDefined()
    expect(screen.getByRole("button", { name: "Reconnect" })).toBeDefined()
  })

  it("disables controls and hides Connect/Disconnect buttons for viewer role", () => {
    vi.mocked(spaceHooks.useSpacePermissions).mockReturnValue({
      spaceId: "spc_1",
      spaceRole: "viewer",
      isWritable: false,
    })

    vi.mocked(hooks.useConnectedAccounts).mockReturnValue({
      data: {
        accounts: [
          {
            id: "cac_1",
            email: "alice@example.com",
            provider: "google",
            status: "healthy",
            enabledCapabilities: ["calendar"],
          },
        ],
      },
      isLoading: false,
      refetch: vi.fn(),
    } as never)

    renderView()

    // Read-only banner is displayed
    expect(
      screen.getByText(/You are viewing Connected Accounts in read-only mode/)
    ).toBeDefined()

    // Connect Google button is disabled / Admin Only
    expect(screen.getByRole("button", { name: /Admin Only/ })).toBeDefined()

    // Disconnect button is not rendered
    expect(screen.queryByRole("button", { name: /Disconnect/ })).toBeNull()

    // Capability switches are disabled
    const switches = screen.getAllByRole("switch")
    for (const s of switches) {
      expect(
        s.hasAttribute("data-disabled") ||
          s.getAttribute("aria-disabled") === "true"
      ).toBe(true)
    }
  })

  it("triggers disconnect confirmation dialog when clicking Disconnect", async () => {
    vi.mocked(spaceHooks.useSpacePermissions).mockReturnValue({
      spaceId: "spc_1",
      spaceRole: "admin",
      isWritable: true,
    })

    vi.mocked(hooks.useConnectedAccounts).mockReturnValue({
      data: {
        accounts: [
          {
            id: "cac_1",
            email: "alice@example.com",
            displayName: "Alice Work",
            provider: "google",
            status: "healthy",
            enabledCapabilities: ["calendar"],
          },
        ],
      },
      isLoading: false,
      refetch: vi.fn(),
    } as never)

    renderView()

    const disconnectBtn = screen.getByRole("button", { name: /Disconnect/ })
    await act(async () => {
      fireEvent.click(disconnectBtn)
    })

    // Dialog appears with warning
    expect(
      screen.getByText(/Are you sure you want to disconnect/)
    ).toBeDefined()
    expect(screen.getAllByText("Alice Work").length).toBeGreaterThanOrEqual(2)

    // Confirm dialog action
    const buttons = screen.getAllByRole("button", { name: "Disconnect" })
    const confirmBtn = buttons[buttons.length - 1]
    await act(async () => {
      fireEvent.click(confirmBtn)
    })

    expect(mutateDeleteAccount).toHaveBeenCalledWith({
      id: "cac_1",
      spaceId: "spc_1",
    })
  })

  it("handles incremental oauth redirect when capability toggle returns scope error", async () => {
    const assignMock = vi.fn()
    vi.stubGlobal("location", {
      ...window.location,
      assign: assignMock,
      href: "http://localhost:3000/settings/connected-accounts",
    })

    vi.mocked(spaceHooks.useSpacePermissions).mockReturnValue({
      spaceId: "spc_1",
      spaceRole: "admin",
      isWritable: true,
    })

    vi.mocked(hooks.useConnectedAccounts).mockReturnValue({
      data: {
        accounts: [
          {
            id: "cac_1",
            email: "alice@example.com",
            provider: "google",
            status: "healthy",
            enabledCapabilities: ["calendar"],
          },
        ],
      },
      isLoading: false,
      refetch: vi.fn(),
    } as never)

    mutateUpdateAccount.mockRejectedValueOnce(
      new Error("MISSING_OAUTH_SCOPES: incremental oauth upgrade required")
    )
    mutateInitiateOAuth.mockResolvedValueOnce({
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth?client_id=123",
    })

    renderView()

    // Toggle mail capability (currently disabled)
    const mailSwitch = screen.getAllByRole("switch")[1]
    fireEvent.click(mailSwitch)

    await waitFor(() => {
      expect(mutateInitiateOAuth).toHaveBeenCalledWith({
        provider: "google",
        returnUrl: "http://localhost:3000/settings/connected-accounts",
        capabilities: ["calendar", "mail"],
        connectedAccountId: "cac_1",
      })
      expect(assignMock).toHaveBeenCalledWith(
        "https://accounts.google.com/o/oauth2/v2/auth?client_id=123"
      )
    })

    vi.unstubAllGlobals()
  })
})
