import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { OAuthConsentView } from "./oauth-consent-view"
import * as identityApi from "@saturn/api/gen/saturn/identity/v1/identity"

vi.mock("@saturn/api/gen/saturn/identity/v1/identity", () => ({
  useInspectOAuthConsentQuery: vi.fn(),
  useDecideOAuthConsentMutation: vi.fn(),
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
  }
})

describe("OAuthConsentView", () => {
  let queryClient: QueryClient
  const decideMutate = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })

    vi.mocked(identityApi.useDecideOAuthConsentMutation).mockReturnValue({
      mutateAsync: decideMutate,
      isPending: false,
    } as never)
  })

  afterEach(() => {
    cleanup()
  })

  it("renders workspace-locked consent and redirects via handoff on approval", async () => {
    const redirectSpy = vi.fn()

    vi.mocked(identityApi.useInspectOAuthConsentQuery).mockReturnValue({
      data: {
        clientId: "oac_1",
        clientName: "Remote MCP Connector",
        clientDescription: "Connects external agent",
        isWorkspaceClient: true,
        redirectUri: "https://client.example.com/cb",
        redirectUriHost: "client.example.com",
        lockedSpaceId: "spc_1",
        effectiveScopes: ["spaces:read", "finance:read"],
        spaces: [
          {
            spaceId: "spc_1",
            spaceName: "Personal Space",
            role: "owner",
            allowedScopes: ["spaces:read", "finance:read"],
          },
        ],
      },
      isLoading: false,
      error: null,
    } as never)

    decideMutate.mockResolvedValue({ handoffToken: "handoff_abc" })

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter
          initialEntries={[
            "/oauth/authorize?client_id=oac_1&redirect_uri=https%3A%2F%2Fclient.example.com%2Fcb&response_type=code&code_challenge=abc&code_challenge_method=S256&state=xyz",
          ]}
        >
          <OAuthConsentView onRedirect={redirectSpy} />
        </MemoryRouter>
      </QueryClientProvider>
    )

    expect(screen.getByText("Remote MCP Connector")).toBeTruthy()
    expect(screen.getByText("Workspace App")).toBeTruthy()
    expect(screen.getByText("Personal Space")).toBeTruthy()
    expect(screen.getByText("client.example.com")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Authorize" }))

    await waitFor(() => {
      expect(decideMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          clientId: "oac_1",
          spaceId: "spc_1",
          approved: true,
          approvedScopes: ["spaces:read", "finance:read"],
        })
      )
    })

    expect(redirectSpy).toHaveBeenCalledWith(
      "/oauth/authorize/callback?handoff=handoff_abc"
    )
  })

  it("submits denial decision and redirects via handoff", async () => {
    const redirectSpy = vi.fn()

    vi.mocked(identityApi.useInspectOAuthConsentQuery).mockReturnValue({
      data: {
        clientId: "oac_global",
        clientName: "Instance CLI",
        isWorkspaceClient: false,
        redirectUri: "http://127.0.0.1:9000/cb",
        redirectUriHost: "127.0.0.1:9000",
        lockedSpaceId: "",
        effectiveScopes: ["spaces:read"],
        spaces: [
          {
            spaceId: "spc_1",
            spaceName: "Personal Space",
            role: "owner",
            allowedScopes: ["spaces:read"],
          },
        ],
      },
      isLoading: false,
      error: null,
    } as never)

    decideMutate.mockResolvedValue({ handoffToken: "handoff_denied" })

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter
          initialEntries={[
            "/oauth/authorize?client_id=oac_global&redirect_uri=http%3A%2F%2F127.0.0.1%3A9000%2Fcb&response_type=code&code_challenge=abc&code_challenge_method=S256",
          ]}
        >
          <OAuthConsentView onRedirect={redirectSpy} />
        </MemoryRouter>
      </QueryClientProvider>
    )

    expect(screen.getByText("Instance App")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Deny" }))

    await waitFor(() => {
      expect(decideMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          clientId: "oac_global",
          approved: false,
        })
      )
    })

    expect(redirectSpy).toHaveBeenCalledWith(
      "/oauth/authorize/callback?handoff=handoff_denied"
    )
  })
})
