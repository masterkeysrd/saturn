import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query"
import { TimezoneProvider } from "@saturn/hooks"
import * as hooks from "@saturn/hooks"
import * as spaceApi from "@saturn/api/gen/saturn/space/v1/space"
import * as financeApi from "@saturn/api/gen/saturn/finance/v1/finance"
import * as workflowApi from "@saturn/api/gen/saturn/platform/workflow/v1/workflow"
import * as identityApi from "@saturn/api/gen/saturn/identity/v1/identity"
import { SidebarProvider } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/toast"
import { AppSidebar } from "@/components/app-sidebar"
import { CommandPalette } from "@/components/command-palette"
import { DashboardView } from "@/features/dashboard/dashboard-view"
import { AccountSettingsView } from "@/features/settings/account-settings-view"
import { USER_PREFS_STORAGE_KEY } from "@/lib/user-preferences"
import { useAuth } from "@/features/auth/use-auth"

vi.mock("@saturn/api/gen/saturn/space/v1/space", () => ({
  useGetDashboardPreferencesQuery: vi.fn(),
  useUpdateDashboardPreferencesMutation: vi.fn(),
}))

vi.mock("@saturn/api/gen/saturn/finance/v1/finance", () => ({
  useGetSettingsQuery: vi.fn(),
  useGetInsightsQuery: vi.fn(),
  useListAccountsQuery: vi.fn(),
  useListBudgetsQuery: vi.fn(),
  useListExchangeRatesQuery: vi.fn(),
  useListInboxItemsQuery: vi.fn(),
  useListScheduledTransactionsQuery: vi.fn(),
}))

vi.mock("@saturn/api/gen/saturn/platform/workflow/v1/workflow", () => ({
  useListFlowRunsQuery: vi.fn(),
}))

vi.mock("@saturn/api/gen/saturn/identity/v1/identity", () => ({
  useListMFAFactorsQuery: vi.fn(),
  useUpdateProfileMutation: vi.fn(),
  useChangeEmailMutation: vi.fn(),
  useDeleteAccountMutation: vi.fn(),
  useGetUserPreferencesQuery: vi.fn(),
  useUpdateUserPreferencesMutation: vi.fn(),
  updateUserPreferences: vi.fn(),
}))

vi.mock("@/features/auth/use-auth", () => ({
  useAuth: vi.fn(),
}))

vi.mock("@/features/space/use-space", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/space/use-space")
  >("@/features/space/use-space")
  return {
    ...actual,
    useActiveSpaceContext: () => ({
      spaceId: "spc_1",
      spaceName: "Personal",
      spaceRole: "owner",
      timezone: "UTC",
      activeSpace: null,
      switchSpace: vi.fn(),
      clearActiveSpace: vi.fn(),
      isLoading: false,
    }),
    useMySpaces: () => ({
      spaces: [{ id: "spc_1", name: "Personal", ownerId: "usr_1" }],
      isLoading: false,
      error: null,
    }),
  }
})

vi.mock("@/components/theme-provider", () => ({
  useTheme: () => ({
    theme: "system",
    resolvedTheme: "light",
    setTheme: vi.fn(),
  }),
}))

vi.mock("@saturn/hooks", async () => {
  const actual = await vi.importActual<typeof hooks>("@saturn/hooks")
  return {
    ...actual,
    useCalendars: vi.fn(),
    useCalendarEvents: vi.fn(),
    useGetEvent: vi.fn(),
    useCreateEvent: vi.fn(),
    useUpdateEvent: vi.fn(),
    useDeleteEvent: vi.fn(),
    useRespondToEvent: vi.fn(),
    useContactSuggestions: vi.fn(),
    useConnectedAccounts: vi.fn(),
    useMailboxes: vi.fn(),
    useInfiniteMailThreads: vi.fn(),
    useModifyThread: vi.fn(),
    useCurrencyConversionPreview: vi.fn(),
  }
})

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
}

