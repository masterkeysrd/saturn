import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}
if (typeof Element !== "undefined" && !Element.prototype.getAnimations) {
  Element.prototype.getAnimations = () => []
}
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import * as aiApi from "@saturn/api/saturn/platform/ai/v1/ai"
import * as aiHooks from "@saturn/hooks/ai"
import { ChatView } from "./chat-view"
import { AgentsView } from "./agents-view"
import { ModelsView } from "./models-view"
import { MCPServersView } from "./mcp-servers-view"
import { RunsView } from "./runs-view"
import { GlobalAIDrawer } from "./components/global-ai-drawer"
import { MCPServerSheet } from "./components/mcp-server-sheet"
import { openAIDrawer } from "./lib/drawer-events"

vi.mock("@saturn/api/saturn/platform/ai/v1/ai", () => ({
  useListThreadsQuery: vi.fn(),
  useUpdateThreadMutation: vi.fn(),
  useDeleteThreadMutation: vi.fn(),
  useListAgentsQuery: vi.fn(),
  useCreateAgentMutation: vi.fn(),
  useUpdateAgentMutation: vi.fn(),
  useDeleteAgentMutation: vi.fn(),
  useResetAgentMutation: vi.fn(),
  useListProvidersQuery: vi.fn(),
  useListProviderDescriptorsQuery: vi.fn(),
  useCreateProviderMutation: vi.fn(),
  useUpdateProviderMutation: vi.fn(),
  useDeleteProviderMutation: vi.fn(),
  useTestProviderMutation: vi.fn(),
  useSyncProviderModelsMutation: vi.fn(),
  useListModelsQuery: vi.fn(),
  useCreateModelMutation: vi.fn(),
  useUpdateModelMutation: vi.fn(),
  useDeleteModelMutation: vi.fn(),
  useGetSettingsQuery: vi.fn(),
  useUpdateSettingsMutation: vi.fn(),
  useListMCPServersQuery: vi.fn(),
  useCreateMCPServerMutation: vi.fn(),
  useUpdateMCPServerMutation: vi.fn(),
  useDeleteMCPServerMutation: vi.fn(),
  useTestMCPServerMutation: vi.fn(),
  useSyncMCPServerMutation: vi.fn(),
  useListRunsQuery: vi.fn(),
  useGetRunQuery: vi.fn(),
}))

vi.mock("@saturn/hooks/ai", () => ({
  useThreadStream: vi.fn(),
}))

vi.mock("@saturn/hooks", () => ({
  useTimezone: () => ({
    timezone: "UTC",
    isToday: () => true,
    isYesterday: () => false,
    format: (d: string | Date) => `FMT(${String(d)})`,
  }),
}))

vi.mock("@/features/space/use-space", () => ({
  useActiveSpaceContext: () => ({
    spaceId: "spc_1",
    spaceName: "Personal",
    spaceRole: "owner",
  }),
  useSpacePermissions: () => ({
    canManageSettings: true,
    canWrite: true,
  }),
}))

function noopMutation() {
  return {
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
  } as never
}

