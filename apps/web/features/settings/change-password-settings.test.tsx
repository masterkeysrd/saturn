import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ChangePasswordSettings } from "./components/change-password-settings"
import * as identityApi from "@saturn/api/gen/saturn/identity/v1/identity"

vi.mock("@saturn/api/gen/saturn/identity/v1/identity", () => ({
  useChangePasswordMutation: vi.fn(),
  useListMFAFactorsQuery: vi.fn(),
}))

vi.mock("@/features/auth/use-auth", () => ({
  useAuth: () => ({
    updateAccessToken: vi.fn(),
  }),
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

function renderChangePassword() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ChangePasswordSettings />
    </QueryClientProvider>
  )
}

describe("ChangePasswordSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(identityApi.useListMFAFactorsQuery).mockReturnValue({
      data: { factors: [] },
      isLoading: false,
    } as never)

    vi.mocked(identityApi.useChangePasswordMutation).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never)
  })

  afterEach(() => {
    cleanup()
  })

  it("clears inputs and collapses the form when clicking Cancel after typing", () => {
    const { container } = renderChangePassword()

    expect(container.querySelector("form")).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Change Password" }))
    expect(container.querySelector("form")).toBeTruthy()

    const currentInput = screen.getByLabelText(
      "Current Password"
    ) as HTMLInputElement
    const newInput = screen.getByLabelText("New Password") as HTMLInputElement
    const confirmInput = screen.getByLabelText(
      "Confirm New Password"
    ) as HTMLInputElement

    fireEvent.change(currentInput, { target: { value: "old-secret-123" } })
    fireEvent.change(newInput, { target: { value: "new-secret-456" } })
    fireEvent.change(confirmInput, { target: { value: "new-secret-456" } })

    expect(currentInput.value).toBe("old-secret-123")
    expect(newInput.value).toBe("new-secret-456")
    expect(confirmInput.value).toBe("new-secret-456")

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))

    expect(container.querySelector("form")).toBeNull()
    expect(screen.getByRole("button", { name: "Change Password" })).toBeTruthy()

    // Re-open to verify form values were reset
    fireEvent.click(screen.getByRole("button", { name: "Change Password" }))
    expect(
      (screen.getByLabelText("Current Password") as HTMLInputElement).value
    ).toBe("")
    expect(
      (screen.getByLabelText("New Password") as HTMLInputElement).value
    ).toBe("")
    expect(
      (screen.getByLabelText("Confirm New Password") as HTMLInputElement).value
    ).toBe("")
  })

  it("collapses the form immediately when clicking Cancel with empty inputs", () => {
    const { container } = renderChangePassword()

    fireEvent.click(screen.getByRole("button", { name: "Change Password" }))
    expect(container.querySelector("form")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))

    expect(container.querySelector("form")).toBeNull()
    expect(screen.getByRole("button", { name: "Change Password" })).toBeTruthy()
  })

  it("collapses the form when pressing Escape inside the form", () => {
    const { container } = renderChangePassword()

    fireEvent.click(screen.getByRole("button", { name: "Change Password" }))
    const form = container.querySelector("form")
    expect(form).toBeTruthy()

    const currentInput = screen.getByLabelText("Current Password")
    fireEvent.change(currentInput, { target: { value: "temp-password" } })
    fireEvent.keyDown(currentInput, { key: "Escape" })

    expect(container.querySelector("form")).toBeNull()
    expect(screen.getByRole("button", { name: "Change Password" })).toBeTruthy()
  })
})
