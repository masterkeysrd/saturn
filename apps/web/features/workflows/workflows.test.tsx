import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import * as workflowApi from "@saturn/api/gen/saturn/platform/workflow/v1/workflow"
import * as agentApi from "@saturn/api/gen/saturn/platform/agent/v1/agent"
import * as identityApi from "@saturn/api/gen/saturn/identity/v1/identity"
import { WorkflowsListView } from "./workflows-list-view"
import { WorkflowEditorView } from "./workflow-editor-view"
import { WorkflowRunsView } from "./workflow-runs-view"

vi.mock("@saturn/api/gen/saturn/platform/workflow/v1/workflow", () => ({
  useListFlowsQuery: vi.fn(),
  useGetFlowQuery: vi.fn(),
  useCreateFlowMutation: vi.fn(),
  useUpdateFlowMutation: vi.fn(),
  useDeleteFlowMutation: vi.fn(),
  useEnableFlowMutation: vi.fn(),
  useDisableFlowMutation: vi.fn(),
  useResetFlowMutation: vi.fn(),
  useExecuteFlowMutation: vi.fn(),
  useTestFlowMutation: vi.fn(),
  useGenerateFlowMutation: vi.fn(),
  useListFlowRunsQuery: vi.fn(),
  useGetFlowRunQuery: vi.fn(),
  useGetCatalogQuery: vi.fn(),
}))

vi.mock("@saturn/api/gen/saturn/platform/agent/v1/agent", () => ({
  useListAgentsQuery: vi.fn(),
  useListProvidersQuery: vi.fn(),
}))

vi.mock("@saturn/api/gen/saturn/identity/v1/identity", () => ({
  useCreateAPIKeyMutation: vi.fn(),
}))

vi.mock("@saturn/hooks", () => ({
  useTimezone: () => ({
    timezone: "America/Santo_Domingo",
    format: (d: string | Date) => `TZ(${String(d)})`,
  }),
}))

vi.mock("@/features/space/use-space", () => ({
  useActiveSpaceContext: () => ({
    spaceId: "spc_1",
    spaceName: "Personal",
    spaceRole: "owner",
  }),
}))

const mockSystemFlow: workflowApi.Flow = {
  id: "flw_sys_1",
  spaceId: "spc_1",
  systemKey: "system.finance.inbox_ingestion",
  isSystem: true,
  isEnabled: true,
  name: "Finance Inbox Ingestion",
  description: "Ingests financial emails and receipts.",
  version: "1",
  triggers: [
    {
      id: "trg_sys_1",
      name: "Inbound Email Sync",
      type: "event",
      isEnabled: true,
      config: { topic: "mail.message.received" },
    },
  ],
  steps: [
    {
      id: "classify",
      name: "Classify",
      type: "llm.generate",
      sources: {},
      cases: [],
      default: [],
      steps: [],
      inputs: { prompt: "Classify {{ input.text }}" },
    },
  ],
  stats: {
    totalRuns7d: 12,
    completedRuns7d: 11,
    failedRuns7d: 1,
    dailyCounts7d: [1, 2, 3, 2, 1, 2, 1],
  },
}

const mockCustomFlow: workflowApi.Flow = {
  id: "flw_usr_1",
  spaceId: "spc_1",
  isSystem: false,
  isEnabled: true,
  name: "Bill Calendar Sync",
  description: "Syncs scheduled bills to primary calendar.",
  version: "2",
  triggers: [
    {
      id: "trg_wh_1",
      name: "Webhook Trigger",
      type: "webhook",
      isEnabled: true,
      config: {},
    },
  ],
  steps: [
    {
      id: "out",
      name: "Return Output",
      type: "output",
      sources: {},
      cases: [],
      default: [],
      steps: [],
      inputs: { value: "{{ input }}" },
    },
  ],
  stats: {
    totalRuns7d: 4,
    completedRuns7d: 4,
    failedRuns7d: 0,
    dailyCounts7d: [0, 1, 0, 1, 1, 0, 1],
  },
}

const mockCatalog: workflowApi.Catalog = {
  triggerTopics: [
    {
      topic: "mail.message.received",
      domain: "mail",
      description: "Emitted when an inbound email is received.",
      payloadSchema: {
        type: "object",
        properties: {
          message: { type: "object" },
        },
      },
    },
  ],
  steps: [
    {
      type: "llm.generate",
      owner: "platform",
      category: "ai",
      displayName: "LLM Generate",
      description: "Execute LLM prompt",
      inputsSchema: {},
      outputSchema: {},
    },
    {
      type: "output",
      owner: "platform",
      category: "flow",
      displayName: "Output",
      description: "Return output",
      inputsSchema: {},
      outputSchema: {},
    },
  ],
  loaders: [
    {
      name: "finance.accounts",
      owner: "finance",
      displayName: "Finance Accounts",
      description: "Lists active workspace accounts.",
      paramsSchema: {},
      outputSchema: {},
    },
  ],
  celHelpers: [],
}