describe("Web AI Studio", () => {
  let queryClient: QueryClient
  const sendMessage = vi.fn()
  const resolveApprovals = vi.fn()
  const stop = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    vi.mocked(aiApi.useListThreadsQuery).mockReturnValue({
      data: {
        threads: [
          {
            id: "thr_1",
            spaceId: "spc_1",
            userId: "usr_1",
            title: "April Spend Check",
            agentName: "Saturn Assistant",
            status: "idle",
            messageCount: 2,
            isPinned: false,
            isArchived: false,
            lastMessageAt: "2026-04-15T10:00:00Z",
          },
        ],
        nextPageToken: "",
      },
      isLoading: false,
    } as never)

    vi.mocked(aiApi.useUpdateThreadMutation).mockReturnValue(noopMutation())
    vi.mocked(aiApi.useDeleteThreadMutation).mockReturnValue(noopMutation())
    vi.mocked(aiApi.useCreateAgentMutation).mockReturnValue(noopMutation())
    vi.mocked(aiApi.useUpdateAgentMutation).mockReturnValue(noopMutation())
    vi.mocked(aiApi.useDeleteAgentMutation).mockReturnValue(noopMutation())
    vi.mocked(aiApi.useResetAgentMutation).mockReturnValue(noopMutation())
    vi.mocked(aiApi.useCreateProviderMutation).mockReturnValue(noopMutation())
    vi.mocked(aiApi.useUpdateProviderMutation).mockReturnValue(noopMutation())
    vi.mocked(aiApi.useDeleteProviderMutation).mockReturnValue(noopMutation())
    vi.mocked(aiApi.useTestProviderMutation).mockReturnValue(noopMutation())
    vi.mocked(aiApi.useSyncProviderModelsMutation).mockReturnValue(
      noopMutation()
    )
    vi.mocked(aiApi.useCreateModelMutation).mockReturnValue(noopMutation())
    vi.mocked(aiApi.useUpdateModelMutation).mockReturnValue(noopMutation())
    vi.mocked(aiApi.useDeleteModelMutation).mockReturnValue(noopMutation())
    vi.mocked(aiApi.useUpdateSettingsMutation).mockReturnValue(noopMutation())
    vi.mocked(aiApi.useCreateMCPServerMutation).mockReturnValue(noopMutation())
    vi.mocked(aiApi.useUpdateMCPServerMutation).mockReturnValue(noopMutation())
    vi.mocked(aiApi.useDeleteMCPServerMutation).mockReturnValue(noopMutation())
    vi.mocked(aiApi.useTestMCPServerMutation).mockReturnValue(noopMutation())
    vi.mocked(aiApi.useSyncMCPServerMutation).mockReturnValue(noopMutation())

    vi.mocked(aiApi.useListAgentsQuery).mockReturnValue({
      data: {
        agents: [
          {
            id: "agt_sys",
            spaceId: "spc_1",
            isSystem: true,
            slug: "saturn-assistant",
            name: "Saturn Assistant",
            description: "Default workspace copilot",
            tags: ["system"],
            isEnabled: true,
            version: "1",
            stats: { totalRuns_7d: 4, completedRuns_7d: 4, failedRuns_7d: 0 },
          },
        ],
      },
      isLoading: false,
    } as never)

    vi.mocked(aiApi.useListProvidersQuery).mockReturnValue({
      data: {
        providers: [
          {
            id: "prv_1",
            spaceId: "spc_1",
            name: "Google Gemini",
            driver: "gemini",
            hasSecret: true,
            isEnabled: true,
            modelCount: 3,
            status: { state: "healthy" },
          },
        ],
      },
      isLoading: false,
    } as never)

    vi.mocked(aiApi.useListProviderDescriptorsQuery).mockReturnValue({
      data: {
        providers: [
          {
            driver: "gemini",
            displayName: "Google Gemini",
            description: "Gemini models",
            defaultBaseUrl: "https://generativelanguage.googleapis.com",
            apiKeyRequired: true,
            supportsDiscovery: true,
            logoIcon: "sparkles",
          },
        ],
      },
    } as never)

    vi.mocked(aiApi.useListModelsQuery).mockReturnValue({
      data: {
        models: [
          {
            id: "mdl_1",
            spaceId: "spc_1",
            providerId: "prv_1",
            providerName: "Google Gemini",
            providerDriver: "gemini",
            modelId: "gemini-2.5-flash",
            displayName: "Gemini 2.5 Flash",
            source: "catalog",
            isEnabled: true,
            profile: {
              capabilities: {
                toolCalling: true,
                vision: true,
                document: true,
                audio: false,
                reasoning: true,
                structuredOutput: true,
                streaming: true,
              },
              limits: { contextWindow: 1000000, maxOutputTokens: 8192 },
            },
          },
        ],
      },
      isLoading: false,
    } as never)

    vi.mocked(aiApi.useGetSettingsQuery).mockReturnValue({
      data: {
        models: { defaultModelId: "mdl_1", fastModelId: "mdl_1" },
        governance: { runRetentionDays: 90 },
        currentMonthSpendUsd: 1.25,
      },
    } as never)

    vi.mocked(aiApi.useListMCPServersQuery).mockReturnValue({
      data: {
        mcpServers: [
          {
            id: "mcp_sys",
            spaceId: "spc_1",
            isSystem: true,
            slug: "saturn",
            name: "Saturn Workspace",
            description: "Built-in tools",
            transport: "in_memory",
            hasAuthSecret: false,
            isEnabled: true,
            discovery: {
              healthStatus: "healthy",
              tools: [
                {
                  name: "finance_list_accounts",
                  description: "List accounts",
                  readOnlyHint: true,
                  destructiveHint: false,
                },
              ],
            },
          },
        ],
      },
      isLoading: false,
    } as never)

    vi.mocked(aiApi.useListRunsQuery).mockReturnValue({
      data: {
        runs: [
          {
            id: "air_1",
            spaceId: "spc_1",
            kind: "chat_turn",
            source: "chat",
            agentName: "Saturn Assistant",
            status: "completed",
            input: { prompt: "How much did I spend?" },
            metrics: { tokens: { total: 140 }, latencyMs: "350" },
            steps: [],
            createTime: "2026-04-15T10:00:00Z",
          },
        ],
        nextPageToken: "",
      },
      isLoading: false,
    } as never)

    vi.mocked(aiApi.useGetRunQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
    } as never)

    vi.mocked(aiHooks.useThreadStream).mockReturnValue({
      thread: undefined,
      messages: [],
      isLoadingMessages: false,
      isStreaming: false,
      status: "idle",
      streamPhase: "idle",
      activeToolCall: null,
      activeRunId: null,
      streamingMessage: null,
      pendingApprovals: [],
      error: null,
      sendMessage,
      resolveApprovals,
      stop,
      clearError: vi.fn(),
    })
  })

  afterEach(() => {
    cleanup()
  })

  function renderWithProviders(ui: React.ReactElement) {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>{ui}</MemoryRouter>
      </QueryClientProvider>
    )
  }

  it("renders ChatView with timezone-grouped threads and inline approval confirmation", () => {
    vi.mocked(aiHooks.useThreadStream).mockReturnValue({
      thread: undefined,
      messages: [
        {
          id: "aim_1",
          threadId: "thr_1",
          spaceId: "spc_1",
          seq: 1,
          role: "user",
          blocks: [{ type: "text", text: "Record $10 coffee" }],
        },
      ],
      isLoadingMessages: false,
      isStreaming: false,
      status: "awaiting_approval",
      streamPhase: "awaiting_approval",
      activeToolCall: null,
      activeRunId: "air_1",
      streamingMessage: null,
      pendingApprovals: [
        {
          toolCallId: "tc_1",
          mcpServerId: "mcp_sys",
          mcpServerName: "Saturn Workspace",
          toolName: "finance_create_expense",
          arguments: { amount: 1000 },
          destructiveHint: false,
        },
      ],
      error: null,
      sendMessage,
      resolveApprovals,
      stop,
      clearError: vi.fn(),
    })

    renderWithProviders(<ChatView />)

    expect(screen.getByText("April Spend Check")).toBeTruthy()
    expect(screen.getByText("Record $10 coffee")).toBeTruthy()
    expect(screen.getByText("finance_create_expense")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Approve" }))
    expect(resolveApprovals).toHaveBeenCalledWith([
      { toolCallId: "tc_1", approved: true },
    ])
  })

  it("opens GlobalAIDrawer on Cmd+J and sends message", async () => {
    renderWithProviders(<GlobalAIDrawer />)

    fireEvent.keyDown(window, { key: "j", metaKey: true })
    expect(await screen.findByText("Saturn Copilot")).toBeTruthy()

    const input = screen.getByLabelText("Ask anything about your workspace...")
    fireEvent.change(input, { target: { value: "Check balances" } })
    fireEvent.click(screen.getByRole("button", { name: "Send message" }))

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ content: "Check balances" })
      )
    })
  })

  it("renders AgentsView, ModelsView, MCPServersView (with Connect modal), and RunsView", async () => {
    const { unmount } = renderWithProviders(<AgentsView />)
    expect(screen.getByText("Saturn Assistant")).toBeTruthy()
    expect(screen.getByText("agent__saturn-assistant")).toBeTruthy()
    unmount()

    const m = renderWithProviders(<ModelsView />)
    expect(screen.getByText("Workspace Role Defaults")).toBeTruthy()
    expect(screen.getByText("Google Gemini")).toBeTruthy()
    expect(screen.getAllByText("Gemini 2.5 Flash").length).toBeGreaterThan(0)
    m.unmount()

    const mcp = renderWithProviders(<MCPServersView />)
    expect(screen.getByText("Saturn Workspace")).toBeTruthy()
    fireEvent.click(
      screen.getByRole("button", { name: /Connect External Client/i })
    )
    expect(
      await screen.findByText("Connect External AI Client (/mcp)")
    ).toBeTruthy()
    mcp.unmount()

    renderWithProviders(<RunsView />)
    expect(screen.getByText("How much did I spend?")).toBeTruthy()
    expect(screen.getByText(/140 tok/)).toBeTruthy()
  })

  it("renders live streaming phase indicator and domain-aware tool labels", () => {
    vi.mocked(aiHooks.useThreadStream).mockReturnValue({
      thread: undefined,
      messages: [
        {
          id: "aim_1",
          threadId: "thr_1",
          spaceId: "spc_1",
          seq: 1,
          role: "user",
          blocks: [{ type: "text", text: "Check my accounts" }],
        },
      ],
      isLoadingMessages: false,
      isStreaming: true,
      status: "streaming",
      streamPhase: "tool_running",
      activeToolCall: {
        toolCallId: "tc_1",
        toolName: "finance_list_accounts",
        status: "running",
      },
      activeRunId: "air_1",
      streamingMessage: {
        thinking: "",
        text: "",
        toolCalls: [
          {
            toolCallId: "tc_1",
            toolName: "finance_list_accounts",
            status: "running",
          },
        ],
      },
      pendingApprovals: [],
      error: null,
      sendMessage,
      resolveApprovals,
      stop,
      clearError: vi.fn(),
    })

    renderWithProviders(<ChatView />)

    expect(screen.getByText("Finance")).toBeTruthy()
    expect(screen.getAllByText("Checking accounts…").length).toBeGreaterThan(0)
    expect(screen.getByRole("status").textContent).toContain(
      "Checking accounts…"
    )
  })

  it("sends starter prompt on click and displays errors even on an empty thread", async () => {
    vi.mocked(aiHooks.useThreadStream).mockReturnValue({
      thread: undefined,
      messages: [],
      isLoadingMessages: false,
      isStreaming: false,
      status: "idle",
      streamPhase: "idle",
      activeToolCall: null,
      activeRunId: null,
      streamingMessage: null,
      pendingApprovals: [],
      error: new Error("Failed to create thread"),
      sendMessage,
      resolveApprovals,
      stop,
      clearError: vi.fn(),
    })

    renderWithProviders(<ChatView />)

    expect(screen.getByText("Failed to create thread")).toBeTruthy()
    fireEvent.click(
      screen.getByRole("button", {
        name: "Summarize my spending this month vs budget",
      })
    )

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          content: "Summarize my spending this month vs budget",
        })
      )
    })

    // Model selector opens as an anchored popover (not a centered Dialog)
    fireEvent.click(screen.getByRole("button", { name: "Select model" }))
    expect(
      await screen.findByPlaceholderText("Search workspace models...")
    ).toBeTruthy()
    expect(document.querySelector('[data-slot="popover-content"]')).toBeTruthy()
    expect(document.querySelector('[data-slot="dialog-content"]')).toBeNull()
  })

  it("opens GlobalAIDrawer via openAIDrawer event, auto-sends prompt, and exposes recent threads switcher", async () => {
    renderWithProviders(<GlobalAIDrawer />)

    expect(aiApi.useListThreadsQuery).toHaveBeenCalledWith(
      { isArchived: false, pageSize: 15, pageToken: "" },
      { enabled: false }
    )

    openAIDrawer({ prompt: "Summarize unread mail", autoSend: true })

    expect(await screen.findByText("Saturn Copilot")).toBeTruthy()
    expect(aiApi.useListThreadsQuery).toHaveBeenLastCalledWith(
      { isArchived: false, pageSize: 15, pageToken: "" },
      { enabled: true }
    )
    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ content: "Summarize unread mail" })
      )
    })
    expect(screen.getByRole("button", { name: "Recent threads" })).toBeTruthy()
  })

  it("stages multi-tool approval decisions without silently rejecting siblings and marks orphan tool_calls as rejected", () => {
    vi.mocked(aiHooks.useThreadStream).mockReturnValue({
      thread: undefined,
      messages: [
        {
          id: "aim_ast_orphan",
          threadId: "thr_1",
          spaceId: "spc_1",
          seq: 1,
          role: "assistant",
          blocks: [
            {
              type: "tool_call",
              toolCallId: "tc_old_cancelled",
              toolName: "finance_create_expense",
              arguments: { amount: 500 },
            },
          ],
        },
      ],
      isLoadingMessages: false,
      isStreaming: false,
      status: "awaiting_approval",
      streamPhase: "awaiting_approval",
      activeToolCall: null,
      activeRunId: "air_1",
      streamingMessage: null,
      pendingApprovals: [
        {
          toolCallId: "tc_1",
          mcpServerId: "mcp_sys",
          mcpServerName: "Saturn Workspace",
          toolName: "calendar_create_event",
          arguments: { title: "Sync" },
          destructiveHint: false,
        },
        {
          toolCallId: "tc_2",
          mcpServerId: "mcp_sys",
          mcpServerName: "Saturn Workspace",
          toolName: "mail_send_message",
          arguments: { to: "a@b.com" },
          destructiveHint: true,
        },
      ],
      error: null,
      sendMessage,
      resolveApprovals,
      stop,
      clearError: vi.fn(),
    })

    renderWithProviders(<ChatView />)

    // Orphan tool_call not in pendingApprovals should NOT show "Awaiting Approval"
    expect(screen.queryByText(/Awaiting Approval/i)).toBeNull()

    const approveButtons = screen.getAllByRole("button", { name: "Approve" })
    const rejectButtons = screen.getAllByRole("button", { name: "Reject" })

    // Click Approve on card #1 -> staged, NOT submitted yet
    fireEvent.click(approveButtons[0])
    expect(resolveApprovals).not.toHaveBeenCalled()

    // Click Reject on card #2 -> staged, Submit Decisions becomes enabled
    fireEvent.click(rejectButtons[1])
    expect(resolveApprovals).not.toHaveBeenCalled()

    fireEvent.click(
      screen.getByRole("button", { name: "Submit Decisions (2/2)" })
    )
    expect(resolveApprovals).toHaveBeenCalledWith([
      { toolCallId: "tc_1", approved: true },
      { toolCallId: "tc_2", approved: false },
    ])
  })

  it("submits custom_headers authSecret and updateMask in MCPServerSheet and navigates RunsView pages with Previous/Next", () => {
    const updateMutate = vi.fn()
    vi.mocked(aiApi.useUpdateMCPServerMutation).mockReturnValue({
      mutate: updateMutate,
      isPending: false,
    } as never)

    const { unmount } = renderWithProviders(
      <MCPServerSheet
        open={true}
        onOpenChange={vi.fn()}
        server={{
          id: "mcp_custom_1",
          spaceId: "spc_1",
          isSystem: false,
          slug: "custom-srv",
          name: "Custom Server",
          description: "",
          transport: "http",
          hasAuthSecret: false,
          isEnabled: true,
          config: {
            url: "https://mcp.custom.test/mcp",
            authType: "custom_headers",
            trustReadHints: true,
            timeoutSeconds: 30,
          },
        }}
      />
    )

    fireEvent.change(screen.getByLabelText("Header name 1"), {
      target: { value: "X-Api-Key" },
    })
    fireEvent.change(screen.getByLabelText("Header value 1"), {
      target: { value: "secret-123" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }))

    expect(updateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "mcp_custom_1",
        req: expect.objectContaining({
          mcpServer: expect.objectContaining({
            authSecret: {
              bearerToken: "",
              headers: { "X-Api-Key": "secret-123" },
            },
          }),
          updateMask: {
            paths: expect.arrayContaining(["auth_secret.headers"]),
          },
        }),
      })
    )
    unmount()

    // Test RunsView Previous / Next pagination
    vi.mocked(aiApi.useListRunsQuery)
      .mockReturnValueOnce({
        data: {
          runs: [
            {
              id: "air_p1",
              spaceId: "spc_1",
              kind: "chat_turn",
              source: "chat",
              status: "completed",
              input: { prompt: "Page 1 prompt" },
              metrics: { tokens: { total: 10 }, latencyMs: "100" },
              steps: [],
              createTime: "2026-04-15T10:00:00Z",
            },
          ],
          nextPageToken: "tok_page_2",
        },
        isLoading: false,
      } as never)
      .mockReturnValue({
        data: {
          runs: [
            {
              id: "air_p2",
              spaceId: "spc_1",
              kind: "chat_turn",
              source: "chat",
              status: "completed",
              input: { prompt: "Page 2 prompt" },
              metrics: { tokens: { total: 20 }, latencyMs: "200" },
              steps: [],
              createTime: "2026-04-15T09:00:00Z",
            },
          ],
          nextPageToken: "",
        },
        isLoading: false,
      } as never)

    renderWithProviders(<RunsView />)
    expect(screen.getByText("Page 1 prompt")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Next" }))
    expect(screen.getByText("Page 2 prompt")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Previous" })).toBeTruthy()
  })
})
