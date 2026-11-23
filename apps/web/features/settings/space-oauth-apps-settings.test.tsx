import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { SpaceOAuthAppsSettings } from "./components/space-oauth-apps-settings"
import * as spaceApi from "@saturn/api/gen/saturn/space/v1/space"

vi.mock("@saturn/api/gen/saturn/space/v1/space", () => ({
  useListSpaceOAuthClientsQuery: vi.fn(),
  useListSpaceOAuthGrantsQuery: vi.fn(),
  useCreateSpaceOAuthClientMutation: vi.fn(),
  useUpdateSpaceOAuthClientMutation: vi.fn(),
  useRotateSpaceOAuthClientSecretMutation: vi.fn(),
  useDeleteSpaceOAuthClientMutation: vi.fn(),
  useRevokeSpaceOAuthGrantMutation: vi.fn(),
}))

vi.mock("@saturn/hooks", async () => {
  const i18n =
    await vi.importActual<typeof import("@saturn/i18n")>("@saturn/i18n")
  return {
    useI18n: () => ({
      locale: "en-US",
      language: "en" as const,
      supportedLocales: [],
      t: (
        key: Parameters<typeof i18n.translate>[1],
        params?: Record<string, string | number>
      ) => i18n.translate("en-US", key, params),
    }),
    useTimezone: () => ({
      timezone: "UTC",
      now: () => new Date("2026-04-01T12:00:00.000Z"),
      formatDate: () => "Apr 1, 2026",
      formatDateTime: () => "Apr 1, 2026, 12:00 PM",
    }),
  }
})

vi.mock("@/features/space/use-space", () => ({
  useActiveSpaceContext: () => ({
    spaceId: "spc_1",
    spaceName: "Personal",
    spaceRole: "owner",
  }),
}))

describe("SpaceOAuthAppsSettings", () => {
  let queryClient: QueryClient
  const createMutate = vi.fn()
  const revokeMutate = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })

    vi.mocked(spaceApi.useListSpaceOAuthClientsQuery).mockReturnValue({
      data: {
        oauthClients: [
          {
            id: "oac_1",
            spaceId: "spc_1",
            name: "Existing Connector",
            tokenEndpointAuthMethod: "client_secret_basic",
            refreshTokenPolicy: "persistent",
            redirectUris: ["https://broker.example.com/cb/*"],
            allowedScopes: ["finance:read"],
          },
        ],
      },
      isLoading: false,
    } as never)

    vi.mocked(spaceApi.useListSpaceOAuthGrantsQuery).mockReturnValue({
      data: {
        grants: [
          {
            grantId: "oag_1",
            clientId: "oac_1",
            clientName: "Existing Connector",
            spaceId: "spc_1",
            userId: "usr_1",
            userName: "Alice",
            userEmail: "alice@example.com",
            scopes: ["finance:read"],
          },
        ],
      },
      isLoading: false,
    } as never)

    vi.mocked(spaceApi.useCreateSpaceOAuthClientMutation).mockReturnValue({
      mutateAsync: createMutate,
      isPending: false,
    } as never)
    vi.mocked(spaceApi.useUpdateSpaceOAuthClientMutation).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never)
    vi.mocked(spaceApi.useRotateSpaceOAuthClientSecretMutation).mockReturnValue(
      {
        mutateAsync: vi.fn(),
        isPending: false,
      } as never
    )
    vi.mocked(spaceApi.useDeleteSpaceOAuthClientMutation).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never)
    vi.mocked(spaceApi.useRevokeSpaceOAuthGrantMutation).mockReturnValue({
      mutateAsync: revokeMutate,
      isPending: false,
    } as never)
  })

  afterEach(() => {
    cleanup()
  })

  it("creates an OAuth client with one-time secret reveal and revokes workspace grants", async () => {
    createMutate.mockResolvedValue({
      id: "oac_new",
      name: "New MCP App",
      rawSecret: "sat_ocs_secret123",
    })
    revokeMutate.mockResolvedValue({})

    render(
      <QueryClientProvider client={queryClient}>
        <SpaceOAuthAppsSettings />
      </QueryClientProvider>
    )

    expect(screen.getAllByText("Existing Connector").length).toBeGreaterThan(0)
    expect(screen.getByText(/Alice/)).toBeTruthy()

    fireEvent.click(
      screen.getByRole("button", { name: /register oauth client/i })
    )

    fireEvent.change(screen.getByLabelText("Application Name"), {
      target: { value: "New MCP App" },
    })
    fireEvent.change(screen.getByLabelText("Redirect URIs"), {
      target: { value: "https://client.example.com/cb" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Create Client" }))

    await waitFor(() => {
      expect(createMutate).toHaveBeenCalledTimes(1)
    })

    await waitFor(() => {
      expect(screen.getByText("Save Client Secret")).toBeTruthy()
    })
    expect(
      (screen.getByLabelText("Client Secret") as HTMLInputElement).value
    ).toBe("sat_ocs_secret123")

    fireEvent.click(screen.getByRole("button", { name: "Done" }))

    fireEvent.click(screen.getByRole("button", { name: /revoke access/i }))
    await waitFor(() => {
      expect(screen.getByText("Revoke OAuth Access")).toBeTruthy()
    })
    const revokeBtns = screen.getAllByRole("button", { name: /revoke access/i })
    fireEvent.click(revokeBtns[revokeBtns.length - 1]!)

    await waitFor(() => {
      expect(revokeMutate).toHaveBeenCalledWith({
        space_id: "spc_1",
        grant_id: "oag_1",
        req: { spaceId: "spc_1", grantId: "oag_1" },
      })
    })
  })
})
