import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { CommandPalette } from "./command-palette"
import { openAIDrawer } from "@/features/ai/lib/drawer-events"

const mockNavigate = vi.fn()
const mockSwitchSpace = vi.fn()
const mockSetTheme = vi.fn()

vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>("react-router-dom")
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock("@/components/theme-provider", () => ({
  useTheme: () => ({
    theme: "system",
    resolvedTheme: "dark",
    setTheme: mockSetTheme,
  }),
}))

vi.mock("@/features/auth/use-auth", () => ({
  useAuth: () => ({ user: { id: "usr_1", name: "Alice" } }),
}))

vi.mock("@/features/space/use-space", () => ({
  useActiveSpaceContext: () => ({
    spaceId: "spc_1",
    switchSpace: mockSwitchSpace,
  }),
  useMySpaces: () => ({
    spaces: [
      { id: "spc_1", name: "Personal", ownerId: "usr_1" },
      { id: "spc_2", name: "Acme Corp", ownerId: "usr_2" },
    ],
  }),
}))

vi.mock("@/features/ai/lib/drawer-events", () => ({
  openAIDrawer: vi.fn(),
}))

describe("CommandPalette", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.HTMLElement.prototype.scrollIntoView = vi.fn()
    globalThis.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  })

  afterEach(() => {
    cleanup()
  })

  it("opens on Cmd+K and navigates to selected destination", () => {
    render(
      <MemoryRouter initialEntries={["/space/spc_1/finance"]}>
        <CommandPalette />
      </MemoryRouter>
    )

    fireEvent.keyDown(window, { key: "k", metaKey: true })
    expect(
      screen.getByPlaceholderText(/Search views, actions, workspaces/i)
    ).toBeTruthy()

    fireEvent.click(screen.getByText("Transactions"))
    expect(mockNavigate).toHaveBeenCalledWith(
      "/space/spc_1/finance/transactions"
    )
  })

  it("keeps Ask Saturn Copilot visible across incremental multi-character typing and submits on Enter", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <CommandPalette open={true} onOpenChange={vi.fn()} />
      </MemoryRouter>
    )

    const input = screen.getByPlaceholderText(
      /Search views, actions, workspaces/i
    )

    const fullPrompt = "Spent $18 at Chipotle"
    let typed = ""
    for (const ch of fullPrompt) {
      typed += ch
      fireEvent.change(input, { target: { value: typed } })
    }

    const copilotText = screen.getByText(/Ask Saturn Copilot:/i)
    const copilotItem = copilotText.closest("[cmdk-item]")
    const copilotGroup = copilotText.closest("[cmdk-group]")
    const emptyNotice = screen.getByText(/No matching commands found/i)

    expect(copilotItem?.hasAttribute("hidden")).toBe(false)
    expect(copilotGroup?.hasAttribute("hidden")).toBe(false)
    expect(
      Boolean(
        copilotGroup &&
        copilotGroup.compareDocumentPosition(emptyNotice) &
          Node.DOCUMENT_POSITION_FOLLOWING
      )
    ).toBe(true)

    fireEvent.keyDown(input, { key: "Enter", code: "Enter" })

    expect(openAIDrawer).toHaveBeenCalledWith({
      prompt: "Spent $18 at Chipotle",
      autoSend: true,
    })
  })

  it("switches workspaces preserving the active module route and switches theme", () => {
    render(
      <MemoryRouter initialEntries={["/space/spc_1/calendar"]}>
        <CommandPalette open={true} onOpenChange={vi.fn()} />
      </MemoryRouter>
    )

    fireEvent.click(screen.getByText("Acme Corp"))
    expect(mockSwitchSpace).toHaveBeenCalledWith({
      spaceId: "spc_2",
      spaceName: "Acme Corp",
      spaceRole: "",
    })
    expect(mockNavigate).toHaveBeenCalledWith("/space/spc_2/calendar")

    fireEvent.click(screen.getByText("Dark Theme"))
    expect(mockSetTheme).toHaveBeenCalledWith("dark")
  })
})