describe("Web Workflows Studio", () => {
  let queryClient: QueryClient
  const mutateEnable = vi.fn()
  const mutateDisable = vi.fn()
  const mutateReset = vi.fn()
  const mutateDelete = vi.fn()
  const mutateGenerate = vi.fn()
  const mutateCreate = vi.fn()
  const mutateUpdate = vi.fn()
  const mutateTest = vi.fn()
  const mutateExecute = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    vi.mocked(workflowApi.useListFlowsQuery).mockReturnValue({
      data: { flows: [mockSystemFlow, mockCustomFlow] },
      isLoading: false,
    } as unknown as ReturnType<typeof workflowApi.useListFlowsQuery>)

    vi.mocked(workflowApi.useGetFlowQuery).mockReturnValue({
      data: mockCustomFlow,
      isLoading: false,
    } as unknown as ReturnType<typeof workflowApi.useGetFlowQuery>)

    vi.mocked(workflowApi.useGetCatalogQuery).mockReturnValue({
      data: mockCatalog,
      isLoading: false,
    } as unknown as ReturnType<typeof workflowApi.useGetCatalogQuery>)

    vi.mocked(workflowApi.useListFlowRunsQuery).mockReturnValue({
      data: {
        runs: [
          {
            id: "wfr_1",
            spaceId: "spc_1",
            flowId: "flw_usr_1",
            flowName: "Bill Calendar Sync",
            flowVersion: "2",
            status: "completed",
            attempts: 1,
            metadata: { duration_ms: 42, tokens_used: 120 },
            stepRuns: [],
            createTime: "2026-10-20T10:00:00Z",
          },
        ],
        nextPageToken: "",
      },
      isLoading: false,
    } as unknown as ReturnType<typeof workflowApi.useListFlowRunsQuery>)

    vi.mocked(workflowApi.useGetFlowRunQuery).mockReturnValue({
      data: {
        id: "wfr_1",
        spaceId: "spc_1",
        flowId: "flw_usr_1",
        flowName: "Bill Calendar Sync",
        flowVersion: "2",
        status: "completed",
        attempts: 1,
        startTime: "2026-10-20T10:00:00Z",
        metadata: { duration_ms: 42, tokens_used: 120 },
        output: { event_id: "cev_1" },
        stepRuns: [
          {
            id: "wsr_1",
            flowRunId: "wfr_1",
            spaceId: "spc_1",
            stepId: "out",
            stepType: "output",
            executionKey: "out",
            status: "completed",
            metadata: {
              duration_ms: 15,
              sources: { accounts: { loader: "finance.accounts", count: 2 } },
            },
            output: { event_id: "cev_1" },
          },
        ],
      },
      isLoading: false,
    } as unknown as ReturnType<typeof workflowApi.useGetFlowRunQuery>)

    vi.mocked(agentApi.useListAgentsQuery).mockReturnValue({
      data: { agents: [] },
    } as unknown as ReturnType<typeof agentApi.useListAgentsQuery>)
    vi.mocked(agentApi.useListProvidersQuery).mockReturnValue({
      data: { providers: [] },
    } as unknown as ReturnType<typeof agentApi.useListProvidersQuery>)
    vi.mocked(identityApi.useCreateAPIKeyMutation).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof identityApi.useCreateAPIKeyMutation>)

    vi.mocked(workflowApi.useEnableFlowMutation).mockReturnValue({
      mutateAsync: mutateEnable,
      isPending: false,
    } as unknown as ReturnType<typeof workflowApi.useEnableFlowMutation>)
    vi.mocked(workflowApi.useDisableFlowMutation).mockReturnValue({
      mutateAsync: mutateDisable,
      isPending: false,
    } as unknown as ReturnType<typeof workflowApi.useDisableFlowMutation>)
    vi.mocked(workflowApi.useResetFlowMutation).mockReturnValue({
      mutateAsync: mutateReset,
      isPending: false,
    } as unknown as ReturnType<typeof workflowApi.useResetFlowMutation>)
    vi.mocked(workflowApi.useDeleteFlowMutation).mockReturnValue({
      mutateAsync: mutateDelete,
      isPending: false,
    } as unknown as ReturnType<typeof workflowApi.useDeleteFlowMutation>)
    vi.mocked(workflowApi.useGenerateFlowMutation).mockReturnValue({
      mutateAsync: mutateGenerate,
      isPending: false,
    } as unknown as ReturnType<typeof workflowApi.useGenerateFlowMutation>)
    vi.mocked(workflowApi.useCreateFlowMutation).mockReturnValue({
      mutateAsync: mutateCreate,
      isPending: false,
    } as unknown as ReturnType<typeof workflowApi.useCreateFlowMutation>)
    vi.mocked(workflowApi.useUpdateFlowMutation).mockReturnValue({
      mutateAsync: mutateUpdate,
      isPending: false,
    } as unknown as ReturnType<typeof workflowApi.useUpdateFlowMutation>)
    vi.mocked(workflowApi.useTestFlowMutation).mockReturnValue({
      mutateAsync: mutateTest,
      isPending: false,
    } as unknown as ReturnType<typeof workflowApi.useTestFlowMutation>)
    vi.mocked(workflowApi.useExecuteFlowMutation).mockReturnValue({
      mutateAsync: mutateExecute,
      isPending: false,
    } as unknown as ReturnType<typeof workflowApi.useExecuteFlowMutation>)
  })

  afterEach(() => {
    cleanup()
  })

  it("renders system and custom flows, supports reset/delete, and runs Build with AI", async () => {
    mutateGenerate.mockResolvedValueOnce({
      name: "Generated AI Flow",
      description: "Built from prompt",
      isEnabled: true,
      triggers: [{ name: "Manual", type: "manual", isEnabled: true }],
      steps: [
        {
          id: "out",
          name: "Out",
          type: "output",
          sources: {},
          inputs: { value: "{{ input }}" },
        },
      ],
    })

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/space/spc_1/workflows"]}>
          <Routes>
            <Route
              path="/space/:spaceId/workflows"
              element={<WorkflowsListView />}
            />
            <Route
              path="/space/:spaceId/workflows/new"
              element={<WorkflowEditorView />}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )

    expect(screen.getByText("Finance Inbox Ingestion")).toBeDefined()
    expect(screen.getByText("Built-in")).toBeDefined()
    expect(screen.getByText("Bill Calendar Sync")).toBeDefined()

    // Trigger Build with AI
    const promptInput = screen.getByLabelText("Build workflow with AI prompt")
    fireEvent.change(promptInput, {
      target: { value: "Summarize new bank alerts" },
    })
    fireEvent.click(screen.getByRole("button", { name: /Build with AI/i }))

    await waitFor(() => {
      expect(mutateGenerate).toHaveBeenCalledWith({
        prompt: "Summarize new bank alerts",
      })
    })
    await waitFor(() => {
      expect(screen.getByDisplayValue("Generated AI Flow")).toBeDefined()
    })
  })

  it("renders visual canvas, selects trigger to inspect webhook URL, and saves updated flow", async () => {
    mutateUpdate.mockResolvedValueOnce({
      ...mockCustomFlow,
      name: "Bill Calendar Sync v2",
      version: "3",
    })

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/space/spc_1/workflows/flw_usr_1"]}>
          <Routes>
            <Route
              path="/space/:spaceId/workflows/:flowId"
              element={<WorkflowEditorView />}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )

    // Flow settings inspector is active by default
    const nameInput = screen.getByLabelText("Workflow name")
    expect((nameInput as HTMLInputElement).value).toBe("Bill Calendar Sync")

    // Click the Webhook Trigger node on the canvas -> inspector displays webhook URL
    fireEvent.click(screen.getByText("Webhook Trigger"))
    expect(
      screen.getAllByText(
        /\/api\/v1\/platform\/workflows\/triggers\/trg_wh_1:webhook/
      ).length
    ).toBeGreaterThanOrEqual(1)

    // Click a Step node on the canvas -> inspector displays Config / Sources / Output tabs
    fireEvent.click(screen.getByText("Return Output"))
    expect(screen.getByRole("tab", { name: /Sources/i })).toBeDefined()
    expect(screen.getByRole("tab", { name: /Output/i })).toBeDefined()

    // Switch back to Flow Settings and save
    fireEvent.click(
      screen.getAllByRole("button", { name: /^Flow Settings$/i })[0]
    )
    const nameInputAgain = screen.getByLabelText("Workflow name")
    fireEvent.change(nameInputAgain, {
      target: { value: "Bill Calendar Sync v2" },
    })
    fireEvent.click(screen.getByRole("button", { name: /Save Workflow/i }))

    await waitFor(() => {
      expect(mutateUpdate).toHaveBeenCalledTimes(1)
    })
  })

  it("renders workflow run history and step trace inspector", async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/space/spc_1/workflows/runs/wfr_1"]}>
          <Routes>
            <Route
              path="/space/:spaceId/workflows/runs/:runId"
              element={<WorkflowRunsView />}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )

    expect(screen.getByText("Workflow Run History")).toBeDefined()
    expect(screen.getByText("Step Timeline (1)")).toBeDefined()
    expect(
      screen.getByText("accounts: finance.accounts (2 rows)")
    ).toBeDefined()
    expect(screen.getByText("120 tokens")).toBeDefined()
  })
})
