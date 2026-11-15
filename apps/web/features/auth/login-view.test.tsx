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
import { AuthProvider } from "./auth-provider"
import { ActiveSpaceProvider } from "@/features/space/use-space"
import { LoginView } from "./login-view"
import App from "@/App"
import * as identityApi from "@saturn/api/gen/saturn/identity/v1/identity"
import { SaturnApiError } from "@saturn/api/client"

vi.mock(
  "@saturn/api/gen/saturn/identity/v1/identity",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@saturn/api/gen/saturn/identity/v1/identity")
      >()
    return {
      ...actual,
      loginUser: vi.fn(),
      registerUser: vi.fn(),
      logout: vi.fn(),
      refreshSession: vi.fn(),
      useGetCurrentUserQuery: vi.fn(() => ({ data: undefined })),
    }
  }
)

vi.mock("@saturn/api/storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@saturn/api/storage")>()
  return {
    ...actual,
    authStorage: {
      getSession: () => ({ accessToken: null, hasSession: false }),
      setSession: vi.fn(),
      clearSession: vi.fn(),
    },
  }
})

describe("LoginView MFA error handling", () => {
  let queryClient: QueryClient
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    cleanup()
  })

  async function renderAndEnterMfaStep() {
    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter>
            <LoginView />
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>
    )

    fireEvent.change(screen.getByLabelText("Username or Email"), {
      target: { value: "alice@example.com" },
    })
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password123" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }))

    await screen.findByText("Two-Factor Authentication")
    const otpInputs = screen.getAllByRole("textbox")
    expect(document.activeElement).toBe(otpInputs[0])
  }

  it("displays an error banner, highlights OTP inputs, and keeps focus on the last box when an incorrect MFA code is entered, then clears on edit", async () => {
    vi.mocked(identityApi.loginUser)
      .mockResolvedValueOnce({
        mfa: {
          ticket: "mfa_ticket_123",
          availableFactors: [
            {
              factorId: "mfa_1",
              type: "totp",
              name: "Authenticator",
              isPrimary: true,
            },
          ],
        },
      })
      .mockRejectedValueOnce(
        new SaturnApiError({
          message: "invalid verification code",
          status: 400,
          code: 3,
          reason: "MFA_INVALID_CODE",
        })
      )

    await renderAndEnterMfaStep()

    const inputs = screen.getAllByRole("textbox")
    expect(inputs.length).toBe(6)

    for (let i = 0; i < 6; i++) {
      fireEvent.change(inputs[i], { target: { value: String(i + 1) } })
    }

    await waitFor(() => {
      expect(identityApi.loginUser).toHaveBeenCalledTimes(2)
    })

    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toBe("invalid verification code")
    for (const input of inputs) {
      expect(input.className).toContain("border-destructive")
    }
    await waitFor(() => {
      expect(document.activeElement).toBe(inputs[5])
    })

    fireEvent.change(inputs[5], { target: { value: "" } })
    await waitFor(() => {
      expect(screen.queryByRole("alert")).toBeNull()
    })
    for (const input of inputs) {
      expect(input.className).not.toContain("border-destructive")
    }
  })

  it("displays inline validation error when submitting an incomplete MFA code", async () => {
    vi.mocked(identityApi.loginUser).mockResolvedValueOnce({
      mfa: {
        ticket: "mfa_ticket_123",
        availableFactors: [
          {
            factorId: "mfa_1",
            type: "totp",
            name: "Authenticator",
            isPrimary: true,
          },
        ],
      },
    })

    await renderAndEnterMfaStep()

    const inputs = screen.getAllByRole("textbox")
    fireEvent.change(inputs[0], { target: { value: "1" } })
    fireEvent.click(screen.getByRole("button", { name: "Verify & Sign In" }))

    await screen.findByText("Please enter all 6 digits")
    expect(identityApi.loginUser).toHaveBeenCalledTimes(1)
  })

  it("displays an error when an incorrect recovery code is submitted and clears on edit", async () => {
    vi.mocked(identityApi.loginUser)
      .mockResolvedValueOnce({
        mfa: {
          ticket: "mfa_ticket_123",
          availableFactors: [
            {
              factorId: "mfa_1",
              type: "totp",
              name: "Authenticator",
              isPrimary: true,
            },
          ],
        },
      })
      .mockRejectedValueOnce(
        new SaturnApiError({
          message: "invalid backup code",
          status: 400,
          code: 3,
          reason: "MFA_INVALID_CODE",
        })
      )

    await renderAndEnterMfaStep()

    fireEvent.click(
      screen.getByRole("button", {
        name: /Use a recovery code/i,
      })
    )

    const backupInput = screen.getByLabelText("Backup Recovery Code")
    fireEvent.change(backupInput, { target: { value: "WRONG-CODE" } })
    fireEvent.click(screen.getByRole("button", { name: "Verify & Sign In" }))

    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toBe("invalid backup code")

    fireEvent.change(backupInput, { target: { value: "WRONG-COD" } })
    await waitFor(() => {
      expect(screen.queryByRole("alert")).toBeNull()
    })
  })

  it("stays on MFA step, does not trigger spaces/settings queries, and shows error inside full App tree", async () => {
    const fetchSpy = vi.fn(async () => {
      return new Response(
        JSON.stringify({ code: 16, message: "unauthenticated" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }
      )
    })
    globalThis.fetch = fetchSpy as unknown as typeof fetch
    localStorage.setItem("active_space_id", "spc_old")

    vi.mocked(identityApi.loginUser)
      .mockResolvedValueOnce({
        mfa: {
          ticket: "mfa_ticket_123",
          availableFactors: [
            {
              factorId: "mfa_1",
              type: "totp",
              name: "Authenticator",
              isPrimary: true,
            },
          ],
        },
      })
      .mockRejectedValueOnce(
        new SaturnApiError({
          message: "invalid verification code",
          status: 400,
          code: 3,
          reason: "MFA_INVALID_CODE",
        })
      )

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ActiveSpaceProvider>
            <MemoryRouter initialEntries={["/login"]}>
              <App />
            </MemoryRouter>
          </ActiveSpaceProvider>
        </AuthProvider>
      </QueryClientProvider>
    )

    fireEvent.change(screen.getByLabelText("Username or Email"), {
      target: { value: "alice@example.com" },
    })
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password123" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }))

    await screen.findByText("Two-Factor Authentication")

    const inputs = screen.getAllByRole("textbox")
    expect(document.activeElement).toBe(inputs[0])

    for (let i = 0; i < 6; i++) {
      fireEvent.change(inputs[i], { target: { value: String(i + 1) } })
    }

    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toBe("invalid verification code")
    expect(screen.getByText("Two-Factor Authentication")).toBeTruthy()
    expect(document.activeElement).toBe(inputs[5])
    expect(fetchSpy).not.toHaveBeenCalled()
    localStorage.removeItem("active_space_id")
  })
})