describe("Web i18n & UserPreferences", () => {
  const mutateUserPrefsAsync = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    window.HTMLElement.prototype.scrollIntoView = vi.fn()
    globalThis.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))

    vi.mocked(useAuth).mockReturnValue({
      user: {
        id: "usr_1",
        name: "Alice Rivera",
        username: "alice",
        email: "alice@example.com",
        role: "user",
      },
      isAuthenticated: true,
      isLoading: false,
      logoutUser: vi.fn(),
    } as never)

    vi.mocked(spaceApi.useGetDashboardPreferencesQuery).mockReturnValue({
      data: {
        spaceId: "spc_1",
        userId: "usr_1",
        widgets: [
          "ai_quick_ask",
          "net_worth",
          "budget_pace",
          "today_schedule",
          "priority_mail",
        ],
        version: "1",
      },
      isLoading: false,
    } as never)

    vi.mocked(spaceApi.useUpdateDashboardPreferencesMutation).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never)

    vi.mocked(financeApi.useGetSettingsQuery).mockReturnValue({
      data: { baseCurrency: "USD" },
      isLoading: false,
      error: null,
    } as never)
    vi.mocked(financeApi.useGetInsightsQuery).mockReturnValue({
      data: { income: { totalIncome: "0" }, spent: { totalSpent: "0" } },
      isLoading: false,
    } as never)
    vi.mocked(financeApi.useListAccountsQuery).mockReturnValue({
      data: { accounts: [] },
      isLoading: false,
    } as never)
    vi.mocked(financeApi.useListBudgetsQuery).mockReturnValue({
      data: { budgets: [] },
      isLoading: false,
    } as never)
    vi.mocked(financeApi.useListInboxItemsQuery).mockReturnValue({
      data: { inboxItems: [], nextPageToken: "" },
      isLoading: false,
    } as never)
    vi.mocked(financeApi.useListScheduledTransactionsQuery).mockReturnValue({
      data: { scheduledTransactions: [] },
      isLoading: false,
    } as never)
    vi.mocked(workflowApi.useListFlowRunsQuery).mockReturnValue({
      data: { runs: [] },
      isLoading: false,
    } as never)

    vi.mocked(hooks.useCurrencyConversionPreview).mockReturnValue({
      exchangeRates: [],
      isLoading: false,
      getConversionPreview: vi.fn(),
    })
    vi.mocked(hooks.useCalendars).mockReturnValue({
      data: { calendars: [] },
      isLoading: false,
    } as never)
    vi.mocked(hooks.useCalendarEvents).mockReturnValue({
      data: { occurrences: [] },
      isLoading: false,
    } as never)
    vi.mocked(hooks.useGetEvent).mockReturnValue({
      data: undefined,
      isLoading: false,
    } as never)
    vi.mocked(hooks.useCreateEvent).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never)
    vi.mocked(hooks.useUpdateEvent).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never)
    vi.mocked(hooks.useDeleteEvent).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never)
    vi.mocked(hooks.useRespondToEvent).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never)
    vi.mocked(hooks.useContactSuggestions).mockReturnValue({
      data: { contacts: [] },
      isLoading: false,
    } as never)
    vi.mocked(hooks.useConnectedAccounts).mockReturnValue({
      data: { accounts: [] },
      isLoading: false,
    } as never)
    vi.mocked(hooks.useMailboxes).mockReturnValue({
      data: { mailboxes: [] },
      isLoading: false,
    } as never)
    vi.mocked(hooks.useInfiniteMailThreads).mockReturnValue({
      data: { pages: [] },
      isLoading: false,
    } as never)
    vi.mocked(hooks.useModifyThread).mockReturnValue({
      mutate: vi.fn(),
    } as never)

    vi.mocked(identityApi.useListMFAFactorsQuery).mockReturnValue({
      data: { factors: [] },
    } as never)
    vi.mocked(identityApi.useUpdateProfileMutation).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never)
    vi.mocked(identityApi.useChangeEmailMutation).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never)
    vi.mocked(identityApi.useDeleteAccountMutation).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never)
    vi.mocked(identityApi.useGetUserPreferencesQuery).mockReturnValue({
      data: { locale: "en-US", hourCycle: "h12", weekStartsOn: 0 },
    } as never)
    mutateUserPrefsAsync.mockImplementation(async (req) => req.userPreferences)
    vi.mocked(identityApi.useUpdateUserPreferencesMutation).mockReturnValue({
      mutateAsync: mutateUserPrefsAsync,
      isPending: false,
    } as never)
  })

  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  it("translates AppSidebar, DashboardView, and CommandPalette into Spanish under locale='es-ES' and keeps English under locale='en-US'", () => {
    const queryClient = createTestQueryClient()

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <TimezoneProvider timezone="UTC" locale="es-ES">
          <MemoryRouter initialEntries={["/space/spc_1/finance/transactions"]}>
            <TooltipProvider>
              <SidebarProvider>
                <AppSidebar />
              </SidebarProvider>
              <DashboardView />
            </TooltipProvider>
          </MemoryRouter>
        </TimezoneProvider>
      </QueryClientProvider>
    )

    // Sidebar Spanish groups & items
    expect(screen.getByText("Pulso diario")).toBeTruthy()
    expect(screen.getAllByText("Finanzas").length).toBeGreaterThan(0)
    expect(screen.getByText("Automatización")).toBeTruthy()
    expect(screen.getAllByText("Configuración").length).toBeGreaterThan(0)

    // Finance submenu is auto-expanded for /finance/transactions route
    expect(screen.getAllByText("Transacciones").length).toBeGreaterThan(0)

    // DashboardView Spanish
    expect(screen.getByText("Patrimonio neto y liquidez")).toBeTruthy()
    expect(screen.getByText("Ritmo de presupuesto mensual")).toBeTruthy()
    expect(screen.getByText("Agenda de hoy")).toBeTruthy()
    expect(screen.getByText("Correo prioritario")).toBeTruthy()
    expect(screen.getByRole("button", { name: /Personalizar/i })).toBeTruthy()
    expect(screen.getByRole("button", { name: /Acción rápida/i })).toBeTruthy()

    // CommandPalette Spanish
    rerender(
      <QueryClientProvider client={queryClient}>
        <TimezoneProvider timezone="UTC" locale="es-ES">
          <MemoryRouter initialEntries={["/space/spc_1/finance/transactions"]}>
            <TooltipProvider>
              <CommandPalette open={true} onOpenChange={vi.fn()} />
            </TooltipProvider>
          </MemoryRouter>
        </TimezoneProvider>
      </QueryClientProvider>
    )

    expect(
      screen.getByPlaceholderText("Escribe un comando o busca...")
    ).toBeTruthy()
    expect(screen.getByText("Acciones rápidas")).toBeTruthy()
    expect(screen.getByText("Navegación")).toBeTruthy()
    expect(screen.getByText("Preferencias y tema")).toBeTruthy()
    expect(screen.getByText("Cambiar idioma a Español (España)")).toBeTruthy()

    // Switch to en-US and verify exact English (AppSidebar + DashboardView)
    rerender(
      <QueryClientProvider client={queryClient}>
        <TimezoneProvider timezone="UTC" locale="en-US">
          <MemoryRouter initialEntries={["/space/spc_1/finance/transactions"]}>
            <TooltipProvider>
              <SidebarProvider>
                <AppSidebar />
              </SidebarProvider>
              <DashboardView />
            </TooltipProvider>
          </MemoryRouter>
        </TimezoneProvider>
      </QueryClientProvider>
    )

    expect(screen.getByText("Daily Pulse")).toBeTruthy()
    expect(screen.getByText("Money")).toBeTruthy()
    expect(screen.getByText("Automation")).toBeTruthy()
    expect(screen.getByText("Net Worth & Liquid Cash")).toBeTruthy()
    expect(screen.getByText("Monthly Budget Pace")).toBeTruthy()
    expect(screen.getByText("Today's Schedule")).toBeTruthy()
    expect(screen.getByText("Priority Mail")).toBeTruthy()
    expect(screen.getByRole("button", { name: /Customize/i })).toBeTruthy()
    expect(screen.getByRole("button", { name: /Quick Action/i })).toBeTruthy()

    // CommandPalette English
    rerender(
      <QueryClientProvider client={queryClient}>
        <TimezoneProvider timezone="UTC" locale="en-US">
          <MemoryRouter initialEntries={["/space/spc_1/finance/transactions"]}>
            <TooltipProvider>
              <CommandPalette open={true} onOpenChange={vi.fn()} />
            </TooltipProvider>
          </MemoryRouter>
        </TimezoneProvider>
      </QueryClientProvider>
    )

    expect(
      screen.getByPlaceholderText("Type a command or search...")
    ).toBeTruthy()
    expect(screen.getByText("Quick Actions")).toBeTruthy()
  })

  it("updates Language, Time Format, and Week Starts On in AccountSettingsView and persists to query cache & localStorage", async () => {
    const queryClient = createTestQueryClient()
    const initialPrefs = {
      locale: "en-US",
      hourCycle: "h12",
      weekStartsOn: 0,
    }
    queryClient.setQueryData(
      ["/api/v1/identity/users/me/preferences", {}],
      initialPrefs
    )
    vi.mocked(identityApi.useGetUserPreferencesQuery).mockImplementation(
      (req, options) =>
        useQuery({
          queryKey: ["/api/v1/identity/users/me/preferences", req],
          queryFn: async () => initialPrefs,
          ...options,
        }) as never
    )

    const selectOption = async (triggerName: string, optionName: string) => {
      fireEvent.click(screen.getByRole("combobox", { name: triggerName }))
      const option = await screen.findByRole("option", { name: optionName })
      fireEvent.pointerDown(option)
      fireEvent.mouseUp(option)
      fireEvent.click(option)
    }

    render(
      <QueryClientProvider client={queryClient}>
        <TimezoneProvider timezone="UTC" locale="en-US">
          <MemoryRouter>
            <Toaster>
              <AccountSettingsView />
            </Toaster>
          </MemoryRouter>
        </TimezoneProvider>
      </QueryClientProvider>
    )

    expect(screen.getByText("Language & Regional Format")).toBeTruthy()

    // 1. Switch Language -> Español (España)
    await selectOption("Language & Locale", "Español (España)")

    await waitFor(() => {
      expect(mutateUserPrefsAsync).toHaveBeenCalledWith({
        userPreferences: {
          locale: "es-ES",
          hourCycle: "h12",
          weekStartsOn: 0,
        },
        updateMask: { paths: ["locale"] },
      })
    })

    expect(
      queryClient.getQueryData(["/api/v1/identity/users/me/preferences", {}])
    ).toEqual({
      locale: "es-ES",
      hourCycle: "h12",
      weekStartsOn: 0,
    })
    expect(
      JSON.parse(localStorage.getItem(USER_PREFS_STORAGE_KEY) || "{}")
    ).toEqual({
      locale: "es-ES",
      hourCycle: "h12",
      weekStartsOn: 0,
    })

    // 2. Switch Time Format -> 24-hour (13:30)
    await selectOption("Time Format", "24-hour (13:30)")

    await waitFor(() => {
      expect(mutateUserPrefsAsync).toHaveBeenCalledWith({
        userPreferences: {
          locale: "es-ES",
          hourCycle: "h23",
          weekStartsOn: 0,
        },
        updateMask: { paths: ["hour_cycle"] },
      })
    })

    // 3. Switch Week Starts On -> Monday
    await selectOption("Week Starts On", "Monday")

    await waitFor(() => {
      expect(mutateUserPrefsAsync).toHaveBeenCalledWith({
        userPreferences: {
          locale: "es-ES",
          hourCycle: "h23",
          weekStartsOn: 1,
        },
        updateMask: { paths: ["week_starts_on"] },
      })
    })

    expect(
      queryClient.getQueryData(["/api/v1/identity/users/me/preferences", {}])
    ).toEqual({
      locale: "es-ES",
      hourCycle: "h23",
      weekStartsOn: 1,
    })
    expect(
      JSON.parse(localStorage.getItem(USER_PREFS_STORAGE_KEY) || "{}")
    ).toEqual({
      locale: "es-ES",
      hourCycle: "h23",
      weekStartsOn: 1,
    })
  })
})
