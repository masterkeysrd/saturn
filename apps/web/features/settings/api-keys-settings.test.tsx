import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { APIKeysSettings } from "./components/api-keys-settings"
import { SpaceAPIKeysSettings } from "./components/space-api-keys-settings"
import * as identityApi from "@saturn/api/gen/saturn/identity/v1/identity"
import * as spaceApi from "@saturn/api/gen/saturn/space/v1/space"

vi.mock("@saturn/api/gen/saturn/identity/v1/identity", () => ({
  useListAPIKeysQuery: vi.fn(),
  useCreateAPIKeyMutation: vi.fn(),
  useUpdateAPIKeyMutation: vi.fn(),
  useDeleteAPIKeyMutation: vi.fn(),
}))

vi.mock("@saturn/api/gen/saturn/space/v1/space", () => ({
  useListSpaceAPIKeyGrantsQuery: vi.fn(),
  useRevokeSpaceAPIKeyGrantMutation: vi.fn(),
}))

vi.mock("@saturn/hooks", () => ({
  useTimezone: () => ({
    timezone: "UTC",
    now: () => new Date("2026-04-01T12:00:00.000Z"),
    formatDate: () => "Jul 1, 2026",
    formatDateTime: () => "Apr 1, 2026, 12:00 PM",
  }),
}))

vi.mock("@/features/space/use-space", () => ({
  useMySpaces: () => ({
    spaces: [
      { id: "spc_1", name: "Personal" },
      { id: "spc_2", name: "Family" },
    ],
    isLoading: false,
  }),
  useActiveSpaceContext: () => ({
    spaceId: "spc_1",
    spaceName: "Personal",
    spaceRole: "owner",
  }),
}))

describe("Web API Keys Settings", () => {
  let queryClient: QueryClient
  const mutateCreate = vi.fn()
  const mutateUpdate = vi.fn()
  const mutateDelete = vi.fn()
  const mutateRevokeGrant = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })

    vi.mocked(identityApi.useListAPIKeysQuery).mockReturnValue({
      data: {
        apiKeys: [
          {
            id: "apk_1",
            name: "CLI Key",
            description: "Local scripts",
            keyPrefix: "sat_9xQ4kL2m",
            scopes: ["spaces:read", "finance:read"],
            spaceIds: ["spc_1"],
          },
          {
            id: "apk_2",
            name: "Orphaned Key",
            keyPrefix: "sat_1aB2cD3e",
            scopes: ["finance:read"],
            spaceIds: [],
          },
        ],
      },
      isLoading: false,
    } as never)

    vi.mocked(identityApi.useCreateAPIKeyMutation).mockReturnValue({
      mutateAsync: mutateCreate,
      isPending: false,
    } as never)

    vi.mocked(identityApi.useUpdateAPIKeyMutation).mockReturnValue({
      mutateAsync: mutateUpdate,
      isPending: false,
    } as never)

    vi.mocked(identityApi.useDeleteAPIKeyMutation).mockReturnValue({
      mutateAsync: mutateDelete,
      isPending: false,
    } as never)

    vi.mocked(spaceApi.useListSpaceAPIKeyGrantsQuery).mockReturnValue({
      data: {
        grants: [
          {
            apiKeyId: "apk_1",
            spaceId: "spc_1",
            userId: "usr_1",
            userName: "Alice",
            userEmail: "alice@example.com",
            keyName: "CLI Key",
            keyPrefix: "sat_9xQ4kL2m",
            scopes: ["finance:read"],
          },
        ],
      },
      isLoading: false,
    } as never)

    vi.mocked(spaceApi.useRevokeSpaceAPIKeyGrantMutation).mockReturnValue({
      mutateAsync: mutateRevokeGrant,
      isPending: false,
    } as never)
  })

  afterEach(() => {
    cleanup()
  })

  it("renders personal API keys including No Active Spaces badge and creates a key with one-time reveal", async () => {
    mutateCreate.mockResolvedValue({
      id: "apk_new",
      name: "Webhook Key",
      keyPrefix: "sat_new12345",
      rawKey: "sat_new1234567890secret",
      scopes: ["spaces:read"],
      spaceIds: ["spc_1"],
    })

    render(
      <QueryClientProvider client={queryClient}>
        <APIKeysSettings />
      </QueryClientProvider>
    )

    expect(screen.getByText("CLI Key")).toBeTruthy()
    expect(screen.getByText("No Active Spaces")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: /create api key/i }))

    const expirationSelect = screen.getByLabelText("Expiration")
    expect(expirationSelect.textContent).toContain("90 days")
    expect(expirationSelect.textContent).not.toContain("90d")

    const nameInput = screen.getByLabelText("Name")
    fireEvent.change(nameInput, { target: { value: "Webhook Key" } })
    fireEvent.click(screen.getByText("Family"))

    const submitButtons = screen.getAllByRole("button", {
      name: /create api key/i,
    })
    fireEvent.click(submitButtons[submitButtons.length - 1]!)

    await waitFor(() => {
      expect(mutateCreate).toHaveBeenCalledTimes(1)
    })

    await waitFor(() => {
      expect(screen.getByText("Save Your API Key")).toBeTruthy()
    })
    expect(
      (screen.getByLabelText("Generated API key secret") as HTMLInputElement)
        .value
    ).toBe("sat_new1234567890secret")
  })

  it("renders workspace API key grants and revokes workspace access", async () => {
    mutateRevokeGrant.mockResolvedValue({})

    render(
      <QueryClientProvider client={queryClient}>
        <SpaceAPIKeysSettings />
      </QueryClientProvider>
    )

    expect(screen.getByText("CLI Key")).toBeTruthy()
    expect(screen.getByText("Alice")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: /revoke access/i }))

    await waitFor(() => {
      expect(screen.getByText("Revoke Workspace Access")).toBeTruthy()
    })

    const buttons = screen.getAllByRole("button", { name: /revoke access/i })
    fireEvent.click(buttons[buttons.length - 1]!)

    await waitFor(() => {
      expect(mutateRevokeGrant).toHaveBeenCalledWith({
        space_id: "spc_1",
        api_key_id: "apk_1",
        req: { spaceId: "spc_1", apiKeyId: "apk_1" },
      })
    })
  })
})
