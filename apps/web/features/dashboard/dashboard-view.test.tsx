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
import { TimezoneProvider } from "@saturn/hooks"
import * as spaceApi from "@saturn/api/gen/saturn/space/v1/space"
import * as financeApi from "@saturn/api/gen/saturn/finance/v1/finance"
import * as workflowApi from "@saturn/api/gen/saturn/platform/workflow/v1/workflow"
import * as hooks from "@saturn/hooks"
import { TooltipProvider } from "@/components/ui/tooltip"
import * as spaceHooks from "@/features/space/use-space"
import * as authHooks from "@/features/auth/use-auth"
import {
  OPEN_AI_DRAWER_EVENT,
  type OpenAIDrawerDetail,
} from "@/features/ai/lib/drawer-events"
import { DashboardView } from "./dashboard-view"

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

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

vi.mock("@/features/space/use-space", () => ({
  useActiveSpaceContext: vi.fn(),
}))

vi.mock("@/features/auth/use-auth", () => ({
  useAuth: vi.fn(),
}))

vi.mock("@saturn/hooks", async () => {
  const actual =
    await vi.importActual<typeof import("@saturn/hooks")>("@saturn/hooks")
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

function renderDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

  const utils = render(
    <QueryClientProvider client={queryClient}>
      <TimezoneProvider timezone="UTC" locale="en-US">
        <MemoryRouter>
          <TooltipProvider>
            <DashboardView />
          </TooltipProvider>
        </MemoryRouter>
      </TimezoneProvider>
    </QueryClientProvider>
  )

  return { ...utils, invalidateSpy, queryClient }
}

describe("DashboardView", () => {
  const updateMutateAsyncMock = vi.fn()
  const modifyThreadMutateMock = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date("2026-07-18T10:30:00Z"))

    vi.mocked(authHooks.useAuth).mockReturnValue({
      user: { id: "usr_1", name: "Alice Rivera", username: "alice" },
    } as ReturnType<typeof authHooks.useAuth>)

    vi.mocked(spaceHooks.useActiveSpaceContext).mockReturnValue({
      spaceId: "spc_1",
      spaceName: "Personal",
      spaceRole: "owner",
      timezone: "UTC",
      activeSpace: null,
      userPreferences: {
        regional: { locale: "en-US", hourCycle: "h12", weekStartsOn: 0 },
        mail: { autoLoadRemoteContent: false },
        calendar: { webView: "month", mobileView: "agenda" },
      },
      updateUserPreferences: vi.fn(),
      switchSpace: vi.fn(),
      clearActiveSpace: vi.fn(),
      isLoading: false,
    })

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
    } as unknown as ReturnType<typeof spaceApi.useGetDashboardPreferencesQuery>)

    updateMutateAsyncMock.mockResolvedValue({
      spaceId: "spc_1",
      userId: "usr_1",
      widgets: ["net_worth", "budget_pace"],
      version: "2",
    })
    vi.mocked(spaceApi.useUpdateDashboardPreferencesMutation).mockReturnValue({
      mutateAsync: updateMutateAsyncMock,
      isPending: false,
    } as unknown as ReturnType<
      typeof spaceApi.useUpdateDashboardPreferencesMutation
    >)

    vi.mocked(financeApi.useGetSettingsQuery).mockReturnValue({
      data: { baseCurrency: "USD" },
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof financeApi.useGetSettingsQuery>)

    vi.mocked(financeApi.useGetInsightsQuery).mockReturnValue({
      data: {
        income: { totalIncome: "450000" },
        spent: { totalSpent: "120000" },
      },
      isLoading: false,
    } as unknown as ReturnType<typeof financeApi.useGetInsightsQuery>)

    vi.mocked(financeApi.useListAccountsQuery).mockReturnValue({
      data: {
        accounts: [
          {
            id: "acc_1",
            name: "Checking",
            type: "CHECKING",
            currency: "USD",
            currentBalance: "525000",
            isActive: true,
          },
          {
            id: "acc_2",
            name: "Sapphire",
            type: "CREDIT_CARD",
            currency: "USD",
            currentBalance: "25000",
            isActive: true,
          },
        ],
      },
      isLoading: false,
    } as unknown as ReturnType<typeof financeApi.useListAccountsQuery>)

    vi.mocked(financeApi.useListBudgetsQuery).mockReturnValue({
      data: {
        budgets: [
          {
            id: "bud_1",
            name: "Groceries",
            limitAmount: "100000",
            currency: "USD",
            interval: "MONTHLY",
            status: "ACTIVE",
            icon: "shopping-cart",
            color: "teal",
            currentPeriod: {
              limitInBase: "100000",
              spentInBase: "40000",
            },
          },
        ],
      },
      isLoading: false,
    } as unknown as ReturnType<typeof financeApi.useListBudgetsQuery>)

    vi.mocked(financeApi.useListInboxItemsQuery).mockReturnValue({
      data: { inboxItems: [], nextPageToken: "" },
      isLoading: false,
    } as unknown as ReturnType<typeof financeApi.useListInboxItemsQuery>)

    vi.mocked(financeApi.useListScheduledTransactionsQuery).mockReturnValue({
      data: { scheduledTransactions: [] },
      isLoading: false,
    } as unknown as ReturnType<
      typeof financeApi.useListScheduledTransactionsQuery
    >)

    vi.mocked(workflowApi.useListFlowRunsQuery).mockReturnValue({
      data: {
        runs: [
          {
            id: "wfr_1",
            flowName: "Receipt Categorizer",
            status: "completed",
            startTime: "2026-07-18T09:00:00Z",
          },
        ],
      },
      isLoading: false,
    } as unknown as ReturnType<typeof workflowApi.useListFlowRunsQuery>)

    vi.mocked(hooks.useCurrencyConversionPreview).mockReturnValue({
      exchangeRates: [],
      isLoading: false,
      getConversionPreview: vi.fn(),
    })

    vi.mocked(hooks.useCalendars).mockReturnValue({
      data: {
        calendars: [{ id: "cal_1", name: "Work", isEnabled: true }],
      },
      isLoading: false,
    } as unknown as ReturnType<typeof hooks.useCalendars>)

    vi.mocked(hooks.useCalendarEvents).mockReturnValue({
      data: {
        occurrences: [
          {
            eventId: "ev_1",
            calendarId: "cal_1",
            instanceId: "inst_1",
            title: "Design Review",
            isAllDay: false,
            startTime: "2026-07-18T14:00:00Z",
            endTime: "2026-07-18T15:00:00Z",
            startDate: "",
            endDate: "",
            color: "#14b8a6",
          },
        ],
      },
      isLoading: false,
    } as unknown as ReturnType<typeof hooks.useCalendarEvents>)

    vi.mocked(hooks.useGetEvent).mockReturnValue({
      data: undefined,
      isLoading: false,
    } as unknown as ReturnType<typeof hooks.useGetEvent>)

    vi.mocked(hooks.useCreateEvent).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof hooks.useCreateEvent>)

    vi.mocked(hooks.useUpdateEvent).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof hooks.useUpdateEvent>)

    vi.mocked(hooks.useDeleteEvent).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof hooks.useDeleteEvent>)

    vi.mocked(hooks.useRespondToEvent).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof hooks.useRespondToEvent>)

    vi.mocked(hooks.useContactSuggestions).mockReturnValue({
      data: { contacts: [] },
      isLoading: false,
    } as unknown as ReturnType<typeof hooks.useContactSuggestions>)

    vi.mocked(hooks.useConnectedAccounts).mockReturnValue({
      data: {
        accounts: [
          {
            id: "ca_1",
            email: "alice@example.com",
            enabledCapabilities: ["mail"],
          },
        ],
      },
      isLoading: false,
    } as unknown as ReturnType<typeof hooks.useConnectedAccounts>)

    vi.mocked(hooks.useMailboxes).mockReturnValue({
      data: {
        mailboxes: [
          { id: "mbx_1", systemRole: "MAILBOX_ROLE_INBOX", unreadCount: 2 },
        ],
      },
      isLoading: false,
    } as unknown as ReturnType<typeof hooks.useMailboxes>)

    vi.mocked(hooks.useInfiniteMailThreads).mockReturnValue({
      data: {
        pages: [
          {
            threads: [
              {
                id: "thr_mail_1",
                subject: "Q3 Budget Signoff",
                isUnread: true,
                isStarred: false,
                lastMessageAt: "2026-07-18T08:15:00Z",
                participants: [
                  { email: "cfo@example.com", displayName: "Morgan Lee" },
                ],
              },
            ],
          },
        ],
      },
      isLoading: false,
    } as unknown as ReturnType<typeof hooks.useInfiniteMailThreads>)

    vi.mocked(hooks.useModifyThread).mockReturnValue({
      mutate: modifyThreadMutateMock,
    } as unknown as ReturnType<typeof hooks.useModifyThread>)
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it("renders onboarding empty state when no space is active", () => {
    vi.mocked(spaceHooks.useActiveSpaceContext).mockReturnValue({
      spaceId: "",
      spaceName: "",
      spaceRole: "",
      timezone: "UTC",
      activeSpace: null,
      userPreferences: {
        regional: { locale: "en-US", hourCycle: "h12", weekStartsOn: 0 },
        mail: { autoLoadRemoteContent: false },
        calendar: { webView: "month", mobileView: "agenda" },
      },
      updateUserPreferences: vi.fn(),
      switchSpace: vi.fn(),
      clearActiveSpace: vi.fn(),
      isLoading: false,
    })

    renderDashboard()

    expect(screen.getByText(/Good morning, Alice/i)).toBeTruthy()
    expect(screen.getByText(/Create your first Space/i)).toBeTruthy()
    expect(
      screen.getByRole("link", { name: /Manage Spaces/i }).getAttribute("href")
    ).toBe("/settings/spaces")
  })

  it("renders default 5-widget layout without standalone TriageWidget, including cash flow and deep links", () => {
    const { container } = renderDashboard()

    expect(screen.getByText("Good morning, Alice")).toBeTruthy()
    expect(screen.queryByText("Needs Attention")).toBeNull()
    expect(screen.getByText("Net Worth & Liquid Cash")).toBeTruthy()
    expect(screen.getByText("$5,000.00")).toBeTruthy()
    expect(screen.getByText("This Month (Jul)")).toBeTruthy()
    expect(screen.getByText("+$4,500.00")).toBeTruthy()
    expect(screen.getByText("-$1,200.00")).toBeTruthy()
    expect(screen.getByText("Monthly Budget Pace")).toBeTruthy()
    expect(screen.getByText("40%")).toBeTruthy()
    expect(screen.getByText("Today's Schedule")).toBeTruthy()

    const eventLink = screen.getByRole("link", { name: "Design Review" })
    expect(eventLink.getAttribute("href")).toBe(
      "/space/spc_1/calendar?date=2026-07-18&view=day"
    )

    expect(screen.getByText("Priority Mail")).toBeTruthy()
    const mailLink = screen
      .getByText("Q3 Budget Signoff")
      .closest("a") as HTMLAnchorElement
    expect(mailLink.getAttribute("href")).toBe(
      "/space/spc_1/mail?threadId=thr_mail_1"
    )

    const renderedOrder = Array.from(
      container.querySelectorAll("[data-widget-id]")
    ).map((el) => el.getAttribute("data-widget-id"))
    expect(renderedOrder).toEqual([
      "ai_quick_ask",
      "net_worth",
      "budget_pace",
      "today_schedule",
      "priority_mail",
    ])
  })

  it("renders domain-native pending Finance Inbox review callout inside NetWorthWidget", () => {
    vi.mocked(financeApi.useListInboxItemsQuery).mockReturnValue({
      data: {
        inboxItems: [
          {
            id: "inb_1",
            vendorName: "Whole Foods",
            amount: "8420",
            currency: "USD",
            transactionDate: "2026-07-18T00:00:00Z",
          },
          {
            id: "inb_2",
            vendorName: "Trader Joe's",
            amount: "4200",
            currency: "USD",
            transactionDate: "2026-07-18T00:00:00Z",
          },
        ],
        nextPageToken: "",
      },
      isLoading: false,
    } as unknown as ReturnType<typeof financeApi.useListInboxItemsQuery>)

    renderDashboard()

    const inboxCallout = screen.getByRole("link", {
      name: /2 staged items awaiting review/i,
    })
    expect(inboxCallout.getAttribute("href")).toBe("/space/spc_1/finance/inbox")
  })

  it("renders graceful setup link when finance settings are not configured", () => {
    vi.mocked(financeApi.useGetSettingsQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("not configured"),
    } as unknown as ReturnType<typeof financeApi.useGetSettingsQuery>)

    renderDashboard()

    const setupLinks = screen.getAllByRole("link", {
      name: /Set up base currency/i,
    })
    expect(setupLinks.length).toBeGreaterThan(0)
    expect(setupLinks[0].getAttribute("href")).toBe("/space/spc_1/finance")
  })

  it("filters BudgetPaceWidget to MONTHLY budgets and shows Overdue/Due today badges in UpcomingBillsWidget", () => {
    vi.mocked(spaceApi.useGetDashboardPreferencesQuery).mockReturnValue({
      data: {
        spaceId: "spc_1",
        userId: "usr_1",
        widgets: ["budget_pace", "upcoming_bills"],
        version: "1",
      },
      isLoading: false,
    } as unknown as ReturnType<typeof spaceApi.useGetDashboardPreferencesQuery>)

    vi.mocked(financeApi.useListBudgetsQuery).mockReturnValue({
      data: {
        budgets: [
          {
            id: "bud_m",
            name: "Monthly Dining",
            limitAmount: "50000",
            currency: "USD",
            interval: "MONTHLY",
            status: "ACTIVE",
            currentPeriod: {
              limitInBase: "50000",
              spentInBase: "25000",
            },
          },
          {
            id: "bud_y",
            name: "Annual Travel",
            limitAmount: "1000000",
            currency: "USD",
            interval: "YEARLY",
            status: "ACTIVE",
            currentPeriod: {
              limitInBase: "1000000",
              spentInBase: "100000",
            },
          },
        ],
      },
      isLoading: false,
    } as unknown as ReturnType<typeof financeApi.useListBudgetsQuery>)

    vi.mocked(financeApi.useListScheduledTransactionsQuery).mockReturnValue({
      data: {
        scheduledTransactions: [
          {
            id: "sch_overdue",
            sourceType: "RECURRENT_TRANSACTION",
            sourceId: "rec_1",
            amount: "9500",
            currency: "USD",
            dueDate: "2026-07-16T00:00:00Z",
            status: "PENDING",
            type: "EXPENSE",
            metadata: { name: "Water Bill" },
          },
          {
            id: "sch_today",
            sourceType: "RECURRENT_TRANSACTION",
            sourceId: "rec_2",
            amount: "12000",
            currency: "USD",
            dueDate: "2026-07-18T12:00:00Z",
            status: "PENDING",
            type: "EXPENSE",
            metadata: { name: "Electric Bill" },
          },
        ],
      },
      isLoading: false,
    } as unknown as ReturnType<
      typeof financeApi.useListScheduledTransactionsQuery
    >)

    renderDashboard()

    // Only monthly budget ($250 of $500 = 50%) is counted in pace math, plus +1 weekly/yearly note
    expect(screen.getByText("50%")).toBeTruthy()
    expect(screen.getByText(/\+1 weekly\/yearly/i)).toBeTruthy()

    // Overdue & Due today badges in UpcomingBillsWidget
    expect(screen.getByText("Water Bill")).toBeTruthy()
    expect(screen.getByText("Overdue")).toBeTruthy()
    expect(screen.getByText("Electric Bill")).toBeTruthy()
    expect(screen.getByText("Due today")).toBeTruthy()
  })

  it("opens CreateTransactionSheet and EventDialog in-place from Quick Action menu", async () => {
    renderDashboard()

    const quickActionTrigger = screen.getByRole("button", {
      name: /Quick Action/i,
    })
    fireEvent.click(quickActionTrigger)

    const recordTxItem = await screen.findByText("Record Transaction")
    fireEvent.click(recordTxItem)

    expect(
      await screen.findByText(
        "Choose the type of transaction you want to record in your ledger."
      )
    ).toBeTruthy()

    // Close transaction sheet
    fireEvent.click(screen.getByRole("button", { name: "Close" }))

    // Open Quick Action -> Create Event
    fireEvent.click(quickActionTrigger)
    const createEventItem = await screen.findByText("Create Event")
    fireEvent.click(createEventItem)

    expect(await screen.findByText("Create Calendar Event")).toBeTruthy()
  })

  it("live-previews changes in Customize drawer, reverts on Cancel, and saves UpdateDashboardPreferences", async () => {
    const { container, invalidateSpy } = renderDashboard()

    fireEvent.click(screen.getByRole("button", { name: /Customize/i }))
    expect(screen.getByText("Customize Dashboard")).toBeTruthy()

    // Save Layout is disabled when nothing changed
    const saveBtn = screen.getByRole("button", { name: /Save Layout/i })
    expect(saveBtn.hasAttribute("disabled")).toBe(true)

    // Apply Finance Focus preset: ["net_worth", "budget_pace", "upcoming_bills", "ai_quick_ask"]
    fireEvent.click(screen.getByRole("button", { name: "Finance Focus" }))

    // Live preview immediately updates DashboardView behind the sheet
    const previewOrder = Array.from(
      container.querySelectorAll("[data-widget-id]")
    ).map((el) => el.getAttribute("data-widget-id"))
    expect(previewOrder).toEqual([
      "net_worth",
      "budget_pace",
      "upcoming_bills",
      "ai_quick_ask",
    ])

    // Cancel reverts preview back to original activeWidgets
    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }))
    const revertedOrder = Array.from(
      container.querySelectorAll("[data-widget-id]")
    ).map((el) => el.getAttribute("data-widget-id"))
    expect(revertedOrder).toEqual([
      "ai_quick_ask",
      "net_worth",
      "budget_pace",
      "today_schedule",
      "priority_mail",
    ])

    // Re-open, apply Finance Focus, reorder, toggle Workflow Runs on, and save
    fireEvent.click(screen.getByRole("button", { name: /Customize/i }))
    fireEvent.click(screen.getByRole("button", { name: "Finance Focus" }))
    fireEvent.click(
      screen.getByRole("button", { name: "Move Monthly Budget Pace up" })
    )
    fireEvent.click(
      screen.getByRole("switch", { name: "Toggle Workflow Runs" })
    )

    fireEvent.click(screen.getByRole("button", { name: /Save Layout/i }))

    await waitFor(() => {
      expect(updateMutateAsyncMock).toHaveBeenCalledWith({
        space_id: "spc_1",
        req: {
          spaceId: "spc_1",
          dashboardPreferences: {
            widgets: [
              "budget_pace",
              "net_worth",
              "upcoming_bills",
              "ai_quick_ask",
              "workflow_runs",
            ],
          },
          updateMask: { paths: ["widgets"] },
          version: "1",
        },
      })
    })

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["/api/v1/spaces/spc_1/dashboard-preferences"],
    })
  })

  it("prevents disabling the last active widget in Customize drawer", () => {
    vi.mocked(spaceApi.useGetDashboardPreferencesQuery).mockReturnValue({
      data: {
        spaceId: "spc_1",
        userId: "usr_1",
        widgets: ["workflow_runs"],
        version: "1",
      },
      isLoading: false,
    } as unknown as ReturnType<typeof spaceApi.useGetDashboardPreferencesQuery>)

    renderDashboard()

    expect(screen.getByText("Workflow Runs")).toBeTruthy()
    expect(screen.getByText("Receipt Categorizer")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: /Customize/i }))

    const lastSwitch = screen.getByRole("switch", {
      name: "Toggle Workflow Runs",
    })
    expect(lastSwitch.getAttribute("aria-disabled")).toBe("true")
  })

  it("dispatches openAIDrawer from AI Quick Ask and icon-only Ask AI widget triggers", () => {
    const dispatched: OpenAIDrawerDetail[] = []
    const listener = (ev: Event) => {
      dispatched.push((ev as CustomEvent<OpenAIDrawerDetail>).detail)
    }
    window.addEventListener(OPEN_AI_DRAWER_EVENT, listener)

    try {
      renderDashboard()

      const input = screen.getByLabelText("Ask Saturn AI")
      fireEvent.change(input, { target: { value: "What is my burn rate?" } })
      fireEvent.submit(input.closest("form")!)

      fireEvent.click(
        screen.getByRole("button", {
          name: "Ask AI about Net Worth & Liquid Cash",
        })
      )

      expect(dispatched).toEqual([
        { prompt: "What is my burn rate?", autoSend: true },
        {
          prompt:
            "Analyze my net worth, assets, and liabilities across my active accounts",
          autoSend: true,
        },
      ])
    } finally {
      window.removeEventListener(OPEN_AI_DRAWER_EVENT, listener)
    }
  })

  it("archives a thread inline from Priority Mail widget", () => {
    renderDashboard()

    fireEvent.click(
      screen.getByRole("button", { name: "Archive Q3 Budget Signoff" })
    )

    expect(modifyThreadMutateMock).toHaveBeenCalledWith({
      id: "thr_mail_1",
      req: { id: "thr_mail_1", inInbox: false },
    })
  })
})
